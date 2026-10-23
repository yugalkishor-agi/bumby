// ConversationList.tsx
// Purpose: List of conversations with FlashList for performance
// Extracted from: MessagesScreenEnhanced.tsx — Session 002

import React, { memo, useCallback } from 'react';
import { View, Text, RefreshControl, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { colors, spacing, typography } from '../../styles/theme';
import { ConversationRow } from './ConversationRow';
import type { Conversation, User } from '../../types/database';

interface ConversationListProps {
  conversations: Conversation[];
  conversationUsers: { [key: string]: User };
  currentUserId: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onConversationPress: (conversation: Conversation) => void;
  onConversationLongPress?: (conversation: Conversation) => void;
  drafts?: { [conversationId: string]: string };
  presenceUsers?: { [userId: string]: { isOnline?: boolean; lastSeen?: any } };
  typingConvos?: { [conversationId: string]: boolean };
}

const keyExtractor = (item: Conversation) => item.conversationId;

const renderEmpty = () => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>No conversations yet</Text>
    <Text style={styles.emptySubtext}>Start a conversation to see it here</Text>
  </View>
);

interface ConversationRowItemProps {
  conversation: Conversation;
  conversationUser?: User;
  currentUserId: string | null;
  draft?: string;
  isTyping?: boolean;
  isOnline?: boolean;
  onConversationPress: (conversation: Conversation) => void;
  onConversationLongPress?: (conversation: Conversation) => void;
}

/**
 * Memoised per-row shell. The inline press handlers are created here, not in
 * `renderItem`, so scrolling or updating one conversation only re-renders the
 * rows whose own primitive props actually changed.
 */
const ConversationRowItem = memo(({
  conversation,
  conversationUser,
  currentUserId,
  draft,
  isTyping,
  isOnline,
  onConversationPress,
  onConversationLongPress,
}: ConversationRowItemProps) => (
  <ConversationRow
    conversation={conversation}
    conversationUser={conversationUser}
    currentUserId={currentUserId}
    draft={draft}
    isTyping={isTyping}
    isOnline={isOnline}
    activeTab="chats"
    onPress={() => onConversationPress(conversation)}
    onLongPress={() => onConversationLongPress?.(conversation)}
    onAvatarPress={() => onConversationPress(conversation)}
    onMorePress={() => onConversationLongPress?.(conversation)}
  />
));

ConversationRowItem.displayName = 'ConversationRowItem';

const ConversationList = memo(({
  conversations,
  conversationUsers,
  currentUserId,
  refreshing,
  onRefresh,
  onConversationPress,
  onConversationLongPress,
  drafts = {},
  presenceUsers = {},
  typingConvos = {},
}: ConversationListProps) => {
  const renderConversation = useCallback(({ item }: { item: Conversation }) => {
    const otherUser = conversationUsers[item.conversationId];
    const presence = otherUser?.userId ? presenceUsers[otherUser.userId] : undefined;

    return (
      <ConversationRowItem
        conversation={item}
        conversationUser={otherUser}
        currentUserId={currentUserId ?? null}
        draft={drafts[item.conversationId]}
        isTyping={typingConvos[item.conversationId]}
        isOnline={presence?.isOnline}
        onConversationPress={onConversationPress}
        onConversationLongPress={onConversationLongPress}
      />
    );
  }, [conversationUsers, currentUserId, drafts, typingConvos, presenceUsers, onConversationPress, onConversationLongPress]);

  return (
    <FlashList
      data={conversations}
      renderItem={renderConversation}
      keyExtractor={keyExtractor}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text.secondary}
          />
        ) : undefined
      }
      ListEmptyComponent={renderEmpty}
      estimatedItemSize={76}
    />
  );
});

ConversationList.displayName = 'ConversationList';

export default ConversationList;

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.secondary,
  },
});
