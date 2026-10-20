import type { Post as DocumentPost } from '../../types/database';
import type { Post, Story } from './homeFeedTypes';

/**
 * A feed item reaches us either as a raw Firestore post document or as an
 * already-lean view model from an older cache payload: canonical document
 * fields, plus the handful of names only the legacy payloads still use.
 * `raw` is only ever read here, never stored.
 */
type RawFeedPost = Partial<DocumentPost> &
  Pick<
    Partial<Post>,
    | 'userId'
    | 'username'
    | 'displayName'
    | 'avatarURL'
    | 'verified'
    | 'content'
    | 'latestCommentText'
    | 'latestCommentUser'
  > & {
    /** Even older documents called the author id `ownerId`. */
    ownerId?: string;
  };

export function transformFeedPost(raw: RawFeedPost): Post {
  return {
    postId: raw.postId,
    userId: raw.authorId || raw.userId || raw.ownerId,
    username: raw.authorUsername || raw.username || '',
    displayName: raw.authorDisplayName || raw.displayName || '',
    avatarURL: raw.authorAvatarURL || raw.avatarURL || '',
    verified: !!(raw.authorVerified ?? raw.verified),
    content: raw.caption || raw.content || '',
    mediaURLs: raw.mediaURLs || [],
    thumbnailURL: raw.thumbnailURL || '',
    aspectRatio: typeof raw.aspectRatio === 'number' ? raw.aspectRatio : undefined,
    mediaType: raw.mediaType as 'photo' | 'video' | 'carousel',
    likesCount: raw.stats?.likesCount || 0,
    commentsCount: raw.stats?.commentsCount || 0,
    sharesCount: raw.stats?.sharesCount || 0,
    hideLikesCount: !!raw.hideLikesCount,
    hideSharesCount: !!raw.hideSharesCount,
    commentsEnabled: raw.commentsEnabled !== false,
    allowSharing: raw.allowSharing !== false,
    likedByPreview: [],
    latestCommentText: raw.latestComment?.text || raw.latestCommentText || raw.latestComment?.comment || '',
    latestCommentUser: raw.latestComment?.username || raw.latestCommentUser || raw.latestComment?.authorUsername || raw.latestComment?.authorName || '',
    isLiked: !!raw.isLiked,
    isSaved: false,
    createdAt: raw.createdAt,
    location: typeof raw.location === 'string' ? raw.location : raw.location?.name,
    tags: raw.tags || [],
    backgroundMusic: raw.backgroundMusic || null,
    taggedUsers: Array.isArray(raw.taggedUsers) ? raw.taggedUsers : [],
    collaborators: Array.isArray(raw.collaborators) ? raw.collaborators : [],
  };
}

function storyMillis(value: any) {
  return value?.toMillis?.() ?? value?.toDate?.()?.getTime?.() ?? 0;
}

export function buildVisibleStories(
  storiesData: any[],
  currentUserId: string,
  username: string,
  viewedMap: Map<string, boolean>,
) {
  const byAuthor = new Map<string, Story & { latestCreatedAt: any }>();
  storiesData.forEach((story) => {
    const userId = story.authorId;
    const current = byAuthor.get(userId);
    const isViewed = viewedMap.get(userId) ?? false;
    if (!current || storyMillis(story.createdAt) >= storyMillis(current.latestCreatedAt)) {
      byAuthor.set(userId, {
        storyId: story.storyId,
        userId,
        username: story.authorUsername,
        displayName: story.authorDisplayName,
        avatarURL: story.authorAvatarURL,
        isViewed,
        latestCreatedAt: story.createdAt,
      });
    } else if (!isViewed) {
      byAuthor.set(userId, { ...current, isViewed: false });
    }
  });

  const normalized = username.trim().toLowerCase();
  const stories = Array.from(byAuthor.values())
    .sort((a, b) => {
      if (a.isViewed !== b.isViewed) return a.isViewed ? 1 : -1;
      return storyMillis(b.latestCreatedAt) - storyMillis(a.latestCreatedAt);
    });
  const ownStory = stories.find((story) => story.userId === currentUserId || (!!normalized && story.username?.trim().toLowerCase() === normalized));
  return {
    ownStory,
    visibleStories: stories
      .filter((story) => story !== ownStory)
      .map(({ latestCreatedAt: _latestCreatedAt, ...story }) => story),
  };
}
