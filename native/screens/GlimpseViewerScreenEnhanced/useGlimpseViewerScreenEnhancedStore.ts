
import { create } from 'zustand';
import type { Glimpse } from './types';

interface GlimpseViewerScreenEnhancedState {
  glimpses: Glimpse[];
  setGlimpses: (val: Glimpse[] | ((prev: Glimpse[]) => Glimpse[])) => void;
  currentIndex: any;
  setCurrentIndex: (val: any | ((prev: any) => any)) => void;
  loading: any;
  setLoading: (val: any | ((prev: any) => any)) => void;
  paused: any;
  setPaused: (val: any | ((prev: any) => any)) => void;
  muted: any;
  setMuted: (val: any | ((prev: any) => any)) => void;
  liked: Record<string, boolean>;
  setLiked: (val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  saved: Record<string, boolean>;
  setSaved: (val: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  commentCounts: Record<string, number>;
  setCommentCounts: (val: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  videoProgress: Record<string, number>;
  setVideoProgress: (val: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  buffering: any;
  setBuffering: (val: any | ((prev: any) => any)) => void;
  mediaNaturalSizes: Record<string, { width: number; height: number }>;
  setMediaNaturalSizes: (val: Record<string, { width: number; height: number }> | ((prev: Record<string, { width: number; height: number }>) => Record<string, { width: number; height: number }>)) => void;
  followingAuthor: boolean;
  setFollowingAuthor: (val: boolean | ((prev: boolean) => boolean)) => void;
  showMenu: boolean;
  setShowMenu: (val: boolean | ((prev: boolean) => boolean)) => void;
  editVisible: any;
  setEditVisible: (val: any | ((prev: any) => any)) => void;
  editCaption: any;
  setEditCaption: (val: any | ((prev: any) => any)) => void;
  menuActionLoading: any;
  setMenuActionLoading: (val: any | ((prev: any) => any)) => void;
  likedByFollowing: any[];
  setLikedByFollowing: (val: any[] | ((prev: any[]) => any[])) => void;
  likedByFollowingCount: number;
  setLikedByFollowingCount: (val: number | ((prev: number) => number)) => void;
  mutualBy: any[];
  setMutualBy: (val: any[] | ((prev: any[]) => any[])) => void;
  followingIds: Set<string>;
  setFollowingIds: (val: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  captionExpanded: any;
  setCaptionExpanded: (val: any | ((prev: any) => any)) => void;
  followActionLoading: any;
  setFollowActionLoading: (val: any | ((prev: any) => any)) => void;
  tapFeedbackIcon: 'volume-mute' | 'volume-high' | null;
  setTapFeedbackIcon: (val: 'volume-mute' | 'volume-high' | null | ((prev: 'volume-mute' | 'volume-high' | null) => 'volume-mute' | 'volume-high' | null)) => void;
  showCommentsSheet: any;
  setShowCommentsSheet: (val: any | ((prev: any) => any)) => void;
  commentsTargetId: string;
  setCommentsTargetId: (val: string | ((prev: string) => string)) => void;
  commentText: any;
  setCommentText: (val: any | ((prev: any) => any)) => void;
  submittingComment: any;
  setSubmittingComment: (val: any | ((prev: any) => any)) => void;
  replyingToComment: { username: string; commentId: string } | null;
  setReplyingToComment: (val: { username: string; commentId: string } | null | ((prev: { username: string; commentId: string } | null) => { username: string; commentId: string } | null)) => void;
  expandedCommentThreads: Set<string>;
  setExpandedCommentThreads: (val: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export const useGlimpseViewerScreenEnhancedStore = create<GlimpseViewerScreenEnhancedState>((set) => ({
  glimpses: [],
  setGlimpses: (val) => set((state) => ({ glimpses: typeof val === 'function' ? (val as any)(state.glimpses) : val })),
  currentIndex: 0,
  setCurrentIndex: (val) => set((state) => ({ currentIndex: typeof val === 'function' ? (val as any)(state.currentIndex) : val })),
  loading: false,
  setLoading: (val) => set((state) => ({ loading: typeof val === 'function' ? (val as any)(state.loading) : val })),
  paused: false,
  setPaused: (val) => set((state) => ({ paused: typeof val === 'function' ? (val as any)(state.paused) : val })),
  muted: true,
  setMuted: (val) => set((state) => ({ muted: typeof val === 'function' ? (val as any)(state.muted) : val })),
  liked: {},
  setLiked: (val) => set((state) => ({ liked: typeof val === 'function' ? (val as any)(state.liked) : val })),
  saved: {},
  setSaved: (val) => set((state) => ({ saved: typeof val === 'function' ? (val as any)(state.saved) : val })),
  commentCounts: {},
  setCommentCounts: (val) => set((state) => ({ commentCounts: typeof val === 'function' ? (val as any)(state.commentCounts) : val })),
  videoProgress: {},
  setVideoProgress: (val) => set((state) => ({ videoProgress: typeof val === 'function' ? (val as any)(state.videoProgress) : val })),
  buffering: false,
  setBuffering: (val) => set((state) => ({ buffering: typeof val === 'function' ? (val as any)(state.buffering) : val })),
  mediaNaturalSizes: {},
  setMediaNaturalSizes: (val) => set((state) => ({ mediaNaturalSizes: typeof val === 'function' ? (val as any)(state.mediaNaturalSizes) : val })),
  followingAuthor: false,
  setFollowingAuthor: (val) => set((state) => ({ followingAuthor: typeof val === 'function' ? (val as any)(state.followingAuthor) : val })),
  showMenu: false,
  setShowMenu: (val) => set((state) => ({ showMenu: typeof val === 'function' ? (val as any)(state.showMenu) : val })),
  editVisible: false,
  setEditVisible: (val) => set((state) => ({ editVisible: typeof val === 'function' ? (val as any)(state.editVisible) : val })),
  editCaption: '',
  setEditCaption: (val) => set((state) => ({ editCaption: typeof val === 'function' ? (val as any)(state.editCaption) : val })),
  menuActionLoading: false,
  setMenuActionLoading: (val) => set((state) => ({ menuActionLoading: typeof val === 'function' ? (val as any)(state.menuActionLoading) : val })),
  likedByFollowing: [],
  setLikedByFollowing: (val) => set((state) => ({ likedByFollowing: typeof val === 'function' ? (val as any)(state.likedByFollowing) : val })),
  likedByFollowingCount: 0,
  setLikedByFollowingCount: (val) => set((state) => ({ likedByFollowingCount: typeof val === 'function' ? (val as any)(state.likedByFollowingCount) : val })),
  mutualBy: [],
  setMutualBy: (val) => set((state) => ({ mutualBy: typeof val === 'function' ? (val as any)(state.mutualBy) : val })),
  followingIds: new Set(),
  setFollowingIds: (val) => set((state) => ({ followingIds: typeof val === 'function' ? (val as any)(state.followingIds) : val })),
  captionExpanded: false,
  setCaptionExpanded: (val) => set((state) => ({ captionExpanded: typeof val === 'function' ? (val as any)(state.captionExpanded) : val })),
  followActionLoading: false,
  setFollowActionLoading: (val) => set((state) => ({ followActionLoading: typeof val === 'function' ? (val as any)(state.followActionLoading) : val })),
  tapFeedbackIcon: null,
  setTapFeedbackIcon: (val) => set((state) => ({ tapFeedbackIcon: typeof val === 'function' ? (val as any)(state.tapFeedbackIcon) : val })),
  showCommentsSheet: false,
  setShowCommentsSheet: (val) => set((state) => ({ showCommentsSheet: typeof val === 'function' ? (val as any)(state.showCommentsSheet) : val })),
  commentsTargetId: '',
  setCommentsTargetId: (val) => set((state) => ({ commentsTargetId: typeof val === 'function' ? (val as any)(state.commentsTargetId) : val })),
  commentText: '',
  setCommentText: (val) => set((state) => ({ commentText: typeof val === 'function' ? (val as any)(state.commentText) : val })),
  submittingComment: false,
  setSubmittingComment: (val) => set((state) => ({ submittingComment: typeof val === 'function' ? (val as any)(state.submittingComment) : val })),
  replyingToComment: null,
  setReplyingToComment: (val) => set((state) => ({ replyingToComment: typeof val === 'function' ? (val as any)(state.replyingToComment) : val })),
  expandedCommentThreads: new Set(),
  setExpandedCommentThreads: (val) => set((state) => ({ expandedCommentThreads: typeof val === 'function' ? (val as any)(state.expandedCommentThreads) : val })),
}));
