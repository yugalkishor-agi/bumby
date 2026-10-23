export interface Post {
  postId: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarURL?: string;
  verified?: boolean;
  content: string;
  mediaURLs: string[];
  thumbnailURL?: string;
  aspectRatio?: number;
  mediaType: 'photo' | 'video' | 'carousel';
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  hideLikesCount?: boolean;
  hideSharesCount?: boolean;
  commentsEnabled?: boolean;
  allowSharing?: boolean;
  audience?: 'public' | 'followers' | 'closeFriends' | 'close_friends';
  likedByPreview?: Array<{ userId: string; username?: string; displayName?: string; avatarURL?: string }>;
  latestCommentText?: string;
  latestCommentUser?: string;
  taggedUsers?: Array<{ userId: string; username?: string }>;
  collaborators?: Array<{ userId: string; username?: string; displayName?: string; avatarURL?: string; status?: string }>;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: any;
  location?: string;
  tags?: string[];
}

export interface Story {
  storyId: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarURL?: string;
  isViewed: boolean;
}

export type FeedMood = 'balanced' | 'friends' | 'discover' | 'trending';

export interface FeedControlSettings {
  enabled: boolean;
  friendsVsPublic: number;
  photosVsVideos: number;
  newVsOldViral: number;
  localVsGlobal: number;
  mood: FeedMood;
}

export const FEED_CONTROL_CACHE_KEY = 'iris_feed_control_settings_v1_';

export const DEFAULT_FEED_CONTROL_SETTINGS: FeedControlSettings = {
  enabled: false,
  friendsVsPublic: 0.8,
  photosVsVideos: 0.55,
  newVsOldViral: 0.7,
  localVsGlobal: 0.7,
  mood: 'balanced',
};
