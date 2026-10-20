import { create } from 'zustand';
import type { User, Message } from '../../types/database';
import type { ChatMessage } from '../../types/chat';
import type { PrivacySettings } from '../../services/settings.service';
import type { PinnedState, PickerTab } from '../chat/chatScreen.types';

interface ChatScreenState {
  conversationId: any;
  setConversationId: (val: any | ((prev: any) => any)) => void;
  messageText: any;
  setMessageText: (val: any | ((prev: any) => any)) => void;
  sending: any;
  setSending: (val: any | ((prev: any) => any)) => void;
  otherUser: User | null;
  setOtherUser: (val: User | null | ((prev: User | null) => User | null)) => void;
  groupMeta: any;
  setGroupMeta: (val: any | ((prev: any) => any)) => void;
  otherUserPrivacy: Partial<PrivacySettings> | null;
  setOtherUserPrivacy: (val: Partial<PrivacySettings> | null | ((prev: Partial<PrivacySettings> | null) => Partial<PrivacySettings> | null)) => void;
  conversationNickname: any;
  setConversationNickname: (val: any | ((prev: any) => any)) => void;
  loadingUser: any;
  setLoadingUser: (val: any | ((prev: any) => any)) => void;
  canMessage: any;
  setCanMessage: (val: any | ((prev: any) => any)) => void;
  requestMode: any;
  setRequestMode: (val: any | ((prev: any) => any)) => void;
  removedGroupMeta: { removedBy: string; removedAtMs: number } | null;
  setRemovedGroupMeta: (val: { removedBy: string; removedAtMs: number } | null | ((prev: { removedBy: string; removedAtMs: number } | null) => { removedBy: string; removedAtMs: number } | null)) => void;
  removedByUser: User | null;
  setRemovedByUser: (val: User | null | ((prev: User | null) => User | null)) => void;
  replyingTo: Partial<ChatMessage> | null;
  setReplyingTo: (val: Partial<ChatMessage> | null | ((prev: Partial<ChatMessage> | null) => Partial<ChatMessage> | null)) => void;
  otherUserTyping: any;
  setOtherUserTyping: (val: any | ((prev: any) => any)) => void;
  favoriteReactions: string[];
  setFavoriteReactions: (val: string[] | ((prev: string[]) => string[])) => void;
  visibleMessageIds: Set<string>;
  setVisibleMessageIds: (val: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  actionsVisible: any;
  setActionsVisible: (val: any | ((prev: any) => any)) => void;
  shareSheetVisible: any;
  setShareSheetVisible: (val: any | ((prev: any) => any)) => void;
  galleryComposerVisible: any;
  setGalleryComposerVisible: (val: any | ((prev: any) => any)) => void;
  pollComposerVisible: any;
  setPollComposerVisible: (val: any | ((prev: any) => any)) => void;
  locationSheetVisible: any;
  setLocationSheetVisible: (val: any | ((prev: any) => any)) => void;
  moreReactionsVisible: any;
  setMoreReactionsVisible: (val: any | ((prev: any) => any)) => void;
  activeActionMessage: ChatMessage | null;
  setActiveActionMessage: (val: ChatMessage | null | ((prev: ChatMessage | null) => ChatMessage | null)) => void;
  reactionViewer: { visible: boolean; messageId: string | null };
  setReactionViewer: (val: { visible: boolean; messageId: string | null } | ((prev: { visible: boolean; messageId: string | null }) => { visible: boolean; messageId: string | null })) => void;
  reactionUsersById: Record<string, User | null>;
  setReactionUsersById: (val: Record<string, User | null> | ((prev: Record<string, User | null>) => Record<string, User | null>)) => void;
  seenUsersById: Record<string, User | null>;
  setSeenUsersById: (val: Record<string, User | null> | ((prev: Record<string, User | null>) => Record<string, User | null>)) => void;
  actionMenuAnchor: { x: number; y: number; width: number; height: number; isMe: boolean } | null;
  setActionMenuAnchor: (val: { x: number; y: number; width: number; height: number; isMe: boolean } | null | ((prev: { x: number; y: number; width: number; height: number; isMe: boolean } | null) => { x: number; y: number; width: number; height: number; isMe: boolean } | null)) => void;
  pinned: PinnedState;
  setPinned: (val: PinnedState | ((prev: PinnedState) => PinnedState)) => void;
  pinnedCursor: any;
  setPinnedCursor: (val: any | ((prev: any) => any)) => void;
  hiddenIds: Set<string>;
  setHiddenIds: (val: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  textOverrides: Record<string, string>;
  setTextOverrides: (val: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  editingId: string | null;
  setEditingId: (val: string | null | ((prev: string | null) => string | null)) => void;
  stickerPickerVisible: any;
  setStickerPickerVisible: (val: any | ((prev: any) => any)) => void;
  stickerPickerTab: PickerTab;
  setStickerPickerTab: (val: PickerTab | ((prev: PickerTab) => PickerTab)) => void;
  forwardModalVisible: any;
  setForwardModalVisible: (val: any | ((prev: any) => any)) => void;
  forwardPayload: {
    messageId: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'shared_post' | 'shared_glimpse' | 'shared_story';
    text?: string;
    mediaURL?: string;
    sharedContent?: Message['sharedContent'];
  } | null;
  setForwardPayload: (val: {
    messageId: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'shared_post' | 'shared_glimpse' | 'shared_story';
    text?: string;
    mediaURL?: string;
    sharedContent?: Message['sharedContent'];
  } | null | ((prev: {
    messageId: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'shared_post' | 'shared_glimpse' | 'shared_story';
    text?: string;
    mediaURL?: string;
    sharedContent?: Message['sharedContent'];
  } | null) => {
    messageId: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'shared_post' | 'shared_glimpse' | 'shared_story';
    text?: string;
    mediaURL?: string;
    sharedContent?: Message['sharedContent'];
  } | null)) => void;
  editedMeta: Record<string, { original: string }>;
  setEditedMeta: (val: Record<string, { original: string }> | ((prev: Record<string, { original: string }>) => Record<string, { original: string }>)) => void;
  editingReactionIndex: number | null;
  setEditingReactionIndex: (val: number | null | ((prev: number | null) => number | null)) => void;
  editingPreview: string | null;
  setEditingPreview: (val: string | null | ((prev: string | null) => string | null)) => void;
  chatTheme: any;
  setChatTheme: (val: any | ((prev: any) => any)) => void;
  seenClockMs: any;
  setSeenClockMs: (val: any | ((prev: any) => any)) => void;
  replyPreviewExpanded: any;
  setReplyPreviewExpanded: (val: any | ((prev: any) => any)) => void;
  showScrollToBottom: any;
  setShowScrollToBottom: (val: any | ((prev: any) => any)) => void;
  hasInitialScrolled: any;
  setHasInitialScrolled: (val: any | ((prev: any) => any)) => void;
}

export const useChatScreenStore = create<ChatScreenState>((set) => ({
  conversationId: null,
  setConversationId: (val) => set((state) => ({ conversationId: typeof val === 'function' ? (val as any)(state.conversationId) : val })),
  messageText: '',
  setMessageText: (val) => set((state) => ({ messageText: typeof val === 'function' ? (val as any)(state.messageText) : val })),
  sending: false,
  setSending: (val) => set((state) => ({ sending: typeof val === 'function' ? (val as any)(state.sending) : val })),
  otherUser: null,
  setOtherUser: (val) => set((state) => ({ otherUser: typeof val === 'function' ? (val as any)(state.otherUser) : val })),
  groupMeta: {
    name: null,
    avatarURL: null,
    description: null,
    participantIds: null,
  },
  setGroupMeta: (val) => set((state) => ({ groupMeta: typeof val === 'function' ? (val as any)(state.groupMeta) : val })),
  otherUserPrivacy: null,
  setOtherUserPrivacy: (val) => set((state) => ({ otherUserPrivacy: typeof val === 'function' ? (val as any)(state.otherUserPrivacy) : val })),
  conversationNickname: '',
  setConversationNickname: (val) => set((state) => ({ conversationNickname: typeof val === 'function' ? (val as any)(state.conversationNickname) : val })),
  loadingUser: false,
  setLoadingUser: (val) => set((state) => ({ loadingUser: typeof val === 'function' ? (val as any)(state.loadingUser) : val })),
  canMessage: true,
  setCanMessage: (val) => set((state) => ({ canMessage: typeof val === 'function' ? (val as any)(state.canMessage) : val })),
  requestMode: false,
  setRequestMode: (val) => set((state) => ({ requestMode: typeof val === 'function' ? (val as any)(state.requestMode) : val })),
  removedGroupMeta: null,
  setRemovedGroupMeta: (val) => set((state) => ({ removedGroupMeta: typeof val === 'function' ? (val as any)(state.removedGroupMeta) : val })),
  removedByUser: null,
  setRemovedByUser: (val) => set((state) => ({ removedByUser: typeof val === 'function' ? (val as any)(state.removedByUser) : val })),
  replyingTo: null,
  setReplyingTo: (val) => set((state) => ({ replyingTo: typeof val === 'function' ? (val as any)(state.replyingTo) : val })),
  otherUserTyping: false,
  setOtherUserTyping: (val) => set((state) => ({ otherUserTyping: typeof val === 'function' ? (val as any)(state.otherUserTyping) : val })),
  favoriteReactions: [],
  setFavoriteReactions: (val) => set((state) => ({ favoriteReactions: typeof val === 'function' ? (val as any)(state.favoriteReactions) : val })),
  visibleMessageIds: new Set<string>(),
  setVisibleMessageIds: (val) => set((state) => ({ visibleMessageIds: typeof val === 'function' ? (val as any)(state.visibleMessageIds) : val })),
  actionsVisible: false,
  setActionsVisible: (val) => set((state) => ({ actionsVisible: typeof val === 'function' ? (val as any)(state.actionsVisible) : val })),
  shareSheetVisible: false,
  setShareSheetVisible: (val) => set((state) => ({ shareSheetVisible: typeof val === 'function' ? (val as any)(state.shareSheetVisible) : val })),
  galleryComposerVisible: false,
  setGalleryComposerVisible: (val) => set((state) => ({ galleryComposerVisible: typeof val === 'function' ? (val as any)(state.galleryComposerVisible) : val })),
  pollComposerVisible: false,
  setPollComposerVisible: (val) => set((state) => ({ pollComposerVisible: typeof val === 'function' ? (val as any)(state.pollComposerVisible) : val })),
  locationSheetVisible: false,
  setLocationSheetVisible: (val) => set((state) => ({ locationSheetVisible: typeof val === 'function' ? (val as any)(state.locationSheetVisible) : val })),
  moreReactionsVisible: false,
  setMoreReactionsVisible: (val) => set((state) => ({ moreReactionsVisible: typeof val === 'function' ? (val as any)(state.moreReactionsVisible) : val })),
  activeActionMessage: null,
  setActiveActionMessage: (val) => set((state) => ({ activeActionMessage: typeof val === 'function' ? (val as any)(state.activeActionMessage) : val })),
  reactionViewer: null,
  setReactionViewer: (val) => set((state) => ({ reactionViewer: typeof val === 'function' ? (val as any)(state.reactionViewer) : val })),
  reactionUsersById: {},
  setReactionUsersById: (val) => set((state) => ({ reactionUsersById: typeof val === 'function' ? (val as any)(state.reactionUsersById) : val })),
  seenUsersById: {},
  setSeenUsersById: (val) => set((state) => ({ seenUsersById: typeof val === 'function' ? (val as any)(state.seenUsersById) : val })),
  actionMenuAnchor: null,
  setActionMenuAnchor: (val) => set((state) => ({ actionMenuAnchor: typeof val === 'function' ? (val as any)(state.actionMenuAnchor) : val })),
  pinned: null,
  setPinned: (val) => set((state) => ({ pinned: typeof val === 'function' ? (val as any)(state.pinned) : val })),
  pinnedCursor: 0,
  setPinnedCursor: (val) => set((state) => ({ pinnedCursor: typeof val === 'function' ? (val as any)(state.pinnedCursor) : val })),
  hiddenIds: new Set(),
  setHiddenIds: (val) => set((state) => ({ hiddenIds: typeof val === 'function' ? (val as any)(state.hiddenIds) : val })),
  textOverrides: {},
  setTextOverrides: (val) => set((state) => ({ textOverrides: typeof val === 'function' ? (val as any)(state.textOverrides) : val })),
  editingId: null,
  setEditingId: (val) => set((state) => ({ editingId: typeof val === 'function' ? (val as any)(state.editingId) : val })),
  stickerPickerVisible: false,
  setStickerPickerVisible: (val) => set((state) => ({ stickerPickerVisible: typeof val === 'function' ? (val as any)(state.stickerPickerVisible) : val })),
  stickerPickerTab: null,
  setStickerPickerTab: (val) => set((state) => ({ stickerPickerTab: typeof val === 'function' ? (val as any)(state.stickerPickerTab) : val })),
  forwardModalVisible: false,
  setForwardModalVisible: (val) => set((state) => ({ forwardModalVisible: typeof val === 'function' ? (val as any)(state.forwardModalVisible) : val })),
  forwardPayload: null,
  setForwardPayload: (val) => set((state) => ({ forwardPayload: typeof val === 'function' ? (val as any)(state.forwardPayload) : val })),
  editedMeta: {},
  setEditedMeta: (val) => set((state) => ({ editedMeta: typeof val === 'function' ? (val as any)(state.editedMeta) : val })),
  editingReactionIndex: null,
  setEditingReactionIndex: (val) => set((state) => ({ editingReactionIndex: typeof val === 'function' ? (val as any)(state.editingReactionIndex) : val })),
  editingPreview: null,
  setEditingPreview: (val) => set((state) => ({ editingPreview: typeof val === 'function' ? (val as any)(state.editingPreview) : val })),
  chatTheme: null,
  setChatTheme: (val) => set((state) => ({ chatTheme: typeof val === 'function' ? (val as any)(state.chatTheme) : val })),
  seenClockMs: null,
  setSeenClockMs: (val) => set((state) => ({ seenClockMs: typeof val === 'function' ? (val as any)(state.seenClockMs) : val })),
  replyPreviewExpanded: false,
  setReplyPreviewExpanded: (val) => set((state) => ({ replyPreviewExpanded: typeof val === 'function' ? (val as any)(state.replyPreviewExpanded) : val })),
  showScrollToBottom: false,
  setShowScrollToBottom: (val) => set((state) => ({ showScrollToBottom: typeof val === 'function' ? (val as any)(state.showScrollToBottom) : val })),
  hasInitialScrolled: false,
  setHasInitialScrolled: (val) => set((state) => ({ hasInitialScrolled: typeof val === 'function' ? (val as any)(state.hasInitialScrolled) : val })),
}));
