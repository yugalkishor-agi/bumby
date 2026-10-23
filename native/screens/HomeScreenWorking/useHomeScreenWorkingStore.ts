import { create } from 'zustand';
import type { FeedControlSettings, Post, Story } from './homeFeedTypes';

interface HomeScreenWorkingState {
  posts: Post[];
  setPosts: (val: Post[] | ((prev: Post[]) => Post[])) => void;
  hiddenPostIds: string[];
  setHiddenPostIds: (val: string[] | ((prev: string[]) => string[])) => void;
  stories: Story[];
  setStories: (val: Story[] | ((prev: Story[]) => Story[])) => void;
  hasMyStory: any;
  setHasMyStory: (val: any | ((prev: any) => any)) => void;
  isMyStoryViewed: any;
  setIsMyStoryViewed: (val: any | ((prev: any) => any)) => void;
  refreshing: any;
  setRefreshing: (val: any | ((prev: any) => any)) => void;
  loading: any;
  setLoading: (val: any | ((prev: any) => any)) => void;
  unreadNotifications: any;
  setUnreadNotifications: (val: any | ((prev: any) => any)) => void;
  unreadMessages: any;
  setUnreadMessages: (val: any | ((prev: any) => any)) => void;
  followingIds: string[];
  setFollowingIds: (val: string[] | ((prev: string[]) => string[])) => void;
  lastDoc: any;
  setLastDoc: (val: any | ((prev: any) => any)) => void;
  loadingMore: any;
  setLoadingMore: (val: any | ((prev: any) => any)) => void;
  noMore: any;
  setNoMore: (val: any | ((prev: any) => any)) => void;
  feedControls: FeedControlSettings;
  setFeedControls: (val: FeedControlSettings | ((prev: FeedControlSettings) => FeedControlSettings)) => void;
  viewerRegion: any;
  setViewerRegion: (val: any | ((prev: any) => any)) => void;
}

export const useHomeScreenWorkingStore = create<HomeScreenWorkingState>((set) => ({
  posts: [],
  setPosts: (val) => set((state) => ({ posts: typeof val === 'function' ? (val as any)(state.posts) : val })),
  hiddenPostIds: [],
  setHiddenPostIds: (val) => set((state) => ({ hiddenPostIds: typeof val === 'function' ? (val as any)(state.hiddenPostIds) : val })),
  stories: [],
  setStories: (val) => set((state) => ({ stories: typeof val === 'function' ? (val as any)(state.stories) : val })),
  hasMyStory: false,
  setHasMyStory: (val) => set((state) => ({ hasMyStory: typeof val === 'function' ? (val as any)(state.hasMyStory) : val })),
  isMyStoryViewed: false,
  setIsMyStoryViewed: (val) => set((state) => ({ isMyStoryViewed: typeof val === 'function' ? (val as any)(state.isMyStoryViewed) : val })),
  refreshing: false,
  setRefreshing: (val) => set((state) => ({ refreshing: typeof val === 'function' ? (val as any)(state.refreshing) : val })),
  loading: true,
  setLoading: (val) => set((state) => ({ loading: typeof val === 'function' ? (val as any)(state.loading) : val })),
  unreadNotifications: 0,
  setUnreadNotifications: (val) => set((state) => ({ unreadNotifications: typeof val === 'function' ? (val as any)(state.unreadNotifications) : val })),
  unreadMessages: 0,
  setUnreadMessages: (val) => set((state) => ({ unreadMessages: typeof val === 'function' ? (val as any)(state.unreadMessages) : val })),
  followingIds: [],
  setFollowingIds: (val) => set((state) => ({ followingIds: typeof val === 'function' ? (val as any)(state.followingIds) : val })),
  lastDoc: null,
  setLastDoc: (val) => set((state) => ({ lastDoc: typeof val === 'function' ? (val as any)(state.lastDoc) : val })),
  loadingMore: false,
  setLoadingMore: (val) => set((state) => ({ loadingMore: typeof val === 'function' ? (val as any)(state.loadingMore) : val })),
  noMore: false,
  setNoMore: (val) => set((state) => ({ noMore: typeof val === 'function' ? (val as any)(state.noMore) : val })),
  feedControls: { enabled: false, friendsVsPublic: 0.8, photosVsVideos: 0.55, newVsOldViral: 0.7, localVsGlobal: 0.7, mood: 'balanced' },
  setFeedControls: (val) => set((state) => ({ feedControls: typeof val === 'function' ? (val as any)(state.feedControls) : val })),
  viewerRegion: '',
  setViewerRegion: (val) => set((state) => ({ viewerRegion: typeof val === 'function' ? (val as any)(state.viewerRegion) : val })),
}));
