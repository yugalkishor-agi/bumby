import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Animated } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { userService } from '../../services/user.service';
import { postService } from '../../services/post.service';
import { glimpseService } from '../../services/glimpse.service';
import { highlightService } from '../../services/highlight.service';
import { settingsService } from '../../services/settings.service';
import { cacheIntegration } from '../../services/cacheIntegration.service';
import { appWarmupService } from '../../services/appWarmup.service';

const PROFILE_SOFT_REFRESH_COOLDOWN_MS = 45 * 1000;
const PROFILE_LAST_FETCH_BY_CACHE_KEY: Record<string, number> = {};
const PROFILE_MEMORY_SNAPSHOT_BY_CACHE_KEY = new Map<string, any>();
const PROFILE_LIVE_FETCH_DONE_BY_CACHE_KEY: Record<string, boolean> = {};

export function useProfileData(
  currentUser: any,
  routeUserId: string | null,
  routeUsername: string | null,
  initialRouteUser: any
) {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(routeUserId || null);
  const [profileUser, setProfileUser] = useState<any>(initialRouteUser);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userGlimpses, setUserGlimpses] = useState<any[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<any[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [mutualFollowers, setMutualFollowers] = useState<any[]>([]);
  const [followersCount, setFollowersCount] = useState(Number(initialRouteUser?.stats?.followersCount || 0));
  const [followingCount, setFollowingCount] = useState(Number(initialRouteUser?.stats?.followingCount || 0));
  const [isFollowing, setIsFollowing] = useState(false);
  const [profilePrivacy, setProfilePrivacy] = useState<any>(null);
  const [hasPendingFollowRequest, setHasPendingFollowRequest] = useState(false);
  const [isBlockedView, setIsBlockedView] = useState(false);
  const [isPrivateRestricted, setIsPrivateRestricted] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loadProfileRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);
  const loadProfileRunRef = useRef(0);
  const cacheHydratedKeyRef = useRef<string | null>(null);
  const currentUserRef = useRef<any>(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser?.userId, currentUser]);

  const toMillis = useCallback((value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const sortPinnedFirst = useCallback((items: any[]) => {
    return [...items].sort((a, b) => {
      const aPin = toMillis(a?.pinnedAt);
      const bPin = toMillis(b?.pinnedAt);
      if (aPin !== bPin) return bPin - aPin;
      return toMillis(b?.createdAt) - toMillis(a?.createdAt);
    });
  }, [toMillis]);

  useEffect(() => {
    let active = true;

    if (routeUserId) {
      setResolvedUserId(routeUserId);
      return () => { active = false; };
    }

    if (!routeUsername) {
      setResolvedUserId(null);
      return () => { active = false; };
    }

    const resolveByUsername = async () => {
      try {
        const found = await userService.getUser(routeUsername);
        if (active) {
          setResolvedUserId(found?.userId || null);
        }
      } catch {
        if (active) setResolvedUserId(null);
      }
    };

    void resolveByUsername();
    return () => { active = false; };
  }, [routeUserId, routeUsername]);

  const isOwnProfile = !resolvedUserId || resolvedUserId === currentUser?.userId;
  const displayUserId = resolvedUserId || currentUser?.userId || '';
  const profileCacheKey = displayUserId ? 'profile_snapshot_v3:' + displayUserId + ':' + (currentUser?.userId || 'guest') : '';

  useEffect(() => {
    if (!profileCacheKey) return;
    const inMemory = PROFILE_MEMORY_SNAPSHOT_BY_CACHE_KEY.get(profileCacheKey);
    if (inMemory && typeof inMemory === 'object') return;

    setUserPosts([]);
    setUserGlimpses([]);
    setTaggedPosts([]);
    setHighlights([]);
    setMutualFollowers([]);
    setLoading(true);
  }, [profileCacheKey]);

  const applyProfileSnapshot = useCallback((snapshot: any) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    if (snapshot.profileUser) setProfileUser(snapshot.profileUser);
    if (Array.isArray(snapshot.userPosts)) setUserPosts(snapshot.userPosts);
    if (Array.isArray(snapshot.userGlimpses)) setUserGlimpses(snapshot.userGlimpses);
    if (Array.isArray(snapshot.taggedPosts)) setTaggedPosts(snapshot.taggedPosts);
    if (Array.isArray(snapshot.highlights)) setHighlights(snapshot.highlights);
    if (Array.isArray(snapshot.mutualFollowers)) setMutualFollowers(snapshot.mutualFollowers);
    if (typeof snapshot.followersCount === 'number') setFollowersCount(snapshot.followersCount);
    if (typeof snapshot.followingCount === 'number') setFollowingCount(snapshot.followingCount);
    if (typeof snapshot.isFollowing === 'boolean') setIsFollowing(snapshot.isFollowing);
    if (typeof snapshot.hasPendingFollowRequest === 'boolean') setHasPendingFollowRequest(snapshot.hasPendingFollowRequest);
    if (typeof snapshot.isPrivateRestricted === 'boolean') setIsPrivateRestricted(snapshot.isPrivateRestricted);
    if (snapshot.profilePrivacy) setProfilePrivacy(snapshot.profilePrivacy);
  }, []);

  const hydrateFromCacheSnapshot = useCallback((snapshot: any) => {
    if (!snapshot || typeof snapshot !== 'object' || !profileCacheKey) return false;
    PROFILE_MEMORY_SNAPSHOT_BY_CACHE_KEY.set(profileCacheKey, snapshot);
    cacheHydratedKeyRef.current = profileCacheKey;
    applyProfileSnapshot(snapshot);
    setLoading(false);
    return true;
  }, [applyProfileSnapshot, profileCacheKey]);

  useLayoutEffect(() => {
    if (!profileCacheKey || !displayUserId) return;
    if (cacheHydratedKeyRef.current === profileCacheKey) return;

    const inMemory = PROFILE_MEMORY_SNAPSHOT_BY_CACHE_KEY.get(profileCacheKey);
    if (hydrateFromCacheSnapshot(inMemory)) return;

    const syncSeed = cacheIntegration.peekCachedData(profileCacheKey) as any;
    if (hydrateFromCacheSnapshot(syncSeed)) return;

    const fallbackProfileUser = cacheIntegration.peekCachedUser(displayUserId) || initialRouteUser || null;
    const fallbackPostsRaw = cacheIntegration.peekCachedUserPosts(displayUserId);
    const fallbackGlimpsesRaw = cacheIntegration.peekCachedUserGlimpses(displayUserId);
    const fallbackPosts = Array.isArray(fallbackPostsRaw) ? fallbackPostsRaw : [];
    const fallbackGlimpses = Array.isArray(fallbackGlimpsesRaw) ? fallbackGlimpsesRaw : [];
    
    if (!fallbackProfileUser && fallbackPosts.length === 0 && fallbackGlimpses.length === 0) return;

    hydrateFromCacheSnapshot({
      profileUser: fallbackProfileUser,
      userPosts: fallbackPosts,
      userGlimpses: fallbackGlimpses,
      taggedPosts: [],
      highlights: [],
      mutualFollowers: [],
    });
  }, [displayUserId, hydrateFromCacheSnapshot, initialRouteUser, profileCacheKey]);

  useEffect(() => {
    if (!profileCacheKey || cacheHydratedKeyRef.current === profileCacheKey) return;
    let active = true;
    cacheIntegration.getCachedData(profileCacheKey)
      .then((cached) => {
        if (!active || cacheHydratedKeyRef.current === profileCacheKey) return;
        hydrateFromCacheSnapshot(cached);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [hydrateFromCacheSnapshot, profileCacheKey]);

  const loadProfile = useCallback(async (force: boolean = false) => {
    if (!displayUserId) return;

    const runId = ++loadProfileRunRef.current;
    const isLatestRun = () => loadProfileRunRef.current === runId;
    const activeUser = currentUserRef.current;

    try {
      const hasSeededContent = !!profileUser || userPosts.length > 0 || userGlimpses.length > 0 || taggedPosts.length > 0 || highlights.length > 0;
      const cacheKey = profileCacheKey || ('profile:' + displayUserId);
      const lastFetchedAt = PROFILE_LAST_FETCH_BY_CACHE_KEY[cacheKey] || 0;
      const hasFetchedLiveData = PROFILE_LIVE_FETCH_DONE_BY_CACHE_KEY[cacheKey] === true;
      const shouldSkipSoftRefresh =
        !force &&
        hasSeededContent &&
        hasFetchedLiveData &&
        Date.now() - lastFetchedAt < PROFILE_SOFT_REFRESH_COOLDOWN_MS;
      
      if (shouldSkipSoftRefresh) return;
      if (!hasSeededContent) setLoading(true);

      const primaryPostsPromise = postService.getUserPosts(displayUserId, 10, undefined, false, activeUser?.userId);
      const primaryGlimpsesPromise = glimpseService.getUserGlimpses(displayUserId, 10, false, activeUser?.userId);
      const secondaryContentPromise = Promise.all([
        highlightService.getProfileHighlights(displayUserId, 12),
        postService.getPostsByTaggedUser(displayUserId, 12, undefined, activeUser?.userId).catch(() => ({ posts: [] })),
        glimpseService.getGlimpsesByTaggedUser(displayUserId, activeUser?.userId).then((items) => (items || []).slice(0, 12)).catch(() => []),
      ]);
      const accessPromise = !isOwnProfile && activeUser
        ? Promise.all([
            settingsService.getPrivacySettings(displayUserId).catch(() => null),
            userService.isFollowingUser(activeUser.userId, displayUserId),
            userService.isBlocked(activeUser.userId, displayUserId),
            userService.hasRequestedFollow(activeUser.userId, displayUserId).catch(() => false),
          ])
        : null;

      const userData = isOwnProfile && activeUser ? activeUser : await userService.getUser(displayUserId);

      if (!isLatestRun()) return;

      if (!userData) {
        setProfileUser(null);
        setUserPosts([]);
        setUserGlimpses([]);
        setTaggedPosts([]);
        setHighlights([]);
        setMutualFollowers([]);
        setFollowersCount(0);
        setFollowingCount(0);
        return;
      }

      const normalizePosts = (raw: any) => sortPinnedFirst(Array.isArray(raw) ? raw : (raw?.posts || []));

      setProfileUser(userData);
      setFollowersCount(userData?.stats?.followersCount || 0);
      setFollowingCount(userData?.stats?.followingCount || 0);

      let cacheIsFollowing = false;
      let cacheHasPendingFollowRequest = false;
      let cacheIsPrivateRestricted = false;
      let cacheProfilePrivacy: any = null;
      let cacheMutualFollowers: any[] = [];
      let nextPosts: any[] = [];
      let nextGlimpses: any[] = [];

      if (!isOwnProfile && activeUser && accessPromise) {
        const optimisticPrivate = !!userData?.isPrivate;

        if (!optimisticPrivate) {
          const primaryPostsRaw = await primaryPostsPromise;
          if (!isLatestRun()) return;
          nextPosts = normalizePosts(primaryPostsRaw);
          setUserPosts(nextPosts);
          setLoading(false);

          const primaryGlimpsesRaw = await primaryGlimpsesPromise;
          if (!isLatestRun()) return;
          nextGlimpses = sortPinnedFirst(primaryGlimpsesRaw || []);
          setUserGlimpses(nextGlimpses);
        }

        const [privacy, viewerFollowsTarget, viewerBlockedTarget, pendingRequest] = await accessPromise;
        if (!isLatestRun()) return;

        const following = viewerFollowsTarget;
        const blocked = viewerBlockedTarget;
        const privateAccountEnabled = typeof privacy?.isPrivate === 'boolean' ? !!privacy.isPrivate : !!userData?.isPrivate;
        const privateRestricted = privateAccountEnabled && !following;

        cacheProfilePrivacy = privacy;
        cacheIsFollowing = !!following;
        cacheHasPendingFollowRequest = !!pendingRequest;
        cacheIsPrivateRestricted = blocked ? false : privateRestricted;

        setProfilePrivacy(privacy);
        setIsBlockedView(blocked);
        setHasPendingFollowRequest(cacheHasPendingFollowRequest);
        setIsFollowing(cacheIsFollowing);
        setIsPrivateRestricted(cacheIsPrivateRestricted);

        if (blocked || privateRestricted) {
          setUserPosts([]);
          setUserGlimpses([]);
          setTaggedPosts([]);
          setHighlights([]);
          setMutualFollowers([]);
          setLoading(false);
          return;
        }

        if (optimisticPrivate) {
          const primaryPostsRaw = await primaryPostsPromise;
          if (!isLatestRun()) return;
          nextPosts = normalizePosts(primaryPostsRaw);
          setUserPosts(nextPosts);
          setLoading(false);

          const primaryGlimpsesRaw = await primaryGlimpsesPromise;
          if (!isLatestRun()) return;
          nextGlimpses = sortPinnedFirst(primaryGlimpsesRaw || []);
          setUserGlimpses(nextGlimpses);
        }

        void (async () => {
          try {
            const [myFollowing, profileFollowers] = await Promise.all([
              userService.getFollowing(activeUser.userId),
              userService.getFollowers(displayUserId),
            ]);
            if (!isLatestRun()) return;
            const mutualIds = myFollowing.filter((id) => profileFollowers.includes(id)).slice(0, 3);
            if (mutualIds.length === 0) {
              cacheMutualFollowers = [];
              setMutualFollowers([]);
              return;
            }
            const mutualUsers = await Promise.all(mutualIds.map((id) => userService.getUser(id)));
            if (!isLatestRun()) return;
            cacheMutualFollowers = mutualUsers.filter((entry) => entry !== null);
            setMutualFollowers(cacheMutualFollowers);
          } catch {
            if (!isLatestRun()) return;
            cacheMutualFollowers = [];
            setMutualFollowers([]);
          }
        })();
      } else {
        cacheIsFollowing = false;
        cacheHasPendingFollowRequest = false;
        cacheIsPrivateRestricted = false;
        cacheProfilePrivacy = null;
        cacheMutualFollowers = [];

        setIsFollowing(false);
        setMutualFollowers([]);
        setProfilePrivacy(null);
        setHasPendingFollowRequest(false);
        setIsBlockedView(false);
        setIsPrivateRestricted(false);

        const primaryPostsRaw = await primaryPostsPromise;
        if (!isLatestRun()) return;
        nextPosts = normalizePosts(primaryPostsRaw);
        setUserPosts(nextPosts);
        setLoading(false);

        const primaryGlimpsesRaw = await primaryGlimpsesPromise;
        if (!isLatestRun()) return;
        nextGlimpses = sortPinnedFirst(primaryGlimpsesRaw || []);
        setUserGlimpses(nextGlimpses);
      }

      const [fetchedHighlights, taggedPostResult, taggedGlimpses] = await secondaryContentPromise;
      if (!isLatestRun()) return;

      const taggedPostItems = Array.isArray((taggedPostResult as any)?.posts)
        ? (taggedPostResult as any).posts
        : Array.isArray(taggedPostResult) ? (taggedPostResult as any) : [];
      const taggedMerged = sortPinnedFirst([...taggedPostItems, ...(taggedGlimpses || [])]
        .filter((entry: any) => !!(entry?.postId || entry?.glimpseId || entry?.storyId || entry?.id))
      );

      const nextHighlights = Array.isArray(fetchedHighlights) ? fetchedHighlights : [];
      
      const profileSnapshot = {
        profileUser: userData,
        userPosts: nextPosts,
        userGlimpses: nextGlimpses,
        taggedPosts: taggedMerged,
        highlights: nextHighlights,
        mutualFollowers: cacheMutualFollowers,
        followersCount: userData?.stats?.followersCount || 0,
        followingCount: userData?.stats?.followingCount || 0,
        isFollowing: cacheIsFollowing,
        hasPendingFollowRequest: cacheHasPendingFollowRequest,
        isPrivateRestricted: cacheIsPrivateRestricted,
        profilePrivacy: cacheProfilePrivacy,
      };
      
      setHighlights(nextHighlights);
      setTaggedPosts(taggedMerged);

      if (profileCacheKey) {
        PROFILE_MEMORY_SNAPSHOT_BY_CACHE_KEY.set(profileCacheKey, profileSnapshot);
        void cacheIntegration.cacheData(profileCacheKey, profileSnapshot, 10 * 60 * 1000);
      }
      PROFILE_LIVE_FETCH_DONE_BY_CACHE_KEY[cacheKey] = true;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      if (!isLatestRun()) return;
      const cacheKey = profileCacheKey || ('profile:' + displayUserId);
      PROFILE_LAST_FETCH_BY_CACHE_KEY[cacheKey] = Date.now();
      setLoading(false);
    }
  }, [displayUserId, fadeAnim, isOwnProfile, profileCacheKey, sortPinnedFirst]);

  useEffect(() => {
    loadProfileRef.current = loadProfile;
  }, [loadProfile]);

  useEffect(() => {
    if (!displayUserId) return;
    const activeUser = currentUserRef.current;
    if (activeUser?.userId) {
      void appWarmupService.prefetchProfile(displayUserId, activeUser.userId);
    }
    void loadProfile();
  }, [displayUserId, loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile(true);
    setRefreshing(false);
  }, [loadProfile]);

  return {
    displayUserId,
    isOwnProfile,
    profileUser,
    setProfileUser,
    loading,
    refreshing,
    userPosts,
    userGlimpses,
    taggedPosts,
    highlights,
    mutualFollowers,
    followersCount,
    setFollowersCount,
    followingCount,
    isFollowing,
    setIsFollowing,
    profilePrivacy,
    hasPendingFollowRequest,
    setHasPendingFollowRequest,
    isBlockedView,
    isPrivateRestricted,
    setIsPrivateRestricted,
    fadeAnim,
    loadProfileRef,
    onRefresh
  };
}
