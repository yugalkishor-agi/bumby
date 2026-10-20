import { useCallback, useEffect, useRef } from 'react';
import { Alert, Keyboard, Platform, Animated, BackHandler } from 'react-native';
import { storyService } from '../../../services/story.service';
import { messageService } from '../../../services/message.service';
import { useStoryViewerStore } from '../useStoryViewerStore';

export function useStoryViewerInteractions(
  currentUser: any,
  currentStoryData: any,
  isOwnStory: boolean,
  canReply: boolean,
  canShare: boolean,
  storyUser: any,
  userId: string,
  navigation: any
) {
  const isLiked = useStoryViewerStore(s => s.isLiked);
  const setIsLiked = useStoryViewerStore(s => s.setIsLiked);
  const replyText = useStoryViewerStore(s => s.replyText);
  const setReplyText = useStoryViewerStore(s => s.setReplyText);
  const setIsTyping = useStoryViewerStore(s => s.setIsTyping);
  const setIsPaused = useStoryViewerStore(s => s.setIsPaused);
  const setSentToastText = useStoryViewerStore(s => s.setSentToastText);
  const setStories = useStoryViewerStore(s => s.setStories);
  const currentStory = useStoryViewerStore(s => s.currentStory);
  const setShowDeleteDialog = useStoryViewerStore(s => s.setShowDeleteDialog);
  
  const likePendingRef = useRef(false);
  const markViewInFlightRef = useRef<string | null>(null);
  const viewedStoryIdsRef = useRef<Set<string>>(new Set());

  const likeBurstOpacity = useRef(new Animated.Value(0)).current;
  const likeBurstScale = useRef(new Animated.Value(0.5)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const animateLikeFeedback = useCallback((liked: boolean) => {
    if (!liked) return;
    likeBurstOpacity.setValue(1);
    likeBurstScale.setValue(0.5);
    Animated.parallel([
      Animated.timing(likeBurstScale, { toValue: 1.2, duration: 250, useNativeDriver: true }),
      Animated.timing(likeBurstOpacity, { toValue: 0, duration: 400, delay: 150, useNativeDriver: true }),
    ]).start();
  }, [likeBurstOpacity, likeBurstScale]);

  const showSentToast = useCallback((text: string) => {
    setSentToastText(text);
    toastOpacity.setValue(1);
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 300,
      delay: 2000,
      useNativeDriver: true,
    }).start(() => setSentToastText(''));
  }, [setSentToastText, toastOpacity]);

  const notifyStoryLike = useCallback(async () => {
    if (!currentUser || !currentStoryData) return;
    const ownerId = currentStoryData.authorId;
    if (!ownerId || ownerId === currentUser.userId) return;

    try {
      const { notificationService } = await import('../../../services/notification.service');
      await notificationService.notifyStoryLike(
        ownerId,
        currentUser.userId,
        currentUser.username || 'user',
        currentUser.avatarURL || '',
        !!(currentUser as any).verified,
        currentStoryData.storyId,
        currentStoryData.thumbnailURL || currentStoryData.mediaURL
      );
    } catch (error) {
      console.warn('Story like notification failed:', error);
    }
  }, [currentUser, currentStoryData]);

  const buildStoryReplyMeta = useCallback(() => {
    if (!currentStoryData) return {};
    return {
      storyId: currentStoryData.storyId,
      mediaURL: currentStoryData.mediaURL,
      coverImage: currentStoryData.thumbnailURL || currentStoryData.mediaURL,
      thumbnailURL: currentStoryData.thumbnailURL || currentStoryData.mediaURL,
      mediaType: currentStoryData.mediaType === 'video' ? ('video' as const) : ('image' as const),
      authorId: currentStoryData.authorId,
      authorUsername: storyUser?.username || currentStoryData.authorUsername || 'User',
      authorAvatar: storyUser?.avatarURL || currentStoryData.authorAvatarURL,
      authorVerified: storyUser?.verified || !!currentStoryData.authorVerified,
    };
  }, [currentStoryData, storyUser]);

  const sendQuickReaction = async (emoji: string) => {
    if (isOwnStory || !canReply || !currentUser || !currentStoryData) return;
    try {
      const targetId = userId || currentStoryData?.authorId;
      if (!targetId) return;
      const conversationId = await messageService.getOrCreateDirectConversation(
        currentUser.userId,
        targetId
      );
      await messageService.sendMessage(conversationId, {
        senderId: currentUser.userId,
        senderUsername: currentUser.username,
        senderAvatarURL: currentUser.avatarURL || '',
        text: emoji,
        type: 'story_reply',
        // @ts-ignore
storyReply: buildStoryReplyMeta(),
      });
      setIsTyping(false);
      setIsPaused(false);
      Keyboard.dismiss();
      showSentToast('Reaction sent');
    } catch (e) {
      console.error('Failed to send reaction', e);
    }
  };

  const handleDoubleTap = async () => {
    if (isOwnStory || !currentUser || !currentStoryData || likePendingRef.current) return;
    if (isLiked) {
      animateLikeFeedback(true);
      return;
    }

    likePendingRef.current = true;
    setIsLiked(true);
    animateLikeFeedback(true);

    try {
      await storyService.likeStory(currentStoryData.storyId, currentUser.userId);
      await notifyStoryLike();
      try {
        if (Platform.OS !== 'web') {
          const Haptics = await import('expo-haptics');
          await Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Medium);
        }
      } catch { }
    } catch (error) {
      setIsLiked(false);
      console.error('Failed to like story on double tap:', error);
    } finally {
      likePendingRef.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    const syncLikeState = async () => {
      if (isOwnStory || !currentUser || !currentStoryData) {
        setIsLiked(false);
        return;
      }
      if (typeof (currentStoryData as any).isLiked === 'boolean') {
        setIsLiked(!!(currentStoryData as any).isLiked);
        return;
      }
      try {
        const liked = await storyService.getUserLikedStories(currentUser.userId, [currentStoryData.storyId]);
        if (active) {
          setIsLiked(liked.includes(currentStoryData.storyId));
        }
      } catch {
        if (active) setIsLiked(false);
      }
    };

    syncLikeState();
    return () => { active = false; };
  }, [currentStoryData?.storyId, currentUser?.userId, isOwnStory, setIsLiked]);

  const handleLike = async () => {
    if (!currentUser || !currentStoryData || likePendingRef.current) return;

    const nextLiked = !isLiked;
    likePendingRef.current = true;
    setIsLiked(nextLiked);
    animateLikeFeedback(nextLiked);

    try {
      if (nextLiked) {
        await storyService.likeStory(currentStoryData.storyId, currentUser.userId);
        await notifyStoryLike();
      } else {
        await storyService.unlikeStory(currentStoryData.storyId, currentUser.userId);
      }
    } catch (error) {
      setIsLiked(!nextLiked);
      console.error('Failed to toggle like:', error);
    } finally {
      likePendingRef.current = false;
    }
  };

  const handleShare = async () => {
    if (!currentStoryData) return;
    if (!isOwnStory && !canShare) {
      Alert.alert('Sharing disabled', 'This story does not allow sharing.');
      return;
    }
    try {
      (navigation as any).navigate('SharePost', {
        contentType: 'story',
        contentData: {
          id: currentStoryData.storyId,
          authorId: currentStoryData.authorId,
          authorUsername: storyUser?.username || currentStoryData.authorUsername || 'user',
          authorAvatarURL: storyUser?.avatarURL || currentStoryData.authorAvatarURL || '',
          mediaURL: currentStoryData.thumbnailURL || currentStoryData.mediaURL,
          caption: '',
          mediaType: currentStoryData.mediaType === 'video' ? 'video' : 'image',
        },
      });
    } catch (error) {
      console.error('Failed to open story share sheet:', error);
      Alert.alert('Error', 'Could not open share options.');
    }
  };

  const handleSendReply = async () => {
    if (isOwnStory || !canReply) return;
    if (!replyText.trim() || !currentUser || !currentStoryData) return;
    try {
      const targetId = userId || currentStoryData?.authorId;
      if (!targetId) return;
      const conversationId = await messageService.getOrCreateDirectConversation(currentUser.userId, targetId);

      await messageService.sendMessage(conversationId, {
        senderId: currentUser.userId,
        senderUsername: currentUser.username,
        senderAvatarURL: currentUser.avatarURL || '',
        text: replyText.trim(),
        type: 'story_reply',
        // @ts-ignore
storyReply: buildStoryReplyMeta(),
      });
      setReplyText('');
      setIsTyping(false);
      setIsPaused(false);
      Keyboard.dismiss();
      showSentToast('Reply sent');
    } catch (error) {
      console.error('Failed to send reply:', error);
      Alert.alert('Error', 'Failed to send reply');
    }
  };

  const applyCurrentStoryUpdates = (updates: Record<string, any>) => {
    setStories((prev) =>
      prev.map((story, index) => (index === currentStory ? { ...story, ...updates } : story))
    );
  };

  const toggleCurrentStorySetting = async (key: 'allowReplies' | 'allowSharing') => {
    if (!currentUser || !currentStoryData || !isOwnStory) return;
    const currentValue = !!((currentStoryData as any)?.[key] ?? true);
    const nextValue = !currentValue;
    try {
      await storyService.updateStorySettings(currentStoryData.storyId, currentUser.userId, { [key]: nextValue } as any);
      applyCurrentStoryUpdates({ [key]: nextValue });
      Alert.alert('Updated', `${key === 'allowReplies' ? 'Replies' : 'Sharing'} ${nextValue ? 'enabled' : 'disabled'} for this story.`);
    } catch (error) {
      console.error('Failed to update current story setting:', error);
      Alert.alert('Error', 'Failed to update story settings');
    }
  };

  const handleDeleteStory = async () => {
    if (!currentUser || !currentStoryData) return;
    try {
      await storyService.deleteStory(currentStoryData.storyId, currentUser.userId);
      Alert.alert('Success', 'Story deleted successfully');
      setShowDeleteDialog(false);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to delete story:', error);
      Alert.alert('Error', 'Failed to delete story');
    }
  };

  const markCurrentStoryViewed = useCallback((source: 'active' | 'exit' | 'hardware-back' | 'unmount' = 'active') => {
    const viewerId = currentUser?.userId;
    const sId = currentStoryData?.storyId;
    if (!viewerId || !sId) return;
    if (viewedStoryIdsRef.current.has(sId)) return;
    if (markViewInFlightRef.current === sId) return;

    markViewInFlightRef.current = sId;
    void storyService.viewStory(sId, viewerId)
      .then(() => {
        viewedStoryIdsRef.current.add(sId);
      })
      .catch((error) => {
        console.error('Failed to mark story as viewed:', source, sId, error);
      })
      .finally(() => {
        if (markViewInFlightRef.current === sId) {
          markViewInFlightRef.current = null;
        }
      });
  }, [currentStoryData?.storyId, currentUser?.userId]);

  useEffect(() => {
    markCurrentStoryViewed('active');
  }, [markCurrentStoryViewed]);

  useEffect(() => {
    const unsubscribeBeforeRemove =
      typeof navigation?.addListener === 'function'
        ? navigation.addListener('beforeRemove', () => {
            markCurrentStoryViewed('exit');
          })
        : undefined;

    const hardwareBackSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      markCurrentStoryViewed('hardware-back');
      return false;
    });

    return () => {
      markCurrentStoryViewed('unmount');
      if (typeof unsubscribeBeforeRemove === 'function') {
        unsubscribeBeforeRemove();
      }
      hardwareBackSubscription.remove();
    };
  }, [markCurrentStoryViewed, navigation]);

  return {
    handleLike,
    handleShare,
    handleSendReply,
    sendQuickReaction,
    toggleCurrentStorySetting,
    handleDoubleTap,
    handleDeleteStory,
    likeBurstOpacity,
    likeBurstScale,
    toastOpacity
  };
}
