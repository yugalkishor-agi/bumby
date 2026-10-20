import { useMemo } from 'react';
import type { User } from '../../types/database';
import type { ChatMessage } from '../../types/chat';
import { toTimestampMs } from '../../screens/chat/chatScreen.utils';

type Params = {
  replyingTo: Partial<ChatMessage> | null;
  userId?: string;
  otherUser?: User | null;
  isGroupConversation: boolean;
  groupMeta: {
    name: string;
    description: string;
    participantIds: string[];
  };
  routeGroupName?: string;
  conversationNickname: string;
  requestMode: boolean;
  otherUserTyping: boolean;
  otherUserPrivacy: Record<string, unknown> | null | undefined;
};

export function useChatMeta({
  replyingTo,
  userId,
  otherUser,
  isGroupConversation,
  groupMeta,
  routeGroupName,
  conversationNickname,
  requestMode,
  otherUserTyping,
  otherUserPrivacy,
}: Params) {
  const replyBarMeta = useMemo(() => {
    if (!replyingTo) return null;
    const source = replyingTo;
    const username = source.senderId === userId ? 'You' : source.senderUsername || otherUser?.displayName || otherUser?.username || 'User';
    let kind = source.type || '';
    if (kind === 'media') kind = source.mediaType || 'media';
    if (!kind && source.mediaType) kind = source.mediaType;
    if (kind === 'shared' && source.sharedContent?.type) kind = `shared_${source.sharedContent.type}`;

    const labelMap: Record<string, string> = {
      image: 'Photo',
      video: 'Video',
      audio: 'Voice message',
      voice: 'Voice message',
      gif: 'GIF',
      sticker: 'Sticker',
      shared_post: 'Post',
      shared_glimpse: 'Glimpse',
      shared_story: 'Story',
      story_reply: 'Story',
      glimpse_collab_request: 'Glimpse',
      poll: 'Poll',
      location: 'Location',
      text: 'Text message',
    };

    const label = labelMap[kind] || (source.text ? 'Text message' : 'Message');
    let text = '';
    if (kind === 'text' || (!kind && source.text)) {
      text = (source.text ?? '').trim();
      if (!text) text = label;
    } else {
      text = label;
    }

    return { username, label, text, isText: kind === 'text' || (!kind && source.text) };
  }, [otherUser?.displayName, otherUser?.username, replyingTo, userId]);

  const headerPrimaryName = isGroupConversation
    ? (groupMeta.name || routeGroupName || 'Group chat')
    : ((conversationNickname || '').trim() || otherUser?.displayName || otherUser?.username || 'User');
  const headerUsername = isGroupConversation ? '' : (otherUser?.username ? '@' + otherUser.username : '');

  const canShowActivityStatus = !isGroupConversation && !requestMode && (
    (typeof otherUserPrivacy?.showActivityStatus === 'boolean' || typeof otherUserPrivacy?.hideOnlineStatus === 'boolean')
      ? otherUserPrivacy?.showActivityStatus !== false && otherUserPrivacy?.hideOnlineStatus !== true
      : otherUser?.settings?.showOnlineStatus !== false
  );
  const canShowLastSeen = canShowActivityStatus && otherUserPrivacy?.hideLastSeen !== true;
  const otherUserLastSeenMs = toTimestampMs(otherUser?.lastSeen);
  const showActiveNow = !!otherUser?.isOnline && otherUserLastSeenMs > 0 && Date.now() - otherUserLastSeenMs < 2 * 60 * 1000;
  const groupDescription = groupMeta.description ? String(groupMeta.description).trim() : '';
  const groupMemberCount = Math.max(0, groupMeta.participantIds?.length || 0);
  const groupStatusLine = groupMemberCount > 0 ? `${groupMemberCount} members` : 'Group chat';

  return {
    replyBarMeta,
    headerPrimaryName,
    headerUsername,
    canShowActivityStatus,
    canShowLastSeen,
    showActiveNow,
    groupDescription,
    groupStatusLine,
    headerStatus: isGroupConversation
      ? (groupDescription ? `${groupStatusLine} - ${groupDescription}` : groupStatusLine)
      : otherUserTyping
      ? 'typing...'
      : canShowActivityStatus
      ? showActiveNow
        ? 'Active now'
        : canShowLastSeen
        ? otherUser?.lastSeen
        : ''
      : '',
  };
}
