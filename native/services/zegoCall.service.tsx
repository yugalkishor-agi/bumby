import React from 'react';
import { Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { zegoConfig } from '../config/zego';
import type { User } from '../types/database';
import { messageService } from './message.service';
import { navigationRef } from './navigation.service';

let _initializedUserId: string | null = null;
let _initPromise: Promise<void> | null = null;
let _currentUser: User | null = null;

// conversationId of the active/last call, used to post system messages
let _activeCallConversationId: string | null = null;
let _activeCallIsVideo: boolean = false;
let _activeCallStartedAt: number | null = null;

const _avatarMap = new Map<string, string>();

export function registerZegoAvatar(userId: string, avatarURL?: string | null) {
  if (!userId || !avatarURL) return;
  _avatarMap.set(userId, avatarURL);
}

export function registerZegoAvatars(users: Array<{ userId: string; avatarURL?: string | null }>) {
  for (const u of users) {
    if (u?.userId && u?.avatarURL) _avatarMap.set(u.userId, u.avatarURL);
  }
}

export function clearZegoAvatars() {
  _avatarMap.clear();
}

/** Track which conversation a call belongs to so we can post system messages */
export function setActiveCallConversation(conversationId: string, isVideo: boolean) {
  _activeCallConversationId = conversationId;
  _activeCallIsVideo = isVideo;
  _activeCallStartedAt = null;
}

function getSdk() {
  const prebuilt = require('@zegocloud/zego-uikit-prebuilt-call-rn');
  const ZegoUIKitPrebuiltCallService = prebuilt.default || prebuilt.ZegoUIKitPrebuiltCallService;
  const ZIM = require('zego-zim-react-native');
  const ZPNs = require('zego-zpns-react-native');
  const {
    ZegoInvitationType,
    ONE_ON_ONE_VIDEO_CALL_CONFIG,
    ONE_ON_ONE_VOICE_CALL_CONFIG,
    GROUP_VIDEO_CALL_CONFIG,
    GROUP_VOICE_CALL_CONFIG,
  } = prebuilt;
  return {
    prebuilt,
    ZegoUIKitPrebuiltCallService,
    ZIM,
    ZPNs,
    ZegoInvitationType,
    ONE_ON_ONE_VIDEO_CALL_CONFIG,
    ONE_ON_ONE_VOICE_CALL_CONFIG,
    GROUP_VIDEO_CALL_CONFIG,
    GROUP_VOICE_CALL_CONFIG,
  };
}

/** Post a system message to the chat for a call event */
async function postCallSystemMessage(
  text: string,
  metadata?: Record<string, any>
) {
  if (!_activeCallConversationId || !_currentUser) return;
  try {
    await messageService.sendMessage(_activeCallConversationId, {
      senderId: _currentUser.userId,
      senderUsername: _currentUser.username,
      senderAvatarURL: _currentUser.avatarURL,
      type: 'system',
      text,
      ...(metadata ? { poll: undefined, location: undefined, ...metadata } : {}),
    });
  } catch (e) {
    // Non-critical — don't break call flow
    console.warn('[ZegoCall] Failed to post system message:', e);
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export const zegoCallService = {
  isSupported: Platform.OS === 'android' || Platform.OS === 'ios',

  get isInitialized() {
    return _initializedUserId !== null;
  },

  get currentUserId() {
    return _initializedUserId;
  },

  async initialize(currentUser: User): Promise<void> {
    if (!this.isSupported) {
      throw new Error('Zego calls are only supported on Android and iOS');
    }

    if (_initializedUserId === currentUser.userId && _initPromise) {
      _currentUser = currentUser;
      return _initPromise;
    }

    if (_initializedUserId && _initializedUserId !== currentUser.userId) {
      await this.uninitialize();
    }

    if (_initPromise) {
      return _initPromise;
    }

    _currentUser = currentUser;

    const {
      ZegoUIKitPrebuiltCallService,
      ZIM,
      ZPNs,
      ZegoInvitationType,
      ONE_ON_ONE_VIDEO_CALL_CONFIG,
      ONE_ON_ONE_VOICE_CALL_CONFIG,
      GROUP_VIDEO_CALL_CONFIG,
      GROUP_VOICE_CALL_CONFIG,
    } = getSdk();

    registerZegoAvatars([{ userId: currentUser.userId, avatarURL: currentUser.avatarURL }]);

    _initPromise = (async () => {
      try {
        await ZegoUIKitPrebuiltCallService.init(
          zegoConfig.appID,
          zegoConfig.appSign,
          currentUser.userId,
          currentUser.displayName || currentUser.username,
          [ZIM, ZPNs],
          {
            ringtoneConfig: {
              incomingCallFileName: 'zego_incoming.mp3',
              outgoingCallFileName: 'zego_outgoing.mp3',
            },
            androidNotificationConfig: {
              channelID: 'ZegoUIKit',
              channelName: 'ZegoUIKit',
            },
            notifyWhenAppRunningInBackgroundOrQuit: true,
            requireConfig: (data: any) => {
              const isVideo = data.type === ZegoInvitationType?.videoCall;
              const isGroup =
                Array.isArray(data.invitees) ? data.invitees.length > 1 : false;
              const base = isGroup
                ? isVideo
                  ? GROUP_VIDEO_CALL_CONFIG
                  : GROUP_VOICE_CALL_CONFIG
                : isVideo
                ? ONE_ON_ONE_VIDEO_CALL_CONFIG
                : ONE_ON_ONE_VOICE_CALL_CONFIG;

              return {
                ...base,

                // ── Avatar builder: use real profile photo ──────────────────
                avatarBuilder: ({ userInfo }: any) => {
                  const url = _avatarMap.get(userInfo?.userID);
                  if (url) {
                    return (
                      <Image
                        source={{ uri: url }}
                        style={styles.avatar}
                        resizeMode="cover"
                      />
                    );
                  }
                  // Fallback: colored circle with initial
                  const name = String(
                    userInfo?.userName || userInfo?.userID || '?'
                  ).trim();
                  const initial = name.charAt(0).toUpperCase();
                  return (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initial}</Text>
                    </View>
                  );
                },

                // ── Call started ────────────────────────────────────────────
                onCallStart: () => {
                  _activeCallStartedAt = Date.now();
                  const callType = isVideo ? 'video' : 'voice';
                  void postCallSystemMessage(
                    `📞 ${callType === 'video' ? 'Video' : 'Voice'} call started`,
                    { callEvent: 'started', callType }
                  );
                },

                // ── Call ended ──────────────────────────────────────────────
                onCallEnd: (callID: string, reason: number, duration: number) => {
                  const callType = isVideo ? 'video' : 'voice';
                  const durSec =
                    duration > 0
                      ? duration
                      : _activeCallStartedAt
                      ? Math.floor((Date.now() - _activeCallStartedAt) / 1000)
                      : 0;
                  const durStr = formatDuration(durSec);
                  const text = durStr
                    ? `${callType === 'video' ? '📹' : '📞'} ${callType === 'video' ? 'Video' : 'Voice'} call ended · ${durStr}`
                    : `${callType === 'video' ? '📹' : '📞'} ${callType === 'video' ? 'Video' : 'Voice'} call ended`;
                  void postCallSystemMessage(text, {
                    callEvent: 'ended',
                    callType,
                    duration: durSec,
                  });
                  _activeCallStartedAt = null;

                  // Navigate back if still on call screen
                  try {
                    const nav = navigationRef.current;
                    const route = nav?.getCurrentRoute?.();
                    const name = route?.name;
                    if (
                      name === 'ZegoUIKitPrebuiltCallInCallScreen' ||
                      name === 'ZegoUIKitPrebuiltCallWaitingScreen'
                    ) {
                      if (nav?.canGoBack?.()) nav.goBack();
                    }
                  } catch {}
                },

                // ── Call declined ───────────────────────────────────────────
                onCallInvitationRejected: ({ reason }: any) => {
                  const callType = isVideo ? 'video' : 'voice';
                  void postCallSystemMessage(
                    `🚫 ${callType === 'video' ? 'Video' : 'Voice'} call declined`,
                    { callEvent: 'declined', callType }
                  );

                  // Dismiss waiting screen for caller
                  try {
                    const nav = navigationRef.current;
                    const route = nav?.getCurrentRoute?.();
                    if (route?.name === 'ZegoUIKitPrebuiltCallWaitingScreen') {
                      if (nav?.canGoBack?.()) nav.goBack();
                    }
                  } catch {}
                },

                // ── Call missed / timed out ─────────────────────────────────
                onCallInvitationTimeout: () => {
                  const callType = isVideo ? 'video' : 'voice';
                  void postCallSystemMessage(
                    `⏱ Missed ${callType === 'video' ? 'video' : 'voice'} call`,
                    { callEvent: 'missed', callType }
                  );

                  try {
                    const nav = navigationRef.current;
                    const route = nav?.getCurrentRoute?.();
                    if (route?.name === 'ZegoUIKitPrebuiltCallWaitingScreen') {
                      if (nav?.canGoBack?.()) nav.goBack();
                    }
                  } catch {}
                },

                // ── Caller cancelled before answer ──────────────────────────
                onCallInvitationCancelled: () => {
                  const callType = isVideo ? 'video' : 'voice';
                  void postCallSystemMessage(
                    `⏱ Missed ${callType === 'video' ? 'video' : 'voice'} call`,
                    { callEvent: 'missed', callType }
                  );
                },
              };
            },
          }
        );
        _initializedUserId = currentUser.userId;
      } catch (e) {
        _initPromise = null;
        throw e;
      }
    })();

    return _initPromise;
  },

  async uninitialize(): Promise<void> {
    if (!this.isSupported) return;
    const { ZegoUIKitPrebuiltCallService } = getSdk();
    try {
      await ZegoUIKitPrebuiltCallService.uninit();
    } catch {}
    _initializedUserId = null;
    _initPromise = null;
    _currentUser = null;
    _activeCallConversationId = null;
    _activeCallStartedAt = null;
    clearZegoAvatars();
  },

  async startCall(params: {
    invitees: Array<{ userID: string; userName: string }>;
    isVideoCall: boolean;
    navigation?: any;
    conversationId?: string;
    timeout?: number;
    resourceID?: string;
  }): Promise<void> {
    if (!this.isSupported) {
      Alert.alert('Not supported', 'Calls are only available on Android and iOS.');
      return;
    }
    const invitees = (params.invitees || []).filter((i) => i && i.userID);
    if (invitees.length === 0) {
      Alert.alert('No recipients', 'No valid recipients to call.');
      return;
    }

    const nav = params.navigation || navigationRef.current;
    if (!nav) {
      Alert.alert('Navigation error', 'Unable to start call.');
      return;
    }

    // Track which conversation this call belongs to
    if (params.conversationId) {
      setActiveCallConversation(params.conversationId, params.isVideoCall);
    }

    try {
      const { ZegoUIKitPrebuiltCallService } = getSdk();
      await ZegoUIKitPrebuiltCallService.sendCallInvitation(
        invitees,
        !!params.isVideoCall,
        nav,
        {
          resourceID: params.resourceID || zegoConfig.resourceID,
          timeout: typeof params.timeout === 'number' ? params.timeout : 60,
        }
      );
    } catch (e: any) {
      Alert.alert('Call failed', e?.message || 'Failed to start call');
      throw e;
    }
  },
};

const styles = StyleSheet.create({
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
});
