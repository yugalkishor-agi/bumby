import { mainCache, userCache, postCache, storyCache, suggestionCache, CACHE_TTL } from './cacheSystem.service';
import { imageCacheService } from './imageCache.service';
import { storageService, STORAGE_KEYS } from './storage.service';
import { cacheService } from './cache.service';

type ContentMutationPatch = {
  likesCount?: number;
  likesDelta?: number;
  savesCount?: number;
  savesDelta?: number;
  liked?: boolean;
  saved?: boolean;
  viewed?: boolean;
};

type CacheMutationOptions<TSnapshot> = {
  laneKey: string;
  throttleMs?: number;
  retries?: number;
  retryBaseMs?: number;
  capture: () => Promise<TSnapshot>;
  optimistic: (snapshot: TSnapshot) => Promise<void>;
  execute: () => Promise<void>;
  rollback: (snapshot: TSnapshot, error: unknown) => Promise<void>;
  revalidate?: () => Promise<void>;
};

type PostMutationSnapshot = {
  post: any | null;
  userPosts: any[] | null;
  feedPosts: any[] | null;
  storedFeed: any[] | null;
};

type StoryMutationSnapshot = {
  story: any | null;
  userStories: any[] | null;
  followingStories: any[] | null;
};

type FollowMutationSnapshot = {
  follower: any | null;
  target: any | null;
  targetUsernameAlias: string | null;
  aliasUser: any | null;
  followingIds: string[] | null;
};

/**
 * Cache Integration Service
 * Consistency model: optimistic UI + eventual consistency via background revalidation.
 */
class CacheIntegrationService {
  private refreshLocks = new Map<string, number>();
  private mutationQueues = new Map<string, Promise<unknown>>();
  private mutationTimestamps = new Map<string, number>();
  private mutationFailures = new Map<string, { count: number; lastError: string; lastAttemptAt: number }>();

  private clone<T>(value: T): T {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isTransientError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return [
      'network',
      'timeout',
      'deadline',
      'unavailable',
      'aborted',
      'temporarily',
      'quota',
      'resource-exhausted',
    ].some((token) => message.includes(token));
  }

  private async throttleLane(laneKey: string, throttleMs = 200): Promise<void> {
    const lastAt = this.mutationTimestamps.get(laneKey) || 0;
    const elapsed = Date.now() - lastAt;
    if (elapsed < throttleMs) {
      await this.wait(throttleMs - elapsed);
    }
    this.mutationTimestamps.set(laneKey, Date.now());
  }

  private enqueueMutation<T>(laneKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(laneKey) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task);
    this.mutationQueues.set(
      laneKey,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async executeWithRetry<T>(task: () => Promise<T>, retries = 1, retryBaseMs = 250): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await task();
      } catch (error) {
        if (attempt >= retries || !this.isTransientError(error)) {
          throw error;
        }
        attempt += 1;
        await this.wait(retryBaseMs * attempt);
      }
    }
  }

  private async runOptimisticMutation<TSnapshot>(options: CacheMutationOptions<TSnapshot>): Promise<void> {
    return this.enqueueMutation(options.laneKey, async () => {
      await this.throttleLane(options.laneKey, options.throttleMs ?? 180);
      const snapshot = await options.capture();
      await options.optimistic(snapshot);

      try {
        await this.executeWithRetry(options.execute, options.retries ?? 1, options.retryBaseMs ?? 250);
        this.mutationFailures.delete(options.laneKey);
        if (options.revalidate) {
          void options.revalidate().catch((error) => {
            console.warn(`Background revalidate failed for ${options.laneKey}:`, error);
          });
        }
      } catch (error) {
        await options.rollback(snapshot, error);
        this.mutationFailures.set(options.laneKey, {
          count: (this.mutationFailures.get(options.laneKey)?.count || 0) + 1,
          lastError: error instanceof Error ? error.message : String(error),
          lastAttemptAt: Date.now(),
        });
        throw error;
      }
    });
  }

  async scheduleBackgroundRefresh(key: string, task: () => Promise<void>, cooldownMs = 15000) {
    const now = Date.now();
    const lastRun = this.refreshLocks.get(key) || 0;
    if (now - lastRun < cooldownMs) {
      return;
    }
    this.refreshLocks.set(key, now);
    void task().catch((error) => {
      console.warn(`Background refresh failed for ${key}:`, error);
    });
  }

  async warmMediaAssets(urls: Array<string | null | undefined>) {
    const cleanUrls = urls.filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (cleanUrls.length === 0) return;
    await imageCacheService.prefetchBatch(cleanUrls);
  }

  async warmPostAssets(posts: any[]) {
    const urls = (posts || []).flatMap((post: any) => [
      post?.authorAvatarURL,
      ...(Array.isArray(post?.mediaURLs) ? post.mediaURLs.slice(0, 3) : []),
      post?.coverImage,
      post?.coverImageURL,
    ]);
    await this.warmMediaAssets(urls);
  }

  async warmUserAssets(user?: any) {
    if (!user) return;
    await this.warmMediaAssets([user.avatarURL, user.bannerURL, user.coverImageURL]);
  }

  async cacheUser(userId: string, userData: any) {
    await userCache.set('user', userId, userData, CACHE_TTL.USER_PROFILE);
  }

  async getCachedUser(userId: string) {
    return await userCache.get('user', userId, { allowStale: true });
  }

  peekCachedUser(userId: string) {
    return userCache.peek('user', userId);
  }

  async invalidateUser(userId: string) {
    await userCache.delete('user', userId);
    await userCache.invalidatePattern(`user_posts:${userId}`);
    await userCache.invalidatePattern(`user_followers:${userId}`);
    await userCache.invalidatePattern(`user_following:${userId}`);
  }

  async cachePost(postId: string, postData: any) {
    await postCache.set('post', postId, postData, CACHE_TTL.FEED_POSTS);
  }

  async getCachedPost(postId: string) {
    return await postCache.get('post', postId, { allowStale: true });
  }

  async cacheUserPosts(userId: string, posts: any[]) {
    await postCache.set('user_posts', userId, posts, CACHE_TTL.USER_POSTS);
  }

  async getCachedUserPosts(userId: string) {
    return await postCache.get('user_posts', userId, { allowStale: true });
  }

  peekCachedUserPosts(userId: string) {
    return postCache.peek('user_posts', userId);
  }

  async cacheFeedPosts(userId: string, posts: any[]) {
    await postCache.set('feed_posts', userId, posts, CACHE_TTL.FEED_POSTS);
  }

  async getCachedFeedPosts(userId: string) {
    return await postCache.get('feed_posts', userId, { allowStale: true });
  }

  async invalidatePost(postId: string) {
    await postCache.delete('post', postId);
    await postCache.invalidatePattern('feed_posts:');
    await postCache.invalidatePattern('user_posts:');
  }

  async cacheStory(storyId: string, storyData: any) {
    await storyCache.set('stories', storyId, storyData, CACHE_TTL.STORIES);
  }

  async getCachedStory(storyId: string) {
    return await storyCache.get('stories', storyId, { allowStale: true });
  }

  async cacheUserStories(userId: string, stories: any[]) {
    await storyCache.set('user_stories', userId, stories, CACHE_TTL.STORIES);
  }

  async getCachedUserStories(userId: string) {
    return await storyCache.get('user_stories', userId, { allowStale: true });
  }

  async cacheFollowingStories(userId: string, stories: any[]) {
    await storyCache.set('following_stories', userId, stories, CACHE_TTL.STORIES);
  }

  async getCachedFollowingStories(userId: string) {
    return await storyCache.get('following_stories', userId, { allowStale: true });
  }

  async cacheUserGlimpses(userId: string, glimpses: any[]) {
    await storyCache.set('user_glimpses', userId, glimpses, CACHE_TTL.STORIES);
  }

  async getCachedUserGlimpses(userId: string) {
    return await storyCache.get('user_glimpses', userId, { allowStale: true });
  }

  peekCachedUserGlimpses(userId: string) {
    return storyCache.peek('user_glimpses', userId);
  }

  async cacheExploreGlimpses(key: string, glimpses: any[]) {
    await postCache.set('explore_glimpses', key, glimpses, CACHE_TTL.FEED_POSTS);
  }

  async getCachedExploreGlimpses(key: string) {
    return await postCache.get('explore_glimpses', key, { allowStale: true });
  }

  peekCachedExploreGlimpses(key: string) {
    return postCache.peek('explore_glimpses', key);
  }

  async invalidateStory(storyId: string, authorId?: string) {
    await storyCache.delete('stories', storyId);
    if (authorId) {
      await storyCache.delete('user_stories', authorId);
    }
    await storyCache.invalidatePattern('following_stories:');
  }

  async cacheSuggestions(userId: string, suggestions: any[]) {
    await suggestionCache.set('suggestions', userId, suggestions, CACHE_TTL.SUGGESTIONS);
  }

  async getCachedSuggestions(userId: string) {
    return await suggestionCache.get('suggestions', userId, { allowStale: true });
  }

  async invalidateSuggestions(userId: string) {
    await suggestionCache.delete('suggestions', userId);
  }

  async cacheSearchResults(query: string, results: any[]) {
    await mainCache.set('search_results', query, results, CACHE_TTL.SEARCH_RESULTS);
  }

  async getCachedSearchResults(query: string) {
    return await mainCache.get('search_results', query, { allowStale: true });
  }

  async cacheNotifications(userId: string, notifications: any[]) {
    await mainCache.set('notifications', userId, notifications, CACHE_TTL.NOTIFICATIONS);
  }

  async getCachedNotifications(userId: string) {
    return await mainCache.get('notifications', userId, { allowStale: true });
  }

  async invalidateNotifications(userId: string) {
    await mainCache.delete('notifications', userId);
  }

  async cacheConversations(userId: string, conversations: any[]) {
    await mainCache.set('conversations', userId, conversations, CACHE_TTL.CONVERSATIONS);
  }

  async getCachedConversations(userId: string) {
    return await mainCache.get('conversations', userId, { allowStale: true });
  }

  async cacheMessages(conversationId: string, messages: any[]) {
    await mainCache.set('messages', conversationId, messages, CACHE_TTL.CONVERSATIONS);
  }

  async getCachedMessages(conversationId: string) {
    return await mainCache.get('messages', conversationId, { allowStale: true });
  }

  async invalidateConversation(conversationId: string, userId?: string) {
    await mainCache.delete('messages', conversationId);
    if (userId) {
      await mainCache.delete('conversations', userId);
    }
  }

  private patchContentRecord(record: any, contentId: string, patch: ContentMutationPatch) {
    if (!record) return record;
    const recordId = record.postId || record.glimpseId || record.storyId || record.id;
    if (recordId !== contentId) return record;

    const next = {
      ...record,
      stats: record?.stats ? { ...record.stats } : undefined,
    } as any;

    const currentLikes = Number(next.likesCount ?? next.stats?.likesCount ?? 0);
    const currentSaves = Number(next.savesCount ?? next.stats?.savesCount ?? 0);

    if (typeof patch.likesCount === 'number' || typeof patch.likesDelta === 'number') {
      const resolvedLikes = typeof patch.likesCount === 'number'
        ? patch.likesCount
        : currentLikes + Number(patch.likesDelta || 0);
      next.likesCount = Math.max(0, resolvedLikes);
      next.stats = { ...(next.stats || {}), likesCount: Math.max(0, resolvedLikes) };
    }

    if (typeof patch.savesCount === 'number' || typeof patch.savesDelta === 'number') {
      const resolvedSaves = typeof patch.savesCount === 'number'
        ? patch.savesCount
        : currentSaves + Number(patch.savesDelta || 0);
      next.savesCount = Math.max(0, resolvedSaves);
      next.stats = { ...(next.stats || {}), savesCount: Math.max(0, resolvedSaves) };
    }

    if (typeof patch.liked === 'boolean') {
      next.isLiked = patch.liked;
      next.liked = patch.liked;
    }

    if (typeof patch.saved === 'boolean') {
      next.isSaved = patch.saved;
      next.saved = patch.saved;
    }

    if (typeof patch.viewed === 'boolean') {
      next.hasViewed = patch.viewed;
      next.viewed = patch.viewed;
      next.seen = patch.viewed;
    }

    return next;
  }

  private patchContentArray(items: any[] | null, contentId: string, patch: ContentMutationPatch) {
    if (!Array.isArray(items)) return null;
    let changed = false;
    const next = items.map((item) => {
      const patched = this.patchContentRecord(item, contentId, patch);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : null;
  }

  async applyOptimisticPostMutation(opts: {
    postId: string;
    viewerId?: string;
    authorId?: string;
    likesCount?: number;
    likesDelta?: number;
    savesCount?: number;
    savesDelta?: number;
    liked?: boolean;
    saved?: boolean;
  }) {
    const { postId, viewerId, authorId, ...patch } = opts;

    const cachedPost = await this.getCachedPost(postId);
    if (cachedPost) {
      await this.cachePost(postId, this.patchContentRecord(cachedPost, postId, patch));
    }

    if (authorId) {
      const cachedUserPosts = await this.getCachedUserPosts(authorId);
      const nextUserPosts = this.patchContentArray(cachedUserPosts as any[] | null, postId, patch);
      if (nextUserPosts) {
        await this.cacheUserPosts(authorId, nextUserPosts);
      }
    }

    if (viewerId) {
      const cachedFeedPosts = await this.getCachedFeedPosts(viewerId);
      const nextFeedPosts = this.patchContentArray(cachedFeedPosts as any[] | null, postId, patch);
      if (nextFeedPosts) {
        await this.cacheFeedPosts(viewerId, nextFeedPosts);
      }

      storageService.patchCachedData<any[]>(
        STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
        viewerId,
        (current) => this.patchContentArray(current || null, postId, patch) ?? current,
        30,
      );
    }
  }

  async applyOptimisticStoryMutation(opts: {
    storyId: string;
    viewerId?: string;
    authorId?: string;
    likesCount?: number;
    likesDelta?: number;
    liked?: boolean;
    viewed?: boolean;
  }) {
    const { storyId, viewerId, authorId, ...patch } = opts;

    const cachedStory = await this.getCachedStory(storyId);
    if (cachedStory) {
      await this.cacheStory(storyId, this.patchContentRecord(cachedStory, storyId, patch));
    }

    if (authorId) {
      const cachedUserStories = await this.getCachedUserStories(authorId);
      const nextUserStories = this.patchContentArray(cachedUserStories as any[] | null, storyId, patch);
      if (nextUserStories) {
        await this.cacheUserStories(authorId, nextUserStories);
      }
    }

    if (viewerId) {
      const cachedFollowingStories = await this.getCachedFollowingStories(viewerId);
      const nextFollowingStories = this.patchContentArray(cachedFollowingStories as any[] | null, storyId, patch);
      if (nextFollowingStories) {
        await this.cacheFollowingStories(viewerId, nextFollowingStories);
      }
    }
  }

  async applyOptimisticFollowMutation(opts: {
    followerId: string;
    targetUserId: string;
    targetUsername?: string;
    isFollowing: boolean;
  }) {
    const { followerId, targetUserId, targetUsername, isFollowing } = opts;
    const delta = isFollowing ? 1 : -1;

    const follower = await this.getCachedUser(followerId);
    if (follower) {
      await this.cacheUser(followerId, {
        ...(follower as any),
        stats: {
          ...((follower as any)?.stats || {}),
          followingCount: Math.max(0, Number((follower as any)?.stats?.followingCount || 0) + delta),
        },
      });
    }

    const target = await this.getCachedUser(targetUserId);
    if (target) {
      const nextTarget = {
        ...(target as any),
        isFollowing,
        stats: {
          ...((target as any)?.stats || {}),
          followersCount: Math.max(0, Number((target as any)?.stats?.followersCount || 0) + delta),
        },
      };
      await this.cacheUser(targetUserId, nextTarget);
      const username = typeof targetUsername === 'string' && targetUsername.trim().length > 0
        ? targetUsername.trim().toLowerCase()
        : typeof (nextTarget as any)?.username === 'string'
        ? String((nextTarget as any).username).toLowerCase()
        : '';
      if (username) {
        await this.cacheUser(username, nextTarget);
      }
    }

    const cachedFollowing = cacheService.getFollowingListSnapshot(followerId);
    if (cachedFollowing) {
      const nextFollowing = isFollowing
        ? Array.from(new Set([targetUserId, ...cachedFollowing]))
        : cachedFollowing.filter((id) => id !== targetUserId);
      cacheService.setFollowingList(followerId, nextFollowing);
    }
    cacheService.invalidateFollowersList(targetUserId);
  }

  private async snapshotPostMutation(opts: { postId: string; viewerId?: string; authorId?: string }): Promise<PostMutationSnapshot> {
    const { postId, viewerId, authorId } = opts;
    return {
      post: this.clone(await this.getCachedPost(postId)),
      userPosts: authorId ? this.clone<any[] | null>(await this.getCachedUserPosts(authorId) as any[] | null) : null,
      feedPosts: viewerId ? this.clone<any[] | null>(await this.getCachedFeedPosts(viewerId) as any[] | null) : null,
      storedFeed: viewerId ? this.clone<any[] | null>(storageService.getCachedData<any[]>(STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED, viewerId)) : null,
    };
  }

  private async restorePostMutation(opts: { postId: string; viewerId?: string; authorId?: string }, snapshot: PostMutationSnapshot): Promise<void> {
    if (snapshot.post !== null) await this.cachePost(opts.postId, snapshot.post);
    else await postCache.delete('post', opts.postId);

    if (opts.authorId) {
      if (snapshot.userPosts !== null) await this.cacheUserPosts(opts.authorId, snapshot.userPosts);
      else await postCache.delete('user_posts', opts.authorId);
    }

    if (opts.viewerId) {
      if (snapshot.feedPosts !== null) await this.cacheFeedPosts(opts.viewerId, snapshot.feedPosts);
      else await postCache.delete('feed_posts', opts.viewerId);

      if (snapshot.storedFeed !== null) {
        storageService.setCachedData(STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED, opts.viewerId, snapshot.storedFeed, 30);
      } else {
        storageService.deleteUserDataKey(STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED, opts.viewerId);
      }
    }
  }

  private async snapshotStoryMutation(opts: { storyId: string; viewerId?: string; authorId?: string }): Promise<StoryMutationSnapshot> {
    const { storyId, viewerId, authorId } = opts;
    return {
      story: this.clone(await this.getCachedStory(storyId)),
      userStories: authorId ? this.clone<any[] | null>(await this.getCachedUserStories(authorId) as any[] | null) : null,
      followingStories: viewerId ? this.clone<any[] | null>(await this.getCachedFollowingStories(viewerId) as any[] | null) : null,
    };
  }

  private async restoreStoryMutation(opts: { storyId: string; viewerId?: string; authorId?: string }, snapshot: StoryMutationSnapshot): Promise<void> {
    if (snapshot.story !== null) await this.cacheStory(opts.storyId, snapshot.story);
    else await storyCache.delete('stories', opts.storyId);

    if (opts.authorId) {
      if (snapshot.userStories !== null) await this.cacheUserStories(opts.authorId, snapshot.userStories);
      else await storyCache.delete('user_stories', opts.authorId);
    }

    if (opts.viewerId) {
      if (snapshot.followingStories !== null) await this.cacheFollowingStories(opts.viewerId, snapshot.followingStories);
      else await storyCache.delete('following_stories', opts.viewerId);
    }
  }

  private async snapshotFollowMutation(opts: { followerId: string; targetUserId: string; targetUsername?: string }): Promise<FollowMutationSnapshot> {
    const alias = opts.targetUsername?.trim().toLowerCase() || null;
    return {
      follower: this.clone(await this.getCachedUser(opts.followerId)),
      target: this.clone(await this.getCachedUser(opts.targetUserId)),
      targetUsernameAlias: alias,
      aliasUser: alias ? this.clone(await this.getCachedUser(alias)) : null,
      followingIds: this.clone(cacheService.getFollowingListSnapshot(opts.followerId)),
    };
  }

  private async restoreFollowMutation(opts: { followerId: string; targetUserId: string; targetUsername?: string }, snapshot: FollowMutationSnapshot): Promise<void> {
    if (snapshot.follower !== null) await this.cacheUser(opts.followerId, snapshot.follower);
    else await userCache.delete('user', opts.followerId);

    if (snapshot.target !== null) await this.cacheUser(opts.targetUserId, snapshot.target);
    else await userCache.delete('user', opts.targetUserId);

    const alias = snapshot.targetUsernameAlias || opts.targetUsername?.trim().toLowerCase() || null;
    if (alias) {
      if (snapshot.aliasUser !== null) await this.cacheUser(alias, snapshot.aliasUser);
      else await userCache.delete('user', alias);
    }

    if (snapshot.followingIds !== null) {
      cacheService.setFollowingList(opts.followerId, snapshot.followingIds);
    } else {
      cacheService.invalidateFollowingList(opts.followerId);
    }
    cacheService.invalidateFollowersList(opts.targetUserId);
  }

  async runOptimisticPostMutation(opts: {
    postId: string;
    viewerId?: string;
    authorId?: string;
    patch: ContentMutationPatch;
    execute: () => Promise<void>;
    revalidate?: () => Promise<void>;
    throttleMs?: number;
    retries?: number;
  }) {
    const scope = { postId: opts.postId, viewerId: opts.viewerId, authorId: opts.authorId };
    await this.runOptimisticMutation<PostMutationSnapshot>({
      laneKey: `post:${opts.postId}:${opts.viewerId || opts.authorId || 'global'}`,
      throttleMs: opts.throttleMs,
      retries: opts.retries,
      capture: () => this.snapshotPostMutation(scope),
      optimistic: () => this.applyOptimisticPostMutation({ ...scope, ...opts.patch }),
      execute: opts.execute,
      rollback: (snapshot) => this.restorePostMutation(scope, snapshot),
      revalidate: opts.revalidate,
    });
  }

  async runOptimisticStoryMutation(opts: {
    storyId: string;
    viewerId?: string;
    authorId?: string;
    patch: ContentMutationPatch;
    execute: () => Promise<void>;
    revalidate?: () => Promise<void>;
    throttleMs?: number;
    retries?: number;
  }) {
    const scope = { storyId: opts.storyId, viewerId: opts.viewerId, authorId: opts.authorId };
    await this.runOptimisticMutation<StoryMutationSnapshot>({
      laneKey: `story:${opts.storyId}:${opts.viewerId || opts.authorId || 'global'}`,
      throttleMs: opts.throttleMs,
      retries: opts.retries,
      capture: () => this.snapshotStoryMutation(scope),
      optimistic: () => this.applyOptimisticStoryMutation({ ...scope, ...opts.patch }),
      execute: opts.execute,
      rollback: (snapshot) => this.restoreStoryMutation(scope, snapshot),
      revalidate: opts.revalidate,
    });
  }

  async runOptimisticFollowMutation(opts: {
    followerId: string;
    targetUserId: string;
    targetUsername?: string;
    isFollowing: boolean;
    execute: () => Promise<void>;
    revalidate?: () => Promise<void>;
    throttleMs?: number;
    retries?: number;
  }) {
    const scope = { followerId: opts.followerId, targetUserId: opts.targetUserId, targetUsername: opts.targetUsername };
    await this.runOptimisticMutation<FollowMutationSnapshot>({
      laneKey: `follow:${opts.followerId}:${opts.targetUserId}`,
      throttleMs: opts.throttleMs,
      retries: opts.retries,
      capture: () => this.snapshotFollowMutation(scope),
      optimistic: () => this.applyOptimisticFollowMutation({ ...scope, isFollowing: opts.isFollowing }),
      execute: opts.execute,
      rollback: (snapshot) => this.restoreFollowMutation(scope, snapshot),
      revalidate: opts.revalidate,
    });
  }

  async clearUserCache(userId: string) {
    await this.invalidateUser(userId);
    await this.invalidateNotifications(userId);
    await this.invalidateSuggestions(userId);
    await postCache.invalidatePattern(`user_posts:${userId}`);
    await storyCache.invalidatePattern(`user_stories:${userId}`);
  }

  async clearAllCaches() {
    await mainCache.clearAll();
    await userCache.clearAll();
    await postCache.clearAll();
    await storyCache.clearAll();
    await suggestionCache.clearAll();
  }

  getCacheStats() {
    return {
      main: mainCache.getStats(),
      user: userCache.getStats(),
      post: postCache.getStats(),
      story: storyCache.getStats(),
      suggestion: suggestionCache.getStats(),
      mutationFailures: Object.fromEntries(this.mutationFailures.entries()),
      consistencyModel: 'optimistic_eventual_revalidate',
    };
  }

  async preloadUserData(userId: string) {
    try {
      const cachedUser = await this.getCachedUser(userId);
      if (!cachedUser) {
        const { userService } = await import('./user.service');
        const userData = await userService.getUser(userId);
        if (userData) {
          await this.cacheUser(userId, userData);
        }
      }

      const cachedPosts = await this.getCachedUserPosts(userId);
      if (!cachedPosts) {
        const { postService } = await import('./post.service');
        const postsResult = await postService.getUserPosts(userId);
        const posts = Array.isArray(postsResult) ? postsResult : postsResult.posts || [];
        await this.cacheUserPosts(userId, posts);
      }

      const cachedStories = await this.getCachedUserStories(userId);
      if (!cachedStories) {
        const { storyService } = await import('./story.service');
        const stories = await storyService.getUserActiveStories(userId);
        await this.cacheUserStories(userId, stories);
      }
    } catch (error) {
      console.warn('Failed to preload user data:', error);
    }
  }

  async refreshExpiredCaches() {
    try {
      const stats = this.getCacheStats();
      console.log('Cache stats:', stats);
    } catch (error) {
      console.warn('Failed to refresh expired caches:', error);
    }
  }

  async cacheData(key: string, data: any, ttl?: number) {
    await mainCache.set('generic', key, data, ttl || CACHE_TTL.GENERIC);
  }

  async getCachedData(key: string) {
    return await mainCache.get('generic', key, { allowStale: true });
  }

  peekCachedData(key: string) {
    return mainCache.peek('generic', key);
  }

  async invalidateData(key: string) {
    await mainCache.delete('generic', key);
  }

  async cacheHighlight(highlightId: string, highlight: any) {
    await mainCache.set('highlight', highlightId, highlight, CACHE_TTL.USER_POSTS);
  }

  async getCachedHighlight(highlightId: string) {
    return await mainCache.get('highlight', highlightId, { allowStale: true });
  }

  async invalidateHighlight(highlightId: string) {
    await mainCache.delete('highlight', highlightId);
  }

  async cacheUserHighlights(userId: string, highlights: any[]) {
    await mainCache.set('user_highlights', userId, highlights, CACHE_TTL.USER_POSTS);
  }

  async getCachedUserHighlights(userId: string) {
    return await mainCache.get('user_highlights', userId, { allowStale: true });
  }

  async invalidateUserHighlights(userId: string) {
    await mainCache.delete('user_highlights', userId);
  }
}

export const cacheIntegration = new CacheIntegrationService();







