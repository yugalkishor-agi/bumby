import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Dimensions,
  StatusBar,
  Animated,
  Easing,
  InteractionManager,
  PanResponder
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { FeedPostItem } from './HomeScreenWorking/FeedPostItem';
import { StoryRing } from '../components/feed/StoryRing';
import { LoadingSkeleton, PostSkeleton } from '../components/ui/LoadingSkeleton';
import { useAuth } from '../contexts/AuthContext';
import { useStoryProcessing } from '../contexts/StoryProcessingContext';
import { buildHomeBootstrapCacheKey } from '../services/appWarmup.service';
import { feedRankingService } from '../services/feedRanking.service';
import { useHomeScreenWorkingStore } from "./HomeScreenWorking/useHomeScreenWorkingStore";
import { styles } from "./HomeScreenWorking/styles";
import type { Post, Story } from './HomeScreenWorking/homeFeedTypes';
import { useHomeBootstrapCache } from './HomeScreenWorking/useHomeBootstrapCache';
import { useHomeBadges } from './HomeScreenWorking/useHomeBadges';
import { useHomeFeed } from './HomeScreenWorking/useHomeFeed';
import { useHomeFeedActions } from './HomeScreenWorking/useHomeFeedActions';
import { useHomeFeedControls } from './HomeScreenWorking/useHomeFeedControls';
import { useHomeFeedHydration } from './HomeScreenWorking/useHomeFeedHydration';
import { useHomeInitialData } from './HomeScreenWorking/useHomeInitialData';
import { useHomeLikedStateSync } from './HomeScreenWorking/useHomeLikedStateSync';
import { useHomePagination } from './HomeScreenWorking/useHomePagination';
import { useHomeStories } from './HomeScreenWorking/useHomeStories';
import { HomeHeader } from './HomeScreenWorking/HomeHeader';
import { HomeStoryTray } from './HomeScreenWorking/HomeStoryTray';

const { height: screenHeight } = Dimensions.get('window');

export default function HomeScreenWorking() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const currentUserId = user?.userId ?? null;
  const homeBootstrapCacheKey = currentUserId ? buildHomeBootstrapCacheKey(currentUserId) : '';
  const { processingStories } = useStoryProcessing();
  const posts = useHomeScreenWorkingStore(s => s.posts);
    const setPosts = useHomeScreenWorkingStore(s => s.setPosts);
  const hiddenPostIds = useHomeScreenWorkingStore(s => s.hiddenPostIds);
    const setHiddenPostIds = useHomeScreenWorkingStore(s => s.setHiddenPostIds);
  const stories = useHomeScreenWorkingStore(s => s.stories);
    const setStories = useHomeScreenWorkingStore(s => s.setStories);
  const hasMyStory = useHomeScreenWorkingStore(s => s.hasMyStory);
    const setHasMyStory = useHomeScreenWorkingStore(s => s.setHasMyStory);
  const isMyStoryViewed = useHomeScreenWorkingStore(s => s.isMyStoryViewed);
    const setIsMyStoryViewed = useHomeScreenWorkingStore(s => s.setIsMyStoryViewed);
  const refreshing = useHomeScreenWorkingStore(s => s.refreshing);
    const setRefreshing = useHomeScreenWorkingStore(s => s.setRefreshing);
  const loading = useHomeScreenWorkingStore(s => s.loading);
    const setLoading = useHomeScreenWorkingStore(s => s.setLoading);
  const unreadNotifications = useHomeScreenWorkingStore(s => s.unreadNotifications);
    const setUnreadNotifications = useHomeScreenWorkingStore(s => s.setUnreadNotifications);
  const unreadMessages = useHomeScreenWorkingStore(s => s.unreadMessages);
    const setUnreadMessages = useHomeScreenWorkingStore(s => s.setUnreadMessages);
  const isFocused = useIsFocused();
  const [isReady, setIsReady] = useState(false);
  const messageWiggle = useRef(new Animated.Value(0)).current;
  const wiggleRef = useRef<Animated.CompositeAnimation | null>(null);
  const followingIds = useHomeScreenWorkingStore(s => s.followingIds);
    const setFollowingIds = useHomeScreenWorkingStore(s => s.setFollowingIds);
  const lastDoc = useHomeScreenWorkingStore(s => s.lastDoc);
    const setLastDoc = useHomeScreenWorkingStore(s => s.setLastDoc);
  const loadingMore = useHomeScreenWorkingStore(s => s.loadingMore);
    const setLoadingMore = useHomeScreenWorkingStore(s => s.setLoadingMore);
  const noMore = useHomeScreenWorkingStore(s => s.noMore);
    const setNoMore = useHomeScreenWorkingStore(s => s.setNoMore);
  const feedControls = useHomeScreenWorkingStore(s => s.feedControls);
    const setFeedControls = useHomeScreenWorkingStore(s => s.setFeedControls);
  const viewerRegion = useHomeScreenWorkingStore(s => s.viewerRegion);
    const setViewerRegion = useHomeScreenWorkingStore(s => s.setViewerRegion);
  const postLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
  const currentUserIdRef = useRef<string | null>(currentUserId);
  const lastFeedSignalRef = useRef<{ postId: string; at: number }>({ postId: '', at: 0 });
  const storiesRef = useRef<Story[]>(stories);

  const {
    postsRef,
    commitBaseFeedPosts,
    mutateBaseFeedPosts,
    seedBaseFeedPosts,
  } = useHomeFeed({
    posts,
    followingIds,
    feedControls,
    viewerRegion,
    setPosts,
  });
  useHomeBadges({
    currentUserId,
    isFocused,
    setUnreadNotifications,
    setUnreadMessages,
  });
  useHomeFeedControls({
    currentUserId,
    isFocused,
    setFeedControls,
  });
  const { hydrateLikedByPreview, hydrateFeedLikedState } = useHomeFeedHydration({
    currentUserId,
    mutateBaseFeedPosts,
  });
  useHomeBootstrapCache({
    cacheKey: homeBootstrapCacheKey,
    currentUserId,
    seedBaseFeedPosts,
    hydrateFeedLikedState,
    setStories,
    setFollowingIds,
    setHasMyStory,
    setIsMyStoryViewed,
    setLoading,
  });
  useHomeLikedStateSync({
    navigation,
    currentUserId,
    postsRef,
    mutateBaseFeedPosts,
  });
  const messagesSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontalIntent = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35;
          return horizontalIntent && gestureState.dx < -18;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -72 && gestureState.vx < -0.2) {
            (navigation as any).navigate('Messages');
          }
        },
      }),
    [navigation]
  );

  const viewabilityConfigRef = useRef({
    waitForInteraction: false,
    viewAreaCoveragePercentThreshold: 55,
    minimumViewTime: 160,
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: any[] }) => {
      let primaryVisiblePost: Post | undefined;
      let minIndex = Number.MAX_SAFE_INTEGER;

      for (const entry of viewableItems) {
        if (entry?.isViewable !== false && entry?.item) {
          const post = entry.item as Post;

          const index = entry.index ?? Number.MAX_SAFE_INTEGER;
          if (index < minIndex && post.postId && post.userId) {
            minIndex = index;
            primaryVisiblePost = post;
          }
        }
      }

      const activeUserId = currentUserIdRef.current;
      if (activeUserId && primaryVisiblePost?.postId) {
        const now = Date.now();
        const lastSignal = lastFeedSignalRef.current;
        if (lastSignal.postId !== primaryVisiblePost.postId || now - lastSignal.at > 45000) {
          lastFeedSignalRef.current = { postId: primaryVisiblePost.postId, at: now };
          feedRankingService.recordOpen(activeUserId, primaryVisiblePost);
        }
      }
    }
  );


  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    storiesRef.current = stories;
  }, [stories]);

  const rankFeedForUser = useCallback((items: Post[]) => {
    if (!currentUserId || items.length === 0) return items;
    return feedRankingService.rankFeed(currentUserId, items);
  }, [currentUserId]);

  const loadMorePosts = useHomePagination({
    followingIds,
    currentUserId,
    lastDoc,
    loadingMore,
    noMore,
    hiddenPostIds,
    hydrateLikedByPreview,
    rankFeedForUser,
    mutateBaseFeedPosts,
    setLastDoc,
    setNoMore,
    setLoadingMore,
  });

  const setPostsEmpty = useCallback(() => {
    commitBaseFeedPosts([]);
  }, [commitBaseFeedPosts]);

  const initialDataParams = useMemo(() => ({
    currentUserId,
    cacheKey: homeBootstrapCacheKey,
    username: user?.username,
    postsRef,
    storiesRef,
    hydrateLikedByPreview,
    rankFeedForUser,
    commitBaseFeedPosts,
    setPostsEmpty,
    setStories,
    setFollowingIds,
    setHiddenPostIds,
    setHasMyStory,
    setIsMyStoryViewed,
    setLoading,
    setRefreshing,
    setLastDoc,
    setNoMore,
    setViewerRegion,
  }), [
    currentUserId,
    homeBootstrapCacheKey,
    user?.username,
    postsRef,
    storiesRef,
    hydrateLikedByPreview,
    rankFeedForUser,
    commitBaseFeedPosts,
    setPostsEmpty,
    setStories,
    setFollowingIds,
    setHiddenPostIds,
    setHasMyStory,
    setIsMyStoryViewed,
    setLoading,
    setRefreshing,
    setLastDoc,
    setNoMore,
    setViewerRegion,
  ]);

  const loadInitialData = useHomeInitialData(initialDataParams);

  useEffect(() => {
    let active = true;
    if (active) {
      void loadInitialData();
    }
    return () => {
      active = false;
    };
  }, [loadInitialData]);

  useEffect(() => {
    if (!isFocused || !currentUserId) return;
    // Intentionally skip full feed reload on tab focus to keep scroll/feed stable.
  }, [currentUserId, isFocused]);

  useEffect(() => {
    wiggleRef.current?.stop();
    messageWiggle.stopAnimation();
    messageWiggle.setValue(0);

    if (!isFocused || unreadMessages <= 0) {
      return () => {
        wiggleRef.current?.stop();
      };
    }

    wiggleRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(messageWiggle, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(messageWiggle, { toValue: -1, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(messageWiggle, { toValue: 0.7, duration: 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(messageWiggle, { toValue: 0, duration: 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    wiggleRef.current.start();

    return () => {
      wiggleRef.current?.stop();
      messageWiggle.stopAnimation();
      messageWiggle.setValue(0);
    };
  }, [isFocused, unreadMessages, messageWiggle]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadInitialData().finally(() => setRefreshing(false));
  }, [loadInitialData]);

  const deletePostLayout = useCallback((postId: string) => {
    delete postLayoutsRef.current[postId];
  }, []);

  const { handleLikePress, handleSavePress, handleShare, handleHide } = useHomeFeedActions({
    user,
    postsRef,
    mutateBaseFeedPosts,
    setHiddenPostIds,
    deletePostLayout,
  });
  useHomeStories({
    currentUserId,
    processingStories,
    loadInitialData,
    setStories,
    setIsMyStoryViewed,
  });

  const handleStoryPress = useCallback((userObj: any) => {
    (navigation as any).navigate('StoryViewerEnhanced', { 
      userId: userObj.userId || userObj.id,
    });
  }, [navigation]);

  const handleCreateStory = useCallback(() => {
    (navigation as any).navigate('StoryEditor');
  }, [navigation]);

  const handleCreateOrViewOwnStory = useCallback(() => {
    if (hasMyStory) {
      (navigation as any).navigate('StoryViewerEnhanced', { userId: user?.userId });
      return;
    }
    handleCreateStory();
  }, [hasMyStory, user?.userId, navigation, handleCreateStory]);

  // Render story item
  const renderStoryItem = useCallback(({ item, index }: { item: any, index: number }) => {
    if (index === 0 && user) {
      return (
        <StoryRing
          user={{
            id: user.userId,
            name: user.displayName || user.username || 'You',
            avatar: user.avatarURL,
            stories: [],
            isOwn: true,
            username: user.username || user.displayName || 'You',
            userId: user.userId,
            hasActiveStory: hasMyStory,
            hasViewedAll: isMyStoryViewed,
          }}
          status={hasMyStory ? (isMyStoryViewed ? 'viewed' : 'own') : 'new'}
          onPress={handleCreateOrViewOwnStory}
        />
      );
    }

    return (
      <StoryRing
        user={{
          id: item.userId,
          name: item.username || item.displayName || '',
          avatar: item.avatarURL,
          stories: [],
          isOwn: false,
          username: item.username || item.displayName || '',
          userId: item.userId,
          hasActiveStory: true,
          hasViewedAll: !!item.isViewed,
        }}
        status={item.isViewed ? 'viewed' : 'new'}
        onPress={handleStoryPress}
      />
    );
  }, [user, hasMyStory, isMyStoryViewed, handleCreateOrViewOwnStory, handleStoryPress]);

  const handlePostLayout = useCallback((event: any, postId: string) => {
    const { y, height } = event.nativeEvent.layout;
    postLayoutsRef.current[postId] = { y, height };
  }, []);

  // Render post item — keep deps limited to values that are stable during scroll.
  const renderPostItem = useCallback(({ item }: { item: any }) => (
    <FeedPostItem
      item={item}
      onLayout={handlePostLayout}
      onLike={handleLikePress}
      onSaveChange={handleSavePress}
      onShare={handleShare}
      onHide={handleHide}
    />
  ), [handlePostLayout, handleLikePress, handleSavePress, handleShare, handleHide]);

  const storiesWithCreate = useMemo(() => {
    return [{ storyId: 'create', userId: user?.userId || '' }, ...stories];
  }, [user?.userId, stories]);

  // Header component
  const renderHeader = useCallback(() => (
    <View>
      <HomeHeader
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
        messageWiggle={messageWiggle}
      />
      <HomeStoryTray
        storiesWithCreate={storiesWithCreate}
        renderStoryItem={renderStoryItem}
      />
    </View>
  ), [unreadNotifications, unreadMessages, messageWiggle, storiesWithCreate, renderStoryItem]);

  const shouldShowInitialSkeleton = loading && posts.length === 0 && stories.length === 0;

  if (!isReady) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00D47E" />
      </SafeAreaView>
    );
  }

  if (shouldShowInitialSkeleton) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <LoadingSkeleton width={112} height={28} borderRadius={14} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <LoadingSkeleton width={36} height={36} borderRadius={18} />
              <LoadingSkeleton width={36} height={36} borderRadius={18} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 18 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <View key={index} style={{ alignItems: 'center', marginRight: 14 }}>
                <LoadingSkeleton width={68} height={68} borderRadius={34} />
                <LoadingSkeleton width={54} height={10} borderRadius={999} style={{ marginTop: 8 }} />
              </View>
            ))}
          </View>
          {Array.from({ length: 3 }).map((_, index) => (
            <PostSkeleton key={index} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Main Feed */}
      <FlashList
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item: any) => item.postId}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={['#007AFF']}
          />
        }
        onEndReached={loadMorePosts}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContainer as any}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfigRef.current}
        estimatedItemSize={600}
        drawDistance={screenHeight * 1.4}
      />
    </SafeAreaView>
  );
}
