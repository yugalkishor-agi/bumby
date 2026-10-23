import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, LayoutAnimation, UIManager, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import MediaBubble from './MediaBubble';
import VoiceMessageBubble from './VoiceMessageBubble';
import PollBubble from './PollBubble';
import LocationBubble from './LocationBubble';
import SharedCard from './SharedCard';
import { SharedContentMessage } from './SharedContentMessage';
import { Avatar } from '../ui/Avatar';
import { Image } from 'expo-image';

type MessageBubbleProps = {
  item: any;
  replySource?: any;
  isMe: boolean;
  isLatestMine: boolean;
  latestSeenMineMessageId?: string | null;
  seenLabel?: string;
  seenReaders?: Array<{ userId: string; avatarURL?: string | null; fallbackText?: string }>; 
  isVisible: boolean;
  isGroupConversation?: boolean;
  otherUserAvatar?: string;
  otherUserId?: string;
  showSenderAvatar?: boolean;
  senderLabel?: string;
  onSenderPress?: (msg: any) => void;
  formatTime: (ts: any) => string;
  canShowReadReceipts?: boolean;
  onBubbleTap: (msg: any) => void;
  onReply?: (msg: any) => void;
  onLongPressAction?: (msg: any, anchor?: { x: number; y: number; width: number; height: number; isMe: boolean }) => void;
  onQuickForward?: (msg: any) => void;
  onCollaborationAccept?: (msg: any) => void;
  onCollaborationDecline?: (msg: any) => void;
  stylesRef: ReturnType<typeof StyleSheet.create> | any;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  accentColor?: string;
  showTimelineTime?: boolean;
  timelineSwipeTranslateX?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  timelineTimeOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  enableReplySwipe?: boolean;
  onBubbleTouchStateChange?: (isTouching: boolean) => void;
  enableEntryAnimation?: boolean;
  simultaneousScrollRef?: any;
};

const alpha = (color: string, opacity: number) => {
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};

const REPLY_SWIPE_LIMIT = 36;
const REPLY_TRIGGER_DISTANCE = 20;
const PRESS_IN_SCALE = 0.994;
const LONG_PRESS_SCALE = 0.978;

const MessageBubble: React.FC<MessageBubbleProps> = ({
  item,
  replySource,
  isMe,
  isLatestMine,
  latestSeenMineMessageId,
  seenLabel,
  seenReaders,
  isVisible,
  isGroupConversation = false,
  otherUserAvatar,
  otherUserId,
  showSenderAvatar = true,
  senderLabel,
  onSenderPress,
  formatTime,
  canShowReadReceipts = true,
  onBubbleTap,
  onReply,
  onLongPressAction,
  onCollaborationAccept,
  onCollaborationDecline,
  stylesRef,
  isFirstInGroup = true,
  isLastInGroup = true,
  accentColor = '#38bdf8',
  showTimelineTime = false,
  timelineSwipeTranslateX = 0,
  timelineTimeOpacity = 1,
  enableReplySwipe = true,
  onBubbleTouchStateChange,
  enableEntryAnimation = true,
  simultaneousScrollRef,
}) => {
  const [messageExpanded, setMessageExpanded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const toggleMessageExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessageExpanded((prev) => !prev);
  }, []);
  const showAvatar = showSenderAvatar && !isMe && isLastInGroup;
  const s = stylesRef;
  const bubbleMeasureRef = useRef<View | null>(null);
  const hasAnimatedRef = useRef(false);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(8)).current;
  const translateXAnim = useRef(new Animated.Value(isMe ? 10 : -10)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const replyDragAnim = useRef(new Animated.Value(0)).current;
  const tapPopAnim = useRef(new Animated.Value(1)).current;
  const longPressTriggeredRef = useRef(false);
  const isDeletedMessage = item.isDeleted === true;

  useEffect(() => {
    if (enableEntryAnimation || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    opacityAnim.setValue(1);
    translateYAnim.setValue(0);
    translateXAnim.setValue(0);
    scaleAnim.setValue(1);
  }, [enableEntryAnimation, opacityAnim, scaleAnim, translateXAnim, translateYAnim]);

  useEffect(() => {
    setMessageExpanded(false);
  }, [item.messageId]);

  useEffect(() => {
    if (enableEntryAnimation && isVisible && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      opacityAnim.setValue(0);
      translateYAnim.setValue(4);
      translateXAnim.setValue(isMe ? 4 : -4);
      scaleAnim.setValue(1);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          speed: 36,
          bounciness: 4,
          useNativeDriver: true,
        }),
        Animated.spring(translateXAnim, {
          toValue: 0,
          speed: 36,
          bounciness: 4,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [enableEntryAnimation, isMe, isVisible, opacityAnim, scaleAnim, translateXAnim, translateYAnim]);

  const replyMeta = useMemo(() => {
    if (!item.replyTo) return null;
    const source = replySource || {};
    const username = item.replyTo?.senderUsername || source.senderUsername || 'User';
    let kind = source.type || '';
    if (kind === 'media') kind = source.mediaType || 'media';
    if (!kind && source.mediaType) kind = source.mediaType;
    if (kind === 'shared' && source.sharedContent?.type) kind = `shared_${source.sharedContent.type}`;

    const labelMap: Record<string, string> = {
      image: 'Photo',
      video: 'Video',
      audio: 'Voice message',
      gif: 'GIF',
      sticker: 'Sticker',
      shared_post: 'Post',
      shared_glimpse: 'Glimpse',
      shared_story: 'Story',
      story_reply: 'Story reply',
      glimpse_collab_request: 'Glimpse request',
      poll: 'Poll',
      location: 'Location',
    };
    const label = labelMap[kind] || '';

    let text = (item.replyTo?.text ?? source.text ?? '').trim();
    if (!text) {
      if (kind === 'poll' && source.poll?.question) {
        text = source.poll.question;
      } else if (kind === 'location' && source.location) {
        text = source.location.name || source.location.address || 'Location';
      } else if (label) {
        text = label;
      } else {
        text = 'Message';
      }
    }

    const thumbUrl =
      source.mediaURL ||
      source.thumbnailURL ||
      source.sharedContent?.coverImage ||
      source.sharedContent?.coverImageURL ||
      source.storyReply?.mediaURL ||
      source.glimpseMediaURL ||
      source.sharedContent?.coverImageURL ||
      source.sharedContent?.coverImage;

    return { username, text, label, thumbUrl, kind };
  }, [item.replyTo, replySource]);

  const replyText = replyMeta?.text || '';
  const replyMax = 90;
  const replyDisplay = replyText.length > replyMax ? `${replyText.slice(0, replyMax).trimEnd()}...` : replyText;
  const replyContextLabel = replyMeta
    ? `${isMe ? 'You replied to' : 'Replying to'} ${replyMeta.username}`
    : '';
  const normalizedMessageText = useMemo(() => {
    if (typeof item.text !== 'string') return '';
    if (item.type === 'system' || item.type === 'group_activity') {
      return item.text.trim();
    }
    const cleaned = item.text
      .replace(/\u2028|\u2029/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{16,}/g, '        ')
      .replace(/^\n+|\n+$/g, '');
    const lines = cleaned.split('\n');
    const lineBreakCount = Math.max(0, lines.length - 1);
    const shortLineCount = lines.filter((line: string) => line.trim().length <= 1).length;
    const suspiciousLineBreaks =
      lineBreakCount > 10 ||
      (lineBreakCount > 0 && lineBreakCount >= Math.floor(cleaned.length * 0.35)) ||
      (lines.length >= 12 && shortLineCount / lines.length > 0.62);
    const stabilized = suspiciousLineBreaks
      ? cleaned.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : cleaned;
    return stabilized.length > 1500 ? `${stabilized.slice(0, 1500)}...` : stabilized;
  }, [item.text]);

  const shouldCollapseMessage = !isDeletedMessage && normalizedMessageText.length > 300;
  const isCollapsedLongMessage = shouldCollapseMessage && !messageExpanded;
  const displayMessageText = normalizedMessageText;

  const renderedMessageParts = useMemo(() => {
    if (isDeletedMessage || !displayMessageText) {
      return [{ key: 'plain', text: displayMessageText, mention: false }];
    }

    const mentionToken = /^@(everyone|admin|owner|[a-zA-Z0-9._]+)$/;
    return displayMessageText
      .split(/(@(?:everyone|admin|owner|[a-zA-Z0-9._]+))/g)
      .filter((part: string) => part.length > 0)
      .map((part: string, index: number) => ({
        key: `${index}:${part}`,
        text: part,
        mention: mentionToken.test(part),
      }));
  }, [displayMessageText, isDeletedMessage]);

  const legacyGroupActivityText = typeof item.text === 'string' ? item.text.toLowerCase() : '';
  const isLegacyGroupActivity =
    isGroupConversation &&
    item.type === 'text' &&
    (
      /\badded\b.+\bto this group\b/.test(legacyGroupActivityText) ||
      /\bremoved\b.+\bfrom this group\b/.test(legacyGroupActivityText) ||
      /\bmuted\b.+\bin this group\b/.test(legacyGroupActivityText) ||
      /\bunmuted\b.+\bin this group\b/.test(legacyGroupActivityText) ||
      /\bleft this group\b/.test(legacyGroupActivityText) ||
      /\bapproved\b.+\bto join this group\b/.test(legacyGroupActivityText)
    );
  const isGroupActivityMessage = item.type === 'group_activity' || item.type === 'system' || isLegacyGroupActivity;

  const createdAtDate = useMemo(() => {
    const ts = item?.createdAt;
    if (!ts) return new Date();
    if (typeof ts?.toDate === 'function') return ts.toDate();
    if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000));
    if (ts instanceof Date) return ts;
    const parsed = new Date(ts);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }, [item?.createdAt]);

  if (isGroupActivityMessage) {
    const activityText = normalizedMessageText || String(item.text || '').trim() || 'Group activity';

    // ── Call system messages get a richer pill UI ─────────────────────────
    const callEvent: string | undefined = (item as any).callEvent;
    const isCallMessage =
      item.type === 'system' &&
      (callEvent != null ||
        /^(📞|📹|🚫|⏱)/.test(activityText));

    if (isCallMessage) {
      // Derive event type from callEvent field or emoji prefix
      const isMissed =
        callEvent === 'missed' || activityText.startsWith('⏱');
      const isDeclined =
        callEvent === 'declined' || activityText.startsWith('🚫');
      const isEnded =
        callEvent === 'ended' ||
        activityText.includes('ended');
      const isStarted =
        callEvent === 'started' ||
        activityText.includes('started');
      const isVideo =
        (item as any).callType === 'video' ||
        activityText.includes('Video') ||
        activityText.includes('video') ||
        activityText.includes('📹');

      // Icon & color per event
      let iconName: any = isVideo ? 'videocam' : 'call';
      let iconColor = '#4ade80';      // green = active/ended
      let pillBg = 'rgba(74,222,128,0.12)';
      if (isMissed || isDeclined) {
        iconName = isVideo ? 'videocam-off' : 'call';
        iconColor = '#f87171';        // red = missed/declined
        pillBg = 'rgba(248,113,113,0.12)';
      } else if (isStarted) {
        iconColor = '#60a5fa';        // blue = started
        pillBg = 'rgba(96,165,250,0.12)';
      }

      // Strip emoji from display text
      const cleanText = activityText.replace(/^[📞📹🚫⏱]\s*/, '').trim();

      return (
        <Animated.View
          style={[
            localStyles.groupActivityRow,
            { opacity: opacityAnim, transform: [{ translateY: translateYAnim }, { scale: scaleAnim }] },
          ]}
        >
          <View style={[localStyles.callPill, { backgroundColor: pillBg }]}>
            <Ionicons name={iconName} size={13} color={iconColor} style={{ marginRight: 5 }} />
            <Text style={[localStyles.callPillText, { color: iconColor }]}>{cleanText}</Text>
          </View>
        </Animated.View>
      );
    }

    // ── Generic system / group-activity message ───────────────────────────
    const activityActorLabel = typeof item.senderUsername === 'string' ? item.senderUsername.trim() : '';
    const activityActorPrefix = activityActorLabel ? activityActorLabel + ' ' : '';
    const canPressActor = !!activityActorLabel && activityText.startsWith(activityActorPrefix) && typeof onSenderPress === 'function';
    const activitySuffix = canPressActor ? activityText.slice(activityActorPrefix.length) : activityText;
    return (
      <Animated.View
        style={[
          localStyles.groupActivityRow,
          {
            opacity: opacityAnim,
            transform: [{ translateY: translateYAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <View style={localStyles.groupActivityChip}>
          <Text style={localStyles.groupActivityText}>
            {canPressActor ? (
              <>
                <Text style={localStyles.groupActivityUserText} onPress={() => onSenderPress?.(item)}>{activityActorLabel}</Text>
                <Text>{' ' + activitySuffix}</Text>
              </>
            ) : (
              activityText
            )}
          </Text>
        </View>
      </Animated.View>
    );
  }

  const renderBody = () => {
    const raw = item.type || 'text';
    const kind = raw === 'media' ? (item.mediaType || 'image') : raw;
    const resolvedUrl = item.mediaURL || item.mediaUrl || item.url || item.gif?.url || item.sticker?.url || item.imageUrl;
    const isGifUrl = typeof resolvedUrl === 'string' && resolvedUrl.toLowerCase().includes('.gif');
    const mediaKind = isGifUrl && kind === 'image' ? 'gif' : kind;

    if (['image', 'video', 'gif', 'sticker'].includes(mediaKind)) {
      if (typeof resolvedUrl !== 'string' || resolvedUrl.trim().length === 0) {
        // Media bubbles are transparent (the media itself is the background), so
        // this label sits on the chat backdrop — it must not use the ink that
        // is tuned for the accent-filled text bubble.
        return <Text style={[s.messageText, localStyles.messageTextContent]}>Unsupported media</Text>;
      }
      return <MediaBubble url={resolvedUrl} type={mediaKind as any} items={Array.isArray(item.mediaItems) ? item.mediaItems : undefined} isVisible={isVisible} stylesRef={s} senderDisplayName={item.senderUsername || (isMe ? 'You' : 'User')} senderVerified={Boolean(item.senderVerified)} />;
    }
    if (kind === 'voice' || kind === 'audio') {
      const rawDuration = Number(item.duration ?? item.audioDuration ?? item.voiceDuration ?? 0);
      const duration = rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.max(0, Math.round(rawDuration));
      if (!resolvedUrl) {
        return <Text style={[s.messageText, isMe && s.messageTextMe]}>Voice message</Text>;
      }
      return (
        <VoiceMessageBubble
          audioUri={resolvedUrl}
          duration={duration}
          isOwn={isMe}
          timestamp={createdAtDate}
          isRead={Array.isArray(item.readBy) && !!otherUserId ? item.readBy.includes(otherUserId) : false}
          embedded
        />
      );
    }
    if (kind === 'poll') {
      const poll = item.poll || {};
      const question = item.question || poll.question || 'Poll';
      const options = item.options || poll.options || [];
      const totalVotes = item.totalVotes ?? poll.totalVotes ?? 0;
      return (
        <PollBubble
          question={question}
          options={options}
          totalVotes={totalVotes}
          selectedId={item.selectedPollOptionId}
          canVote={item.canVote}
          stylesRef={s}
          onVote={item.onVote}
        />
      );
    }
    if (kind === 'location') {
      const loc = item.location || {};
      const lat = item.lat ?? loc.latitude;
      const lng = item.lng ?? loc.longitude;
      const title = item.title || loc.name || loc.address || 'Shared location';
      return <LocationBubble title={title} lat={lat} lng={lng} onOpen={item.onOpen} stylesRef={s} />;
    }
    if (kind === 'shared_post' || kind === 'shared_glimpse' || kind === 'shared_story' || kind === 'story_reply') {
      const isStoryReply = kind === 'story_reply';
      const collaborationStatus = item.collaborationStatus || item.collaborationRequest?.status || (item.status === 'accepted' || item.status === 'rejected' ? item.status : 'pending');
      const storyReplyMeta = item.storyReply || {};
      const normalizedSharedType =
        isStoryReply
          ? 'story'
          : item.sharedContent?.type || (kind === 'shared_post' ? 'post' : kind === 'shared_glimpse' ? 'glimpse' : 'story');
      const normalizedSharedContent = isStoryReply
        ? {
            ...(item.sharedContent || {}),
            type: 'story',
            contentId: storyReplyMeta.storyId || item.sharedContent?.contentId || item.sharedContent?.id,
            authorId: storyReplyMeta.authorId || item.sharedContent?.authorId,
            username: storyReplyMeta.authorUsername || item.sharedContent?.username || item.sharedContent?.authorUsername,
            authorAvatarURL: storyReplyMeta.authorAvatar || item.sharedContent?.authorAvatarURL,
            mediaType: storyReplyMeta.mediaType || item.sharedContent?.mediaType || 'image',
            verified: storyReplyMeta.authorVerified ?? item.sharedContent?.verified,
            coverImage:
              storyReplyMeta.coverImage ||
              storyReplyMeta.thumbnailURL ||
              storyReplyMeta.mediaURL ||
              item.sharedContent?.coverImage ||
              item.sharedContent?.coverImageURL ||
              item.sharedContent?.thumbnailURL ||
              item.sharedContent?.thumbnail ||
              item.mediaURL ||
              item.mediaUrl ||
              item.imageUrl,
          }
        : {
            ...(item.sharedContent || {}),
            type: normalizedSharedType,
            coverImage:
              item.sharedContent?.coverImage ||
              item.sharedContent?.coverImageURL ||
              item.sharedContent?.thumbnailURL ||
              item.sharedContent?.thumbnail ||
              item.sharedContent?.posterURL ||
              item.sharedContent?.mediaURL ||
              item.mediaURL ||
              item.mediaUrl ||
              item.imageUrl,
          };
      const contextLabel = isStoryReply ? (isMe ? 'You replied to their story' : 'Replied to your story') : undefined;
      return (
        <SharedContentMessage
          sharedContent={normalizedSharedContent}
          message={item.text}
          contextLabel={contextLabel}
          collaboration={!isStoryReply && item.collaborationRequest ? { status: collaborationStatus, canRespond: !!item.canRespondToCollab } : undefined}
          onAccept={() => onCollaborationAccept?.(item)}
          onDecline={() => onCollaborationDecline?.(item)}
        />
      );
    }
    if (kind === 'shared') {
      return <SharedCard title={item.title || 'Shared content'} subtitle={item.subtitle} thumbnail={item.thumbnail} onOpen={item.onOpen} stylesRef={s} />;
    }
    return (
      <View style={localStyles.messageTextBlock}>
        <Text
          style={[
            s.messageText,
            localStyles.messageTextContent,
            isMe ? s.messageTextMe : undefined,
            isDeletedMessage ? (isMe ? s.messageTextMeDeleted : s.messageTextDeleted) : undefined,
            isPendingMessage && localStyles.pendingMessageText,
          ]}
          textBreakStrategy="highQuality"
          numberOfLines={isCollapsedLongMessage ? 6 : undefined}
          ellipsizeMode={isCollapsedLongMessage ? 'tail' : undefined}
        >
          {isDeletedMessage
            ? 'This message was unsent'
            : hasRenderableText
            ? renderedMessageParts.map((part: { key: string; text: string; mention: boolean }) => (
                <Text
                  key={part.key}
                  style={part.mention ? (isMe ? s.messageTextMeMention : localStyles.mentionText) : undefined}
                >
                  {part.text}
                </Text>
              ))
            : (item.replyTo ? 'Reply' : 'Message')}
        </Text>
        {shouldCollapseMessage ? (
          <TouchableOpacity
            style={localStyles.messageExpandButton}
            onPress={toggleMessageExpanded}
            activeOpacity={0.8}
          >
            <Text style={[localStyles.messageExpandText, { color: accentColor }]}>{messageExpanded ? 'Less' : 'Read more'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };
  const renderStatusIcon = () => {
    if (item.status === 'failed') return <Ionicons name="alert-circle" size={14} color="#ef4444" style={s.readIcon} />;
    if (item.status === 'pending' || item.status === 'pending_offline') {
      const tint = isMe ? s.messageStatusIconMe?.color : undefined;
      return <Ionicons name="time" size={14} color={tint || '#9ca3af'} style={s.readIcon} />;
    }
    return null;
  };

  const shouldShowSeenLabel =
    isMe &&
    canShowReadReceipts &&
    !!otherUserId &&
    item.messageId === latestSeenMineMessageId &&
    Array.isArray(item.readBy) &&
    item.readBy.includes(otherUserId);
  const isFreshSeenLabel = seenLabel === 'Seen';
  const hasSeenReaders = Array.isArray(seenReaders) && seenReaders.length > 0;
  const baseKind = (item.type === 'media' ? item.mediaType : item.type) || item.mediaType || 'text';
  const isMediaBubble = ['image', 'video', 'gif', 'sticker'].includes(baseKind);
  const isSharedBubble = ['shared_post', 'shared_glimpse', 'shared_story', 'story_reply'].includes(baseKind);
  const mediaUrl = item.mediaURL || item.mediaUrl || item.url || item.gif?.url || item.sticker?.url || item.imageUrl;
  const isGifUrl = typeof mediaUrl === 'string' && mediaUrl.toLowerCase().includes('.gif');
  const isStickerOrGif = baseKind === 'gif' || baseKind === 'sticker' || item.mediaType === 'gif' || item.type === 'gif' || item.type === 'sticker' || isGifUrl;
  const isPollBubble = baseKind === 'poll';
  const isLocationBubble = baseKind === 'location';
  const isPendingMessage = item.status === 'pending' || item.status === 'pending_offline';
  const hasRenderableText = normalizedMessageText.length > 0;
  const shouldUseWideReplyBubble = !!item.replyTo && !isStickerOrGif && !isSharedBubble;
  const plainText = normalizedMessageText.trim();
  const isShortPlainTextBubble = false;
  const bubbleShape = {
    borderTopLeftRadius: !isMe && !isFirstInGroup ? 10 : 24,
    borderBottomLeftRadius: !isMe && !isLastInGroup ? 10 : 24,
    borderTopRightRadius: isMe && !isFirstInGroup ? 10 : 24,
    borderBottomRightRadius: isMe && !isLastInGroup ? 10 : 24,
  };
  const isDecoratedTextBubble = !isStickerOrGif && !isSharedBubble && !isMediaBubble && !isPollBubble && !isLocationBubble;
  const replyDirection = isMe ? -1 : 1;
  const limitedTranslateX = replyDragAnim.interpolate({
    inputRange: [-REPLY_SWIPE_LIMIT, 0, REPLY_SWIPE_LIMIT],
    outputRange: isMe ? [-REPLY_SWIPE_LIMIT, 0, 0] : [0, 0, REPLY_SWIPE_LIMIT],
    extrapolate: 'clamp',
  });
  const replyDistance = Animated.multiply(limitedTranslateX, replyDirection);
  const replyChipOpacity = replyDistance.interpolate({ inputRange: [0, 8, 20], outputRange: [0, 0.74, 1], extrapolate: 'clamp' });
  const replyChipScale = replyDistance.interpolate({ inputRange: [0, 14, 36], outputRange: [0.9, 0.97, 1], extrapolate: 'clamp' });
  const replyChipTranslate = replyDistance.interpolate({ inputRange: [0, 10, 36], outputRange: [isMe ? 8 : -8, 0, 0], extrapolate: 'clamp' });
  // Use scaleX instead of width for native animated support
  const replyProgressScale = replyDistance.interpolate({ inputRange: [0, 10, REPLY_SWIPE_LIMIT], outputRange: [0, 0.33, 1], extrapolate: 'clamp' });
  const replyBubbleScale = replyDistance.interpolate({ inputRange: [0, REPLY_SWIPE_LIMIT], outputRange: [1, 1.012], extrapolate: 'clamp' });
  const replyBubbleLift = replyDistance.interpolate({ inputRange: [0, REPLY_SWIPE_LIMIT], outputRange: [0, -2], extrapolate: 'clamp' });
  const replyChipConfirmOpacity = replyDistance.interpolate({ inputRange: [12, 18, 24], outputRange: [0, 0.55, 1], extrapolate: 'clamp' });

  const triggerSwipeHaptic = () => {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const resetReplyDrag = () => {
    Animated.spring(replyDragAnim, {
      toValue: 0,
      damping: 18,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  const handleReplySwipeStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState !== State.ACTIVE) return;
    onBubbleTouchStateChange?.(false);
    const translationX = Number(nativeEvent.translationX || 0);
    const inwardDistance = Math.max(0, Math.min(REPLY_SWIPE_LIMIT, translationX * replyDirection));

    if (inwardDistance >= REPLY_TRIGGER_DISTANCE) {
      triggerSwipeHaptic();
      onReply?.(item);
      Animated.sequence([
        Animated.timing(replyDragAnim, {
          toValue: isMe ? -REPLY_SWIPE_LIMIT : REPLY_SWIPE_LIMIT,
          duration: 88,
          useNativeDriver: true,
        }),
        Animated.spring(replyDragAnim, {
          toValue: 0,
          damping: 16,
          stiffness: 230,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    resetReplyDrag();
  };

  const handleReplySwipeGesture = Animated.event(
    [{ nativeEvent: { translationX: replyDragAnim } }],
    { useNativeDriver: true }
  );

  const handleLongPress = () => {
    longPressTriggeredRef.current = true;
    Animated.spring(tapPopAnim, {
      toValue: LONG_PRESS_SCALE,
      damping: 22,
      stiffness: 320,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
    triggerSwipeHaptic();
    const node = bubbleMeasureRef.current as any;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (width > 0 && height > 0) {
          onLongPressAction?.(item, { x, y, width, height, isMe });
          return;
        }
        onLongPressAction?.(item, undefined);
      });
      return;
    }
    onLongPressAction?.(item, undefined);
  };

  const handlePressIn = () => {
    onBubbleTouchStateChange?.(true);
    Animated.spring(tapPopAnim, {
      toValue: PRESS_IN_SCALE,
      damping: 24,
      stiffness: 340,
      mass: 0.65,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    onBubbleTouchStateChange?.(false);
    if (longPressTriggeredRef.current) {
      setTimeout(() => {
        longPressTriggeredRef.current = false;
      }, 0);
    }
    Animated.spring(tapPopAnim, {
      toValue: 1,
      damping: 20,
      stiffness: 300,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  const handleTapPress = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onBubbleTap(item);
  };
    const statusIcon = renderStatusIcon();
  const bubbleBody = (
    <View ref={bubbleMeasureRef} collapsable={false}>
      <Animated.View style={{ opacity: opacityAnim, transform: [{ translateX: translateXAnim }, { translateY: translateYAnim }, { scale: scaleAnim }] }}>
        {item.replyTo && replyMeta ? (
          <View
            style={[
              localStyles.replyFloatingLabelWrap,
              isMe ? localStyles.replyFloatingLabelWrapMe : localStyles.replyFloatingLabelWrapOther,
            ]}
          >
            <Text style={[s.replyContextLabel, localStyles.replyFloatingLabelText]} numberOfLines={1}>
              {replyContextLabel}
            </Text>
          </View>
        ) : null}
        {item.replyTo && replyMeta ? (
          <TouchableOpacity
            style={[
              localStyles.replyPreviewBubble,
              isMe ? localStyles.replyPreviewBubbleMe : localStyles.replyPreviewBubbleOther,
            ]}
            onPress={() => onReply?.(item.replyTo)}
            activeOpacity={0.85}
          >
            <View style={s.replySnippet}>
              {replyMeta.thumbUrl ? <Image source={{ uri: replyMeta.thumbUrl }} style={s.replyThumb} /> : null}
              <View style={s.replyTextWrap}>
                <Text style={s.replyText} numberOfLines={1}>
                  {replyDisplay}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}
        <Animated.View style={{ transform: [{ scale: tapPopAnim }] }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleTapPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onLongPress={handleLongPress}
            delayLongPress={180}
            style={[
              s.messageBubble,
              isStickerOrGif || isSharedBubble
                ? s.messageBubbleBare
                : isMe
                ? (isMediaBubble ? s.messageBubbleMeMedia : (isPollBubble || isLocationBubble) ? s.messageBubbleMeCard : s.messageBubbleMe)
                : (isPollBubble || isLocationBubble) ? s.messageBubbleOtherCard : s.messageBubbleOther,
              shouldUseWideReplyBubble && s.messageBubbleWithReply,
              isShortPlainTextBubble && s.messageBubbleCompact,
              !isStickerOrGif && !isSharedBubble && isLatestMine && s.latestHighlight,
              (isPollBubble || isLocationBubble) && s.pollBubbleWide,
              bubbleShape,
              isPendingMessage && localStyles.pendingBubbleVisual,
            ]}
          >
            {isDecoratedTextBubble && isMe && (
              <>
                <LinearGradient
                  colors={[alpha('#FFFFFF', 0.2), alpha('#FFFFFF', 0.06), 'transparent']}
                  locations={[0, 0.34, 1]}
                  start={{ x: 0.08, y: 0 }}
                  end={{ x: 0.92, y: 0.92 }}
                  style={[StyleSheet.absoluteFill, bubbleShape]}
                />
                <LinearGradient
                  colors={['transparent', alpha('#020617', 0.18)]}
                  start={{ x: 0.5, y: 0.14 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[StyleSheet.absoluteFill, bubbleShape]}
                />
              </>
            )}
            {isDecoratedTextBubble && !isMe && (
              <>
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.01)']}
                  locations={[0, 0.4, 1]}
                  start={{ x: 0.12, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, bubbleShape]}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(2, 6, 23, 0.24)']}
                  start={{ x: 0.5, y: 0.2 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[StyleSheet.absoluteFill, bubbleShape]}
                />
              </>
            )}
          {renderBody()}

          {statusIcon ? (
            isStickerOrGif ? (
              <View style={[s.messageFooter, s.messageFooterOverlay, isMe && s.messageFooterMe]}>
                {statusIcon}
              </View>
            ) : (
              <View
                pointerEvents="none"
                style={[
                  localStyles.statusIndicatorOverlay,
                  isMe ? localStyles.statusIndicatorOverlayMe : localStyles.statusIndicatorOverlayOther,
                ]}
              >
                {statusIcon}
              </View>
            )
          ) : null}

          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );

  return (
    <View style={[s.messageRow, isMe && s.messageRowMe]}>
      <Animated.View
        style={[
          s.messageRowSwipeContent,
          isMe && s.messageRowSwipeContentMe,
          { transform: [{ translateX: timelineSwipeTranslateX as any }] },
        ]}
      >
        {!isMe ? (
          <View style={s.messageAvatarSlot}>
            {showAvatar ? (
              <Avatar source={otherUserAvatar} size={44} fallbackText={otherUserId || '?'} style={s.messageAvatar} />
            ) : null}
          </View>
        ) : null}
        <View style={[s.messageBubbleWrap, isMe && s.messageBubbleWrapMe]}>
          {!isMe && senderLabel ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onSenderPress?.(item)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={localStyles.senderFloatingLabel} numberOfLines={1}>{senderLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <View
            style={localStyles.replySwipeStage}
            pointerEvents="box-none"
          >
          <View pointerEvents="none" style={[localStyles.replyActionRail, isMe ? localStyles.replyActionRailMe : localStyles.replyActionRailOther]}>
            <Animated.View
              style={[
                localStyles.swipeActionChip,
                {
                  opacity: replyChipOpacity,
                  transform: [{ translateX: replyChipTranslate }, { scale: replyChipScale }],
                  borderColor: alpha(accentColor, 0.34),
                  shadowColor: accentColor,
                },
              ]}
            >
              <Animated.View style={[localStyles.swipeActionProgress, { 
                transform: [{ scaleX: replyProgressScale }],
                backgroundColor: alpha(accentColor, 0.14) 
              }]} />
              <View style={[localStyles.swipeActionIconWrap, { backgroundColor: alpha(accentColor, 0.18), borderColor: alpha(accentColor, 0.26) }]}>
                <Ionicons name="arrow-undo" size={16} color={accentColor} />
              </View>
              <View style={localStyles.swipeActionCopy}>
                <Text style={localStyles.swipeActionLabel}>Reply</Text>
              </View>
            </Animated.View>
          </View>

          <PanGestureHandler
            enabled={enableReplySwipe && !!onReply}
            activeOffsetX={isMe ? [-16, 999] : [-999, 16]}
            activeOffsetY={[-12, 12]}
            simultaneousHandlers={simultaneousScrollRef}
            shouldCancelWhenOutside={false}
            onGestureEvent={handleReplySwipeGesture}
            onHandlerStateChange={handleReplySwipeStateChange}
          >
            <Animated.View style={{ transform: [{ translateX: limitedTranslateX }, { translateY: replyBubbleLift }, { scale: replyBubbleScale }] }}>
              {bubbleBody}
            </Animated.View>
          </PanGestureHandler>
          </View>
          {hasSeenReaders ? (
            <View style={localStyles.seenReadersRow}>
              {(seenReaders || []).slice(0, 3).map((reader, idx) => (
                <Avatar
                  key={`${reader.userId}-${idx}`}
                  source={reader.avatarURL || null}
                  size={18}
                  fallbackText={reader.fallbackText || reader.userId}
                  style={idx > 0 ? localStyles.seenReaderAvatarWithOverlap : localStyles.seenReaderAvatar}
                />
              ))}
            </View>
          ) : shouldShowSeenLabel && seenLabel ? (
            <Text style={[s.seenLabel, isFreshSeenLabel ? s.seenLabelFresh : s.seenLabelAged]}>
              {seenLabel}
            </Text>
          ) : null}
        </View>
      </Animated.View>
      {showTimelineTime ? (
        <Animated.Text
          style={[s.threadTimelineTime, isMe ? s.threadTimelineTimeMe : s.threadTimelineTimeOther, { opacity: timelineTimeOpacity as any }]}
        >
          {formatTime(item.createdAt)}
        </Animated.Text>
      ) : null}
    </View>
  );
};

const readBySignature = (value: any): string =>
  Array.isArray(value) ? value.filter(Boolean).join('|') : '';

const toMillis = (timestamp: any): number => {
  if (!timestamp) return 0;
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
  if (typeof timestamp?.seconds === 'number') {
    return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
  }
  if (timestamp instanceof Date) return timestamp.getTime();
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const messageRenderSignature = (item: any): string => {
  if (!item) return '';
  const text = typeof item?.text === 'string' ? item.text : String(item?.text ?? '');
  const trimmedText = text.length > 160 ? `${text.slice(0, 80)}::${text.slice(-40)}` : text;
  return [
    String(item?.messageId || ''),
    String(item?.status || ''),
    item?.isDeleted === true ? '1' : '0',
    String(item?.type || ''),
    String(item?.mediaType || ''),
    String(item?.mediaURL || item?.mediaUrl || item?.url || item?.imageUrl || ''),
    String(item?.replyTo?.messageId || ''),
    String(item?.replyTo?.text || ''),
    readBySignature(item?.readBy),
    trimmedText,
    String(toMillis(item?.createdAt) || 0),
    String(toMillis(item?.updatedAt) || 0),
  ].join('::');
};

const replySourceSignature = (replySource: any): string => {
  if (!replySource) return '';
  const text = typeof replySource?.text === 'string' ? replySource.text : String(replySource?.text ?? '');
  const clippedText = text.length > 120 ? `${text.slice(0, 60)}::${text.slice(-20)}` : text;
  return [
    String(replySource?.messageId || ''),
    String(replySource?.senderId || ''),
    String(replySource?.senderUsername || ''),
    String(replySource?.type || ''),
    String(replySource?.mediaType || ''),
    String(replySource?.mediaURL || replySource?.thumbnailURL || ''),
    clippedText,
  ].join('::');
};

const seenReadersSignature = (readers: Array<{ userId: string; avatarURL?: string | null; fallbackText?: string }> | undefined): string => {
  if (!Array.isArray(readers) || readers.length === 0) return '';
  return readers
    .map((reader) => `${reader.userId}:${String(reader.avatarURL || '')}:${String(reader.fallbackText || '')}`)
    .join('|');
};

const areMessageBubblePropsEqual = (prev: MessageBubbleProps, next: MessageBubbleProps): boolean => {
  if (prev.item?.messageId !== next.item?.messageId) return false;
  if (messageRenderSignature(prev.item) !== messageRenderSignature(next.item)) return false;
  if (replySourceSignature(prev.replySource) !== replySourceSignature(next.replySource)) return false;
  if (seenReadersSignature(prev.seenReaders) !== seenReadersSignature(next.seenReaders)) return false;

  if (prev.isMe !== next.isMe) return false;
  if (prev.isLatestMine !== next.isLatestMine) return false;
  if (prev.latestSeenMineMessageId !== next.latestSeenMineMessageId) return false;
  if (prev.seenLabel !== next.seenLabel) return false;
  if (prev.isVisible !== next.isVisible) return false;
  if (prev.isGroupConversation !== next.isGroupConversation) return false;
  if (prev.otherUserAvatar !== next.otherUserAvatar) return false;
  if (prev.otherUserId !== next.otherUserId) return false;
  if (prev.showSenderAvatar !== next.showSenderAvatar) return false;
  if (prev.senderLabel !== next.senderLabel) return false;
  if (prev.canShowReadReceipts !== next.canShowReadReceipts) return false;
  if (prev.isFirstInGroup !== next.isFirstInGroup) return false;
  if (prev.isLastInGroup !== next.isLastInGroup) return false;
  if (prev.accentColor !== next.accentColor) return false;
  if (prev.showTimelineTime !== next.showTimelineTime) return false;
  if (prev.timelineSwipeTranslateX !== next.timelineSwipeTranslateX) return false;
  if (prev.timelineTimeOpacity !== next.timelineTimeOpacity) return false;
  if (prev.enableReplySwipe !== next.enableReplySwipe) return false;
  if (prev.enableEntryAnimation !== next.enableEntryAnimation) return false;
  if (prev.stylesRef !== next.stylesRef) return false;

  return true;
};

export default memo(MessageBubble, areMessageBubblePropsEqual);

const localStyles = StyleSheet.create({
  groupActivityRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  groupActivityChip: {
    maxWidth: '88%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 19, 36, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  callPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  groupActivityText: {
    textAlign: 'center',
    color: 'rgba(241, 245, 249, 0.88)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  groupActivityUserText: {
    color: '#f8fafc',
    fontWeight: '800',
  },
  replySwipeStage: {
    position: 'relative',
    overflow: 'visible',
  },
  replyActionRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 0,
  },
  replyActionRailOther: {
    left: 0,
    alignItems: 'flex-start',
  },
  replyActionRailMe: {
    right: 0,
    alignItems: 'flex-end',
  },
  swipeActionChip: {
    minWidth: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 14, 28, 0.92)',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  swipeActionProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 84, // Max width - will be scaled from 0 to 1
    borderRadius: 18,
    transformOrigin: 'left',
  },
  swipeActionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeActionCopy: {
    marginLeft: 8,
  },
  swipeActionLabel: {
    color: '#e5edf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  messageTextBlock: {
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  messageExpandButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  messageExpandText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  messageTextContent: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '100%',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
  },
  statusIndicatorOverlay: {
    position: 'absolute',
    bottom: 8,
    zIndex: 3,
  },
  statusIndicatorOverlayMe: {
    right: -8,
  },
  statusIndicatorOverlayOther: {
    left: -18,
  },
  pendingBubbleVisual: {
    opacity: 0.72,
  },
  pendingMessageText: {
    opacity: 0.82,
  },
  mentionText: {
    color: '#f5d0fe',
    fontWeight: '800',
  },
  replyPreviewBubble: {
    maxWidth: '76%',
    marginBottom: 10,
  },
  replyPreviewBubbleMe: {
    alignSelf: 'flex-end',
  },
  replyPreviewBubbleOther: {
    alignSelf: 'flex-start',
  },
  senderFloatingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248, 250, 252, 0.92)',
    marginBottom: 4,
    marginLeft: 10,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(2, 6, 23, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  replyFloatingLabelWrap: {
    marginBottom: 6,
    maxWidth: '100%',
  },
  replyFloatingLabelWrapMe: {
    alignSelf: 'flex-end',
    paddingRight: 2,
  },
  replyFloatingLabelWrapOther: {
    alignSelf: 'flex-start',
    paddingLeft: 2,
  },
  replyFloatingLabelText: {
    color: 'rgba(241, 245, 249, 0.78)',
    marginBottom: 0,
    fontSize: 11,
    lineHeight: 14,
    textShadowRadius: 2,
  },
  seenReadersRow: {
    marginTop: 8,
    marginRight: 10,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
  },
  seenReaderAvatar: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.74)',
  },
  seenReaderAvatarWithOverlap: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.74)',
    marginLeft: -6,
  },
  swipeActionStage: {
    color: '#a5b4fc',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
});






































































