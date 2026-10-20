import { Timestamp } from 'firebase/firestore';

// ==========================================
// USER TYPES
// ==========================================

export interface User {
  userId: string;
  username: string;
  usernameLowercase: string; // For case-insensitive search
  email: string;
  displayName: string;
  avatarURL?: string;
  bannerURL?: string; // Profile banner image
  bio?: string;
  website?: string;
  location?: string;
  phoneNumber?: string;
  phone?: string; // Alias for phoneNumber
  birthday?: Timestamp | string | Date;
  verified: boolean;
  accountType: 'personal' | 'professional' | 'business';
  isPrivate: boolean;
  isOnline: boolean;
  lastSeen: Timestamp;
  stats: UserStats;
  settings: UserSettings;
  preferences?: UserPreferences;
  socialLinks?: SocialLinks;
  businessInfo?: BusinessInfo;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserStats {
  postsCount: number;
  storiesCount: number;
  followersCount: number;
  followingCount: number;
  highlightsCount: number;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  appLanguage?: string; // App language preference
  accentColor?: string; // Custom accent color
  timeFormat?: '12h' | '24h'; // Time format preference
  dateFormat?: string; // Date format preference
  experimentalFeatures?: boolean; // Enable experimental features
  notificationsEnabled: boolean;
  showOnlineStatus: boolean;
  allowMessageRequests: boolean;
  autoPlayVideos: boolean;
  dataUsage: 'low' | 'medium' | 'high';
  downloadQuality: 'low' | 'medium' | 'high';
}

export interface UserPreferences {
  contentLanguages: string[];
  interests: string[];
  blockedKeywords: string[];
  mutedUsers: string[];
  hiddenPosts: string[];
  customFeedOrder: boolean;
  showSuggestedPosts: boolean;
  adPersonalization: boolean;
}

export interface SocialLinks {
  instagram?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
  linkedin?: string;
  facebook?: string;
  website?: string;
  other?: Array<{
    name: string;
    url: string;
  }>;
}

export interface BusinessInfo {
  category: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  businessHours?: Array<{
    day: string;
    open: string;
    close: string;
    closed: boolean;
  }>;
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  services?: string[];
}

export interface Follower {
  userId: string;
  followedAt: Timestamp;
  isCloseFriend: boolean;
}

export interface Following {
  userId: string;
  followedAt: Timestamp;
  notificationsEnabled: boolean;
}

// ==========================================
// POST TYPES
// ==========================================

export interface Post {
  postId: string;
  postType: 'image' | 'video' | 'carousel' | 'text' | 'poll' | 'event';
  authorId: string;
  authorUsername: string;
  authorAvatarURL: string;
  authorVerified?: boolean;
  authorDisplayName?: string;
  caption?: string;
  mediaURLs: string[];
  mediaType: 'image' | 'video';
  thumbnailURL?: string;
  backgroundMusic?: {
    trackId?: string;
    trackTitle: string;
    artistName: string;
    coverArtURL?: string;
    streamURL?: string;
    clipStart?: number;
    clipEnd?: number;
  };
  aspectRatio: number;
  location?: PostLocation;
  tags: string[];
  mentions: string[];
  taggedUsers: Array<{
    userId: string;
    username: string;
    displayName?: string;
    x: number;
    y: number;
  }>;
  collaborators?: Array<{
    userId: string;
    username: string;
    displayName?: string;
    avatarURL?: string;
    status: 'pending' | 'accepted' | 'declined';
    addedAt: Timestamp;
  }>;
  altText?: string;
  stats: PostStats;
  /**
   * Viewer-hydrated state. These are never stored on the post document - services
   * attach them after reading - so they are always optional.
   */
  isLiked?: boolean;
  isSaved?: boolean;
  latestComment?: {
    text?: string;
    comment?: string;
    username?: string;
    authorUsername?: string;
    authorName?: string;
  };
  commentsEnabled: boolean;
  hideLikesCount: boolean;
  hideSharesCount?: boolean;
  allowDownloads: boolean;
  allowSharing: boolean;
  pinnedAt?: Timestamp;
  audience: 'public' | 'followers' | 'closeFriends' | 'custom';
  customAudience?: string[]; // User IDs for custom audience
  isSponsored?: boolean;
  sponsorInfo?: SponsorInfo;
  pollData?: PollData;
  eventData?: EventData;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
  engagement: number;
  lastEngagementAt: Timestamp;
  isArchived?: boolean;
  archivedAt?: Timestamp;
}

export interface PostLocation {
  name: string;
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  placeId?: string;
}

export interface SponsorInfo {
  brandName: string;
  brandLogo?: string;
  campaignId?: string;
  disclosureText: string;
  targetAudience?: string[];
}

export interface PollData {
  question: string;
  options: Array<{
    id: string;
    text: string;
    votes: number;
    voters: string[];
  }>;
  totalVotes: number;
  allowMultipleChoices: boolean;
  showResults: 'always' | 'after_vote' | 'after_expiry';
}

export interface EventData {
  title: string;
  description?: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  location?: PostLocation;
  ticketUrl?: string;
  price?: string;
  capacity?: number;
  attendees: string[];
  interestedUsers: string[];
  category: string;
}

export interface PostStats {
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  sharesCount: number;
  viewsCount: number;
  pollVotes?: number;
  eventAttendees?: number;
  eventInterested?: number;
}

export interface Like {
  userId: string;
  likedAt: Timestamp;
}

export interface Comment {
  commentId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarURL: string;
  authorVerified?: boolean;
  text: string;
  parentCommentId?: string; // If this is a reply, ID of parent comment
  mentions: string[];
  likesCount: number;
  repliesCount: number;
  isPinned: boolean;
  isEdited: boolean;
  likedByAuthor?: boolean; // True if post author liked this comment
  isLiked?: boolean; // Viewer-hydrated: has the viewer liked this comment
  isVerified?: boolean; // Viewer-hydrated from the author's user document
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Reply {
  replyId: string;
  parentCommentId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarURL: string;
  text: string;
  mentions: string[];
  likesCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// STORY TYPES
// ==========================================

export interface Story {
  storyId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarURL: string;
  authorVerified?: boolean;
  mediaURL: string;
  mediaType: 'image' | 'video';
  duration: number;
  thumbnailURL?: string;
  coverImageURL?: string; // Cover image for glimpses (both images and videos)
  textOverlay?: TextOverlay;
  backgroundMusic?: {
    trackId: string;
    trackTitle: string;
    artistName: string;
    coverArtURL?: string;
    clipStart: number;
    clipEnd: number;
    customAudio?: boolean;
    customAudioUrl?: string;
  };
  audience: 'public' | 'followers' | 'closeFriends';
  allowReplies: boolean;
  allowSharing: boolean;
  pinnedAt?: Timestamp;
  hiddenFrom: string[];
  viewsCount: number;
  likesCount: number;
  repliesCount: number;
  stats?: {
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
  };
  caption?: string;
  mentions?: string[];
  tags?: string[];
  taggedUsers?: Array<{ userId: string; username: string }>;
  collaborators?: Array<{
    userId: string;
    username: string;
    avatarURL: string;
    status: 'pending' | 'accepted';
    addedAt: Timestamp;
  }>;
  // Repost fields
  isRepost?: boolean;
  repostOf?: string; // Original story ID
  originalAuthorId?: string;
  originalAuthorUsername?: string;
  originalAuthorVerified?: boolean;
  originalMediaURL?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  isHighlighted: boolean;
  highlightId?: string;
}

export interface TextOverlay {
  text: string;
  position: { x: number; y: number };
  fontSize: number;
  color: string;
}

export interface Highlight {
  highlightId: string;
  userId: string;
  name: string; // Internal name for management
  title: string; // Display title shown below circle in profile
  coverImageURL: string;
  storiesCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// GLIMPSE TYPES
// ==========================================

/**
 * A Glimpse is a one-to-one ephemeral clip (the counterpart of a Story).
 * This is the single definition - services and screens must import it from here
 * rather than re-declaring their own.
 */
export interface Glimpse {
  glimpseId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarURL?: string;
  authorVerified?: boolean;
  mediaURL: string;
  mediaType: 'image' | 'video';
  thumbnailURL?: string;
  coverImageURL?: string;
  caption?: string;
  /**
   * Editor-only state (filters, text layers, stickers) persisted with the clip.
   * The editor owns the definition; this file only references it.
   */
  editorMeta?: GlimpseEditorMeta | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  duration?: number;
  audience?: 'public' | 'followers' | 'closeFriends' | 'close_friends';
  allowReplies?: boolean;
  allowSharing?: boolean;
  settings?: { allowComments?: boolean; hideLikes?: boolean };
  backgroundMusic?: {
    trackTitle: string;
    artistName: string;
    coverArtURL?: string;
    streamURL?: string;
    clipStart?: number;
    clipEnd?: number;
  };
  stats: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    viewsCount: number;
  };
  tags?: string[];
  mentions?: string[];
  createdAt: Timestamp;
  /** Viewer-hydrated; never stored on the document. */
  isLiked?: boolean;
  isSaved?: boolean;
}

/**
 * Whatever the editor stashed on a clip. Defined next to the editor code in
 * utils/glimpseEditor - imported here (type-only) so `Glimpse` stays self-
 * describing without the schema file owning an editor concept.
 */
export type { GlimpseEditorMeta } from '../utils/glimpseEditor';
import type { GlimpseEditorMeta } from '../utils/glimpseEditor';

// ==========================================
// MESSAGE TYPES
// ==========================================

export interface ConversationE2EE {
  enabled: boolean;
  version: number;
  algorithm: string;
  keyVersion: number;
  wrappedKeys: Record<string, string>;
  deviceId: string;
  initializedAtMs?: number;
}

export interface MessageEncryptedPayload {
  version: number;
  algorithm: string;
  iv: string;
  ciphertext: string;
}

export interface Conversation {
  conversationId: string;
  type: 'direct' | 'group';
  groupName?: string;
  groupDescription?: string;
  groupAvatarURL?: string;
  groupAdmins?: string[];
  groupJoinMode?: 'invite_only' | 'approval_required';
  groupJoinRequests?: string[];
  groupMemberMutes?: Record<string, { mutedBy: string; mutedAtMs: number; mutedUntilMs: number }>;
  groupBans?: Record<string, number>;
  removedMembers?: Record<string, { removedBy: string; removedAtMs: number }>;
  participantIds: string[];
  participantCount: number;
  /** Written as `null` while a conversation is still being created. */
  lastMessage: LastMessage | null;
  unreadCounts: { [userId: string]: number };
  mutedBy?: string[];
  /** User who created the conversation (groups). */
  createdBy?: string;
  /** Millisecond mirror of lastMessageAt, kept for cheap client-side sorting. */
  lastMessageAtMs?: number;
  pinnedBy?: string[];
  deletedBy?: string[];
  archivedBy?: string[]; // Users who archived this conversation
  restrictedBy?: string[]; // Users who moved this chat to requests (messages won't show "seen")
  e2ee?: ConversationE2EE;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt: Timestamp;
}

export interface LastMessage {
  text: string;
  senderId: string;
  senderUsername: string;
  mediaType?: 'image' | 'video' | 'audio';
  type?: 'text' | 'media' | 'gif' | 'sticker' | 'shared_post' | 'shared_glimpse' | 'shared_story' | 'story_reply' | 'glimpse_collab_request' | 'poll' | 'location' | 'group_activity' | 'system';
  timestamp: Timestamp;
}
export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voterIds: string[];
}

export interface PollMessage {
  question: string;
  options: PollOption[];
  totalVotes: number;
}

export interface LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface Message {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderAvatarURL: string;
  senderVerified?: boolean;
  type?: 'text' | 'media' | 'gif' | 'sticker' | 'shared_post' | 'shared_glimpse' | 'shared_story' | 'story_reply' | 'glimpse_collab_request' | 'poll' | 'location' | 'group_activity' | 'system';
  text?: string;
  encryptedPayload?: MessageEncryptedPayload;
  e2eeState?: 'encrypted' | 'decrypted' | 'locked';
  mediaURL?: string;
  /** Legacy lowercase-l variant that older documents actually stored. */
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
  mediaItems?: Array<{
    url: string;
    type: 'image' | 'video' | 'gif' | 'sticker';
    thumbnailURL?: string;
  }>;
  thumbnailURL?: string;
  poll?: PollMessage;
  location?: LocationMessage;
  scheduledFor?: Timestamp;
  expiresAt?: Timestamp;
  replyToMessageId?: string;
  replyToText?: string;
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    senderUsername: string;
  };
  reactions?: { [userId: string]: string };
  storyReply?: {
    storyId: string;
    mediaURL: string;
    coverImage?: string;
    thumbnailURL?: string;
    mediaType?: 'image' | 'video';
    authorId?: string;
    authorUsername: string;
    authorAvatar?: string;
    authorVerified?: boolean;
  };
  sharedContent?: {
    type: 'post' | 'glimpse' | 'story';
    id: string;
    authorId: string;
    authorUsername: string;
    authorAvatarURL: string;
    coverImageURL: string;
    caption?: string;
    mediaType?: 'image' | 'video';
  };
  // Collab request metadata
  glimpseId?: string;
  glimpseMediaURL?: string;
  glimpseCaption?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'pending' | 'pending_offline' | 'accepted' | 'rejected';
  readBy?: string[];
  isForwarded?: boolean;
  forwardedFrom?: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderUsername?: string;
  };
  isEdited?: boolean;
  isDeleted?: boolean;
  deletedFor?: string[];
  pinnedBy?: string[];
  pinnedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  deliveredAt?: Timestamp;
  readAt?: Timestamp;
  isRead?: boolean;
  acceptedAt?: Timestamp;
  rejectedAt?: Timestamp;
  /**
   * Client-side send time. Written by message.service so the sending device can
   * order its own optimistic messages before Firestore assigns createdAt.
   */
  clientCreatedAtMs?: number;
  clientTimestamp?: Timestamp;
}

// ==========================================
// NOTIFICATION TYPES
// ==========================================

export interface Notification {
  notificationId: string;
  userId: string;
  type: NotificationType;
  actorId: string;
  actorUsername: string;
  actorAvatarURL: string;
  actorVerified?: boolean;
  refType: 'post' | 'comment' | 'story' | 'message';
  refId: string;
  refPreview?: string;
  refMediaURL?: string;
  isRead: boolean;
  createdAt: Timestamp;
  readAt?: Timestamp;
  // For aggregated story likes
  storyId?: string;
  likersData?: Array<{
    userId: string;
    username: string;
    avatarURL: string;
    verified?: boolean;
    likedAt: Timestamp;
  }>;
  totalLikesCount?: number;
  // For collaboration requests
  postId?: string;
  glimpseId?: string;
  requestId?: string;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'comment_reply'
  | 'comment_like'
  | 'follow'
  | 'follow_request'
  | 'mention'
  | 'dm'
  | 'story_view'
  | 'story_reply'
  | 'story_like'
  | 'collaboration_request';

// ==========================================
// REPORT TYPES
// ==========================================

export interface Report {
  reportId: string;
  reporterId: string;
  targetType: 'user' | 'post' | 'comment' | 'story' | 'message';
  targetId: string;
  targetUserId: string;
  reason: ReportReason;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  reviewNotes?: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  resolvedAt?: Timestamp;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nudity'
  | 'fake_news'
  | 'copyright'
  | 'other';

// ==========================================
// DIRECT MESSAGES TYPES (NEW - BACKEND ALIGNED)
// ==========================================

export interface DirectMessage {
  conversationId: string;
  participants: string[];
  participantDetails: Record<string, ParticipantInfo>;
  lastMessage?: LastMessageInfo;
  messageRequestStatus: 'pending' | 'accepted' | 'rejected';
  requestedBy: string;
  requestedAt: Timestamp;
  acceptedAt?: Timestamp;
  unreadCounts: Record<string, number>;
  mutedBy: string[];
  archivedBy: string[];
  blockedBy: string[];
  disappearingMessages: DisappearingMessagesSettings;
  encryptionKey?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DMMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  text?: string;
  encryptedPayload?: MessageEncryptedPayload;
  e2eeState?: 'encrypted' | 'decrypted' | 'locked';
  encryptedText?: string;
  mediaURL?: string;
  mediaType?: string;
  mediaMetadata?: MediaMetadata;
  replyTo?: ReplyInfo;
  reactions: Record<string, string>;
  readBy: Record<string, number | null>;
  deliveredTo: Record<string, number>;
  disappearsAt?: number;
  edited: boolean;
  editedAt?: Timestamp;
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedFor: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MessageRequest {
  requestId: string;
  requesterId: string;
  recipientId: string;
  requesterDetails: RequesterInfo;
  initialMessage: InitialMessageInfo;
  status: 'pending' | 'accepted' | 'rejected';
  respondedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface ParticipantInfo {
  username: string;
  displayName: string;
  avatarURL: string;
  lastSeen: Timestamp;
  role?: 'admin' | 'member';
  joinedAt?: Timestamp;
  nickname?: string;
  permissions?: string[];
  isTyping?: boolean;
  lastTyped?: Timestamp;
}

export interface LastMessageInfo {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
  type: string;
  mediaURL?: string;
}

export interface DisappearingMessagesSettings {
  enabled: boolean;
  duration: number; // in milliseconds
  enabledBy?: string;
  enabledAt?: Timestamp;
}

export interface RequesterInfo {
  username: string;
  displayName: string;
  avatarURL: string;
  verified: boolean;
  mutualFollowers: string[];
  mutualFollowersCount: number;
}

export interface InitialMessageInfo {
  text: string;
  mediaURL?: string;
  type: 'text' | 'image' | 'video';
}

// ==========================================
// GROUP CHAT TYPES (NEW - BACKEND ALIGNED)
// ==========================================

export interface GroupChat {
  chatId: string;
  name: string;
  description?: string;
  avatarURL?: string;
  type: 'group';
  participants: string[];
  participantDetails: Record<string, ParticipantInfo>;
  settings: GroupChatSettings;
  lastMessage?: LastMessageInfo;
  unreadCounts: Record<string, number>;
  pinnedMessages: string[];
  mutedBy: string[];
  archivedBy: string[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatarURL?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'system';
  text?: string;
  encryptedPayload?: MessageEncryptedPayload;
  e2eeState?: 'encrypted' | 'decrypted' | 'locked';
  mediaURL?: string;
  mediaType?: string;
  mediaMetadata?: MediaMetadata;
  replyTo?: ReplyInfo;
  mentions: string[];
  reactions: Record<string, string>;
  readBy: Record<string, number>;
  deliveredTo: Record<string, number>;
  pinned: boolean;
  pinnedBy?: string;
  pinnedAt?: Timestamp;
  edited: boolean;
  editedAt?: Timestamp;
  deleted: boolean;
  deletedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupChatSettings {
  allowInvites: boolean;
  requireApproval: boolean;
  allowMediaSharing: boolean;
  allowVoiceMessages: boolean;
  disappearingMessages: boolean;
  disappearingDuration: number;
}

// ==========================================
// REELS TYPES (ENHANCED - BACKEND ALIGNED)
// ==========================================

export interface Reel {
  reelId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarURL: string;
  authorVerified: boolean;
  caption: string;
  videoURL: string;
  thumbnailURL: string;
  duration: number;
  aspectRatio: number;
  videoMetadata: VideoMetadata;
  audio?: AudioData;
  effects: EffectData[];
  hashtags: string[];
  mentions: string[];
  location?: LocationData;
  stats: ReelStats;
  algorithm: AlgorithmData;
  visibility: 'public' | 'followers' | 'private';
  commentsEnabled: boolean;
  downloadEnabled: boolean;
  remixEnabled: boolean;
  featured: boolean;
  trending: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ReelView {
  viewId: string;
  reelId: string;
  userId: string;
  sessionId: string;
  watchTime: number;
  completedView: boolean;
  interactions: {
    liked: boolean;
    commented: boolean;
    shared: boolean;
    saved: boolean;
  };
  viewSource: 'feed' | 'profile' | 'hashtag' | 'search';
  deviceInfo: DeviceInfo;
  viewedAt: Timestamp;
}

export interface ReelStats {
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  completionRate: number;
  avgWatchTime: number;
  engagementRate: number;
}

export interface AlgorithmData {
  score: number;
  factors: {
    engagement?: number;
    completion?: number;
    recency?: number;
    authorPopularity?: number;
    trending?: number;
  };
  tags: string[];
  lastCalculated: Timestamp;
}

export interface VideoMetadata {
  width: number;
  height: number;
  size: number;
  format: string;
  fps: number;
  bitrate: number;
}

export interface AudioData {
  trackId: string;
  title: string;
  artist: string;
  startTime: number;
  duration: number;
  volume: number;
}

export interface EffectData {
  type: 'filter' | 'speed' | 'transition';
  name: string;
  intensity?: number;
  multiplier?: number;
}

// ==========================================
// UNIVERSAL COMMENT TYPES (NEW - BACKEND ALIGNED)
// ==========================================

export interface UniversalComment {
  commentId: string;
  postId?: string;
  reelId?: string;
  glimpseId?: string;
  targetType: 'post' | 'reel' | 'glimpse';
  targetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarURL: string;
  authorVerified: boolean;
  text: string;
  parentCommentId?: string;
  mentions: string[];
  hashtags: string[];
  stats: CommentStats;
  media?: CommentMedia;
  edited: boolean;
  editedAt?: Timestamp;
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
  pinned: boolean;
  pinnedAt?: Timestamp;
  moderation: ModerationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  replies?: UniversalComment[];
  hasMoreReplies?: boolean;
}

export interface CommentStats {
  likesCount: number;
  repliesCount: number;
  reportsCount: number;
}

export interface CommentMedia {
  type: 'image' | 'video' | 'gif' | null;
  url: string | null;
  thumbnailURL: string | null;
  metadata?: MediaMetadata;
}

export interface ModerationStatus {
  status: 'pending' | 'approved' | 'flagged' | 'rejected';
  flagged: boolean;
  autoModerated: boolean;
  reviewedAt?: Timestamp;
}

// ==========================================
// UNIVERSAL LIKE TYPES (NEW - BACKEND ALIGNED)
// ==========================================

export interface UniversalLike {
  likeId: string;
  userId: string;
  username: string;
  userDisplayName: string;
  userAvatarURL: string;
  userVerified: boolean;
  targetType: 'post' | 'comment' | 'glimpse' | 'reel';
  targetId: string;
  targetAuthorId: string;
  targetAuthorUsername: string;
  contextData: LikeContextData;
  source: 'feed' | 'detail' | 'notification' | 'search';
  deviceInfo: DeviceInfo;
  createdAt: Timestamp;
}

export interface LikeContextData {
  postTitle?: string;
  postImageURL?: string;
  commentText?: string;
  glimpseId?: string;
  reelId?: string;
}

// ==========================================
// AUTH EXTENSION TYPES (NEW - BACKEND ALIGNED)
// ==========================================

export interface UserSession {
  sessionId: string;
  userId: string;
  createdAt: Timestamp;
  lastRefreshAt: Timestamp;
  device: DeviceInfo;
  tokens: {
    idTokenLastIssuedAt?: Timestamp;
  };
}

export interface PushToken {
  tokenId: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Timestamp;
  lastUsedAt?: Timestamp;
  revoked: boolean;
}

export interface PhoneVerification {
  requestId: string;
  phoneNumber: string;
  userId?: string;
  code: string;
  verified: boolean;
  attempts: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  verifiedAt?: Timestamp;
}

// ==========================================
// SHARED UTILITY TYPES
// ==========================================

export interface MediaMetadata {
  width: number;
  height: number;
  size: number;
  format: string;
  aspectRatio: number;
  duration?: number;
}

export interface LocationData {
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  placeId: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  userAgent?: string;
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  screenSize?: {
    width: number;
    height: number;
  };
}

export interface ReplyInfo {
  messageId: string;
  text: string;
  senderUsername: string;
  senderId: string;
  mediaURL?: string;
}

// ==========================================
// ANALYTICS TYPES
// ==========================================

export interface Analytics {
  analyticsId: string;
  type: 'post' | 'story' | 'profile';
  referenceId: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  engagement: number;
  viewersByGender?: { male: number; female: number; other: number };
  viewersByAge?: { [ageRange: string]: number };
  viewersByLocation?: { [country: string]: number };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// COLLECTION TYPES
// ==========================================

export interface Collection {
  collectionId: string;
  userId: string;
  name: string;
  description?: string;
  coverImageURL?: string;
  isPrivate: boolean;
  postsCount: number;
  /** Denormalised list of saved post ids; newer collections rely on the posts subcollection instead. */
  postIds?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CollectionPost {
  postId: string;
  collectionId: string;
  savedAt: Timestamp;
}

// ==========================================
// HELPER TYPES
// ==========================================

export interface CreateUserData {
  username: string;
  email: string;
  displayName: string;
  avatarURL?: string;
  bio?: string;
}

export interface CreatePostData {
  authorId: string;
  authorUsername: string;
  authorAvatarURL: string;
  caption?: string;
  mediaURLs: string[];
  mediaType: 'image' | 'video';
  postType: 'image' | 'video' | 'carousel' | 'text';
  thumbnailURL?: string;
  backgroundMusic?: {
    trackId?: string;
    trackTitle: string;
    artistName: string;
    coverArtURL?: string;
    streamURL?: string;
    clipStart?: number;
    clipEnd?: number;
  };
  aspectRatio: number;
  location?: string;
  tags?: string[];
  mentions?: string[];
  taggedUsers?: Array<{
    userId: string;
    username: string;
    x: number;
    y: number;
  }>;
  collaborators?: Array<{
    userId: string;
    username: string;
    displayName?: string;
    avatarURL?: string;
  }>;
  altText?: string;
  commentsEnabled?: boolean;
  hideLikesCount?: boolean;
  hideSharesCount?: boolean;
  allowSharing?: boolean;
  pinnedAt?: Timestamp | null;
  audience?: 'public' | 'followers' | 'close_friends';
}

export interface CreateMessageData {
  senderId: string;
  senderUsername: string;
  senderAvatarURL?: string;
  senderVerified?: boolean;
  text?: string;
  encryptedPayload?: MessageEncryptedPayload;
  e2eeState?: 'encrypted' | 'decrypted' | 'locked';
  type?: 'text' | 'media' | 'gif' | 'sticker' | 'shared_post' | 'shared_glimpse' | 'shared_story' | 'story_reply' | 'glimpse_collab_request' | 'poll' | 'location' | 'group_activity' | 'system';
  mediaURL?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
  mediaItems?: Array<{
    url: string;
    type: 'image' | 'video' | 'gif' | 'sticker';
    thumbnailURL?: string;
  }>;
  thumbnailURL?: string;
  poll?: PollMessage;
  location?: LocationMessage;
  scheduledFor?: Timestamp;
  expiresAt?: Timestamp;
  replyToMessageId?: string;
  replyToText?: string;
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    senderUsername: string;
  };
  storyReply?: {
    storyId: string;
    mediaURL: string;
    coverImage?: string;
    thumbnailURL?: string;
    mediaType?: 'image' | 'video';
    authorId?: string;
    authorUsername: string;
    authorAvatar?: string;
    authorVerified?: boolean;
  };
  sharedContent?: any;
  glimpseId?: string;
  status?: string;
  isForwarded?: boolean;
  forwardedFrom?: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderUsername?: string;
  };
}

// ==========================================
// ADDITIONAL COLLECTIONS FROM WEB
// ==========================================

export interface SavedPost {
  postId: string;
  userId: string;
  collectionId?: string;
  savedAt: Timestamp;
  postData?: {
    authorUsername: string;
    authorAvatarURL: string;
    mediaURL: string;
    caption?: string;
  };
}

export interface BlockedUser {
  userId: string;
  blockedUserId: string;
  blockedAt: Timestamp;
  reason?: string;
}

export interface MutedUser {
  userId: string;
  mutedUserId: string;
  mutedAt: Timestamp;
  duration?: 'temporary' | 'permanent';
}

export interface FollowRequest {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  fromUsername: string;
  fromDisplayName?: string;
  fromAvatarURL?: string;
  fromVerified?: boolean;
  status: 'pending' | 'accepted' | 'declined';
  requestedAt: Timestamp;
  respondedAt?: Timestamp;
}

export interface SearchHistory {
  userId: string;
  query: string;
  type: 'user' | 'hashtag' | 'location' | 'general';
  searchedAt: Timestamp;
  resultCount?: number;
}

export interface Draft {
  draftId: string;
  userId: string;
  type: 'post' | 'story' | 'message';
  content: {
    caption?: string;
    mediaURLs?: string[];
    mediaType?: 'image' | 'video';
    location?: PostLocation;
    tags?: string[];
    mentions?: string[];
    audience?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Device {
  deviceId: string;
  userId: string;
  deviceType: 'ios' | 'android' | 'web';
  deviceName: string;
  pushToken?: string;
  lastActiveAt: Timestamp;
  isActive: boolean;
  appVersion?: string;
  osVersion?: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  deviceId: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  startedAt: Timestamp;
  lastActiveAt: Timestamp;
  endedAt?: Timestamp;
  isActive: boolean;
}

export interface Hashtag {
  tag: string;
  tagLowercase: string;
  postsCount: number;
  storiesCount: number;
  totalUsage: number;
  trending: boolean;
  trendingScore?: number;
  category?: string;
  relatedTags?: string[];
  createdAt: Timestamp;
  lastUsedAt: Timestamp;
}

export interface TrendingTopic {
  topicId: string;
  name: string;
  type: 'hashtag' | 'location' | 'person' | 'event';
  score: number;
  postsCount: number;
  engagementCount: number;
  region?: string;
  category?: string;
  relatedTopics?: string[];
  startedTrendingAt: Timestamp;
  peakAt?: Timestamp;
  isActive: boolean;
}




















