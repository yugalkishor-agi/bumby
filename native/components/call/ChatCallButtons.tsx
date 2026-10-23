import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/user.service';
import {
  zegoCallService,
  registerZegoAvatar,
  registerZegoAvatars,
} from '../../services/zegoCall.service';

interface ChatCallButtonsProps {
  isGroupConversation?: boolean;
  otherUserId?: string | null;
  otherUser?: any;
  groupParticipantIds?: string[] | null;
  conversationId?: string | null;
  accentColor?: string;
  disabled?: boolean;
}

export default function ChatCallButtons({
  isGroupConversation = false,
  otherUserId,
  otherUser,
  groupParticipantIds,
  conversationId,
  accentColor = '#EC4899',
  disabled = false,
}: ChatCallButtonsProps) {
  const navigation = useNavigation();
  const { user } = useAuth();
  // Each button has its own loading state so they are fully independent
  const [startingVoice, setStartingVoice] = useState(false);
  const [startingVideo, setStartingVideo] = useState(false);

  const ensureInitialized = useCallback(async () => {
    if (!user) return;
    if (!zegoCallService.isInitialized || zegoCallService.currentUserId !== user.userId) {
      await zegoCallService.initialize(user);
    } else {
      registerZegoAvatar(user.userId, user.avatarURL);
    }
  }, [user]);

  const start = useCallback(
    async (isVideoCall: boolean) => {
      if (disabled) return;
      if (isVideoCall ? startingVideo : startingVoice) return;
      if (!user) return;
      if (!zegoCallService.isSupported) {
        Alert.alert('Not supported', 'Calls are only available on mobile devices.');
        return;
      }

      const setLoading = isVideoCall ? setStartingVideo : setStartingVoice;

      try {
        setLoading(true);
        await ensureInitialized();

        if (isGroupConversation) {
          const ids = Array.isArray(groupParticipantIds)
            ? groupParticipantIds.filter((id) => id && id !== user.userId)
            : [];
          if (ids.length === 0) {
            Alert.alert('No participants', 'No other participants to call.');
            return;
          }
          const usersMap = await userService
            .getUsersByIds(ids)
            .catch(() => ({} as Record<string, any>));
          const invitees = ids
            .map((id) => {
              const u = usersMap[id];
              return { userID: id, userName: u?.displayName || u?.username || id };
            })
            .filter((i) => i.userID);
          registerZegoAvatars([
            { userId: user.userId, avatarURL: user.avatarURL },
            ...invitees.map((i) => ({
              userId: i.userID,
              avatarURL: usersMap[i.userID]?.avatarURL,
            })),
          ]);
          await zegoCallService.startCall({
            invitees,
            isVideoCall,
            navigation,
            conversationId: conversationId ?? undefined,
          });
          return;
        }

        const targetId = otherUserId || otherUser?.userId;
        if (!targetId) {
          Alert.alert('No user', 'Unable to start call with this user.');
          return;
        }
        const target =
          otherUser && otherUser.userId === targetId
            ? otherUser
            : await userService.getUser(targetId).catch(() => null);

        registerZegoAvatars([
          { userId: user.userId, avatarURL: user.avatarURL },
          { userId: targetId, avatarURL: target?.avatarURL || otherUser?.avatarURL },
        ]);

        await zegoCallService.startCall({
          invitees: [
            {
              userID: targetId,
              userName:
                target?.displayName ||
                target?.username ||
                otherUser?.displayName ||
                otherUser?.username ||
                targetId,
            },
          ],
          isVideoCall,
          navigation,
          conversationId: conversationId ?? undefined,
        });
      } catch {
        // errors already surfaced by the service layer
      } finally {
        setLoading(false);
      }
    },
    [
      disabled,
      startingVoice,
      startingVideo,
      user,
      ensureInitialized,
      isGroupConversation,
      groupParticipantIds,
      navigation,
      otherUserId,
      otherUser,
      conversationId,
    ]
  );

  if (!zegoCallService.isSupported) return null;

  const busy = startingVoice || startingVideo;

  return (
    <View style={styles.container}>
      {/* Voice call */}
      <TouchableOpacity
        style={[styles.btn, startingVoice && styles.btnBusy]}
        onPress={() => start(false)}
        disabled={disabled || busy}
        activeOpacity={0.7}
        accessibilityLabel="Voice call"
        accessibilityRole="button"
      >
        {startingVoice ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons name="call" size={19} color={accentColor} />
        )}
      </TouchableOpacity>

      {/* Video call */}
      <TouchableOpacity
        style={[styles.btn, startingVideo && styles.btnBusy]}
        onPress={() => start(true)}
        disabled={disabled || busy}
        activeOpacity={0.7}
        accessibilityLabel="Video call"
        accessibilityRole="button"
      >
        {startingVideo ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons name="videocam" size={21} color={accentColor} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  btn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  btnBusy: {
    opacity: 0.6,
  },
});
