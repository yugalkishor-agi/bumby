import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing } from '../styles/theme';
import type { Conversation, User } from '../types/database';
import { messageService } from '../services/message.service';

// Hooks
import { useConversationsList } from '../hooks/messages/useConversationsList';
import { useConversationUsers } from '../hooks/messages/useConversationUsers';
import { useConversationPresence } from '../hooks/messages/useConversationPresence';
import { useConversationActions } from '../hooks/messages/useConversationActions';
import { useConversationSearch } from '../hooks/messages/useConversationSearch';
import { useConversationDrafts } from '../hooks/messages/useConversationDrafts';

// Components
import MessagesHeader from '../components/messages/MessagesHeader';
import MessagesTabs from '../components/messages/MessagesTabs';
import ActiveUsersList from '../components/messages/ActiveUsersList';
import ConversationList from '../components/messages/ConversationList';
import ConversationActionsSheet, {
  type ConversationAction,
} from '../components/messages/ConversationActionsSheet';

/**
 * Conversation flags (pinned / muted / archived) are written as per-user arrays,
 * but older documents stored `mutedBy` as a `userId -> { isMuted }` map.
 * Read either shape without trusting the declared type.
 */
const hasUserFlag = (flag: unknown, userId: string): boolean => {
  if (Array.isArray(flag)) return flag.includes(userId);
  if (flag && typeof flag === 'object') {
    const entry = (flag as Record<string, unknown>)[userId];
    if (typeof entry === 'boolean') return entry;
    return !!(entry as { isMuted?: boolean } | undefined)?.isMuted;
  }
  return false;
};

export default function MessagesScreenEnhanced() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const currentUserId = user?.userId ?? null;

  const initialTab = (route.params?.initialTab === 'requests' ? 'requests' : route.params?.initialTab === 'archived' ? 'archived' : 'chats');
  const [activeTab, setActiveTab] = useState<'chats' | 'requests' | 'archived'>(initialTab);

  const screenAppearAnim = useRef(new Animated.Value(0)).current;
  const screenAppearTranslateY = screenAppearAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  useFocusEffect(
    useCallback(() => {
      screenAppearAnim.setValue(1);
      return undefined;
    }, [screenAppearAnim])
  );

  const canDisplayPresence = useCallback((targetUser?: User | null) => targetUser?.settings?.showOnlineStatus !== false, []);

  // 1. Conversations List Hook
  const {
    conversations,
    requestConversations,
    archivedConversations,
    conversationUsers,
    loading: listLoading,
    refreshing: listRefreshing,
    refresh: listRefresh,
  } = useConversationsList({ currentUserId });

  // 2. Active Users Hook
  const {
    activeUsers,
    loading: activeUsersLoading,
  } = useConversationUsers({ currentUserId, canDisplayPresence });

  // 3. Presence Hook
  const {
    presenceUsers,
    typingConvos,
  } = useConversationPresence();

  // 4. Search Hook
  const {
    searchQuery,
    setSearchQuery,
  } = useConversationSearch({ currentUserId, conversations, conversationUsers });

  // 5. Drafts Hook
  const { drafts } = useConversationDrafts({
    currentUserId,
    conversations,
    requestConversations,
    archivedConversations,
  });

  // 6. Actions Hook
  const {
    pinConversation,
    muteConversation,
    archiveConversation,
    deleteConversation,
    markAsUnread,
    blockUser,
    acceptMessageRequest,
    declineMessageRequest,
  } = useConversationActions({
    currentUserId,
    onConversationUpdate: () => {}, // Handled by Firebase onSnapshot
    onConversationRemove: () => {}, // Handled by Firebase onSnapshot
  });

  // Action Sheet State
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetConversation, setActionSheetConversation] = useState<Conversation | null>(null);

  const getConversationParticipantIds = useCallback((conversation?: Partial<Conversation> | null) => {
    return Array.isArray(conversation?.participantIds) ? conversation.participantIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  }, []);

  const buildGroupChatParams = useCallback((conversation: Conversation) => {
    const participantIds = getConversationParticipantIds(conversation);
    return {
      userId: participantIds.find((id) => id !== (currentUserId || '')) || currentUserId || conversation.conversationId,
      conversationId: conversation.conversationId,
      conversationType: 'group',
      groupName: conversation.groupName || 'Group chat',
      groupAvatarURL: conversation.groupAvatarURL,
      groupDescription: (conversation as any).groupDescription || '',
      participantIds,
    };
  }, [currentUserId, getConversationParticipantIds]);

  const buildChatParams = useCallback((targetUser: User, targetConversationId: string, extra?: Record<string, any>) => ({
    userId: targetUser.userId,
    conversationId: targetConversationId,
    initialUser: {
      userId: targetUser.userId,
      username: targetUser.username,
      displayName: targetUser.displayName,
      avatarURL: targetUser.avatarURL,
      verified: targetUser.verified,
      isOnline: targetUser.isOnline,
      lastSeen: targetUser.lastSeen,
    },
    ...(extra || {}),
  }), []);

  const handleConversationPress = useCallback((conversation: Conversation) => {
    try {
      if (!conversation?.conversationId) {
        Alert.alert('Error', 'Unable to open this chat right now.');
        return;
      }
      
      if (conversation.type === 'group') {
        navigation.navigate('Chat', buildGroupChatParams(conversation));
      } else {
        const participantIds = getConversationParticipantIds(conversation);
        const otherUserId = participantIds.find((id) => id !== (user?.userId || ''));
        const otherUser = conversationUsers[conversation.conversationId];

        if (!otherUser?.userId) {
          Alert.alert('Error', 'User information not found.');
          return;
        }

        navigation.navigate('Chat', buildChatParams(otherUser, conversation.conversationId));
      }

      if (user?.userId) {
        messageService.markConversationAsRead(conversation.conversationId, user.userId).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to open conversation:', error);
      Alert.alert('Error', 'Unable to open this conversation right now.');
    }
  }, [navigation, user?.userId, conversationUsers, buildChatParams, buildGroupChatParams, getConversationParticipantIds]);

  const handleConversationLongPress = useCallback((conversation: Conversation) => {
    setActionSheetConversation(conversation);
    setActionSheetVisible(true);
  }, []);

  const handleActiveUserPress = (activeUser: User) => {
    if (!currentUserId) return;

    // Open the chat straight away. Resolving the conversation needs several
    // Firestore round trips (access check + document read/create), and awaiting
    // them here left the inbox hanging with no feedback.
    //
    // A conversation that is already in the inbox list is reused as-is so the
    // history stays in one place; otherwise the deterministic id is used and
    // the chat screen creates the document in the background.
    const existingConversation = conversations.find((conv) => {
      const otherUser = conversationUsers[conv.conversationId];
      return otherUser?.userId === activeUser.userId;
    });

    if (existingConversation) {
      const otherUser = conversationUsers[existingConversation.conversationId] || activeUser;
      navigation.navigate('Chat', buildChatParams(otherUser, existingConversation.conversationId));
      return;
    }

    const conversationId = messageService.getDirectConversationId(currentUserId, activeUser.userId);
    navigation.navigate('Chat', buildChatParams(activeUser, conversationId));
  };

  const displayedConversations = activeTab === 'requests' 
    ? requestConversations 
    : activeTab === 'archived' 
      ? archivedConversations 
      : conversations;

  const sheetConversation = actionSheetConversation;
  const sheetOtherUser = sheetConversation
    ? conversationUsers[sheetConversation.conversationId]
    : undefined;

  const sheetTitle = !sheetConversation
    ? undefined
    : sheetConversation.type === 'group'
      ? sheetConversation.groupName || 'Group chat'
      : sheetOtherUser?.displayName || sheetOtherUser?.username || 'Conversation';

  const sheetActions: ConversationAction[] = !sheetConversation || !currentUserId
    ? []
    : [
        {
          key: 'pin',
          label: hasUserFlag(sheetConversation.pinnedBy, currentUserId)
            ? 'Unpin conversation'
            : 'Pin conversation',
          onPress: () =>
            pinConversation(
              sheetConversation.conversationId,
              !hasUserFlag(sheetConversation.pinnedBy, currentUserId)
            ),
        },
        {
          key: 'mute',
          label: hasUserFlag(sheetConversation.mutedBy, currentUserId)
            ? 'Unmute notifications'
            : 'Mute notifications',
          onPress: () =>
            muteConversation(
              sheetConversation.conversationId,
              !hasUserFlag(sheetConversation.mutedBy, currentUserId)
            ),
        },
        {
          key: 'archive',
          label: hasUserFlag(sheetConversation.archivedBy, currentUserId)
            ? 'Unarchive conversation'
            : 'Archive conversation',
          onPress: () =>
            archiveConversation(
              sheetConversation.conversationId,
              !hasUserFlag(sheetConversation.archivedBy, currentUserId)
            ),
        },
        {
          key: 'mark-unread',
          label: 'Mark as unread',
          onPress: () => markAsUnread(sheetConversation.conversationId),
        },
        {
          key: 'delete',
          label: 'Delete conversation',
          destructive: true,
          onPress: () => deleteConversation(sheetConversation.conversationId),
        },
        ...(sheetConversation.type === 'direct' && sheetOtherUser?.userId
          ? [
              {
                key: 'block',
                label: 'Block user',
                destructive: true,
                onPress: () => blockUser(sheetConversation, sheetOtherUser),
              },
            ]
          : []),
      ];

  return (
    <View style={styles.container}>
      <MessagesHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewMessage={() => navigation.navigate('NewMessage')}
        onNewGroup={() => navigation.navigate('NewGroup')}
        screenAppearTranslateY={screenAppearTranslateY}
      />
      
      {!searchQuery && (
        <MessagesTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          requestCount={requestConversations.length}
          archivedCount={archivedConversations.length}
        />
      )}

      {!searchQuery && activeTab === 'chats' && (
        <ActiveUsersList
          users={activeUsers}
          loading={activeUsersLoading}
          onUserPress={handleActiveUserPress}
        />
      )}

      <ConversationList
        conversations={displayedConversations}
        conversationUsers={conversationUsers}
        currentUserId={currentUserId}
        refreshing={listRefreshing}
        onRefresh={listRefresh}
        onConversationPress={handleConversationPress}
        onConversationLongPress={handleConversationLongPress}
        drafts={drafts}
        presenceUsers={presenceUsers}
        typingConvos={typingConvos}
      />

      <ConversationActionsSheet
        visible={actionSheetVisible}
        title={sheetTitle}
        actions={sheetActions}
        onClose={() => setActionSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
});
