import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Bookmark,
  EyeOff,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  UserMinus,
} from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { Avatar } from '../ui/Avatar';
import { CachedImage } from '../ui/CachedImage';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/user.service';
import { reportService } from '../../services/report.service';
import { settingsService } from '../../services/settings.service';
import { appWarmupService } from '../../services/appWarmup.service';
import { colors } from '../../styles/theme';

type PostUser = {
  name: string;
  username?: string;
  avatar?: string;
  avatarURL?: string;
  isVerified?: boolean;
  userId?: string;
};

export type PostCardVariant = 'feed' | 'fullscreen';

interface PostCardProps {
  postId: string;
  postType?: 'post' | 'glimpse';
  user: PostUser;
  image: string;
  mediaAspectRatio?: number;
  caption?: string;
  location?: string;
  time?: any;
  likes?: number;
  comments?: number;
  shares?: number;
  mediaType?: string;
  hideLikesCount?: boolean;
  hideSharesCount?: boolean;
  commentsEnabled?: boolean;
  allowSharing?: boolean;
  audience?: 'public' | 'followers' | 'closeFriends' | 'close_friends';
  isLiked?: boolean;
  isSaved?: boolean;
  showMenuButton?: boolean;
  variant?: PostCardVariant;
  likedByPreview?: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    avatarURL?: string;
  }>;

  latestCommentText?: string;
  latestCommentUser?: string;
  taggedUsers?: Array<{
    userId: string;
    username?: string;
    x?: number;
    y?: number;
  }>;
  collaborators?: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    avatarURL?: string;
    status?: string;
  }>;
  onLike?: (postId: string) => void;
  onSave?: (postId: string) => void;
  onSaveChange?: (postId: string, saved: boolean) => void;
  onShare?: (postId: string, sharedCount: number) => void;
  onHide?: (postId: string) => void;
  onMenuPress?: (postId: string) => void;
}

const formatCountShort = (value: number) => {
  if (!value || value < 1000) return String(value || 0);
  if (value < 10000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 100000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 1000000) return `${Math.round(value / 1000)}K`;
  if (value < 10000000) return `${(value / 1000000).toFixed(1)}M`;
  return `${Math.round(value / 1000000)}M`;
};

const formatPrettyDate = (value: any) => {
  if (!value) return '';
  const date = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['jan', 'feb', 'march', 'april', 'may', 'june', 'july', 'aug', 'sept', 'oct', 'nov', 'dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const formatTime = (value: any) => {
  if (!value) return '';
  const date = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatPostDate = (value: any) => {
  const pretty = formatPrettyDate(value);
  return pretty || formatTime(value);
};

const clampAspectRatio = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.max(0.6, Math.min(2.2, value));
};

const PostCardComponent = ({
  postId,
  postType = 'post',
  user,
  image,
  mediaAspectRatio,
  caption,
  location,
  time,
  likes = 0,
  comments = 0,
  shares = 0,
  mediaType,
  hideLikesCount,
  hideSharesCount,
  commentsEnabled = true,
  allowSharing = true,
  audience,
  isLiked,
  isSaved,
  showMenuButton = true,
  variant = 'feed',
  likedByPreview = [],

  latestCommentText,
  latestCommentUser,
  taggedUsers = [],
  collaborators = [],
  onLike,
  onSave,
  onSaveChange,
  onShare,
  onHide,
  onMenuPress,
}: PostCardProps) => {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const isFullscreen = variant === 'fullscreen';
  const headerAvatarSize = isFullscreen ? 46 : 42;
  const actionIconSize = isFullscreen ? 26 : 24;
  const menuIconSize = isFullscreen ? 22 : 20;
  const [menuVisible, setMenuVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [localSaved, setLocalSaved] = useState(!!isSaved);
  const [localSharesCount, setLocalSharesCount] = useState(() => Math.max(0, Number(shares || 0)));
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [captionCanExpand, setCaptionCanExpand] = useState(false);
  const [resolvedAspectRatio, setResolvedAspectRatio] = useState(() => clampAspectRatio(mediaAspectRatio));
  const lastTap = useRef<number>(0);
  const likeAnimation = useRef(new Animated.Value(1)).current;
  const saveAnimation = useRef(new Animated.Value(1)).current;
  const doubleTapHeart = useRef(new Animated.Value(0)).current;
  const doubleTapHeartScale = useRef(new Animated.Value(0.6)).current;
  const doubleTapRing = useRef(new Animated.Value(0)).current;
  const doubleTapAnimating = useRef(false);

  const acceptedCollaborators = useMemo(
    () => (collaborators || []).filter((collab) => collab?.userId && collab.status === 'accepted'),
    [collaborators]
  );
  const displayCollaborator = acceptedCollaborators[0] || null;
  const primaryHandle = user.username || user.name;
  const collaboratorHandle = displayCollaborator
    ? displayCollaborator.username || displayCollaborator.displayName || 'collaborator'
    : '';
  const showCollaboratorHandle = !!displayCollaborator && acceptedCollaborators.length === 1;
  const showCollaboratorCount = acceptedCollaborators.length > 1;
  const visibleTags = taggedUsers.slice(0, 3);
  const hiddenTagsCount = Math.max(0, taggedUsers.length - visibleTags.length);
  const imageResizeMode = isFullscreen ? 'contain' : 'contain';
  const resolvedLiked = !!isLiked;
  const resolvedLikesCount = Math.max(0, Number(likes || 0));
  const normalizedAudience = audience === 'close_friends' ? 'closeFriends' : audience;
  const audienceLabel = normalizedAudience === 'closeFriends' ? 'Close Friends' : normalizedAudience === 'followers' ? 'Followers' : '';
  const showAudienceBadge = audienceLabel.length > 0;
  const mediaContainerStyle = [
    styles.imageContainer,
    !isFullscreen && styles.imageInset,
    isFullscreen && styles.imageFullscreen,
    !isFullscreen ? { aspectRatio: resolvedAspectRatio } : null,
  ];


  useEffect(() => {
    setLocalSaved(!!isSaved);
  }, [isSaved]);


  useEffect(() => {
    setLocalSharesCount(Math.max(0, Number(shares || 0)));
  }, [shares]);

  useEffect(() => {
    setImageLoading(!!image);
  }, [image]);

  useEffect(() => {
    setResolvedAspectRatio(clampAspectRatio(mediaAspectRatio));
  }, [mediaAspectRatio]);

  const handleProfilePress = () => {
    if (!user.userId && !user.username) return;
    if (currentUser?.userId && user.userId) {
      void appWarmupService.prefetchProfile(user.userId, currentUser.userId);
    }
    (navigation as any).navigate('UserProfile', {
      userId: user.userId,
      username: user.username,
    });
  };

  const handleCollaboratorPress = () => {
    if (!displayCollaborator?.userId) return;
    if (currentUser?.userId) {
      void appWarmupService.prefetchProfile(displayCollaborator.userId, currentUser.userId);
    }
    (navigation as any).navigate('UserProfile', {
      userId: displayCollaborator.userId,
      username: displayCollaborator.username || displayCollaborator.displayName,
    });
  };

  const handleLike = () => {
    Animated.sequence([
      Animated.timing(likeAnimation, { toValue: 1.2, duration: 120, useNativeDriver: true }),
      Animated.timing(likeAnimation, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    if (onLike) onLike(postId);
  };

  const handleSave = () => {
    const next = !localSaved;
    setLocalSaved(next);
    Animated.sequence([
      Animated.timing(saveAnimation, { toValue: 1.15, duration: 120, useNativeDriver: true }),
      Animated.timing(saveAnimation, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    if (onSave) {
      onSave(postId);
    } else if (onSaveChange) {
      onSaveChange(postId, next);
    }
  };

  const triggerDoubleTapHeart = () => {
    if (doubleTapAnimating.current) return;
    doubleTapAnimating.current = true;

    doubleTapHeart.setValue(0);
    doubleTapHeartScale.setValue(0.6);
    doubleTapRing.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(doubleTapHeart, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(doubleTapHeartScale, {
          toValue: 1.12,
          friction: 5,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(doubleTapRing, { toValue: 1, duration: 460, useNativeDriver: true }),
      ]),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(doubleTapHeart, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(doubleTapHeartScale, { toValue: 0.85, duration: 220, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      doubleTapAnimating.current = false;
      if (!finished) {
        doubleTapHeart.setValue(0);
      }
    });
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!resolvedLiked && onLike) {
        onLike(postId);
      }
      triggerDoubleTapHeart();
    }
    lastTap.current = now;
  };

  const handleShare = async () => {
    if (!allowSharing) return;
    (navigation as any).navigate('SharePost', {
      contentType: postType === 'glimpse' ? 'glimpse' : 'post',
      contentData: {
        id: postId,
        authorId: user.userId,
        authorUsername: user.username || user.name,
        authorAvatarURL: user.avatarURL || user.avatar,
        authorVerified: !!user.isVerified,
        mediaURL: image,
        caption: caption || '',
        mediaType: mediaType || 'image',
      },
      onShared: (count: number) => {
        if (!count || count <= 0) return;
        onShare?.(postId, count);
      },
    });
  };
  const handleHidePost = async () => {
    if (!currentUser?.userId) return;
    try {
      const settings = await settingsService.getUserSettings(currentUser.userId);
      const hidden = Array.isArray(settings.hiddenPosts) ? settings.hiddenPosts : [];
      if (!hidden.includes(postId)) {
        await settingsService.updateSettings(currentUser.userId, {
          hiddenPosts: [...hidden, postId],
        });
      }
      if (onHide) onHide(postId);
      setMenuVisible(false);
    } catch (error) {
      console.error('Hide post failed:', error);
    }
  };

  const handleReport = async () => {
    if (!currentUser?.userId || !user.userId) return;
    try {
      await reportService.reportPost(
        postId,
        user.userId,
        currentUser.userId,
        currentUser.username || 'user',
        'other',
        'Something else'
      );
      setMenuVisible(false);
      Alert.alert('Report sent', 'Thanks for letting us know.');
    } catch (error) {
      console.error('Report failed:', error);
    }
  };

  const handleUnfollow = () => {
    if (!currentUser?.userId || !user.userId) return;
    Alert.alert('Unfollow user', `Unfollow ${user.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: async () => {
          try {
            await userService.unfollowUser(currentUser.userId, user.userId as string);
            setMenuVisible(false);
          } catch (error) {
            console.error('Unfollow failed:', error);
          }
        },
      },
    ]);
  };

  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress(postId);
    } else {
      setMenuVisible(true);
    }
  };

  const commentsDisabled = !commentsEnabled;
  const iconHitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
  const shareDisabled = !allowSharing;
  const primaryLikedByUser = likedByPreview[0];
  
  const likedByName = primaryLikedByUser?.username || primaryLikedByUser?.displayName || '';
  const showLikedByOthers = resolvedLikesCount > 1 || likedByPreview.length > 1;
  const normalizedCaption = (caption || '').trim();

  return (
    <View style={[styles.container, isFullscreen && styles.containerFullscreen]}>
      <View style={[styles.header, isFullscreen && styles.headerFullscreen]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerAvatarTouch} onPress={handleProfilePress} activeOpacity={0.8}>
            <View style={styles.headerAvatarCluster}>
              <Avatar
                source={user.avatarURL || user.avatar}
                size={headerAvatarSize}
                fallbackText={user.username || user.name}
              />
              {displayCollaborator ? (
                <View style={styles.collabAvatarOverlay}>
                  <Avatar
                    source={displayCollaborator.avatarURL}
                    size={Math.max(24, headerAvatarSize - 14)}
                    fallbackText={displayCollaborator.username || displayCollaborator.displayName || 'C'}
                    style={styles.collabAvatar}
                  />
                </View>
              ) : null}
            </View>
          </TouchableOpacity>

          <View style={[styles.headerInfo, isFullscreen && styles.headerInfoFullscreen]}>
            <View style={styles.nameContainer}>
              <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.75}>
                <Text style={[styles.headerUsername, isFullscreen && styles.headerUsernameFullscreen]} numberOfLines={1}>
                  {primaryHandle}
                </Text>
              </TouchableOpacity>

              {showCollaboratorHandle ? (
                <>
                  <Text style={styles.usernameConnector}>and</Text>
                  <TouchableOpacity onPress={handleCollaboratorPress} activeOpacity={0.75}>
                    <Text style={[styles.headerUsername, styles.headerUsernameCollab, isFullscreen && styles.headerUsernameFullscreen]} numberOfLines={1}>
                      {collaboratorHandle}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : showCollaboratorCount ? (
                <Text style={styles.usernameConnector} numberOfLines={1}>{`and ${acceptedCollaborators.length} others`}</Text>
              ) : null}

              {user.isVerified ? (
                <VerifiedBadge size={isFullscreen ? 18 : 16} style={styles.verificationBadgeSvg} />
              ) : null}
            </View>
            {showAudienceBadge ? (
              <View style={[styles.audienceBadge, normalizedAudience === 'closeFriends' ? styles.closeFriendsBadge : styles.followersBadge]}>
                {normalizedAudience === 'closeFriends' ? (
                  <MaterialCommunityIcons name="infinity" size={12} color="#7CFFB2" />
                ) : null}
                <Text style={styles.audienceBadgeText}>{audienceLabel}</Text>
              </View>
            ) : null}
            {location ? (
              <View style={styles.locationContainer}>
                <MapPin size={12} color={colors.text.secondary} strokeWidth={1.5} />
                <Text style={styles.location} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {showMenuButton ? (
          <TouchableOpacity style={styles.moreButton} activeOpacity={0.7} onPress={handleMenuPress}>
            <MoreHorizontal size={menuIconSize} color={colors.text.primary} strokeWidth={1.5} />
          </TouchableOpacity>
        ) : (
          <View style={styles.moreButtonSpacer} />
        )}
      </View>
      <TouchableOpacity onPress={handleDoubleTap} activeOpacity={0.98}>
        <View style={mediaContainerStyle}>
          {imageLoading ? (
            <View style={styles.imagePlaceholder}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
            </View>
          ) : null}
          <CachedImage
            uri={image}
            style={styles.image}
            onLoadStart={() => setImageLoading(!!image)}
            onLoad={(event) => {
              const width = event?.source?.width;
              const height = event?.source?.height;
              if (width && height) {
                setResolvedAspectRatio(clampAspectRatio(width / Math.max(1, height)));
              }
            }}
            onLoadEnd={() => setImageLoading(false)}
            onError={() => setImageLoading(false)}
            resizeMode={imageResizeMode}
          />

          {/* Expanding ring behind the heart (glimpse-style) */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.doubleTapRing,
              {
                opacity: doubleTapRing.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0, 0.5, 0],
                }),
                transform: [
                  {
                    scale: doubleTapRing.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 1.9],
                    }),
                  },
                ],
              },
            ]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.doubleTapHeart,
              {
                opacity: doubleTapHeart,
                transform: [{ scale: doubleTapHeartScale }],
              },
            ]}
          >
            <Heart size={96} color="#FF2D55" fill="#FF2D55" strokeWidth={1.5} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <View style={[styles.actions, isFullscreen && styles.actionsFullscreen]}>
        
        <View style={styles.actionsLeft}>
          <View style={styles.actionGroup}>
            <TouchableOpacity style={styles.actionButton} onPress={handleLike} activeOpacity={0.7} hitSlop={iconHitSlop}>
              <Animated.View style={{ transform: [{ scale: likeAnimation }] }}>
                <Heart
                  size={actionIconSize}
                  color={resolvedLiked ? '#E91E63' : colors.text.primary}
                  fill={resolvedLiked ? '#E91E63' : 'transparent'}
                  strokeWidth={1.5}
                />
              </Animated.View>
            </TouchableOpacity>
            {!hideLikesCount && resolvedLikesCount > 0 ? (
              <Text style={styles.actionCount}>{formatCountShort(resolvedLikesCount)}</Text>
            ) : null}
          </View>

          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.actionButton, commentsDisabled && styles.actionButtonDisabled]}
              onPress={() =>
                (navigation as any).navigate('Comments', {
                  postId,
                  postType: postType === 'glimpse' ? 'glimpse' : 'post',
                  fromGlimpses: postType === 'glimpse',
                })
              }
              activeOpacity={0.7}
              disabled={commentsDisabled}
            >
              <MessageCircle
                size={actionIconSize}
                color={commentsDisabled ? colors.text.muted : colors.text.primary}
                strokeWidth={1.5}
              />
            </TouchableOpacity>
            {commentsEnabled && comments > 0 ? (
              <Text style={styles.actionCount}>{formatCountShort(comments)}</Text>
            ) : null}
          </View>

          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.actionButton, shareDisabled && styles.actionButtonDisabled]}
              activeOpacity={0.7}
              onPress={handleShare}
              disabled={shareDisabled}
            >
              <Send
                size={actionIconSize}
                color={shareDisabled ? colors.text.muted : colors.text.primary}
                strokeWidth={1.5}
              />
            </TouchableOpacity>
            {!hideSharesCount && localSharesCount > 0 ? (
              <Text style={styles.actionCount}>{formatCountShort(localSharesCount)}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity style={styles.actionButtonRight} onPress={handleSave} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: saveAnimation }] }}>
            <Bookmark
              size={actionIconSize}
              color={localSaved ? colors.text.link : colors.text.primary}
              fill={localSaved ? colors.text.link : 'transparent'}
              strokeWidth={1.5}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>


      {likedByPreview.length > 0 ? (
        <TouchableOpacity
          style={styles.likedByContainer}
          activeOpacity={0.75}
          onPress={() => (navigation as any).navigate('LikesList', { postId, postType, ownerId: user.userId })}
        >
          <View style={styles.likedByAvatarStack}>
            {likedByPreview.slice(0, 3).map((likeUser, index) => (
              <View
                key={likeUser.userId}
                style={[
                  styles.likedByAvatarWrap,
                  index > 0 ? styles.likedByAvatarOverlay : null,
                  { zIndex: likedByPreview.length - index },
                ]}
              >
                <Avatar
                  source={likeUser.avatarURL}
                  size={18}
                  fallbackText={likeUser.username || likeUser.displayName || '?'}
                  style={styles.likedByAvatar}
                />
              </View>
            ))}
          </View>
          <View style={styles.likedByTextWrap}>
            <Text style={styles.likedByLabel}>Liked by</Text>
            {likedByName ? (
              <Text style={styles.likedByPrimaryName} numberOfLines={1}>{likedByName}</Text>
            ) : null}
            {showLikedByOthers ? (
              <Text style={styles.likedByOthersText}>and others</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : null}
      {normalizedCaption ? (
        <View style={styles.captionContainer}>
          <Text
            style={styles.caption}
            numberOfLines={isCaptionExpanded ? undefined : 2}
            onTextLayout={(event) => {
              if (!captionCanExpand && event.nativeEvent.lines.length > 2) {
                setCaptionCanExpand(true);
              }
            }}
          >
            <Text style={styles.username} onPress={handleProfilePress}>{user.username || user.name}</Text>{' '}
            {normalizedCaption}
          </Text>
          {captionCanExpand ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsCaptionExpanded((prev) => !prev)}
              style={styles.captionToggleButton}
            >
              <Text style={styles.captionMore}>{isCaptionExpanded ? 'less' : 'more'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {visibleTags.length > 0 ? (
        <View style={styles.tagsRow}>
          {visibleTags.map((tag) => (
            <TouchableOpacity
              key={tag.userId}
              style={styles.tagChip}
              activeOpacity={0.75}
              onPress={() => { if (currentUser?.userId && tag.userId) { void appWarmupService.prefetchProfile(tag.userId, currentUser.userId); } (navigation as any).navigate('UserProfile', { userId: tag.userId, username: tag.username }); }}
            >
              <Text style={styles.tagChipText}>@{tag.username || 'user'}</Text>
            </TouchableOpacity>
          ))}
          {hiddenTagsCount > 0 ? (
            <View style={[styles.tagChip, styles.tagChipMuted]}>
              <Text style={styles.tagChipText}>+{hiddenTagsCount}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {comments > 0 ? (
        <View style={styles.commentsContainer}>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('Comments', { postId })}
            activeOpacity={0.7}
          >
            <Text style={styles.viewComments}>
              View all {formatCountShort(comments)} comment{comments !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {latestCommentText ? (
        <View style={styles.latestCommentContainer}>
          <Text style={styles.latestCommentText} numberOfLines={1}>
            {latestCommentUser ? (
              <Text style={styles.latestCommentUser}>{latestCommentUser} </Text>
            ) : null}
            {latestCommentText}
          </Text>
        </View>
      ) : null}

      <View style={styles.timeContainer}>
        <Text style={styles.time}>{formatPostDate(time)}</Text>
      </View>

      {!onMenuPress && (
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <Pressable style={styles.menuSheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity style={styles.menuItem} onPress={handleSave}>
                <Bookmark
                  size={18}
                  color={colors.text.primary}
                  fill={localSaved ? colors.text.primary : 'transparent'}
                  strokeWidth={1.5}
                  style={styles.menuIcon}
                />
                <Text style={styles.menuText}>{localSaved ? 'Unsave' : 'Save'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
                <Send size={20} color={colors.text.primary} strokeWidth={1.5} style={styles.menuIcon} />
                <Text style={styles.menuText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={handleHidePost}>
                <EyeOff size={20} color={colors.text.primary} strokeWidth={1.5} style={styles.menuIcon} />
                <Text style={styles.menuText}>Hide</Text>
              </TouchableOpacity>

              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleReport}>
                <Flag size={20} color="#ef4444" strokeWidth={1.5} style={styles.menuIcon} />
                <Text style={[styles.menuText, styles.menuTextDanger]}>Report</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleUnfollow}>
                <UserMinus size={20} color="#ef4444" strokeWidth={1.5} style={styles.menuIcon} />
                <Text style={[styles.menuText, styles.menuTextDanger]}>Unfollow</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

const sameById = (
  a?: Array<{ userId: string }>,
  b?: Array<{ userId: string }>,
) => {
  if (a === b) return true;
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) if (a![i].userId !== b![i].userId) return false;
  return true;
};

const sameCollaborators = (
  a?: Array<{ userId: string; status?: string }>,
  b?: Array<{ userId: string; status?: string }>,
) => {
  if (a === b) return true;
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) {
    if (a![i].userId !== b![i].userId || a![i].status !== b![i].status) return false;
  }
  return true;
};

export const PostCard = memo(PostCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.postId === nextProps.postId &&
    prevProps.isLiked === nextProps.isLiked &&
    prevProps.isSaved === nextProps.isSaved &&
    prevProps.likes === nextProps.likes &&
    prevProps.comments === nextProps.comments &&
    prevProps.shares === nextProps.shares &&
    prevProps.image === nextProps.image &&
    prevProps.caption === nextProps.caption &&
    prevProps.latestCommentText === nextProps.latestCommentText &&
    prevProps.latestCommentUser === nextProps.latestCommentUser &&
    prevProps.time === nextProps.time &&
    sameById(prevProps.likedByPreview, nextProps.likedByPreview) &&
    sameById(prevProps.taggedUsers, nextProps.taggedUsers) &&
    sameCollaborators(prevProps.collaborators, nextProps.collaborators) &&
    prevProps.showMenuButton === nextProps.showMenuButton &&
    prevProps.variant === nextProps.variant
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: colors.background.primary,
    borderBottomWidth: 0.5,
    borderColor: colors.border.subtle,
  },
  containerFullscreen: {
    flex: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.background.primary,
  },
  headerFullscreen: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 18,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatarTouch: {
    marginRight: 2,
  },
  headerAvatarCluster: {
    position: 'relative',
    width: 58,
    height: 50,
    justifyContent: 'center',
  },
  collabAvatarOverlay: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: 999,
    backgroundColor: colors.background.primary,
    padding: 2,
  },
  collabAvatar: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  headerInfoFullscreen: {
    marginLeft: 12,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 4,
  },
  headerUsername: {
    fontSize: 16,
    fontWeight: '600' as any,
    color: '#F5F5F5',
    flexShrink: 1,
  },
  headerUsernameFullscreen: {
    fontSize: 17.5,
    fontWeight: '700' as any,
  },
  headerUsernameCollab: {
    color: '#E5EDFF',
  },
  usernameConnector: {
    color: '#D4DEF4',
    fontSize: 14,
    fontWeight: '500' as any,
  },
  username: {
    fontSize: 14,
    fontWeight: '500' as any,
    color: '#F5F5F5',
    flexShrink: 1,
  },
  usernameFullscreen: {
    fontSize: 15.5,
    fontWeight: '600' as any,
  },
  verificationBadgeSvg: {
    marginLeft: 2,
  },
  audienceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  closeFriendsBadge: {
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderColor: 'rgba(16,185,129,0.38)',
  },
  followersBadge: {
    backgroundColor: 'rgba(96,165,250,0.14)',
    borderColor: 'rgba(96,165,250,0.28)',
  },
  audienceBadgeGlyph: {
    color: '#7CFFB2',
    fontSize: 13,
    fontWeight: '900' as any,
    marginRight: 5,
    marginTop: -1,
  },
  audienceBadgeText: {
    color: '#E6F8F1',
    fontSize: 11,
    fontWeight: '800' as any,
    letterSpacing: 0.2,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  location: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  moreButton: {
    padding: 6,
  },
  moreButtonSpacer: {
    width: 28,
  },
  imageContainer: {
    alignSelf: 'stretch',
    aspectRatio: 1,
    backgroundColor: colors.background.primary,
    position: 'relative',
  },
  
  imageInset: {
    marginHorizontal: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  imageFullscreen: {
    alignSelf: 'center',
    width: '92%',
    borderRadius: 18,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  doubleTapHeart: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -60,
    marginLeft: -60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF2D55',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  doubleTapRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 120,
    height: 120,
    marginTop: -60,
    marginLeft: -60,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#FF2D55',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  actionsFullscreen: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  actionCount: {
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: 1,
    fontWeight: '500' as any,
  },
  actionButton: {
    padding: 0,
    marginRight: 0,
  },
  actionButtonRight: {
    padding: 0,
    marginRight: 0,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  likedByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  likedByTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
  },
  likedByLabel: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500' as any,
    marginRight: 6,
  },
  likedByPrimaryName: {
    fontSize: 13,
    color: '#F5F5F5',
    fontWeight: '600' as any,
    marginRight: 4,
  },
  likedByOthersText: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500' as any,
  },
  likedByAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  likedByAvatarWrap: {
    marginLeft: 0,
  },
  likedByAvatarOverlay: {
    marginLeft: -10,
  },
  likedByAvatar: {
    borderWidth: 1.5,
    borderColor: colors.background.primary,
  },
  captionContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  caption: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 19,
    fontWeight: '400' as any,
  },
  captionMore: {
    color: '#A8A8A8',
    fontWeight: '500' as any,
  },
  captionToggleButton: {
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  tagChip: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagChipMuted: {
    opacity: 0.7,
  },
  tagChipText: {
    color: '#DCE7FF',
    fontSize: 12,
    fontWeight: '600' as any,
  },
  commentsContainer: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  viewComments: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  timeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  time: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  latestCommentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  latestCommentText: {
    fontSize: 14,
    color: '#E2E8F0',
  },
  latestCommentUser: {
    fontWeight: '500' as any,
    color: '#F5F5F5',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: colors.border.subtle,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#555555',
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 12,
    alignSelf: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuItemDanger: {
    justifyContent: 'flex-start',
  },
  menuIcon: {
    marginRight: 14,
  },
  menuText: {
    fontSize: 15,
    color: '#F5F5F5',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 8,
    marginHorizontal: 20,
  },
  menuTextDanger: {
    color: '#ef4444',
  },
});

