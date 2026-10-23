import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { db, auth } from '../config/firebase';
import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { NavigationService } from './navigation.service';
import { toast } from '../contexts/ToastContext';
import { runtimeConfig } from '../config/runtimeConfig';

// Client-side push sending is handled by the Supabase Edge Function (FCM V1).
// The legacy Expo push path was removed with the Expo sender itself.
const PUSH_TOKEN_CACHE_TTL_MS = 60 * 1000;
const pushTokenCache = new Map<string, { tokens: string[]; expiresAt: number }>();

const SUPABASE_URL = runtimeConfig.supabase.url ?? '';
const SUPABASE_ANON_KEY = runtimeConfig.supabase.anonKey ?? '';

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
  // Hardcoded fallback — ensures dev builds (npx expo run:android) also get
  // a valid project ID. Without this, Constants.easConfig is undefined in
  // dev mode and getExpoPushTokenAsync registers against the wrong project.
  const fallbackId = '884a38af-642d-4ee4-bc42-1ce208a78b6a';
  return easId || expoId || fallbackId;
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

// Minimal title/body builder for the Expo push API fallback path.
function buildExpoNotification(n: any): { title: string; body: string } {
  const actor = getActorName(n?.actorUsername);
  const preview = trimPushText(n?.refPreview, 120);
  const type = String(n?.type ?? '');

  switch (type) {
    case 'dm':         return { title: `New message from ${actor}`, body: preview || 'Open chat to see the message.' };
    case 'like':       return { title: `${actor} liked your post`, body: 'Tap to view.' };
    case 'comment':    return { title: `${actor} commented on your post`, body: preview || 'Tap to read.' };
    case 'comment_reply': return { title: `${actor} replied to your comment`, body: preview || 'Tap to read.' };
    case 'follow':     return { title: `${actor} started following you`, body: 'Tap to view their profile.' };
    case 'follow_request': return { title: `${actor} requested to follow you`, body: 'Tap to review.' };
    case 'mention':    return { title: `${actor} mentioned you`, body: preview || 'Tap to see where.' };
    case 'story_view': return { title: `${actor} viewed your story`, body: 'Tap to see story activity.' };
    case 'story_reply': return { title: `${actor} replied to your story`, body: preview || 'Tap to read.' };
    case 'story_like': return { title: `${actor} liked your story`, body: 'Tap to see story activity.' };
    case 'collaboration_request': return { title: `${actor} sent a collaboration request`, body: preview || 'Tap to review.' };
    default:           return { title: `New activity from ${actor}`, body: preview || 'Tap to view.' };
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
      if (Platform.OS === 'web') {
        console.warn('[Push] Skipping push registration on web');
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

      // --- Try native FCM token first (physical device, some emulators with Play Services) ---
      let fcmToken: string | null = null;
      try {
        const tokenResp = await Notifications.getDevicePushTokenAsync();
        const raw = tokenResp.data as string;
        // Reject obviously fake/short tokens from emulators
        if (raw && raw.length >= 100) {
          fcmToken = raw;
          console.log(`[Push] Got FCM device token for ${userId} (len=${raw.length})`);
        } else {
          console.warn(`[Push] FCM device token looks invalid (len=${raw?.length ?? 0}) raw="${String(raw).slice(0,30)}", will try Expo token`);
        }
      } catch (fcmErr) {
        console.warn('[Push] getDevicePushTokenAsync failed, will try Expo token:', fcmErr);
      }

      // --- Fall back to Expo push token (works on emulators, BlueStacks, all devices) ---
      let expoToken: string | null = null;
      if (!fcmToken) {
        try {
          const projectId = resolveProjectId();
          console.log(`[Push] Attempting Expo push token with projectId="${projectId}"`);
          if (!projectId) {
            console.warn('[Push] No EAS project ID — cannot get Expo push token');
          } else {
            const expoResp = await Notifications.getExpoPushTokenAsync({ projectId });
            expoToken = expoResp.data;
            console.log(`[Push] Got Expo push token for ${userId}: ${expoToken?.slice(0, 40)}`);
          }
        } catch (expoErr: any) {
          console.warn('[Push] getExpoPushTokenAsync also failed:', expoErr?.message ?? expoErr);
        }
      }

      if (!fcmToken && !expoToken) {
        console.warn('[Push] Could not obtain any push token for', userId);
        return undefined;
      }

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const existing = userSnap.data() ?? {};

      const updates: Record<string, any> = {};

      if (fcmToken && existing.fcmToken !== fcmToken) {
        updates.fcmToken = fcmToken;
        updates.fcmTokenUpdatedAt = new Date();
        // Clear Expo token since FCM path is preferred
        updates.expoPushToken = deleteField();
        updates.expoPushTokens = deleteField();
      }

      if (!fcmToken && expoToken && existing.expoPushToken !== expoToken) {
        updates.expoPushToken = expoToken;
        updates.expoPushTokenUpdatedAt = new Date();
        // Clear any stale FCM token so sendForNotification doesn't use it
        updates.fcmToken = deleteField();
        updates.fcmTokenUpdatedAt = deleteField();
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, updates);
        console.log(`[Push] Token updated in Firestore for ${userId} (fcm=${!!fcmToken}, expo=${!!expoToken})`);
      }

      const activeToken = fcmToken ?? expoToken!;
      pushTokenCache.set(userId, {
        tokens: [activeToken],
        expiresAt: Date.now() + PUSH_TOKEN_CACHE_TTL_MS,
      });

      return activeToken;
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
        fcmToken: deleteField(),
        fcmTokenUpdatedAt: deleteField(),
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
      const userId = notificationData?.userId;
      if (!userId) {
        console.warn('[Push] sendForNotification called without userId');
        return;
      }

      // ── 1. Resolve token from cache or Firestore ────────────────────────────
      const cachedEntry = pushTokenCache.get(userId);
      const cachedToken = cachedEntry && cachedEntry.expiresAt > Date.now() ? (cachedEntry.tokens[0] ?? null) : null;

      let fcmToken: string | null = null;
      let expoToken: string | null = null;

      if (cachedToken) {
        // Determine type from cache
        if (cachedToken.startsWith('ExponentPushToken') || cachedToken.startsWith('ExpoPushToken')) {
          expoToken = cachedToken;
        } else if (cachedToken.length >= 100) {
          fcmToken = cachedToken;
        }
      }

      if (!fcmToken && !expoToken) {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        const data = userSnap.data() as any;
        const rawFcm: string | null = data?.fcmToken ?? null;
        const rawExpo: string | null = data?.expoPushToken ?? null;

        console.log(`[Push] Firestore tokens for ${userId}: fcmToken len=${rawFcm?.length ?? 0}, expoPushToken="${rawExpo?.slice(0,40) ?? 'none'}"`);

        // Prefer FCM if it looks valid
        if (rawFcm && rawFcm.length >= 100 &&
            !rawFcm.startsWith('ExponentPushToken') && !rawFcm.startsWith('ExpoPushToken')) {
          fcmToken = rawFcm;
        } else if (rawExpo && (rawExpo.startsWith('ExponentPushToken') || rawExpo.startsWith('ExpoPushToken'))) {
          expoToken = rawExpo;
        } else if (rawFcm) {
          // FCM token exists but looks stale/invalid — log and skip
          console.warn(`[Push] Stored FCM token for ${userId} looks invalid (len=${rawFcm.length}), no Expo fallback found`);
          pushTokenCache.delete(userId);
          return;
        }

        const activeToken = fcmToken ?? expoToken;
        if (activeToken) {
          pushTokenCache.set(userId, { tokens: [activeToken], expiresAt: Date.now() + PUSH_TOKEN_CACHE_TTL_MS });
        }
      }

      // ── 2. FCM path — via Supabase Edge Function ────────────────────────────
      if (fcmToken) {
        if (!SUPABASE_URL) {
          console.warn('[Push] SUPABASE_URL not set, skipping FCM push');
          return;
        }

        console.log(`[Push] Sending via FCM edge function for ${userId}`);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            fcmToken,
            notification: {
              type: notificationData.type,
              actorUsername: notificationData.actorUsername,
              actorAvatarURL: notificationData.actorAvatarURL,
              actorId: notificationData.actorId,
              refPreview: notificationData.refPreview,
              refMediaURL: notificationData.refMediaURL,
              refType: notificationData.refType,
              refId: notificationData.refId,
              notificationId: notificationData.notificationId,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error(`[Push] Edge Function error (${res.status}):`, err);

          // 410 = stale/invalid FCM token — purge and try Expo fallback if available
          if (res.status === 410) {
            try {
              const userRef = doc(db, 'users', userId);
              const userSnap = await getDoc(userRef);
              const fallbackExpo: string | null = (userSnap.data() as any)?.expoPushToken ?? null;
              await updateDoc(userRef, { fcmToken: deleteField(), fcmTokenUpdatedAt: deleteField() });
              pushTokenCache.delete(userId);
              console.warn(`[Push] Purged stale FCM token for ${userId}`);

              if (fallbackExpo && (fallbackExpo.startsWith('ExponentPushToken') || fallbackExpo.startsWith('ExpoPushToken'))) {
                console.log(`[Push] Retrying with Expo fallback token for ${userId}`);
                expoToken = fallbackExpo;
                // fall through to Expo path below
              } else {
                return;
              }
            } catch (purgeErr) {
              console.warn('[Push] Failed to purge stale FCM token', purgeErr);
              return;
            }
          } else {
            return;
          }
        } else {
          const result = await res.json();
          console.log(`[Push] FCM notification delivered:`, result?.name ?? 'ok');
          return;
        }
      }

      // ── 3. Expo path — direct to Expo push API (emulator / BlueStacks fallback) ──
      if (expoToken) {
        const { title, body: bodyText } = buildExpoNotification(notificationData);

        console.log(`[Push] Sending via Expo push API for ${userId}`);

        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: expoToken,
            title,
            body: bodyText,
            sound: 'default',
            priority: 'high',
            channelId: notificationData.type === 'dm' ? 'messages' : 'social',
            data: {
              type: notificationData.type ?? '',
              notificationId: notificationData.notificationId ?? '',
              refType: notificationData.refType ?? '',
              refId: notificationData.refId ?? '',
              actorId: notificationData.actorId ?? '',
              actorUsername: notificationData.actorUsername ?? '',
              actorAvatarURL: notificationData.actorAvatarURL ?? '',
              refPreview: notificationData.refPreview ?? '',
              refMediaURL: notificationData.refMediaURL ?? '',
            },
          }),
        });

        if (!res.ok) {
          console.error(`[Push] Expo push API error (${res.status}):`, await res.text());
          return;
        }

        const result = await res.json();
        const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
        if (ticket?.status === 'error') {
          console.error('[Push] Expo push ticket error:', ticket);
        } else {
          console.log(`[Push] Expo notification delivered (id=${ticket?.id ?? 'ok'})`);
        }
        return;
      }

      console.warn(`[Push] No valid token found for ${userId} — notification not delivered`);
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
















