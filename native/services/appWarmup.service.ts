import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { cacheIntegration } from './cacheIntegration.service';
import { glimpseService } from './glimpse.service';
import { notificationService } from './notification.service';
import { postService } from './post.service';
import { searchService } from './search.service';
import { storyService } from './story.service';
import { userService } from './user.service';

const APP_WARMUP_TTL_MS = 3 * 60 * 1000;
const APP_WARMUP_COOLDOWN_MS = 45 * 1000;

const GLIMPSES_CACHE_KEY = 'glimpses_explore_grid_v2';

export const buildAppBootstrapCacheKey = (userId: string) => `app_bootstrap_bundle_v1:${userId}`;
export const buildHomeBootstrapCacheKey = (userId: string) => `home_bootstrap_v1:${userId}`;
export const buildSearchBootstrapCacheKey = (userId: string) => `search_bootstrap_v1:${userId}`;
export const buildMessagesBootstrapCacheKey = (userId: string) => `messages_bootstrap_v1:${userId}`;

function isVideoGlimpse(item: any) {
  const mediaUrl = item?.mediaURL || item?.mediaUrl || item?.mediaURLs?.[0] || '';
  return item?.mediaType === 'video' || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(mediaUrl);
}

function pickNotificationPreview(raw: any) {
  return {
    notificationId: raw.notificationId || raw.id,
    type: raw.type,
    actorId: raw.actorId,
    actorUsername: raw.actorUsername,
    actorAvatarURL: raw.actorAvatarURL,
    actorVerified: raw.actorVerified,
    message: raw.message || '',
    previewText: typeof raw.refPreview === 'string' ? raw.refPreview : undefined,
    createdAt: raw.createdAt,
    isRead: raw.isRead ?? raw.read ?? false,
    postId: raw.postId || (raw.refType === 'post' ? raw.refId : undefined),
    requestId: raw.requestId,
    glimpseId: raw.glimpseId || (raw.refType === 'glimpse' ? raw.refId : undefined),
    postImageURL: raw.refMediaURL || raw.previewImageURL || raw.glimpseCoverURL || raw.postImageURL || raw.coverImageURL || raw.thumbnailURL,
    refType: raw.refType,
    refId: raw.refId,
    commentId: raw.commentId,
    parentCommentId: raw.parentCommentId,
    targetCommentId: raw.targetCommentId,
  };
}

class AppWarmupService {
  private inFlight = new Map<string, Promise<void>>();
  private lastRunAt = new Map<string, number>();

  async warm(userId: string, options?: { force?: boolean }) {
    if (!userId) return;
    const now = Date.now();
    const force = !!options?.force;
    const lastRun = this.lastRunAt.get(userId) || 0;

    if (!force && now - lastRun < APP_WARMUP_COOLDOWN_MS) {
      return;
    }

    const active = this.inFlight.get(userId);
    if (active) {
      return active;
    }

    const task = this.execute(userId)
      .catch((error) => {
        console.warn('[Warmup] failed:', error);
      })
      .finally(() => {
        this.inFlight.delete(userId);
      });

    this.inFlight.set(userId, task);
    this.lastRunAt.set(userId, now);
    return task;
  }

  async prefetchProfile(targetUserId: string, viewerUserId: string) {
    if (!targetUserId || !viewerUserId) return;

    const cacheKey = 'profile_snapshot_v3:' + targetUserId + ':' + viewerUserId;
    const laneKey = 'profile_prefetch:' + viewerUserId + ':' + targetUserId;
    const active = this.inFlight.get(laneKey);
    if (active) {
      return active;
    }

    const task = (async () => {
      try {
        const [profileUser, postsResult, glimpses] = await Promise.all([
          userService.getUser(targetUserId).catch(() => null),
          postService.getUserPosts(targetUserId, 10, undefined, false, viewerUserId).catch(() => ({ posts: [] as any[] })),
          glimpseService.getUserGlimpses(targetUserId, 10, false, viewerUserId).catch(() => [] as any[]),
        ]);

        if (!profileUser) return;

        const posts = Array.isArray(postsResult) ? postsResult : (postsResult as any)?.posts || [];
        const snapshot = {
          profileUser,
          userPosts: posts,
          userGlimpses: Array.isArray(glimpses) ? glimpses : [],
          taggedPosts: [],
          highlights: [],
          mutualFollowers: [],
          followersCount: Number((profileUser as any)?.stats?.followersCount || 0),
          followingCount: Number((profileUser as any)?.stats?.followingCount || 0),
          isFollowing: false,
          hasPendingFollowRequest: false,
          isPrivateRestricted: false,
          profilePrivacy: null,
          warmedAt: Date.now(),
        };

        await cacheIntegration.cacheData(cacheKey, snapshot, APP_WARMUP_TTL_MS);
        await cacheIntegration.warmMediaAssets([
          (profileUser as any)?.avatarURL,
          ...(posts || []).slice(0, 6).flatMap((post: any) => [post?.thumbnailURL, ...(post?.mediaURLs || []).slice(0, 1)]),
          ...(Array.isArray(glimpses) ? glimpses : []).slice(0, 6).flatMap((item: any) => [item?.thumbnailURL, item?.coverImageURL, item?.mediaURL]),
        ]);
      } catch (error) {
        console.warn('[Warmup] profile prefetch failed:', error);
      }
    })().finally(() => {
      this.inFlight.delete(laneKey);
    });

    this.inFlight.set(laneKey, task);
    return task;
  }
  private async loadMessagesPreview(userId: string) {
    const conversationsRef = collection(db, 'conversations');
    const conversationsQuery = query(
      conversationsRef,
      where('participantIds', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
      limit(14)
    );

    const snapshot = await getDocs(conversationsQuery);
    const docs = snapshot.docs.map((entry) => ({ conversationId: entry.id, ...(entry.data() as any) }));

    const isDeletedForUser = (deletedBy: any) =>
      Array.isArray(deletedBy) ? deletedBy.includes(userId) : Boolean(deletedBy?.[userId]);

    const visible = docs.filter((entry: any) => !isDeletedForUser(entry.deletedBy));
    const conversations = visible.map((entry: any) => {
      const pinnedBy = Array.isArray(entry.pinnedBy) ? entry.pinnedBy : [];
      const archivedBy = Array.isArray(entry.archivedBy) ? entry.archivedBy : [];
      const mutedBy = entry.mutedBy || {};
      return {
        ...entry,
        isPinned: pinnedBy.includes(userId),
        isArchived: archivedBy.includes(userId),
        isMuted: Array.isArray(entry.mutedBy) ? entry.mutedBy.includes(userId) : !!mutedBy[userId]?.isMuted,
      };
    });

    const conversationUsers: Record<string, any> = {};
    const directUserIds = Array.from(
      new Set(
        conversations
          .filter((entry: any) => entry.type === 'direct')
          .map((entry: any) => (entry.participantIds || []).find((id: string) => id !== userId))
          .filter((id: any) => typeof id === 'string' && id.length > 0)
      )
    ) as string[];

    if (directUserIds.length > 0) {
      const usersById = await userService.getUsersByIds(directUserIds).catch(() => ({} as Record<string, any>));
      conversations.forEach((entry: any) => {
        if (entry.type !== 'direct') return;
        const otherUserId = (entry.participantIds || []).find((id: string) => id !== userId);
        if (otherUserId && usersById[otherUserId]) {
          conversationUsers[entry.conversationId] = usersById[otherUserId];
        }
      });
    }

    const regularConversations = conversations.filter((entry: any) => !entry.isArchived && !(entry.restrictedBy || []).includes(userId));
    const requestConversations = conversations.filter((entry: any) => !entry.isArchived && (entry.restrictedBy || []).includes(userId));
    const archivedConversations = conversations.filter((entry: any) => !!entry.isArchived);

    return {
      hydrated: true,
      conversations: regularConversations,
      requestConversations,
      archivedConversations,
      conversationUsers,
      activeUsers: [] as any[],
      warmedAt: Date.now(),
    };
  }

  private async execute(userId: string) {
    const recentSearchesKey = `recent_searches_${userId}`;
    const [followingIds, me, notifications, exploreGlimpses, trendingHashtags, recentSearchesRaw, inboxSeed] = await Promise.all([
      userService.getFollowing(userId, 40).catch(() => []),
      userService.getUser(userId).catch(() => null),
      notificationService.getUserNotifications(userId, 24).catch(() => []),
      glimpseService.getExploreGlimpses(24).catch(() => []),
      searchService.getTrendingHashtags(10).catch(() => []),
      AsyncStorage.getItem(recentSearchesKey).catch(() => null),
      this.loadMessagesPreview(userId).catch(() => ({
        hydrated: false,
        conversations: [],
        requestConversations: [],
        archivedConversations: [],
        conversationUsers: {},
        activeUsers: [],
        warmedAt: Date.now(),
      })),
    ]);

    const [feedResult, followingStories, myStories, ownPosts, ownGlimpses] = await Promise.all([
      postService.getFeedPosts(followingIds || [], userId, 12).catch(() => ({ posts: [] as any[], lastDoc: null })),
      storyService.getFollowingStories(userId).catch(() => []),
      storyService.getUserActiveStories(userId).catch(() => []),
      postService
        .getUserPosts(userId, 9)
        .then((result: any) => (Array.isArray(result) ? result : result?.posts || []))
        .catch(() => []),
      glimpseService.getUserGlimpses(userId, 9).catch(() => []),
    ]);

    const feedPosts = Array.isArray((feedResult as any)?.posts) ? (feedResult as any).posts : [];
    const videoGlimpses = (exploreGlimpses || []).filter((item: any) => isVideoGlimpse(item));
    const seededNotifications = (notifications || []).map((entry: any) => pickNotificationPreview(entry));

    const recentSearches = (() => {
      if (!recentSearchesRaw) return [] as string[];
      try {
        const parsed = JSON.parse(recentSearchesRaw);
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string').slice(0, 10) : [];
      } catch {
        return [] as string[];
      }
    })();

    const normalizedHomePosts = (feedPosts || [])
      .filter((post: any) => (post?.authorId || post?.userId) !== userId)
      .map((post: any) => ({
        postId: post?.postId || post?.id || '',
        userId: post?.authorId || post?.userId || post?.ownerId || '',
        username: post?.authorUsername || post?.username || '',
        displayName: post?.authorDisplayName || post?.displayName || '',
        avatarURL: post?.authorAvatarURL || post?.avatarURL || '',
        verified: !!(post?.authorVerified ?? post?.verified),
        content: post?.caption || post?.content || '',
        mediaURLs: Array.isArray(post?.mediaURLs) ? post.mediaURLs : [],
        thumbnailURL: post?.thumbnailURL || '',
        aspectRatio: typeof post?.aspectRatio === 'number' ? post.aspectRatio : undefined,
        mediaType: post?.mediaType,
        likesCount: Number(post?.stats?.likesCount || post?.likesCount || 0),
        commentsCount: Number(post?.stats?.commentsCount || post?.commentsCount || 0),
        sharesCount: Number(post?.stats?.sharesCount || post?.sharesCount || 0),
        hideLikesCount: !!post?.hideLikesCount,
        hideSharesCount: !!post?.hideSharesCount,
        commentsEnabled: post?.commentsEnabled !== false,
        allowSharing: post?.allowSharing !== false,
        likedByPreview: [],
        latestCommentText: post?.latestComment?.text || post?.latestCommentText || post?.latestComment?.comment || '',
        latestCommentUser: post?.latestComment?.username || post?.latestCommentUser || post?.latestComment?.authorUsername || post?.latestComment?.authorName || '',
        isLiked: !!post?.isLiked,
        isSaved: !!post?.isSaved,
        createdAt: post?.createdAt,
        location: typeof post?.location === 'string' ? post.location : post?.location?.name,
        tags: Array.isArray(post?.tags) ? post.tags : [],
        taggedUsers: Array.isArray(post?.taggedUsers) ? post.taggedUsers : [],
        collaborators: Array.isArray(post?.collaborators) ? post.collaborators : [],
      }));

    const normalizedHomeStories = (followingStories || []).map((story: any) => ({
      storyId: story?.storyId,
      userId: story?.authorId || story?.userId,
      username: story?.authorUsername || story?.username || '',
      displayName: story?.authorDisplayName || story?.displayName,
      avatarURL: story?.authorAvatarURL || story?.avatarURL,
      isViewed: false,
    }));
    const homeSeed = {
      posts: normalizedHomePosts,
      stories: normalizedHomeStories,
      followingIds: followingIds || [],
      hasMyStory: (myStories || []).length > 0,
      isMyStoryViewed: false,
      warmedAt: Date.now(),
    };

    const searchSeed = {
      exploreGlimpses: videoGlimpses,
      trendingHashtags: trendingHashtags || [],
      followingIds: followingIds || [],
      recentSearches,
      warmedAt: Date.now(),
    };

    const profileSeed = {
      profileUser: me,
      userPosts: ownPosts || [],
      userGlimpses: ownGlimpses || [],
      taggedPosts: [],
      highlights: [],
      mutualFollowers: [],
      followersCount: Number((me as any)?.stats?.followersCount || 0),
      followingCount: Number((me as any)?.stats?.followingCount || 0),
      isFollowing: false,
      hasPendingFollowRequest: false,
      isPrivateRestricted: false,
      profilePrivacy: null,
      warmedAt: Date.now(),
    };

    const bootstrapBundle = {
      home: homeSeed,
      search: searchSeed,
      inbox: inboxSeed,
      notifications: seededNotifications,
      profile: profileSeed,
      warmedAt: Date.now(),
    };

    await Promise.allSettled([
      cacheIntegration.cacheData(buildHomeBootstrapCacheKey(userId), homeSeed, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData(buildSearchBootstrapCacheKey(userId), searchSeed, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData(buildMessagesBootstrapCacheKey(userId), inboxSeed, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData(buildAppBootstrapCacheKey(userId), bootstrapBundle, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData(`notifications_enhanced_v2:${userId}`, seededNotifications, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData(GLIMPSES_CACHE_KEY, videoGlimpses, APP_WARMUP_TTL_MS),
      cacheIntegration.cacheData('profile_snapshot_v3:' + userId + ':' + userId, profileSeed, APP_WARMUP_TTL_MS),
    ]);

    await cacheIntegration.warmMediaAssets([
      ...(feedPosts || []).slice(0, 6).flatMap((post: any) => [post?.authorAvatarURL, ...(post?.mediaURLs || []).slice(0, 2)]),
      ...(videoGlimpses || []).slice(0, 8).flatMap((item: any) => [item?.thumbnailURL, item?.coverImageURL, item?.mediaURL]),
      me?.avatarURL,
      me?.bannerURL,
    ]);
  }
}

export const appWarmupService = new AppWarmupService();











