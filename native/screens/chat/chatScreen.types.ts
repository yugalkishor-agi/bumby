import type { RouteProp } from '@react-navigation/native';
import type { User } from '../../types/database';
import type { ChatMessage } from '../../types/chat';

export type ChatRouteSeedUser = Pick<
  User,
  'userId' | 'username' | 'displayName' | 'avatarURL' | 'verified' | 'isOnline' | 'lastSeen'
>;

export type ChatRouteParams = {
  userId: string;
  conversationId?: string;
  initialUser?: ChatRouteSeedUser;
  focusMessageId?: string;
  conversationType?: 'direct' | 'group';
  groupName?: string;
  groupAvatarURL?: string;
  groupDescription?: string;
  participantIds?: string[];
};

export type ChatScreenRouteProp = RouteProp<{ Chat: ChatRouteParams }, 'Chat'>;

export type DisplayMessage = ChatMessage;

export type DisplayMessageCacheEntry = {
  /** Identity handle for memo comparison; never read for its fields. */
  source: DisplayMessage;
  overrideText?: string;
  pinned: boolean;
  isDeleted: boolean;
  signature: string;
  message: DisplayMessage;
};

export type PinnedState = { ids: string[] };

export type StickerPick = { type: 'gif' | 'sticker'; url: string };

export type PickerTab = 'gif' | 'sticker';
