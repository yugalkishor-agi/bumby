import type { Message, PollMessage, User } from './database';

export type TimestampLike =
  | Message['createdAt']
  | number
  | string
  | Date
  | null
  | undefined
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };

export type ChatMessageType =
  | NonNullable<Message['type']>
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'voice'
  | 'system'
  | 'shared';

export type ChatReactionUsersMap = Record<string, User | null>;

export type ActionMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
  isMe: boolean;
};

export type SeenReader = {
  userId: string;
  avatarURL?: string | null;
  fallbackText?: string;
};

type CollaborationRequestMeta = {
  requestId?: string;
  toUserId?: string;
  postId?: string;
  status?: Message['status'];
};

type ChatSharedContent = NonNullable<Message['sharedContent']> & {
  contentId?: string;
  username?: string;
  verified?: boolean;
  coverImage?: string;
  thumbnailURL?: string;
  thumbnail?: string;
  posterURL?: string;
  mediaURL?: string;
};

type ChatStoryReply = NonNullable<Message['storyReply']> & {
  contentId?: string;
  username?: string;
  verified?: boolean;
  authorAvatar?: string;
  coverImage?: string;
  thumbnail?: string;
  mediaURL?: string;
};

export type ChatMessage = Omit<Message, 'type' | 'sharedContent' | 'storyReply'> & {
  type?: ChatMessageType;
  title?: string;
  subtitle?: string;
  mediaUrl?: string;
  url?: string;
  imageUrl?: string;
  gif?: string;
  sticker?: string;
  thumbnail?: string;
  pinned?: boolean;
  contentId?: string;
  postId?: string;
  username?: string;
  verified?: boolean;
  duration?: number;
  audioDuration?: number;
  voiceDuration?: number;
  glimpseMediaURL?: string;
  collaborationRequest?: CollaborationRequestMeta;
  collaborationRequestId?: string;
  collaborationStatus?: Message['status'];
  canRespondToCollab?: boolean;
  question?: PollMessage['question'];
  options?: PollMessage['options'];
  totalVotes?: PollMessage['totalVotes'];
  selectedPollOptionId?: string | null;
  canVote?: boolean;
  onVote?: (optionId: string) => void;
  lat?: number;
  lng?: number;
  onOpen?: () => void;
  mediaItems?: Array<{ url?: string; type?: 'image' | 'video' | 'gif' | 'sticker' } | string>;
  sharedContent?: ChatSharedContent;
  storyReply?: ChatStoryReply;
};

