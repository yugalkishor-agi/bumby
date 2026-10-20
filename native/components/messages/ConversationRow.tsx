import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import type { User as DBUser } from '../../types/database';

/**
 * The slice of a user document this row actually renders. Derived from the
 * schema so the field names can never drift, but kept narrow (and all-but-id
 * optional) because callers may pass a partially-loaded participant.
 */
type ConversationUser = Pick<DBUser, 'userId' | 'username'> &
  Partial<Pick<DBUser, 'displayName' | 'avatarURL' | 'verified' | 'isOnline'>>;

interface Conversation {
  conversationId: string;
  type: 'direct' | 'group';
  groupName?: string;
  groupAvatarURL?: string;
  participantIds: string[];
  lastMessage?: {
    text?: string;
    senderId: string;
    timestamp: any;
    mediaType?: 'image' | 'video' | 'audio';
    type?: string;
  };
  unreadCounts?: { [userId: string]: number };
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  restrictedBy?: string[];
  e2ee?: { enabled?: boolean };
}

interface ConversationRowProps {
  conversation: Conversation;
  currentUserId?: string | null;
  conversationUser?: ConversationUser | null;
  draft?: string;
  isTyping?: boolean;
  isOnline?: boolean;
  isRequest?: boolean;
  showRequestBadge?: boolean;
  activeTab: 'chats' | 'requests' | 'archived';
  onPress: () => void;
  onLongPress: () => void;
  onAvatarPress: () => void;
  onMorePress: (event: any) => void;
  onAcceptRequest?: () => void;
  onDeclineRequest?: () => void;
}

export const ConversationRow = React.memo<ConversationRowProps>(({
  conversation,
  currentUserId,
  conversationUser,
  draft,
  isTyping,
  isOnline,
  isRequest,
  showRequestBadge,
  activeTab,
  onPress,
  onLongPress,
  onAvatarPress,
  onMorePress,
  onAcceptRequest,
  onDeclineRequest,
}) => {
  const isGroup = conversation.type === 'group';
  const lastMessage = conversation.lastMessage;
  const isLastFromMe = lastMessage?.senderId === currentUserId;
  const hasDraft = !!draft && draft.trim().length > 0;
  const unread = conversation.unreadCounts?.[currentUserId || ''] || 0;

  const previewMeta = getLastMessagePreviewMeta(conversation, lastMessage);
  const previewText = hasDraft
    ? draft
    : isTyping
    ? 'Typing...'
    : previewMeta?.text || 'Message';

  const shouldPrefixYou =
    isLastFromMe &&
    !isTyping &&
    lastMessage?.type !== 'group_activity' &&
    lastMessage?.type !== 'system';

  const conversationTitle = isGroup
    ? conversation.groupName || 'Group chat'
    : conversationUser?.displayName || conversationUser?.username || 'Unknown User';

  const conversationAvatar = isGroup ? conversation.groupAvatarURL : conversationUser?.avatarURL;

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    const date =
      typeof timestamp?.toDate === 'function'
        ? timestamp.toDate()
        : typeof timestamp?.seconds === 'number'
        ? new Date(timestamp.seconds * 1000)
        : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={[styles.conversationItem, conversation.isPinned && styles.pinnedConversation]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      activeOpacity={0.7}
    >
      <View style={styles.conversationAvatar}>
        <TouchableOpacity activeOpacity={0.85} onPress={onAvatarPress}>
          <Avatar source={conversationAvatar} size={50} fallbackText={conversationTitle} />
        </TouchableOpacity>
        {isOnline && <View style={styles.onlineIndicator} />}
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <View style={styles.conversationNameContainer}>
            <Text style={styles.conversationName} numberOfLines={1}>
              {conversationTitle}
            </Text>
            {!isGroup && conversationUser?.verified && <VerifiedBadge size={16} />}
            {showRequestBadge && (
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>Request</Text>
              </View>
            )}
            {conversation.isPinned && (
              <Ionicons name="pin" size={14} color="#8E8E93" style={styles.pinIcon} />
            )}
          </View>

          <View style={styles.conversationMeta}>
            {conversation.isMuted && (
              <Ionicons name="volume-mute" size={16} color="#8E8E93" style={styles.muteIcon} />
            )}
            <Text style={styles.timestamp}>{formatTimestamp(lastMessage?.timestamp)}</Text>
            {!isRequest && (
              <Pressable
                style={styles.moreButton}
                onPress={onMorePress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#94a3b8" />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.messagePreview}>
          {hasDraft ? (
            <View style={styles.draftPreviewRow}>
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>Draft</Text>
              </View>
              <Text style={styles.draftPreviewText} numberOfLines={1}>
                {previewText}
              </Text>
            </View>
          ) : (
            <View style={styles.previewTextRow}>
              {previewMeta?.icon && !isTyping && (
                <Ionicons
                  name={previewMeta.icon}
                  size={14}
                  color={unread > 0 ? '#cbd5e1' : '#64748b'}
                  style={styles.previewIcon}
                />
              )}
              <Text
                style={[
                  styles.lastMessage,
                  unread > 0 && styles.lastMessageUnread,
                  isTyping && styles.lastMessageTyping,
                ]}
                numberOfLines={1}
              >
                {shouldPrefixYou ? 'You: ' : ''}
                {previewText}
              </Text>
            </View>
          )}
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>

        {isRequest && onAcceptRequest && onDeclineRequest && (
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.acceptButton} onPress={onAcceptRequest}>
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineButton} onPress={onDeclineRequest}>
              <Text style={styles.declineButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

ConversationRow.displayName = 'ConversationRow';

// Helper function
function getLastMessagePreviewMeta(
  conversation?: Conversation,
  lastMessage?: Conversation['lastMessage']
) {
  if (conversation?.e2ee?.enabled) return { text: 'Encrypted message', icon: 'lock-closed-outline' as const };
  if (!lastMessage) return { text: 'No messages yet' };
  if (lastMessage.type === 'shared_post') return { text: 'Shared a post', icon: 'duplicate-outline' as const };
  if (lastMessage.type === 'shared_glimpse') return { text: 'Shared a glimpse', icon: 'sparkles-outline' as const };
  if (lastMessage.type === 'shared_story') return { text: 'Shared a story', icon: 'albums-outline' as const };
  if (lastMessage.type === 'sticker') return { text: 'Sticker', icon: 'images-outline' as const };
  if (lastMessage.type === 'gif') return { text: 'GIF', icon: 'images-outline' as const };
  if (lastMessage.type === 'poll') return { text: 'Poll', icon: 'bar-chart-outline' as const };
  if (lastMessage.type === 'location') return { text: 'Location', icon: 'location-outline' as const };
  if (lastMessage.mediaType === 'image') return { text: 'Photo', icon: 'image-outline' as const };
  if (lastMessage.mediaType === 'video') return { text: 'Video', icon: 'videocam-outline' as const };
  if (lastMessage.mediaType === 'audio') return { text: 'Voice message', icon: 'mic-outline' as const };
  return { text: lastMessage.text || 'Message' };
}

const styles = StyleSheet.create({
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 18,
    backgroundColor: 'rgba(11, 18, 32, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  pinnedConversation: {
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderColor: 'rgba(56, 189, 248, 0.18)',
  },
  conversationAvatar: {
    position: 'relative',
    marginRight: 14,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#0b1220',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  conversationNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'nowrap',
  },
  conversationName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginRight: 6,
    flexShrink: 1,
  },
  requestBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  requestBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fbbf24',
  },
  pinIcon: {
    marginLeft: 4,
  },
  conversationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  muteIcon: {
    marginRight: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#7c8aa5',
  },
  moreButton: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
  },
  messagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTextRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  previewIcon: {
    marginRight: 6,
  },
  lastMessage: {
    fontSize: 13.5,
    color: '#94a3b8',
    flex: 1,
  },
  lastMessageUnread: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  lastMessageTyping: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  draftPreviewRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  draftBadge: {
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    borderColor: 'rgba(248, 113, 113, 0.45)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  draftBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f87171',
  },
  draftPreviewText: {
    flex: 1,
    fontSize: 14,
    color: '#fca5a5',
  },
  unreadBadge: {
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 22,
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0b1220',
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  acceptButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  acceptButtonText: {
    color: '#0b1220',
    fontSize: 14,
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  declineButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
});
