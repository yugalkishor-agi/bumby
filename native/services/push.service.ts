import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { NavigationService } from './navigation.service';
import { toast } from '../contexts/ToastContext';

const ENABLE_CLIENT_PUSH_SEND = process.env.EXPO_PUBLIC_ENABLE_CLIENT_PUSH_SEND !== 'false';
const CAN_CLIENT_SEND_PUSH = ENABLE_CLIENT_PUSH_SEND && Platform.OS !== 'web';
const PUSH_TOKEN_CACHE_TTL_MS = 60 * 1000;
const REMOTE_PUSH_TTL_SECONDS = 30 * 60;
const pushTokenCache = new Map<string, { tokens: string[]; expiresAt: number }>();

function clearCachedTokens(userId?: string | null) {
  if (!userId) return;
  pushTokenCache.delete(userId);
}

function shouldAttemptNativePushRegistration(): boolean {
  if (Platform.OS === 'web') return false;

  // Android emulators can still exercise the native notification path.
  // The old Device.isDevice gate hard-blocked registration before Expo could even try.
  if (Platform.OS === 'android') return true;

  return Device.isDevice;
}

let listenersInitialized = false;
let responseSubscription: Notifications.Subscription | null = null;
let receivedSubscription: Notifications.Subscription | null = null;

const STARTUP_RESPONSE_MAX_AGE_MS = 12 * 1000;

function toEpochMs(value: any): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractResponseTimestamp(response: Notifications.NotificationResponse | null | undefined): number {
  const notification: any = response?.notification;
  return (
    toEpochMs(notification?.date) ||
    toEpochMs(notification?.request?.trigger?.date) ||
    toEpochMs(notification?.request?.content?.data?.createdAt) ||
    toEpochMs(notification?.request?.content?.data?.timestamp)
  );
}

function isFreshStartupNotificationResponse(
  response: Notifications.NotificationResponse | null | undefined,
  initializeStartedAtMs: number
): boolean {
  const responseTs = extractResponseTimestamp(response);
  if (!responseTs) return false;
  const ageFromInit = Math.abs(initializeStartedAtMs - responseTs);
  const ageFromNow = Math.abs(Date.now() - responseTs);
  return ageFromInit <= STARTUP_RESPONSE_MAX_AGE_MS || ageFromNow <= STARTUP_RESPONSE_MAX_AGE_MS;
}

async function clearLastNotificationResponseSafe() {
  try {
    const clearFn = (Notifications as any)?.clearLastNotificationResponseAsync;
    if (typeof clearFn === 'function') {
      await clearFn();
    }
  } catch {}
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function resolveProjectId(): string | undefined {
  // @ts-ignore
  const easId = (Constants as any)?.easConfig?.projectId;
  // @ts-ignore
  const expoId = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  return easId || expoId;
}

function trimPushText(value: any, maxLength = 110): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getActorName(value: any): string {
  const name = trimPushText(value, 32);
  return name || 'Someone';
}

function getReferenceLabel(refType: any): string {
  if (refType === 'story') return 'story';
  if (refType === 'glimpse') return 'glimpse';
  if (refType === 'comment') return 'comment';
  if (refType === 'message') return 'message';
  if (refType === 'user') return 'profile';
  return 'post';
}

function buildNavigationPayload(notificationData: any) {
  const type = notificationData?.type;
  const refType = notificationData?.refType;
  const refId = notificationData?.refId;
  const actorId = notificationData?.actorId;

  if (type === 'dm' && refId) {
    return {
      screen: 'Chat',
      params: {
        conversationId: refId,
        userId: actorId,
      },
    };
  }

  if (type === 'follow' || type === 'follow_request') {
    return {
      screen: 'UserProfile',
      params: { userId: actorId },
    };
  }

  if (refType === 'glimpse' && refId) {
    return {
      screen: 'GlimpseViewer',
      params: { glimpseId: refId },
    };
  }

  if (refType === 'story' && (actorId || refId)) {
    return {
      screen: 'StoryViewerEnhanced',
      params: actorId ? { userId: actorId } : { storyId: refId },
    };
  }

  if (refType === 'post' && refId) {
    return {
      screen: 'PostView',
      params: { postId: refId },
    };
  }

  return {
    screen: 'Notifications',
    params: {},
  };
}

function handleNotificationNavigation(data: any) {
  const payload = data?.screen
    ? { screen: data.screen, params: data.params || {} }
    : buildNavigationPayload(data);

  if (!payload?.screen) return;

  setTimeout(() => {
    NavigationService.navigate(payload.screen, payload.params);
  }, 150);
}

type PushPresentation = {
  title: string;
  body: string;
  subtitle?: string;
  channelId: 'messages' | 'social' | 'alerts' | 'default';
  categoryId?: 'message' | 'follow' | 'follow_request' | 'engagement' | 'alert';
  priority: 'default' | 'high';
  imageUrl?: string;
  collapseId?: string;
};

function formatMessagePreview(preview: string): { body: string; subtitle?: string } {
  const normalized = trimPushText(preview, 120);
  if (!normalized) {
    return { body: 'Open chat to see the latest message.', subtitle: 'New message' };
  }

  const lower = normalized.toLowerCase();
  if (lower.includes('voice message')) {
    return { body: normalized, subtitle: 'Voice message' };
  }
  if (lower.includes('video')) {
    return { body: normalized, subtitle: 'Video message' };
  }
  if (lower.includes('photo') || lower.includes('image')) {
    return { body: normalized, subtitle: 'Photo message' };
  }
  if (lower.includes('location')) {
    return { body: normalized, subtitle: 'Location shared' };
  }
  if (lower.includes('poll')) {
    return { body: normalized, subtitle: 'Poll' };
  }
  if (lower.includes('story')) {
    return { body: normalized, subtitle: 'Story reply' };
  }

  return { body: normalized, subtitle: 'New message' };
}

function getPushImageUrl(notificationData: any): string | undefined {
  const refMediaURL = typeof notificationData?.refMediaURL === 'string' ? notificationData.refMediaURL.trim() : '';
  if (refMediaURL) return refMediaURL;

  const actorAvatarURL = typeof notificationData?.actorAvatarURL === 'string' ? notificationData.actorAvatarURL.trim() : '';
  const type = String(notificationData?.type || '');
  if ((type === 'follow' || type === 'follow_request' || type === 'collaboration_request') && actorAvatarURL) {
    return actorAvatarURL;
  }

  return undefined;
}

function getCollapseId(notificationData: any): string | undefined {
  const type = String(notificationData?.type || '');
  const refId = trimPushText(notificationData?.refId, 80);
  const actorId = trimPushText(notificationData?.actorId, 80);
  const refType = trimPushText(notificationData?.refType, 32);

  if (type === 'dm' && refId) {
    return `dm-${refId}`;
  }

  if ((type === 'follow' || type === 'follow_request') && actorId) {
    return `${type}-${actorId}`;
  }

  if (refId) {
    return `${type || 'activity'}-${refType || 'ref'}-${refId}`;
  }

  if (actorId) {
    return `${type || 'activity'}-${actorId}`;
  }

  return undefined;
}

function buildPushPresentation(notificationData: any): PushPresentation {
  const type = String(notificationData?.type || '');
  const actor = getActorName(notificationData?.actorUsername);
  const refType = notificationData?.refType;
  const preview = trimPushText(notificationData?.refPreview, 120);
  const referenceLabel = getReferenceLabel(refType);
  const totalLikes = Number(notificationData?.totalLikesCount || notificationData?.likersData?.length || 0);
  const imageUrl = getPushImageUrl(notificationData);
  const collapseId = getCollapseId(notificationData);

  switch (type) {
    case 'dm': {
      const message = formatMessagePreview(preview);
      return {
        title: `New message from ${actor}`,
        body: message.body,
        subtitle: message.subtitle,
        channelId: 'messages',
        categoryId: 'message',
        priority: 'high',
        collapseId,
      };
    }
    case 'comment':
      return {
        title: `${actor} commented on your ${referenceLabel}`,
        body: preview || 'Open to read the comment.',
        subtitle: 'Comment',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'high',
        imageUrl,
        collapseId,
      };
    case 'comment_reply':
      return {
        title: `${actor} replied to your comment`,
        body: preview || 'Open to read the reply.',
        subtitle: 'Reply',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'high',
        imageUrl,
        collapseId,
      };
    case 'comment_like':
      return {
        title: `${actor} liked your comment`,
        body: preview || 'Open to view the conversation.',
        subtitle: 'Comment like',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'default',
        imageUrl,
        collapseId,
      };
    case 'like':
      return {
        title: `${actor} liked your ${referenceLabel}`,
        body: preview || `Open to view your ${referenceLabel}.`,
        subtitle: 'Like',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'default',
        imageUrl,
        collapseId,
      };
    case 'follow':
      return {
        title: `${actor} started following you`,
        body: 'Open profile to follow back.',
        subtitle: 'New follower',
        channelId: 'social',
        categoryId: 'follow',
        priority: 'default',
        imageUrl,
        collapseId,
      };
    case 'follow_request':
      return {
        title: `${actor} requested to follow you`,
        body: 'Review the follow request in your notifications.',
        subtitle: 'Follow request',
        channelId: 'social',
        categoryId: 'follow_request',
        priority: 'high',
        imageUrl,
        collapseId,
      };
    case 'mention':
      return {
        title: `${actor} mentioned you`,
        body: preview || `You were mentioned in a ${referenceLabel}.`,
        subtitle: `Mention in ${referenceLabel}`,
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'high',
        imageUrl,
        collapseId,
      };
    case 'story_view':
      return {
        title: `${actor} viewed your story`,
        body: 'Your story activity has a new update.',
        subtitle: 'Story activity',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'default',
        imageUrl,
        collapseId,
      };
    case 'story_reply':
      return {
        title: `${actor} replied to your story`,
        body: preview || 'Open to read the reply.',
        subtitle: 'Story reply',
        channelId: 'messages',
        categoryId: 'message',
        priority: 'high',
        collapseId,
      };
    case 'story_like':
      return {
        title: totalLikes > 1 ? `${actor} and ${totalLikes - 1} others liked your story` : `${actor} liked your story`,
        body: 'Open story activity to see the latest reactions.',
        subtitle: 'Story like',
        channelId: 'social',
        categoryId: 'engagement',
        priority: 'default',
        imageUrl,
        collapseId,
      };
    case 'collaboration_request':
      return {
        title: `${actor} sent a collaboration request`,
        body: preview || 'Open the request to review the details.',
        subtitle: 'Collaboration',
        channelId: 'alerts',
        categoryId: 'alert',
        priority: 'high',
        imageUrl,
        collapseId,
      };
    default:
      return {
        title: `New activity from ${actor}`,
        body: preview || 'Open the app to view the update.',
        subtitle: 'Notification',
        channelId: 'default',
        priority: 'default',
        imageUrl,
        collapseId,
      };
  }
}


function getForegroundActionLabel(type: string): string {
  switch (type) {
    case 'follow_request':
    case 'collaboration_request':
      return 'Review';
    case 'follow':
      return 'View';
    default:
      return 'Open';
  }
}

function showForegroundNotificationBanner(notificationData: any) {
  const presentation = buildPushPresentation(notificationData);
  toast.notification({
    title: presentation.title,
    subtitle: presentation.subtitle,
    message: presentation.body,
    actorName: getActorName(notificationData?.actorUsername),
    actorAvatarURL: typeof notificationData?.actorAvatarURL === 'string' ? notificationData.actorAvatarURL : undefined,
    actorVerified: Boolean(notificationData?.actorVerified),
    thumbnailURL: typeof notificationData?.refMediaURL === 'string' ? notificationData.refMediaURL : undefined,
    timestampLabel: 'now',
    duration: presentation.priority === 'high' ? 5200 : 4200,
    action: {
      label: getForegroundActionLabel(String(notificationData?.type || '')),
      onPress: () => handleNotificationNavigation(notificationData),
    },
  });
}
async function configureAndroidNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#34D399',
    sound: 'default',
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('social', {
    name: 'Social activity',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#38BDF8',
    sound: 'default',
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('alerts', {
    name: 'Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 320, 180, 320],
    lightColor: '#F97316',
    sound: 'default',
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lightColor: '#4DD0E1',
    sound: 'default',
    showBadge: true,
  });
}

async function configureNotificationCategories() {
  await Notifications.setNotificationCategoryAsync('message', [
    {
      identifier: 'open_chat',
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'mark_read',
      buttonTitle: 'Mark read',
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('follow', [
    {
      identifier: 'follow_back',
      buttonTitle: 'Follow back',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'view_profile',
      buttonTitle: 'View',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('follow_request', [
    {
      identifier: 'review_request',
      buttonTitle: 'Review',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('engagement', [
    {
      identifier: 'open_activity',
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('alert', [
    {
      identifier: 'review_alert',
      buttonTitle: 'Review',
      options: { opensAppToForeground: true },
    },
  ]);
}

async function handleNotificationResponseAction(response: Notifications.NotificationResponse) {
  const actionIdentifier = response.actionIdentifier;
  const data = response.notification.request.content.data;

  if (!data) return;

  if (
    actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ||
    actionIdentifier === 'open_chat' ||
    actionIdentifier === 'view_profile' ||
    actionIdentifier === 'review_request' ||
    actionIdentifier === 'open_activity' ||
    actionIdentifier === 'review_alert'
  ) {
    handleNotificationNavigation(data);
    return;
  }

  try {
    if (actionIdentifier === 'mark_read' && data.notificationId) {
      const { notificationService } = await import('./notification.service');
      await notificationService.markAsRead(String(data.notificationId));
      return;
    }

    if (actionIdentifier === 'follow_back' && data.actorId && auth.currentUser?.uid) {
      const { userService } = await import('./user.service');
      await userService.followUser(auth.currentUser.uid, String(data.actorId));
      return;
    }
  } catch (error) {
    console.error('[Push] Notification action failed', error);
  }

  handleNotificationNavigation(data);
}

async function sendExpoPush(tokens: string[], presentation: PushPresentation, data?: any) {
  if (!CAN_CLIENT_SEND_PUSH || !tokens.length) {
    return;
  }

  const payloadData = data && typeof data === 'object' ? { ...data, _source: 'iris-push-v2' } : data;
  const ttlSeconds = REMOTE_PUSH_TTL_SECONDS;

  const messages = tokens.map((to) => {
    const message: Record<string, any> = {
      to,
      sound: 'default',
      title: presentation.title,
      body: presentation.body,
      data: payloadData,
      priority: presentation.priority === 'high' ? 'high' : 'default',
      channelId: presentation.channelId,
      categoryId: presentation.categoryId,
      ttl: ttlSeconds,
      expiration: Math.floor(Date.now() / 1000) + ttlSeconds,
    };

    if (Platform.OS === 'ios' && presentation.subtitle) {
      message.subtitle = presentation.subtitle;
    }

    return message;
  });

  try {
    console.log(`[Push] Posting ${messages.length} message(s) to Expo push API via ${presentation.channelId} channel`);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const responseText = await response.text();
    let parsed: any = null;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {}

    if (!response.ok) {
      console.error(`[Push] Expo push API failed (status=${response.status})`, parsed || responseText);
      return;
    }

    const failedTickets = Array.isArray(parsed?.data)
      ? parsed.data.filter((item: any) => item?.status && item.status !== 'ok')
      : [];

    if (failedTickets.length > 0) {
      console.error('[Push] Expo push API returned ticket errors', failedTickets);
      return;
    }

    console.log(`[Push] Expo push API accepted request (status=${response.status})`, parsed || responseText);
  } catch (e) {
    console.error('[Push] sendExpoPush failed', e);
  }
}

export const pushService = {
  async initialize(userId: string) {
    const projectId = resolveProjectId();
    console.log(`[Push] initialize called for ${userId} (platform=${Platform.OS}, isDevice=${Device.isDevice}, projectId=${projectId || 'missing'})`);

    await this.registerForPushNotifications(userId);
    await configureNotificationCategories();

    if (Platform.OS === 'web' || listenersInitialized) {
      return;
    }

    receivedSubscription = Notifications.addNotificationReceivedListener(async (notification) => {
      try {
        const data = notification.request.content.data || {};
        showForegroundNotificationBanner(data);
      } catch (error) {
        console.warn('[Push] Failed to show foreground banner', error);
      }

      try {
        const current = await Notifications.getBadgeCountAsync();
        await Notifications.setBadgeCountAsync(current + 1);
      } catch {}
    });

    const initializeStartedAtMs = Date.now();

    responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponseAction(response);
      void clearLastNotificationResponseSafe();
    });

    try {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (
        lastResponse?.notification?.request?.content?.data &&
        isFreshStartupNotificationResponse(lastResponse, initializeStartedAtMs)
      ) {
        await handleNotificationResponseAction(lastResponse);
      }
      await clearLastNotificationResponseSafe();
    } catch {}

    listenersInitialized = true;
  },

  async registerForPushNotifications(userId: string) {
    try {
      if (!shouldAttemptNativePushRegistration()) {
        console.warn(
          `[Push] Skipping native push token registration on unsupported platform (platform=${Platform.OS}, isDevice=${Device.isDevice})`
        );
        return undefined;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn(`[Push] Notification permission not granted (status=${finalStatus})`);
        return undefined;
      }

      await configureAndroidNotificationChannels();

      const projectId = resolveProjectId();
      console.log(`[Push] Resolving Expo projectId=${projectId || 'missing'}`);
      const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      const token = tokenResp.data;
      if (!token) {
        console.warn('[Push] Expo push token not returned');
        return undefined;
      }

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const previousTokens: string[] = Array.isArray(userSnap.data()?.expoPushTokens)
        ? userSnap.data()?.expoPushTokens.filter(Boolean)
        : [];
      const previousProjectId = typeof userSnap.data()?.expoPushProjectId === 'string'
        ? userSnap.data()?.expoPushProjectId
        : null;
      const nextProjectId = projectId || null;
      const hasSameToken = previousTokens.length === 1 && previousTokens[0] === token;
      const hasSameProjectId = previousProjectId === nextProjectId;

      if (!hasSameToken || !hasSameProjectId) {
        await updateDoc(userRef, {
          expoPushToken: token,
          expoPushTokens: [token],
          expoPushProjectId: nextProjectId,
          expoTokenUpdatedAt: new Date(),
        });
      }

      pushTokenCache.set(userId, {
        tokens: [token],
        expiresAt: Date.now() + PUSH_TOKEN_CACHE_TTL_MS,
      });

      if (previousTokens.length > 1 || (previousTokens.length === 1 && previousTokens[0] !== token)) {
        console.log(
          `[Push] Replaced ${previousTokens.length} stored Expo token(s) with the latest active token for ${userId}`
        );
      }

      console.log(
        `[Push] Registered Expo push token for ${userId} (platform=${Platform.OS}, isDevice=${Device.isDevice})`
      );

      return token;
    } catch (e) {
      console.warn('[Push] register failed (non-fatal)', e);
      return undefined;
    }
  },

  async unregisterForPushNotifications(userId: string) {
    try {
      if (!userId) return;

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        clearCachedTokens(userId);
        return;
      }

      const data = userSnap.data() || {};
      const existingTokens = Array.from(
        new Set(
          [
            ...(Array.isArray((data as any).expoPushTokens) ? (data as any).expoPushTokens : []),
            (data as any).expoPushToken,
          ].filter(Boolean)
        )
      );

      await updateDoc(userRef, {
        expoPushToken: deleteField(),
        expoPushTokens: deleteField(),
        expoPushProjectId: deleteField(),
        expoTokenUpdatedAt: deleteField(),
      });

      clearCachedTokens(userId);

      try {
        await Notifications.dismissAllNotificationsAsync();
        await Notifications.setBadgeCountAsync(0);
      } catch {}

      console.log(`[Push] Unregistered ${existingTokens.length} Expo push token(s) for ${userId}`);
    } catch (e) {
      console.warn('[Push] unregister failed (non-fatal)', e);
    }
  },
  async sendForNotification(notificationData: any) {
    try {
      if (!CAN_CLIENT_SEND_PUSH) {
        return;
      }

      const userId = notificationData?.userId;
      if (!userId) {
        console.warn('[Push] sendForNotification called without userId');
        return;
      }

      const cachedTokens = pushTokenCache.get(userId);
      let tokens = cachedTokens && cachedTokens.expiresAt > Date.now() ? cachedTokens.tokens : null;

      if (!tokens) {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        const data = userSnap.data() || {};
        tokens = Array.from(
          new Set(
            [
              ...(Array.isArray((data as any).expoPushTokens) ? (data as any).expoPushTokens : []),
              (data as any).expoPushToken,
            ].filter(Boolean)
          )
        ) as string[];

        pushTokenCache.set(userId, {
          tokens,
          expiresAt: Date.now() + PUSH_TOKEN_CACHE_TTL_MS,
        });
      }

      if (!tokens.length) {
        console.warn(`[Push] No expo push tokens found for ${userId}`);
        return;
      }

      console.log(`[Push] Sending notification to ${tokens.length} token(s) for ${userId}`);

      const presentation = buildPushPresentation(notificationData);
      const nav = buildNavigationPayload(notificationData);

      await sendExpoPush(tokens, presentation, {
        screen: nav.screen,
        params: nav.params,
        notificationId: notificationData?.notificationId,
        type: notificationData?.type,
        refType: notificationData?.refType,
        refId: notificationData?.refId,
        actorId: notificationData?.actorId,
        actorUsername: notificationData?.actorUsername,
        actorAvatarURL: notificationData?.actorAvatarURL,
        actorVerified: notificationData?.actorVerified,
        refPreview: notificationData?.refPreview,
        refMediaURL: notificationData?.refMediaURL,
        totalLikesCount: notificationData?.totalLikesCount,
      });
    } catch (e) {
      console.error('[Push] sendForNotification failed', e);
    }
  },

  cleanup() {
    responseSubscription?.remove();
    receivedSubscription?.remove();
    responseSubscription = null;
    receivedSubscription = null;
    listenersInitialized = false;
    void clearLastNotificationResponseSafe();
  },
};
















