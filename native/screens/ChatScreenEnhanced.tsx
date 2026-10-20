
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, UIManager, Keyboard, InteractionManager, Alert, Linking, Modal, ActivityIndicator, FlatListProps, Animated, useWindowDimensions, PanResponder } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenCapture from 'expo-screen-capture';
import { onSnapshot, doc, updateDoc, serverTimestamp, deleteField, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMessages } from '../hooks/useMessages';
import { useChatPreferences } from '../hooks/useChatPreferences';
import { userService } from '../services/user.service';
import { settingsService } from '../services/settings.service';
import type { PrivacySettings } from '../services/settings.service';
import { messageService } from '../services/message.service';
import { postService } from '../services/post.service';
import type { Message, User } from '../types/database';
import MessageList from '../components/chat/MessageList';
import Composer from '../components/chat/Composer';
import MessageBubble from '../components/chat/MessageBubble';
import { useChatCache } from '../hooks/useChatCache';
import { useChatReactions } from '../hooks/chat/useChatReactions';
import { useChatThemedStyles } from '../hooks/chat/useChatThemedStyles';
import { useChatSeenState } from '../hooks/chat/useChatSeenState';
import { useChatMeta } from '../hooks/chat/useChatMeta';
import PinnedBanner, { PinnedMessageMeta } from '../components/chat/PinnedBanner';
import ShareSheet from '../components/chat/ShareSheet';
import GalleryComposerSheet from '../components/chat/GalleryComposerSheet';
import PollComposer from '../components/chat/PollComposer';
import LocationShareSheet from '../components/chat/LocationShareSheet';
import MessageActionsSheet from '../components/chat/MessageActionsSheet';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import MoreReactionsPicker from '../components/chat/MoreReactionsPicker';
import StickerGifPicker from '../components/chat/StickerGifPicker';
import { MessageForwardModal } from '../components/chat/MessageForwardModal';
import { Avatar } from '../components/ui/Avatar';
import { MentionAutocomplete } from '../components/ui/MentionAutocomplete';
import { DEFAULT_REACTIONS, QUICK_REACTION_KEY, getChatAccent, getChatGradient } from '../constants/chat';
import type { ActionMenuAnchor, ChatMessage, ChatReactionUsersMap } from '../types/chat';
import chatScreenStyles from './chat/chatScreen.styles';
import type { ChatRouteSeedUser, ChatScreenRouteProp, DisplayMessage, DisplayMessageCacheEntry, PickerTab, PinnedState, StickerPick } from './chat/chatScreen.types';
import { buildDisplayMessageSignature, formatDayTimeLabel as formatDayTimeLabelValue, formatMessageTime, formatPresenceTime as formatPresenceTimeValue, formatSeenAge as formatSeenAgeValue, getDayKey as getDayKeyValue, MESSAGE_TIME_GAP_SEPARATOR_MS, stabilizeChatTextForRender, toTimestampMs } from './chat/chatScreen.utils';
import { useChatScreenStore } from "./ChatScreenEnhanced/useChatScreenStore";
import { Image } from 'expo-image';
import { FlashList, FlashListProps } from '@shopify/flash-list';

const normalizeSeededUser = (input?: ChatRouteSeedUser | null): User | null => {
  if (!input?.userId) return null;
  return {
    userId: input.userId,
    username: input.username || input.displayName || 'user',
    displayName: input.displayName,
    avatarURL: input.avatarURL,
    verified: input.verified,
    isOnline: input.isOnline,
    lastSeen: input.lastSeen,
  } as User;
};


const styles = chatScreenStyles;


export default function ChatScreen() {
  const route = useRoute<ChatScreenRouteProp>();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const routeParams = route.params;
  const otherUserId = routeParams?.userId;
  const isGroupConversation = routeParams?.conversationType === 'group';
  const seededConversationId = routeParams?.conversationId || '';
  const seededUser = useMemo(() => normalizeSeededUser(routeParams?.initialUser), [
    routeParams?.initialUser?.userId,
    routeParams?.initialUser?.username,
    routeParams?.initialUser?.displayName,
    routeParams?.initialUser?.avatarURL,
    routeParams?.initialUser?.verified,
    routeParams?.initialUser?.isOnline,
    routeParams?.initialUser?.lastSeen,
  ]);
  const hasSeededUser = !!seededUser?.userId;

  const conversationId = useChatScreenStore(s => s.conversationId);
    const setConversationId = useChatScreenStore(s => s.setConversationId);

  // The chat store is a module-level singleton shared by every conversation.
  // Wipe its per-conversation fields when this screen unmounts so the next
  // chat opened never sees pinned/hidden/edited state from the previous one.
  useEffect(() => {
    return () => {
      useChatScreenStore.getState().resetForConversation();
    };
  }, []);
  const { messages: chatMessages, loading, loadingMore, sendMessage: sendMsg, markAsRead, loadOlderMessages, connectionState: messagesConnectionState, pendingMessageCount } = useMessages(conversationId, {
    initialLimit: 24,
    pageSize: 24,
  });

  const messageText = useChatScreenStore(s => s.messageText);
    const setMessageText = useChatScreenStore(s => s.setMessageText);
  const sending = useChatScreenStore(s => s.sending);
    const setSending = useChatScreenStore(s => s.setSending);
  const otherUser = useChatScreenStore(s => s.otherUser);
    const setOtherUser = useChatScreenStore(s => s.setOtherUser);
  const groupMeta = useChatScreenStore(s => s.groupMeta);
    const setGroupMeta = useChatScreenStore(s => s.setGroupMeta);
  const otherUserPrivacy = useChatScreenStore(s => s.otherUserPrivacy);
    const setOtherUserPrivacy = useChatScreenStore(s => s.setOtherUserPrivacy);
  const conversationNickname = useChatScreenStore(s => s.conversationNickname);
    const setConversationNickname = useChatScreenStore(s => s.setConversationNickname);
  const loadingUser = useChatScreenStore(s => s.loadingUser);
    const setLoadingUser = useChatScreenStore(s => s.setLoadingUser);
  const canMessage = useChatScreenStore(s => s.canMessage);
    const setCanMessage = useChatScreenStore(s => s.setCanMessage);
  const requestMode = useChatScreenStore(s => s.requestMode);
    const setRequestMode = useChatScreenStore(s => s.setRequestMode);
  const removedGroupMeta = useChatScreenStore(s => s.removedGroupMeta);
    const setRemovedGroupMeta = useChatScreenStore(s => s.setRemovedGroupMeta);
  const removedByUser = useChatScreenStore(s => s.removedByUser);
    const setRemovedByUser = useChatScreenStore(s => s.setRemovedByUser);
  const replyingTo = useChatScreenStore(s => s.replyingTo);
    const setReplyingTo = useChatScreenStore(s => s.setReplyingTo);
  const otherUserTyping = useChatScreenStore(s => s.otherUserTyping);
    const setOtherUserTyping = useChatScreenStore(s => s.setOtherUserTyping);
  const favoriteReactions = useChatScreenStore(s => s.favoriteReactions);
    const setFavoriteReactions = useChatScreenStore(s => s.setFavoriteReactions);
  const { quickReactionEmoji, setQuickReactionEmoji, allowSeenHaptics, preferStrongVibration } = useChatPreferences(user?.userId, favoriteReactions);
  const visibleMessageIds = useChatScreenStore(s => s.visibleMessageIds);
    const setVisibleMessageIds = useChatScreenStore(s => s.setVisibleMessageIds);
  const actionsVisible = useChatScreenStore(s => s.actionsVisible);
    const setActionsVisible = useChatScreenStore(s => s.setActionsVisible);
  const shareSheetVisible = useChatScreenStore(s => s.shareSheetVisible);
    const setShareSheetVisible = useChatScreenStore(s => s.setShareSheetVisible);
  const galleryComposerVisible = useChatScreenStore(s => s.galleryComposerVisible);
    const setGalleryComposerVisible = useChatScreenStore(s => s.setGalleryComposerVisible);
  const pollComposerVisible = useChatScreenStore(s => s.pollComposerVisible);
    const setPollComposerVisible = useChatScreenStore(s => s.setPollComposerVisible);
  const locationSheetVisible = useChatScreenStore(s => s.locationSheetVisible);
    const setLocationSheetVisible = useChatScreenStore(s => s.setLocationSheetVisible);
  const moreReactionsVisible = useChatScreenStore(s => s.moreReactionsVisible);
    const setMoreReactionsVisible = useChatScreenStore(s => s.setMoreReactionsVisible);
  const activeActionMessage = useChatScreenStore(s => s.activeActionMessage);
    const setActiveActionMessage = useChatScreenStore(s => s.setActiveActionMessage);
  const reactionViewer = useChatScreenStore(s => s.reactionViewer);
    const setReactionViewer = useChatScreenStore(s => s.setReactionViewer);
  const reactionUsersById = useChatScreenStore(s => s.reactionUsersById);
    const setReactionUsersById = useChatScreenStore(s => s.setReactionUsersById);
  const seenUsersById = useChatScreenStore(s => s.seenUsersById);
    const setSeenUsersById = useChatScreenStore(s => s.setSeenUsersById);
  const actionMenuAnchor = useChatScreenStore(s => s.actionMenuAnchor);
    const setActionMenuAnchor = useChatScreenStore(s => s.setActionMenuAnchor);
  const pinned = useChatScreenStore(s => s.pinned);
    const setPinned = useChatScreenStore(s => s.setPinned);
  const pinnedCursor = useChatScreenStore(s => s.pinnedCursor);
    const setPinnedCursor = useChatScreenStore(s => s.setPinnedCursor);
  const hiddenIds = useChatScreenStore(s => s.hiddenIds);
    const setHiddenIds = useChatScreenStore(s => s.setHiddenIds);
  const textOverrides = useChatScreenStore(s => s.textOverrides);
    const setTextOverrides = useChatScreenStore(s => s.setTextOverrides);
  const editingId = useChatScreenStore(s => s.editingId);
    const setEditingId = useChatScreenStore(s => s.setEditingId);
  const stickerPickerVisible = useChatScreenStore(s => s.stickerPickerVisible);
    const setStickerPickerVisible = useChatScreenStore(s => s.setStickerPickerVisible);
  const stickerPickerTab = useChatScreenStore(s => s.stickerPickerTab);
    const setStickerPickerTab = useChatScreenStore(s => s.setStickerPickerTab);
  const forwardModalVisible = useChatScreenStore(s => s.forwardModalVisible);
    const setForwardModalVisible = useChatScreenStore(s => s.setForwardModalVisible);
  const forwardPayload = useChatScreenStore(s => s.forwardPayload);
    const setForwardPayload = useChatScreenStore(s => s.setForwardPayload);
  const editedMeta = useChatScreenStore(s => s.editedMeta);
    const setEditedMeta = useChatScreenStore(s => s.setEditedMeta);
  const editingReactionIndex = useChatScreenStore(s => s.editingReactionIndex);
    const setEditingReactionIndex = useChatScreenStore(s => s.setEditingReactionIndex);
  const editingPreview = useChatScreenStore(s => s.editingPreview);
    const setEditingPreview = useChatScreenStore(s => s.setEditingPreview);
  const chatTheme = useChatScreenStore(s => s.chatTheme);
    const setChatTheme = useChatScreenStore(s => s.setChatTheme);
  const seenClockMs = useChatScreenStore(s => s.seenClockMs);
    const setSeenClockMs = useChatScreenStore(s => s.setSeenClockMs);

  const replyPreviewExpanded = useChatScreenStore(s => s.replyPreviewExpanded);
    const setReplyPreviewExpanded = useChatScreenStore(s => s.setReplyPreviewExpanded);
  const messageTextRef = useRef('');
  
  const draftTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { cachedMessages } = useChatCache(conversationId, user?.userId);

  const flatListRef = useRef<FlashList<ChatMessage> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingActiveRef = useRef(false);
  const lastTypingPingRef = useRef(0);
  const lastTapRef = useRef<{ messageId: string | null; timestamp: number }>({ messageId: null, timestamp: 0 });
  const isAtBottomRef = useRef(true);

  const forceAutoScrollRef = useRef(false);
  const sendAnchorUntilRef = useRef(0);
  const inputFocusAnchorUntilRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const lastUserScrollTsRef = useRef(0);
  const prevMessageCountRef = useRef(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastContentHeightRef = useRef(0);
  const lastAutoScrollMessageIdRef = useRef<string | null>(null);
  const initialLatestAnchoredRef = useRef(false);
  const lastSeenHapticMessageIdRef = useRef<string | null>(null);
  const lastScreenshotAlertAtRef = useRef(0);
  const timelineSwipeStartRef = useRef(0);
  const timelineGestureFromBubbleRef = useRef(false);
  const timelineSwipeTranslateX = useRef(new Animated.Value(0)).current;
  const showScrollToBottom = useChatScreenStore(s => s.showScrollToBottom);
    const setShowScrollToBottom = useChatScreenStore(s => s.setShowScrollToBottom);
  const showScrollToBottomRef = useRef(false);
  const loadOlderCooldownRef = useRef(0);
  const hasInitialScrolled = useChatScreenStore(s => s.hasInitialScrolled);
    const setHasInitialScrolled = useChatScreenStore(s => s.setHasInitialScrolled);
  const displayMessageCacheRef = useRef<Map<string, DisplayMessageCacheEntry>>(new Map());
  useEffect(() => {
    showScrollToBottomRef.current = showScrollToBottom;
  }, [showScrollToBottom]);
  const handleVisibleMessageIdsChange = useCallback((_next: Set<string>) => {}, []);
  const resumeMessageIdRef = useRef<string | null>(null);
  const resumeRestoredRef = useRef(false);
  const resumeKey = useMemo(() => (conversationId && user?.userId ? `chat_resume:${conversationId}:${user.userId}` : ''), [conversationId, user?.userId]);

  const mentionQuery = useMemo(() => {
    if (!isGroupConversation) return '';
    const match = messageText.match(/(?:^|\s)@([a-zA-Z0-9._]{1,24})$/);
    if (!match?.[1]) return '';
    const token = match[1].toLowerCase();
    return ['everyone', 'admin', 'owner'].includes(token) ? '' : match[1];
  }, [isGroupConversation, messageText]);
  const showMentionAutocomplete = isGroupConversation && mentionQuery.length > 0;

  const isCompactScreen = windowWidth <= 360;
  const isTablet = windowWidth >= 768;
  const contentMaxWidth = isTablet ? Math.min(windowWidth - 24, 860) : windowWidth;
  const messageMaxWidthPx = Math.max(168, Math.floor(contentMaxWidth * (isCompactScreen ? 0.82 : isTablet ? 0.64 : 0.75)));
  const replyBubbleMinWidthPx = Math.min(
    messageMaxWidthPx,
    Math.max(
      isCompactScreen ? 164 : isTablet ? 252 : 192,
      Math.floor(messageMaxWidthPx * (isCompactScreen ? 0.7 : 0.62))
    )
  );
  const pollLocationWidth = isCompactScreen ? '96%' : isTablet ? '74%' : '88%';
  const pollLocationMaxWidth = isTablet ? 620 : isCompactScreen ? 312 : 440;
  const mediaBubbleWidth = isCompactScreen ? 208 : isTablet ? 296 : 248;
    const timelineSwipeMax = useMemo(
    () => Math.max(44, Math.min(64, windowWidth * 0.16)),
    [windowWidth]
  );

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, [conversationId, user?.userId]);

  useEffect(() => {
    setReplyPreviewExpanded(false);
  }, [replyingTo?.messageId]);

  useEffect(() => {
    setHasInitialScrolled(false);
    setShowScrollToBottom(false);
    showScrollToBottomRef.current = false;
    forceAutoScrollRef.current = true;
    sendAnchorUntilRef.current = 0;
    inputFocusAnchorUntilRef.current = 0;
    isUserScrollingRef.current = false;
    lastUserScrollTsRef.current = 0;
    lastMessageIdRef.current = null;
    lastContentHeightRef.current = 0;
    lastAutoScrollMessageIdRef.current = null;
    initialLatestAnchoredRef.current = false;
    isAtBottomRef.current = true;
    timelineSwipeTranslateX.setValue(0);
  }, [conversationId]);

  const handleBubbleTouchStateChange = useCallback((isTouching: boolean) => {
    timelineGestureFromBubbleRef.current = isTouching;
  }, []);

  const finishTimelineSwipe = useCallback(() => {
    Animated.spring(timelineSwipeTranslateX, {
      toValue: 0,
      damping: 20,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [timelineSwipeTranslateX]);

  const timelineSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (timelineGestureFromBubbleRef.current) return false;
          const horizontalIntent = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4;
          if (!horizontalIntent || Math.abs(gestureState.dx) < 7) return false;
          return gestureState.dx < 0;
        },
        onPanResponderGrant: () => {
          timelineSwipeStartRef.current = 0;
          timelineSwipeTranslateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          if (timelineGestureFromBubbleRef.current) return;
          const raw = timelineSwipeStartRef.current + gestureState.dx;
          const next = Math.min(0, Math.max(-timelineSwipeMax, raw));
          timelineSwipeTranslateX.setValue(next);
        },
        onPanResponderRelease: () => {
          finishTimelineSwipe();
          timelineGestureFromBubbleRef.current = false;
        },
        onPanResponderTerminate: () => {
          finishTimelineSwipe();
          timelineGestureFromBubbleRef.current = false;
        },
      }),
    [finishTimelineSwipe, timelineSwipeMax, timelineSwipeTranslateX]
  );

  const timelineTimeOpacity = useMemo(
    () =>
      timelineSwipeTranslateX.interpolate({
        inputRange: [-timelineSwipeMax, -10, 0],
        outputRange: [1, 0.35, 0],
        extrapolate: 'clamp',
      }),
    [timelineSwipeMax, timelineSwipeTranslateX]
  );

  

  useEffect(() => {
    if (!conversationId || !user) return;
    const key = 'draft:chat:' + conversationId + ':' + user.userId;
    AsyncStorage.getItem(key).then((value) => {
      if (typeof value !== 'string') return;
      if (value.trim().length === 0) return;
      setMessageText((prev) => (prev.trim().length === 0 ? value : prev));
    }).catch(() => undefined);
  }, [conversationId, user?.userId]);


  useEffect(() => {
    if (!conversationId || !user) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const key = 'draft:chat:' + conversationId + ':' + user.userId;
    const textValue = messageText;
    draftTimerRef.current = setTimeout(() => {
      if (textValue.trim().length === 0) {
        AsyncStorage.removeItem(key).catch(() => undefined);
      } else {
        AsyncStorage.setItem(key, textValue).catch(() => undefined);
      }
    }, 350);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [messageText, conversationId, user?.userId]);

  useEffect(() => {
    messageTextRef.current = messageText;
  }, [messageText]);


  useEffect(() => {
    const initializeChat = async () => {
      if (!user?.userId) return;

      try {
        if (isGroupConversation) {
          if (seededConversationId) {
            setConversationId((prev) => (prev === seededConversationId ? prev : seededConversationId));
          }
          setCanMessage(true);
          setRequestMode(false);
          setOtherUserTyping(false);
          return;
        }

        if (!otherUserId) return;

        if (!seededConversationId && !hasSeededUser) {
          setLoadingUser(true);
        }

        const userDataPromise = userService.getUser(otherUserId);
        userDataPromise.then((userData) => {
          setOtherUser(userData);
        });

        const [_, privacy, access] = await Promise.all([
          userDataPromise,
          settingsService.getPrivacySettings(otherUserId).catch(() => null),
          messageService.getDirectMessageAccess(user.userId, otherUserId),
        ]);

        setOtherUserPrivacy(privacy);
        setCanMessage(access.allowed);
        setRequestMode(access.requiresRequest);

        if (seededConversationId) {
          setConversationId((prev) => (prev === seededConversationId ? prev : seededConversationId));
          return;
        }

        if (!access.allowed) {
          setConversationId('');
          return;
        }

        const convId = await messageService.getOrCreateDirectConversation(user.userId, otherUserId);
        setConversationId((prev) => (prev === convId ? prev : convId));
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      } finally {
        setLoadingUser(false);
      }
    };

    initializeChat();
  }, [hasSeededUser, isGroupConversation, otherUserId, seededConversationId, user?.userId]);

  useEffect(() => {
    if (!otherUserId) {
      setOtherUserPrivacy(null);
      return;
    }

    let cancelled = false;
    settingsService.getPrivacySettings(otherUserId)
      .then((privacy) => {
        if (!cancelled) {
          setOtherUserPrivacy(privacy);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOtherUserPrivacy(null);
        }
      });

    const privacyRef = doc(db, `users/${otherUserId}/privacySettings/main`);
    const unsubscribe = onSnapshot(
      privacyRef,
      (privacyDoc) => {
        setOtherUserPrivacy((prev) => ({
          ...(prev || {}),
          ...(privacyDoc.exists() ? (privacyDoc.data() as Partial<PrivacySettings>) : {}),
        }));
      },
      () => undefined
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [otherUserId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isGroupConversation) return;
    if (!conversationId || !user?.userId) return;

    const subscription = ScreenCapture.addScreenshotListener(() => {
      const now = Date.now();
      if (now - lastScreenshotAlertAtRef.current < 3000) return;
      lastScreenshotAlertAtRef.current = now;

      const actorLabel = String(user.username || user.displayName || 'Someone').trim() || 'Someone';
      void messageService.sendDirectActivityMessage(
        conversationId,
        user.userId,
        actorLabel + ' took a screenshot'
      ).catch((error) => {
        console.error('Failed to send screenshot alert:', error);
      });
    });

    return () => {
      subscription?.remove?.();
    };
  }, [conversationId, isGroupConversation, user?.displayName, user?.userId, user?.username]);
  useEffect(() => {
    if (!otherUserId) return;

    const userUnsubscribe = onSnapshot(doc(db, 'users', otherUserId), (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        setOtherUser(userData);
      }
    });

    return () => {
      userUnsubscribe();
    };
  }, [otherUserId]);

  useEffect(() => {
    if (!removedGroupMeta?.removedBy) {
      setRemovedByUser(null);
      return;
    }

    let cancelled = false;
    userService.getUser(removedGroupMeta.removedBy)
      .then((profile) => {
        if (!cancelled) {
          setRemovedByUser(profile || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemovedByUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [removedGroupMeta?.removedBy]);

  useEffect(() => {
    if (!conversationId) return;
    if (!otherUserId && !isGroupConversation) return;

    const conversationUnsubscribe = onSnapshot(doc(db, 'conversations', conversationId), (convDoc) => {
      if (!convDoc.exists()) return;

      const convData = convDoc.data();
      if (isGroupConversation) {
        const removedMembers = (((convData as { removedMembers?: Record<string, { removedBy: string; removedAtMs: number }> })?.removedMembers) || {}) as Record<string, { removedBy: string; removedAtMs: number }>;
        setGroupMeta((prev) => ({
          name: convData?.groupName || prev.name || 'Group chat',
          avatarURL: convData?.groupAvatarURL || prev.avatarURL || '',
          description: convData?.groupDescription || prev.description || '',
          participantIds: Array.isArray(convData?.participantIds) ? convData.participantIds.filter((id: string) => !removedMembers[id]) : prev.participantIds,
        }));
        const selfRemoval = user?.userId ? removedMembers[user.userId] || null : null;
        setRemovedGroupMeta(selfRemoval);
        if (selfRemoval) {
          setCanMessage(false);
        }
      } else {
        setRemovedGroupMeta(null);
      }
      const typingData = convData?.typing || {};
      const restrictedBy = Array.isArray(convData?.restrictedBy) ? convData.restrictedBy : [];
      setRequestMode(restrictedBy.includes(otherUserId));
      const otherUserTypingTimestamp = typingData[otherUserId];

      if (otherUserTypingTimestamp) {
        const now = Date.now();
        const typingTime = otherUserTypingTimestamp.toMillis ? otherUserTypingTimestamp.toMillis() : 0;
        setOtherUserTyping(now - typingTime < 3000);
      } else {
        setOtherUserTyping(false);
      }

      const themeKey = convData?.chatThemes?.[user?.userId || ''];
      if (typeof themeKey === 'string') {
        setChatTheme(themeKey);
      }
      const nickValue = convData?.nicknames?.[user?.userId || ''];
      setConversationNickname(typeof nickValue === 'string' ? nickValue : '');
    });

    return () => {
      conversationUnsubscribe();
    };
  }, [conversationId, isGroupConversation, otherUserId, user?.userId]);
  const unreadIncomingSignature = useMemo(() => {
    if (!conversationId || !user || chatMessages.length === 0) return '';
    return chatMessages
      .filter((msg) => msg.senderId !== user.userId && (!msg.readBy || !msg.readBy.includes(user.userId)))
      .map((msg) => msg.messageId)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [chatMessages, conversationId, user]);

  useEffect(() => {
    if (!unreadIncomingSignature) return;
    markAsRead();
  }, [markAsRead, unreadIncomingSignature]);

  const handleMentionSelect = useCallback((selectedUser: Pick<User, 'username'>) => {
    const next = messageText.replace(/@[a-zA-Z0-9._]*$/, '@' + selectedUser.username + ' ');
    messageTextRef.current = next;
    setMessageText(next);
  }, [messageText]);

  const handleTyping = (text: string) => {
    messageTextRef.current = text;
    setMessageText(text);

    if (!conversationId || !user || !otherUserId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const now = Date.now();
    if (text.length > 0) {
      if (!typingActiveRef.current || now - lastTypingPingRef.current > 2200) {
        typingActiveRef.current = true;
        lastTypingPingRef.current = now;
        userService.setTypingStatus(conversationId, user.userId, true).catch(() => undefined);
      }

      typingTimeoutRef.current = setTimeout(() => {
        if (!typingActiveRef.current) return;
        typingActiveRef.current = false;
        userService.setTypingStatus(conversationId, user.userId, false).catch(() => undefined);
      }, 1800);
    } else if (typingActiveRef.current) {
      typingActiveRef.current = false;
      userService.setTypingStatus(conversationId, user.userId, false).catch(() => undefined);
    }
  };

  const applyEdit = (text: string) => {
    if (!editingId) return false;

    setTextOverrides((prev) => ({ ...prev, [editingId]: text }));

    setEditedMeta((prev) => {
      if (prev[editingId]) return prev;
      const source = [...chatMessages, ...cachedMessages].find(
        (m) => m.messageId === editingId
      );
      const original = source?.text ?? '';
      if (!original) return prev;
      return { ...prev, [editingId]: { original } };
    });

    setEditingId(null);
    setEditingPreview(null);
    return true;
  };

  const handleSendMessage = async (inputText?: string) => {
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }
    const primaryText = typeof inputText === 'string' ? inputText : messageText;
    const fallbackText = primaryText.trim().length > 0 ? primaryText : messageTextRef.current;
    const text = stabilizeChatTextForRender(fallbackText || '').trim();
    if (!text) return;
    forceAutoScrollRef.current = true;
    sendAnchorUntilRef.current = Date.now() + 260;
    if (applyEdit(text)) {
      messageTextRef.current = '';
      setMessageText('');
      return;
    }

    const replyPayload = replyingTo?.messageId
      ? {
          messageId: replyingTo.messageId,
          text: replyingTo.text,
          senderId: replyingTo.senderId,
          senderUsername: replyingTo.senderUsername,
        }
      : undefined;

    messageTextRef.current = '';
    setMessageText('');
    setReplyingTo(null);
    forceAutoScrollRef.current = true;
    sendAnchorUntilRef.current = Date.now() + 220;
    inputFocusAnchorUntilRef.current = Date.now() + 220;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      userService.setTypingStatus(conversationId, user.userId, false).catch(() => undefined);
    }

    try {
      await sendMsg(text, undefined, replyPayload);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(text);
      messageTextRef.current = text;
      if (replyPayload) {
        setReplyingTo(replyPayload);
      }
    }
  };

  const sendSelectedMediaAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }

    const validAssets = (assets || []).filter((asset) => typeof asset?.uri === 'string' && asset.uri.trim().length > 0);
    if (validAssets.length === 0) return;

    forceAutoScrollRef.current = true;
    if (validAssets.length === 1) {
      const asset = validAssets[0];
      const isVideo = (asset.type || '').toLowerCase() === 'video' || (asset.duration || 0) > 0;
      const mediaKind = isVideo ? 'video' : 'image';
      await sendMsg('', asset, undefined, { type: mediaKind, mediaType: mediaKind });
    } else {
      const mediaItems = validAssets.map((asset) => ({
        url: String(asset.uri || ''),
        type: (asset.type || '').toLowerCase() === 'video' || (asset.duration || 0) > 0 ? 'video' : 'image',
        thumbnailURL: undefined,
      }));
      await sendMsg('', validAssets, undefined, {
        type: 'media',
        mediaType: mediaItems.some((entry) => entry.type === 'video') ? 'video' : 'image',
        mediaItems,
      });
    }
    sendAnchorUntilRef.current = Date.now() + 220;
    forceAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd?.({ animated: false });
    });
  }, [canMessage, conversationId, loadingUser, sendMsg, user]);

  const handleAttachImage = async () => {
    setShareSheetVisible(false);
    setGalleryComposerVisible(true);
  };

  const handleAttachCamera = async () => {
    setShareSheetVisible(false);
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow camera access to send photos/videos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    try {
      await sendSelectedMediaAssets([asset]);
    } catch (err) {
      Alert.alert('Error', 'Failed to send camera media');
    }
  };
  const handleStickerPick = async (item: StickerPick) => {
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }
    setStickerPickerVisible(false);
    try {
      forceAutoScrollRef.current = true;
      await sendMsg('', undefined, undefined, { type: item.type, mediaURL: item.url, mediaType: item.type });
      anchorToLatest(500);
    } catch {
      Alert.alert('Error', 'Failed to send sticker/gif');
    }
  };

  const openStickerPicker = (tab: PickerTab) => {
    setStickerPickerTab(tab);
    setStickerPickerVisible(true);
  };

  const handleGalleryComposerSend = useCallback(async (assets: ImagePicker.ImagePickerAsset[]) => {
    try {
      await sendSelectedMediaAssets(assets);
      setGalleryComposerVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to send selected media');
    }
  }, [sendSelectedMediaAssets]);
  const openMaps = useCallback(async (lat?: number, lng?: number, label?: string) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const query = encodeURIComponent(label ? `${lat},${lng} ${label}` : `${lat},${lng}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Unable to open maps.');
    }
  }, [conversationId, user?.userId]);

  const handleShareLocation = async (payload: { latitude: number; longitude: number; name?: string; address?: string }) => {
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }
    try {
      forceAutoScrollRef.current = true;
      await sendMsg('', undefined, undefined, {
        type: 'location',
        location: payload,
      });
      setLocationSheetVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to send location');
    }
  };

  const handleCreatePoll = async (payload: { question: string; options: string[] }) => {
    if (!user || !conversationId || loadingUser) return;
    if (!canMessage) {
      Alert.alert('Messaging unavailable', 'This account is not accepting messages from you right now.');
      return;
    }
    const options = payload.options.map((text, idx) => ({
      id: `opt-${Date.now()}-${idx}`,
      text,
      votes: 0,
      voterIds: [],
    }));
    try {
      forceAutoScrollRef.current = true;
      await sendMsg('', undefined, undefined, {
        type: 'poll',
        poll: {
          question: payload.question,
          options,
          totalVotes: 0,
        },
      });
      setPollComposerVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to send poll');
    }
  };

  const handlePollVote = useCallback(async (messageId: string, optionId: string) => {
    if (!user || !conversationId) return;
    try {
      await messageService.voteInPoll(conversationId, messageId, optionId, user.userId);
    } catch {
      Alert.alert('Error', 'Failed to submit vote');
    }
  }, [conversationId, user]);


    const {
    getMergedReactionsForMessage,
    getCurrentUserReaction,
    applyReactionForMessage,
  } = useChatReactions({
    conversationId,
    viewerId: user?.userId,
  });
  const handleBubbleTap = useCallback((item: ChatMessage) => {
    const messageId = String(item?.messageId || '');
    if (!messageId) return;

    const now = Date.now();
    const lastTap = lastTapRef.current;
    const isDoubleTap = lastTap.messageId === messageId && now - lastTap.timestamp < 280;

    if (isDoubleTap) {
      void applyReactionForMessage(item, quickReactionEmoji);
      lastTapRef.current = { messageId: null, timestamp: 0 };
      return;
    }

    lastTapRef.current = { messageId, timestamp: now };
  }, [applyReactionForMessage, quickReactionEmoji]);

  const handleBubbleReply = useCallback((item: ChatMessage) => {
    setReplyingTo(item);
  }, []);

  const updateDefaultReaction = useCallback((emo: string) => {
    setQuickReactionEmoji(emo);
    AsyncStorage.setItem(QUICK_REACTION_KEY, emo).catch(() => undefined);
  }, [setQuickReactionEmoji]);

  const handleBubbleActions = useCallback((item: ChatMessage, anchor?: ActionMenuAnchor) => {
    lastTapRef.current = { messageId: null, timestamp: 0 };
    setActiveActionMessage(item);
    setActionMenuAnchor(anchor || null);
    setActionsVisible(true);
  }, []);
  const handleAcceptCollaborationFromChat = useCallback(async (item: ChatMessage) => {
    if (!user?.userId) return;
    const requestId = item?.collaborationRequestId || item?.collaborationRequest?.requestId;
    const postId =
      item?.collaborationRequest?.postId ||
      item?.postId ||
      item?.sharedContent?.contentId ||
      item?.sharedContent?.id;

    if (!requestId || !postId) {
      Alert.alert('Unable to accept', 'Collaboration request details are missing.');
      return;
    }

    try {
      await postService.acceptCollaboration(postId, requestId, user.userId);
      if (conversationId && item?.messageId) {
        await updateDoc(doc(db, 'conversations', conversationId, 'messages', item.messageId), {
          collaborationStatus: 'accepted',
          collaborationRequest: { ...(item?.collaborationRequest || {}), status: 'accepted' },
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
    } catch (error) {
      console.error('Failed to accept collaboration from chat:', error);
      Alert.alert('Error', 'Failed to accept collaboration request.');
    }
  }, [conversationId, user?.userId]);

  const handleDeclineCollaborationFromChat = useCallback(async (item: ChatMessage) => {
    const requestId = item?.collaborationRequestId || item?.collaborationRequest?.requestId;
    const postId =
      item?.collaborationRequest?.postId ||
      item?.postId ||
      item?.sharedContent?.contentId ||
      item?.sharedContent?.id;

    if (!requestId || !postId) {
      Alert.alert('Unable to decline', 'Collaboration request details are missing.');
      return;
    }

    try {
      await postService.rejectCollaboration(postId, requestId, user?.userId);
      if (conversationId && item?.messageId) {
        await updateDoc(doc(db, 'conversations', conversationId, 'messages', item.messageId), {
          collaborationStatus: 'rejected',
          collaborationRequest: { ...(item?.collaborationRequest || {}), status: 'rejected' },
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
    } catch (error) {
      console.error('Failed to decline collaboration from chat:', error);
      Alert.alert('Error', 'Failed to decline collaboration request.');
    }
  }, [conversationId, user?.userId]);

  const togglePin = useCallback((item: ChatMessage) => {
    setPinned((prev) => {
      const exists = prev.ids.includes(item.messageId);
      return { ids: exists ? prev.ids.filter((id) => id !== item.messageId) : [...prev.ids, item.messageId] };
    });
  }, []);

  const handleAction = useCallback(async (action: string) => {
    const msg = activeActionMessage;
    if (!msg) return;

    if (action === 'reply') {
      handleBubbleReply(msg);
      return;
    }

    if (action === 'pin') {
      togglePin(msg);
      return;
    }

    if (action === 'delete_me') {
      setHiddenIds((prev) => new Set([...Array.from(prev), msg.messageId]));
      return;
    }

    if (action === 'delete_all') {
      if (!conversationId || !user?.userId || msg.senderId !== user.userId) return;
      setTextOverrides((prev) => ({ ...prev, [msg.messageId]: 'This message was unsent' }));
      try {
        await messageService.unsendMessage(conversationId, msg.messageId, user.userId);
      } catch (error) {
        console.error('Failed to unsend message:', error);
        setTextOverrides((prev) => {
          const next = { ...prev };
          delete next[msg.messageId];
          return next;
        });
        Alert.alert('Error', 'Failed to delete message for everyone.');
      }
      return;
    }

    if (action === 'edit') {
      if (!msg.text) return;
      setEditedMeta((prev) =>
        prev[msg.messageId]
          ? prev
          : {
              ...prev,
              [msg.messageId]: { original: msg.text || '' },
            }
      );
      setMessageText(msg.text || '');
      setEditingId(msg.messageId);
      setEditingPreview(msg.text || '');
      return;
    }

    if (action === 'forward') {
      const normalizedType =
        msg.type === 'image' || msg.type === 'video' || msg.type === 'voice'
          ? msg.type
          : msg.type === 'shared_post' || msg.type === 'shared_glimpse' || msg.type === 'shared_story'
          ? msg.type
          : msg.mediaType === 'image' || msg.type === 'gif' || msg.type === 'sticker'
          ? 'image'
          : msg.mediaType === 'video'
          ? 'video'
          : 'text';

      setForwardPayload({
        messageId: msg.messageId,
        type: normalizedType,
        text: msg.text,
        mediaURL: msg.mediaURL,
        sharedContent: msg.sharedContent,
      });
      setForwardModalVisible(true);
    }
  }, [activeActionMessage, conversationId, handleBubbleReply, togglePin, user?.userId]);

  const formatTime = useCallback((timestamp: Message['createdAt']) => formatMessageTime(timestamp), []);
  const getDayKey = useCallback((timestamp: Message['createdAt']) => getDayKeyValue(timestamp), []);
  const formatDayTimeLabel = useCallback((timestamp: Message['createdAt']) => formatDayTimeLabelValue(timestamp), []);
  const formatSeenAge = useCallback((timestamp: Message['readAt']) => formatSeenAgeValue(timestamp, seenClockMs), [seenClockMs]);
  const formatPresenceTime = useCallback((timestamp: User['lastSeen'] | undefined) => formatPresenceTimeValue(timestamp), []);

  useEffect(() => {
    displayMessageCacheRef.current = new Map();
  }, [conversationId]);

  const displayMessages: DisplayMessage[] = useMemo(() => {
    // The cache only backs the list up until fresh messages arrive, so it can
    // legitimately be shorter-lived than `chatMessages`; entries read from it
    // may still carry UI-only fields that the document type does not declare.
    const base: ChatMessage[] =
      chatMessages.length > 0 ? chatMessages : (cachedMessages as ChatMessage[]);
    const prevCache = displayMessageCacheRef.current;
    const nextCache = new Map<string, DisplayMessageCacheEntry>();

    const mapped = base.map((m) => {
      const isDeleted = m.isDeleted === true;
      const override = typeof textOverrides[m.messageId] === 'string' && !isDeleted ? textOverrides[m.messageId] : undefined;
      const pinnedMessage = pinned.ids.includes(m.messageId);
      const cached = prevCache.get(m.messageId);

      if (
        cached &&
        cached.source === m &&
        cached.overrideText === override &&
        cached.pinned === pinnedMessage &&
        cached.isDeleted === isDeleted
      ) {
        nextCache.set(m.messageId, cached);
        return cached.message;
      }

      const signature = buildDisplayMessageSignature(m, override, pinnedMessage, isDeleted);
      if (cached && cached.signature === signature) {
        const reused: DisplayMessageCacheEntry = {
          ...cached,
          source: m,
          overrideText: override,
          pinned: pinnedMessage,
          isDeleted,
        };
        nextCache.set(m.messageId, reused);
        return cached.message;
      }

      const isEdited = !isDeleted && typeof override === 'string' && override !== m.text;
      const baseTextRaw = override ?? (isDeleted ? 'This message was unsent' : m.text);
      const safeText = typeof baseTextRaw === 'string' ? baseTextRaw : String(baseTextRaw ?? '');
      const boundedText = safeText.length > 1500 ? `${safeText.slice(0, 1500)}...` : safeText;
      const message = {
        ...m,
        text: boundedText,
        type: isDeleted ? 'text' : m.type,
        mediaURL: isDeleted ? undefined : m.mediaURL,
        mediaType: isDeleted ? undefined : m.mediaType,
        mediaUrl: isDeleted ? undefined : m.mediaUrl,
        url: isDeleted ? undefined : m.url,
        imageUrl: isDeleted ? undefined : m.imageUrl,
        gif: isDeleted ? undefined : m.gif,
        sticker: isDeleted ? undefined : m.sticker,
        sharedContent: isDeleted ? undefined : m.sharedContent,
        isEdited,
        pinned: pinnedMessage,
      };

      nextCache.set(m.messageId, {
        source: m,
        overrideText: override,
        pinned: pinnedMessage,
        isDeleted,
        signature,
        message,
      });
      return message;
    });

    displayMessageCacheRef.current = nextCache;
    return mapped;
  }, [buildDisplayMessageSignature, chatMessages, cachedMessages, textOverrides, pinned.ids]);
  const finalData = useMemo(
    () => displayMessages.filter((m) => !hiddenIds.has(m.messageId)),
    [displayMessages, hiddenIds]
  );
  const messageById = useMemo(() => new Map(finalData.map((m) => [m.messageId, m])), [finalData]);

  const reactionViewerMessage = useMemo(() => {
    if (!reactionViewer.messageId) return null;
    return messageById.get(reactionViewer.messageId) || null;
  }, [messageById, reactionViewer.messageId]);

  const reactionViewerMap = useMemo(() => {
    if (!reactionViewerMessage) return {} as Record<string, string>;
    return getMergedReactionsForMessage(reactionViewerMessage);
  }, [getMergedReactionsForMessage, reactionViewerMessage]);

  const reactionViewerRows = useMemo(
    () =>
      Object.entries(reactionViewerMap)
        .filter(([uid, emoji]) => !!uid && typeof emoji === 'string' && emoji.trim().length > 0)
        .map(([uid, emoji]) => ({ userId: uid, emoji }))
        .sort((a, b) => a.userId.localeCompare(b.userId)),
    [reactionViewerMap]
  );

  useEffect(() => {
    if (!reactionViewer.visible || reactionViewerRows.length === 0) return;
    const missingIds = reactionViewerRows
      .map((row) => row.userId)
      .filter((id) => id && !reactionUsersById[id]);

    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const selfEntries =
        user?.userId && missingIds.includes(user.userId)
          ? ({ [user.userId]: user as User } as Record<string, User | null>)
          : {};
      const remoteIds = missingIds.filter((id) => id !== user?.userId);
      const fetchedUsers = remoteIds.length > 0 ? await userService.getUsersByIds(remoteIds) : {};

      if (cancelled) return;
      setReactionUsersById((prev) => ({
        ...prev,
        ...fetchedUsers,
        ...selfEntries,
      }));
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [reactionUsersById, reactionViewer.visible, reactionViewerRows, user]);

  useEffect(() => {
    if (finalData.length === 0) return;

    const recent = finalData.slice(-140);
    const missingIdsSet = new Set<string>();

    recent.forEach((msg) => {
      const merged = getMergedReactionsForMessage(msg);
      Object.keys(merged).forEach((uid) => {
        if (!uid || reactionUsersById[uid]) return;
        missingIdsSet.add(uid);
      });
    });

    const missingIds = Array.from(missingIdsSet).slice(0, 30);
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const selfEntries =
        user?.userId && missingIds.includes(user.userId)
          ? ({ [user.userId]: user as User } as Record<string, User | null>)
          : {};
      const remoteIds = missingIds.filter((id) => id !== user?.userId);
      const fetchedUsers = remoteIds.length > 0 ? await userService.getUsersByIds(remoteIds) : {};

      if (cancelled) return;
      setReactionUsersById((prev) => ({
        ...prev,
        ...fetchedUsers,
        ...selfEntries,
      }));
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [finalData, getMergedReactionsForMessage, reactionUsersById, user]);

  const themeAccent = useMemo(() => getChatAccent(chatTheme), [chatTheme]);
  const activeGradient = useMemo<[string, string, ...string[]]>(() => getChatGradient(chatTheme), [chatTheme]);

  const themedStyles = useChatThemedStyles({
    styles,
    themeAccent,
    isCompactScreen,
    messageMaxWidthPx,
    pollLocationWidth,
    pollLocationMaxWidth,
    mediaBubbleWidth,
  });



  const pinnedMeta: PinnedMessageMeta[] = useMemo(() => {
    if (!pinned.ids.length) return [];
    const orderedIds = [...pinned.ids].reverse();
    const byId = new Map(finalData.map((m) => [m.messageId, m]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((m) => ({ messageId: m!.messageId, preview: m!.text || m!.title || "Pinned", createdAt: m!.createdAt }));
  }, [pinned.ids, finalData]);

  useEffect(() => {
    if (pinnedMeta.length === 0) {
      setPinnedCursor(0);
      return;
    }
    setPinnedCursor((prev) => Math.min(prev, pinnedMeta.length - 1));
  }, [pinnedMeta.length]);

  const handleCallComingSoon = useCallback(() => {
    Alert.alert('Coming soon', 'Voice and video calling will be available in an upcoming update.');
  }, []);

  const scrollToLatest = useCallback((animated: boolean = false) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!hasInitialScrolled) return;
    if (resumeMessageIdRef.current && !resumeRestoredRef.current) return;
    timelineSwipeTranslateX.setValue(0);
    requestAnimationFrame(() => {
      scrollToLatest(false);
    });
  }, [hasInitialScrolled, scrollToLatest, timelineSwipeTranslateX]);

  const anchorToLatest = useCallback((durationMs: number = 700) => {
    const until = Date.now() + durationMs;
    forceAutoScrollRef.current = true;
    sendAnchorUntilRef.current = until;
    inputFocusAnchorUntilRef.current = until;
    scrollToLatest(false);
  }, [scrollToLatest]);

  const handleComposerFocus = useCallback(() => {
    inputFocusAnchorUntilRef.current = Date.now() + 700;
    anchorToLatest(420);
  }, [anchorToLatest]);

  useEffect(() => {
    const onKeyboardShow = () => {
      if (!conversationId || finalData.length === 0) return;
      anchorToLatest(520);
    };

    const keyboardShowSub = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
    return () => {
      keyboardShowSub.remove();
    };
  }, [anchorToLatest, conversationId, finalData.length]);

  const { latestSeenReceipt, groupSeenReadersByMessageId } = useChatSeenState({
    finalData,
    userId: user?.userId,
    otherUserId,
    isGroupConversation,
    requestMode,
    formatSeenAge,
  });

  useEffect(() => {
    const readerIds = Array.from(new Set(Object.values(groupSeenReadersByMessageId).flat()));
    if (readerIds.length === 0) return;

    const missingIds = readerIds.filter((id) => id && !seenUsersById[id]).slice(0, 36);
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const selfEntries =
        user?.userId && missingIds.includes(user.userId)
          ? ({ [user.userId]: user as User } as Record<string, User | null>)
          : {};
      const remoteIds = missingIds.filter((id) => id !== user?.userId);
      const fetchedUsers = remoteIds.length > 0 ? await userService.getUsersByIds(remoteIds) : {};

      if (cancelled) return;
      setSeenUsersById((prev) => ({
        ...prev,
        ...fetchedUsers,
        ...selfEntries,
      }));
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [groupSeenReadersByMessageId, seenUsersById, user]);

  const latestMessageId = finalData[finalData.length - 1]?.messageId ?? null;

  useEffect(() => {
    resumeMessageIdRef.current = null;
    resumeRestoredRef.current = false;
    if (!resumeKey) return;
    AsyncStorage.getItem(resumeKey)
      .then((value) => {
        if (!value) return;
        resumeMessageIdRef.current = value;
      })
      .catch(() => undefined);
  }, [resumeKey]);

  useEffect(() => {
    if (!resumeKey || !latestMessageId) return;
    AsyncStorage.setItem(resumeKey, latestMessageId).catch(() => undefined);
  }, [latestMessageId, resumeKey]);

  useEffect(() => {
    if (resumeRestoredRef.current || finalData.length === 0) return;
    const resumeId = resumeMessageIdRef.current;
    if (!resumeId) return;
    const index = finalData.findIndex((msg) => msg.messageId === resumeId);
    const latestIndex = Math.max(0, finalData.length - 1);
    if (index < 0 || latestIndex - index > 0) {
      resumeRestoredRef.current = true;
      resumeMessageIdRef.current = null;
      return;
    }
    resumeRestoredRef.current = true;
    initialLatestAnchoredRef.current = true;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex?.({ index, animated: false, viewPosition: 0.92 });
      setHasInitialScrolled(true);
      setShowScrollToBottom(false);
      forceAutoScrollRef.current = false;
    });
  }, [finalData]);

  useEffect(() => {
    if (!latestMessageId || hasInitialScrolled || initialLatestAnchoredRef.current) return;
    forceAutoScrollRef.current = true;
    sendAnchorUntilRef.current = Date.now() + 260;
    setShowScrollToBottom(false);

    const completeInitialAnchor = () => {
      if (initialLatestAnchoredRef.current) return;
      initialLatestAnchoredRef.current = true;
      setHasInitialScrolled(true);
      setShowScrollToBottom(false);
      lastMessageIdRef.current = latestMessageId;
      lastAutoScrollMessageIdRef.current = latestMessageId;
      forceAutoScrollRef.current = false;
    };

    requestAnimationFrame(() => {
      scrollToLatest(false);
      completeInitialAnchor();
    });

    const timer = setTimeout(() => {
      scrollToLatest(false);
      completeInitialAnchor();
    }, 120);

    return () => clearTimeout(timer);
  }, [hasInitialScrolled, latestMessageId, scrollToLatest]);

  useEffect(() => {
    if (!hasInitialScrolled || !latestMessageId) return;

    const lastChanged = latestMessageId !== lastMessageIdRef.current;
    const withinSendAnchor = Date.now() < sendAnchorUntilRef.current;
    const userRecentlyScrolled =
      isUserScrollingRef.current || Date.now() - lastUserScrollTsRef.current < 500;
    const shouldAutoScroll =
      withinSendAnchor ||
      forceAutoScrollRef.current ||
      (lastChanged && isAtBottomRef.current && !userRecentlyScrolled);

    if (!shouldAutoScroll) {
      if (lastChanged) {
        lastMessageIdRef.current = latestMessageId;
      }
      return;
    }

    scrollToLatest(false);
    setShowScrollToBottom(false);
    lastMessageIdRef.current = latestMessageId;
    lastAutoScrollMessageIdRef.current = latestMessageId;
    forceAutoScrollRef.current = false;
  }, [hasInitialScrolled, latestMessageId, scrollToLatest]);

  const handleContentSizeChange = (_width: number, height: number) => {
    if (resumeMessageIdRef.current && !resumeRestoredRef.current) return;
    if (!finalData.length) return;
    const lastId = finalData[finalData.length - 1]?.messageId ?? null;
    lastContentHeightRef.current = height;

    if (!hasInitialScrolled) {
      return;
    }

    const now = Date.now();
    const withinAnchorWindow = now < sendAnchorUntilRef.current || now < inputFocusAnchorUntilRef.current;
    const messageChanged = lastId !== lastMessageIdRef.current;
    const shouldStickToLatest =
      withinAnchorWindow ||
      forceAutoScrollRef.current ||
      (isAtBottomRef.current && messageChanged);

    if (shouldStickToLatest) {
      scrollToLatest(false);
      setShowScrollToBottom(false);
      lastMessageIdRef.current = lastId;
      lastAutoScrollMessageIdRef.current = lastId;
      forceAutoScrollRef.current = false;
    }
  };


  const scrollToMessage = (id: string) => {
    const idx = finalData.findIndex((m) => m.messageId === id);
    if (idx >= 0) {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  };

  const handlePinnedPress = (id?: string) => {
    if (!pinnedMeta.length) return;
    const target = id ? pinnedMeta.find((p) => p.messageId === id) : pinnedMeta[pinnedCursor];
    if (!target) return;
    scrollToMessage(target.messageId);
    setPinnedCursor((prev) => (prev + 1) % pinnedMeta.length);
  };

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isMe = item.senderId === user?.userId;
    const isLatestMine = isMe && index === finalData.length - 1;
    const reaction = getCurrentUserReaction(item);
    const mergedReactions = getMergedReactionsForMessage(item);
    const isVisible = true;
    const previousMessage = index > 0 ? finalData[index - 1] : null;
    const nextMessage = index < finalData.length - 1 ? finalData[index + 1] : null;
    const currentDayKey = getDayKey(item.createdAt);
    const previousDayKey = previousMessage ? getDayKey(previousMessage.createdAt) : '';
    const nextDayKey = nextMessage ? getDayKey(nextMessage.createdAt) : '';
    const currentMessageMs = toTimestampMs(item.createdAt);
    const previousMessageMs = previousMessage ? toTimestampMs(previousMessage.createdAt) : 0;
    const nextMessageMs = nextMessage ? toTimestampMs(nextMessage.createdAt) : 0;
    const hasTimeGap =
      previousMessageMs > 0 &&
      currentMessageMs > previousMessageMs &&
      currentMessageMs - previousMessageMs >= MESSAGE_TIME_GAP_SEPARATOR_MS;
    const hasGapToNext =
      nextMessageMs > 0 &&
      nextMessageMs > currentMessageMs &&
      nextMessageMs - currentMessageMs >= MESSAGE_TIME_GAP_SEPARATOR_MS;
    const isFirstInGroup =
      !previousMessage ||
      previousMessage.senderId !== item.senderId ||
      previousDayKey !== currentDayKey ||
      hasTimeGap;
    const isLastInGroup =
      !nextMessage ||
      nextMessage.senderId !== item.senderId ||
      nextDayKey !== currentDayKey ||
      hasGapToNext;
    const showDayTimeSeparator = index === 0 || currentDayKey !== previousDayKey || hasTimeGap;
    const dayTimeLabel = formatDayTimeLabel(item.createdAt);

    const normalizedType = item.type === 'media' ? (item.mediaType || 'image') : item.type;
    const itemWithTypeFallback: ChatMessage = { ...item, type: normalizedType || item.mediaType || 'text' };
    if (itemWithTypeFallback.collaborationRequest) {
      const collabMeta = itemWithTypeFallback.collaborationRequest;
      itemWithTypeFallback.collaborationRequestId = itemWithTypeFallback.collaborationRequestId || collabMeta?.requestId;
      const normalizedCollabStatus =
        itemWithTypeFallback.collaborationStatus ||
        collabMeta?.status ||
        (itemWithTypeFallback.status === 'accepted' || itemWithTypeFallback.status === 'rejected'
          ? itemWithTypeFallback.status
          : 'pending');
      itemWithTypeFallback.collaborationStatus = normalizedCollabStatus;
      const requestTargetUserId = collabMeta?.toUserId;
      const canFallbackRespond =
        !requestTargetUserId &&
        itemWithTypeFallback.senderId !== user?.userId &&
        Boolean(itemWithTypeFallback.collaborationRequestId);
      itemWithTypeFallback.canRespondToCollab =
        normalizedCollabStatus === 'pending' &&
        (requestTargetUserId === user?.userId || canFallbackRespond);
    }
    if (itemWithTypeFallback.type === 'poll' && itemWithTypeFallback.poll) {
      const poll = itemWithTypeFallback.poll;
      itemWithTypeFallback.question = poll.question;
      itemWithTypeFallback.options = poll.options;
      itemWithTypeFallback.totalVotes = poll.totalVotes;
      const selected = Array.isArray(poll.options) ? poll.options.find((opt) => Array.isArray(opt.voterIds) && opt.voterIds.includes(user?.userId || '')) : null;
      itemWithTypeFallback.selectedPollOptionId = selected?.id || null;
      itemWithTypeFallback.canVote = !selected;
      itemWithTypeFallback.onVote = (optionId: string) => handlePollVote(item.messageId, optionId);
    }
    const replySource = item.replyTo?.messageId ? messageById.get(item.replyTo.messageId) : null;

    if (itemWithTypeFallback.type === 'location' && itemWithTypeFallback.location) {
      const loc = itemWithTypeFallback.location;
      itemWithTypeFallback.title = loc.name || loc.address || 'Shared location';
      itemWithTypeFallback.lat = loc.latitude;
      itemWithTypeFallback.lng = loc.longitude;
      itemWithTypeFallback.onOpen = () => openMaps(loc.latitude, loc.longitude, loc.name || loc.address);
    }

    const seenReaderIds = isMe && isGroupConversation ? (groupSeenReadersByMessageId[item.messageId] || []) : [];
    const seenReaders = seenReaderIds.slice(0, 3).map((uid: string) => {
      const profile = seenUsersById[uid];
      return {
        userId: uid,
        avatarURL: profile?.avatarURL || null,
        fallbackText: profile?.displayName || profile?.username || uid,
      };
    });

    return (
      <View>
        {showDayTimeSeparator && !!dayTimeLabel ? (
          <View style={themedStyles.dayTimeSeparatorWrap}>
            <Text style={themedStyles.dayTimeSeparatorText}>{dayTimeLabel}</Text>
          </View>
        ) : null}
        <MessageBubble
          item={itemWithTypeFallback}
          replySource={replySource}
          isMe={isMe}
          isLatestMine={isLatestMine}
          latestSeenMineMessageId={latestSeenReceipt.messageId}
          seenLabel={latestSeenReceipt.label}
          seenReaders={seenReaders}
          isVisible={isVisible}
          reaction={reaction}
          reactions={mergedReactions}
          reactionUsersById={reactionUsersById}
          isGroupConversation={isGroupConversation}
          otherUserAvatar={isGroupConversation ? item.senderAvatarURL : otherUser?.avatarURL}
          otherUserId={isGroupConversation ? item.senderId : otherUserId}
          showSenderAvatar={!isMe}
          senderLabel={isGroupConversation && !isMe && isFirstInGroup ? item.senderUsername : undefined}
          onSenderPress={(msg) => {
            const senderId = msg?.senderId;
            if (!senderId) return;
            if (senderId === user?.userId) {
              (navigation as any).navigate('Main', { screen: 'Profile' });
              return;
            }
            (navigation as any).navigate('UserProfile', { userId: senderId });
          }}
          formatTime={formatTime}
          canShowReadReceipts={!requestMode && otherUserPrivacy?.showReadReceipts !== false}
          onBubbleTap={handleBubbleTap}
          onReactionPress={(msg) => setReactionViewer({ visible: true, messageId: msg?.messageId || null })}
          onReply={handleBubbleReply}
          onPinToggle={togglePin}
          onLongPressAction={handleBubbleActions}
          onQuickForward={(msg) => {
            const normType =
              msg.type === 'image' || msg.type === 'video' || msg.type === 'voice'
                ? msg.type
                : msg.type === 'shared_post' || msg.type === 'shared_glimpse' || msg.type === 'shared_story'
                ? msg.type
                : msg.mediaType === 'image' || msg.type === 'gif' || msg.type === 'sticker'
                ? 'image'
                : msg.mediaType === 'video'
                ? 'video'
                : 'text';

            setForwardPayload({
              messageId: msg.messageId,
              type: normType,
              text: msg.text,
              mediaURL: msg.mediaURL,
              sharedContent: msg.sharedContent,
            });
            setForwardModalVisible(true);
          }}
          onCollaborationAccept={handleAcceptCollaborationFromChat}
          onCollaborationDecline={handleDeclineCollaborationFromChat}
          onEditedPress={(msg) => {
            const meta = editedMeta[msg.messageId];
            if (!meta) return;
            Alert.alert('Edited message', `Before:\n${meta.original}\n\nNow:\n${msg.text || ''}`);
          }}
          isEdited={Boolean(itemWithTypeFallback.isEdited)}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          showTimelineTime
          timelineSwipeTranslateX={timelineSwipeTranslateX}
          timelineTimeOpacity={timelineTimeOpacity}
          enableReplySwipe
          onBubbleTouchStateChange={handleBubbleTouchStateChange}
          simultaneousScrollRef={flatListRef}
          accentColor={themeAccent}
          stylesRef={themedStyles}
          enableEntryAnimation={item.messageId === latestMessageId && finalData.length <= 80}
        />
      </View>
    );
  }, [user?.userId, finalData, getDayKey, formatDayTimeLabel, toTimestampMs, messageById, getCurrentUserReaction, getMergedReactionsForMessage, handlePollVote, openMaps, isGroupConversation, otherUser?.avatarURL, otherUserId, formatTime, handleBubbleTap, handleBubbleReply, togglePin, handleBubbleActions, handleAcceptCollaborationFromChat, handleDeclineCollaborationFromChat, editedMeta, timelineSwipeTranslateX, timelineTimeOpacity, handleBubbleTouchStateChange, groupSeenReadersByMessageId, seenUsersById, reactionUsersById, themeAccent, themedStyles]);
  const handleListScroll = useCallback<NonNullable<FlashListProps<ChatMessage>['onScroll']>>((event) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

    if (!hasInitialScrolled) {
      isAtBottomRef.current = true;
      return;
    }

    const paddingToBottom = 24;
    const isAtBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
    isAtBottomRef.current = isAtBottom;

    if (!isAtBottom) {
      lastUserScrollTsRef.current = Date.now();
    }

    const nextShowScrollButton = !isAtBottom;
    if (showScrollToBottomRef.current !== nextShowScrollButton) {
      showScrollToBottomRef.current = nextShowScrollButton;
      setShowScrollToBottom(nextShowScrollButton);
    }

    const topThreshold = 40;
    const isScrollable = contentSize.height > layoutMeasurement.height + 20;
    if (isScrollable && contentOffset.y <= topThreshold) {
      const now = Date.now();
      if (now - loadOlderCooldownRef.current > 420) {
        loadOlderCooldownRef.current = now;
        loadOlderMessages();
      }
    }
  }, [hasInitialScrolled, loadOlderMessages]);

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
    forceAutoScrollRef.current = false;
    lastUserScrollTsRef.current = Date.now();
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    isUserScrollingRef.current = false;
    lastUserScrollTsRef.current = Date.now();
  }, []);

  const handleMomentumScrollBegin = useCallback(() => {
    isUserScrollingRef.current = true;
    forceAutoScrollRef.current = false;
    lastUserScrollTsRef.current = Date.now();
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    isUserScrollingRef.current = false;
    lastUserScrollTsRef.current = Date.now();
  }, []);

  const handleMorePress = () => {
    setShareSheetVisible(true);
  };

  const {
    replyBarMeta,
    headerPrimaryName,
    headerUsername,
    canShowActivityStatus,
    canShowLastSeen,
    showActiveNow,
    groupDescription,
    groupStatusLine,
    headerStatus,
  } = useChatMeta({
    replyingTo,
    userId: user?.userId,
    otherUser,
    isGroupConversation,
    groupMeta,
    routeGroupName: routeParams?.groupName,
    conversationNickname,
    requestMode,
    otherUserTyping,
    otherUserPrivacy,
  });
  const activityStatusLabel = !isGroupConversation && canShowActivityStatus && !otherUserTyping && !showActiveNow && canShowLastSeen && otherUser?.lastSeen
    ? formatPresenceTime(otherUser.lastSeen)
    : '';
  const resolvedHeaderStatus = isGroupConversation ? headerStatus : otherUserTyping ? 'typing...' : showActiveNow ? 'Active now' : activityStatusLabel;
  const headerSubline = isGroupConversation ? resolvedHeaderStatus : (headerUsername ? (resolvedHeaderStatus ? headerUsername + ' - ' + resolvedHeaderStatus : headerUsername) : resolvedHeaderStatus);
  const headerSublineText = typeof headerSubline === 'string' ? headerSubline : '';
  const replyBarText = replyBarMeta?.text || '';
  const replyBarMax = 120;
  const replyBarIsLong = !!replyBarMeta?.isText && replyBarText.length > replyBarMax;
  const replyBarDisplay = replyBarIsLong && !replyPreviewExpanded ? `${replyBarText.slice(0, replyBarMax).trimEnd()}...` : replyBarText;
  const isRemovedFromGroup = isGroupConversation && !!removedGroupMeta;
  const removedByDisplayName = removedByUser?.displayName || removedByUser?.username || removedGroupMeta?.removedBy || 'a group admin';
  const shouldBlockInitialRender = (loadingUser || loading) && finalData.length === 0;
  const showConnectingBanner = messagesConnectionState !== 'connected';
  const connectingBannerText = pendingMessageCount > 0 ? 'Connecting... ' + pendingMessageCount + ' pending' : 'Connecting...';
  
  if (shouldBlockInitialRender) {
    return (
      <ScreenSkeleton variant="chat" rows={6} />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <LinearGradient
        colors={activeGradient}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.backdropLayer}>
        <View style={[styles.ambientOrb, styles.ambientOrbPrimary, { backgroundColor: `${themeAccent}2f` }]} />
        <View style={[styles.ambientOrb, styles.ambientOrbSecondary]} />
        <LinearGradient colors={['rgba(2, 6, 23, 0.12)', 'rgba(2, 6, 23, 0.78)']} style={styles.ambientFadeTop} />
        <LinearGradient colors={['rgba(2, 6, 23, 0)', 'rgba(2, 6, 23, 0.84)']} style={styles.ambientFadeBottom} />
      </View>
      
      {/* Header */}
      <BlurView intensity={76} tint="dark" style={themedStyles.headerBlur}>
        <View style={[styles.header, { maxWidth: contentMaxWidth, paddingVertical: isCompactScreen ? 8 : 10, paddingHorizontal: isCompactScreen ? 10 : 14 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#f8fafc" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerUser}
            onPress={() => (navigation as any).navigate(isGroupConversation ? 'GroupInfo' : 'ChatProfile', isGroupConversation ? { conversationId } : { userId: otherUserId, conversationId })}
          >
            <Avatar
              source={isGroupConversation ? groupMeta.avatarURL : otherUser?.avatarURL}
              size={isCompactScreen ? 40 : 44}
              fallbackText={headerPrimaryName || otherUser?.username || '?'}
              style={styles.headerAvatar}
            />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName}>{headerPrimaryName}</Text>
                {!isGroupConversation && otherUser?.verified ? <VerifiedBadge size={16} /> : null}
              </View>
              {headerSublineText ? <Text style={styles.headerSub}>{headerSublineText}</Text> : null}
            </View>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={themedStyles.headerButton} onPress={handleCallComingSoon}>
              <Ionicons name="call-outline" size={22} color={themeAccent} />
            </TouchableOpacity>
            <TouchableOpacity style={themedStyles.headerButton} onPress={handleCallComingSoon}>
              <Ionicons name="videocam-outline" size={24} color={themeAccent} />
            </TouchableOpacity>

          </View>
        </View>
      </BlurView>


      {showConnectingBanner ? (
        <View style={[styles.contentFrame, { maxWidth: contentMaxWidth }]}>
          <View style={styles.connectingBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color="#fbbf24" />
            <Text style={styles.connectingBannerText}>{connectingBannerText}</Text>
          </View>
        </View>
      ) : null}
      {pinnedMeta.length > 0 && (
        <View style={[styles.contentFrame, styles.pinnedBannerFrame, { maxWidth: contentMaxWidth }]}>
          <PinnedBanner pinned={pinnedMeta} activeIndex={pinnedCursor} onPress={handlePinnedPress} stylesRef={themedStyles} />
        </View>
      )}

      {loading && finalData.length === 0 ? (
        <ScreenSkeleton variant="chat" rows={6} />
      ) : (
        <View
          style={styles.messageListStage}
          pointerEvents="auto"
          {...timelineSwipeResponder.panHandlers}
        >
          <View style={[styles.contentFrame, { maxWidth: contentMaxWidth }]}>
            <MessageList
              data={finalData}
              renderBubble={renderMessage}
              flatListRef={flatListRef}
              ListHeaderComponent={
                loadingMore ? (
                  <View style={styles.olderMessagesLoader}>
                    <ActivityIndicator size="small" color="#93c5fd" />
                    <Text style={styles.olderMessagesLoaderText}>Loading older messages...</Text>
                  </View>
                ) : null
              }
              maintainVisibleContentPosition={Platform.OS === 'ios' ? { minIndexForVisible: 1, autoscrollToTopThreshold: 24 } : undefined}
              onScroll={handleListScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollBegin={handleMomentumScrollBegin}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              onContentSizeChange={handleContentSizeChange}
            />
          </View>
        </View>
      )}

      {replyingTo && replyBarMeta && (
        <View style={[themedStyles.replyContainer, styles.contentFrame, { maxWidth: contentMaxWidth }]}>
          <View style={styles.replyContent}>
            <Text style={themedStyles.replyLabel}>Reply to {replyBarMeta.username}</Text>
            {!replyBarMeta.isText && (
              <Text style={themedStyles.replyBarType}>{replyBarMeta.label}</Text>
            )}
            {replyBarMeta.isText && (
              <Text style={themedStyles.replyText}>
                {replyBarDisplay}
              </Text>
            )}
            {replyBarMeta.isText && replyBarIsLong ? (
              <TouchableOpacity onPress={() => setReplyPreviewExpanded(!replyPreviewExpanded)}>
                <Text style={themedStyles.replyBarMore}>{replyPreviewExpanded ? 'Less' : 'More'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      <MoreReactionsPicker
        visible={moreReactionsVisible}
        quickReactions={favoriteReactions}
        activeReaction={activeActionMessage ? (getCurrentUserReaction(activeActionMessage) || quickReactionEmoji) : quickReactionEmoji}
        defaultReaction={quickReactionEmoji}
        selectedQuickIndex={editingReactionIndex}
        onSelectedQuickIndexChange={setEditingReactionIndex}
        onDefaultReactionChange={updateDefaultReaction}
        onQuickReactionReplace={(index, emo) => {
          setFavoriteReactions((prev) => {
            const next = [...prev];
            const previous = next[index];
            next[index] = emo;
            if (previous === quickReactionEmoji) {
              updateDefaultReaction(emo);
            }
            return next;
          });
        }}
        onSelect={(emo) => {
          if (activeActionMessage) {
            void applyReactionForMessage(activeActionMessage, emo);
          }
        }}
        onClose={() => {
          setMoreReactionsVisible(false);
          setEditingReactionIndex(null);
        }}
        stylesRef={themedStyles}
      />

      <GalleryComposerSheet
        visible={galleryComposerVisible}
        accentColor={themeAccent}
        onClose={() => setGalleryComposerVisible(false)}
        onSend={handleGalleryComposerSend}
      />
      <LocationShareSheet
        visible={locationSheetVisible}
        onClose={() => setLocationSheetVisible(false)}
        onShare={handleShareLocation}
      />
      <PollComposer
        visible={pollComposerVisible}
        onClose={() => setPollComposerVisible(false)}
        onSubmit={handleCreatePoll}
      />
      <ShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        onGallery={handleAttachImage}
        onCamera={handleAttachCamera}
        onLocation={() => { setShareSheetVisible(false); setLocationSheetVisible(true); }}
        onPoll={() => { setShareSheetVisible(false); setPollComposerVisible(true); }}
        onGif={() => openStickerPicker('gif')}
        onSticker={() => openStickerPicker('sticker')}
        stylesRef={themedStyles}
      />

      <Modal
        visible={reactionViewer.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionViewer({ visible: false, messageId: null })}
      >
        <View style={styles.reactionsListBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setReactionViewer({ visible: false, messageId: null })}
          />
          <View style={styles.reactionsListModal}>
            <View style={styles.reactionsListHeader}>
              <Text style={styles.reactionsListTitle}>Reactions</Text>
              <TouchableOpacity onPress={() => setReactionViewer({ visible: false, messageId: null })}>
                <Ionicons name="close" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
            {reactionViewerRows.length === 0 ? (
              <Text style={styles.reactionsListEmpty}>No reactions yet</Text>
            ) : (
              <FlashList estimatedItemSize={100}
                data={reactionViewerRows}
                keyExtractor={(row: { userId: string }, index: number) => row.userId + '-' + String(index)}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.reactionsListContent as any}
                renderItem={({ item: row }: any) => {
                  const profile = reactionUsersById[row.userId];
                  const displayName = profile?.displayName || profile?.username || row.userId;
                  const handle = profile?.username ? '@' + profile.username : row.userId;
                  return (
                    <View style={styles.reactionUserRow}>
                      <Avatar source={profile?.avatarURL} size={36} fallbackText={displayName} />
                      <View style={styles.reactionUserMeta}>
                        <Text style={styles.reactionUserName} numberOfLines={1}>{displayName}</Text>
                        <Text style={styles.reactionUserHandle} numberOfLines={1}>{handle}</Text>
                      </View>
                      <Text style={styles.reactionUserEmoji}>{row.emoji}</Text>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
      <MessageActionsSheet
        visible={actionsVisible}
        onClose={() => {
          setActionsVisible(false);
          setActionMenuAnchor(null);
          setEditingReactionIndex(null);
        }}
        onAction={handleAction}
        reactions={favoriteReactions}
        activeReaction={activeActionMessage ? (getCurrentUserReaction(activeActionMessage) || quickReactionEmoji) : quickReactionEmoji}
        defaultReaction={quickReactionEmoji}
        onReactionPress={(emo) => {
          if (!activeActionMessage) return;
          void applyReactionForMessage(activeActionMessage, emo);
        }}
        onDefaultReactionChange={updateDefaultReaction}
        onMoreReactions={() => {
          const defaultIndex = Math.max(0, favoriteReactions.indexOf(quickReactionEmoji));
          setEditingReactionIndex(defaultIndex);
          setMoreReactionsVisible(true);
        }}
        canEdit={
          !!activeActionMessage &&
          activeActionMessage.senderId === user?.userId &&
          activeActionMessage.isDeleted !== true &&
          (activeActionMessage.type === 'text' || (!activeActionMessage.type && !activeActionMessage.mediaType))
        }
        canDeleteForEveryone={!!activeActionMessage && activeActionMessage.senderId === user?.userId && activeActionMessage.isDeleted !== true}
        anchor={actionMenuAnchor}
        stylesRef={themedStyles}
      />

      <Modal visible={stickerPickerVisible} animationType="slide" onRequestClose={() => setStickerPickerVisible(false)}>
        <StickerGifPicker
          initialTab={stickerPickerTab}
          onSelect={handleStickerPick}
          onClose={() => setStickerPickerVisible(false)}
        />
      </Modal>

      {forwardPayload && (
        <MessageForwardModal
          isVisible={forwardModalVisible}
          onClose={() => setForwardModalVisible(false)}
          messageId={forwardPayload.messageId}
          messageContent={{
            text: forwardPayload.text,
            type: forwardPayload.type,
            mediaURL: forwardPayload.mediaURL,
            sharedContent: forwardPayload.sharedContent,
          }}
        />
      )}

      {editingId && (
        <View style={[themedStyles.editingBanner, styles.contentFrame, { maxWidth: contentMaxWidth }]}>
          <View style={styles.editingBannerText}>
            <Text style={themedStyles.editingBannerLabel}>Editing</Text>
            <Text style={themedStyles.editingBannerPreview} numberOfLines={1}>
              {editingPreview ||
                (editingId && (textOverrides[editingId] ?? editedMeta[editingId]?.original)) ||
                ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditingId(null);
              setEditingPreview(null);
            }}
          >
            <Ionicons name="close" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      {otherUserTyping && (
        <BlurView intensity={36} tint="dark" style={themedStyles.typingIndicatorContainer}>
          <View style={styles.typingIndicatorRow}>
            <Avatar
              source={otherUser?.avatarURL}
              size={24}
              fallbackText={otherUser?.displayName || otherUser?.username || '?'}
              style={styles.typingIndicatorAvatar}
            />
            <View style={styles.typingIndicatorMeta}>
              <Text style={styles.typingIndicatorName}>{otherUser?.displayName || otherUser?.username}</Text>
              <View style={styles.typingIndicatorDotsRow}>
                <View style={[styles.typingIndicatorDot, styles.typingIndicatorDotPrimary]} />
                <View style={styles.typingIndicatorDot} />
                <View style={styles.typingIndicatorDot} />
                <Text style={themedStyles.typingIndicatorText}>typing</Text>
              </View>
            </View>
          </View>
        </BlurView>
      )}
      {showMentionAutocomplete ? <View style={[styles.mentionAutocompleteWrap, { maxWidth: contentMaxWidth }]}><MentionAutocomplete query={mentionQuery} visible={showMentionAutocomplete} onSelect={handleMentionSelect} maxResults={6} /></View> : null}
      {isRemovedFromGroup ? (
        <BlurView intensity={24} tint="dark" style={[styles.groupRemovalBanner, styles.contentFrame, { maxWidth: contentMaxWidth }]}> 
          <View style={styles.groupRemovalMeta}>
            <Text style={styles.groupRemovalLabel}>Read only</Text>
            <Text style={styles.groupRemovalText}>You have been removed from this group by</Text>
            <TouchableOpacity onPress={() => removedByUser?.userId ? (navigation as any).navigate('UserProfile', { userId: removedByUser.userId }) : undefined}>
              <View style={styles.groupRemovalActorRow}>
                <Text style={styles.groupRemovalActor}>{removedByDisplayName}</Text>
                {removedByUser?.verified ? <VerifiedBadge size={14} /> : null}
              </View>
            </TouchableOpacity>
          </View>
        </BlurView>
      ) : null}
      {!isRemovedFromGroup ? (
        <BlurView intensity={20} tint="dark" style={themedStyles.composerBlur}>
        <View style={[styles.contentFrame, { maxWidth: contentMaxWidth }]}>
          <Composer
            messageText={messageText}
            canMessage={canMessage}
            sending={sending}
            onChange={handleTyping}
            onSend={handleSendMessage}
            onMore={handleMorePress}
            onCamera={handleAttachCamera}
            onSticker={() => openStickerPicker('sticker')}
            onFocus={handleComposerFocus}
            stylesRef={themedStyles}
            accentColor={themeAccent}
          />
        </View>
      </BlurView>
      ) : null}
      {showScrollToBottom && (
        <TouchableOpacity
          style={themedStyles.scrollToBottomButton}
          activeOpacity={0.8}
          onPress={() => scrollToLatest(true)}
        >
          <Ionicons name="chevron-down" size={20} color="#e2e8f0" />
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}













