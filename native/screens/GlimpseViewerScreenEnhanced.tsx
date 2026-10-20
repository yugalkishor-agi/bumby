import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator, Alert, Share, Animated, StatusBar, Modal, KeyboardAvoidingView, TextInput, Platform, LayoutChangeEvent, Easing } from 'react-native';
import { PanGestureHandler, State, TapGestureHandler, LongPressGestureHandler } from 'react-native-gesture-handler';
import { Audio, Video, ResizeMode } from 'expo-av';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../components/ui/Avatar';
import { colors } from '../styles/theme';
import type { Glimpse } from '../types/database';
import { getGlimpseStylePreset, type GlimpseEditorMeta } from '../utils/glimpseEditor';
import { useAuth } from '../contexts/AuthContext';
import { glimpseService } from '../services/glimpse.service';
import { reportService } from '../services/report.service';
import { userService } from '../services/user.service';
import { collectionService } from '../services/collection.service';
import { cacheIntegration } from '../services/cacheIntegration.service';
import { useComments } from '../hooks/usePost';
import { collection, getDocs, getDoc, query, limit, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useGlimpseViewerScreenEnhancedStore } from "./GlimpseViewerScreenEnhanced/useGlimpseViewerScreenEnhancedStore";
import { styles } from "./GlimpseViewerScreenEnhanced/styles";
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

const { width, height } = Dimensions.get('window');

let glimpseMusicAudioModeConfigured = false;
const ensureGlimpseMusicAudioMode = async () => {
  if (glimpseMusicAudioModeConfigured) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
  glimpseMusicAudioModeConfigured = true;
};

const extractMediaDimensions = (item: any): { width: number; height: number } | null => {
  const candidates = [
    { width: Number(item?.width), height: Number(item?.height) },
    { width: Number(item?.mediaWidth), height: Number(item?.mediaHeight) },
    { width: Number(item?.videoWidth), height: Number(item?.videoHeight) },
    { width: Number(item?.originalWidth), height: Number(item?.originalHeight) },
  ];

  for (const candidate of candidates) {
    if (candidate.width > 0 && candidate.height > 0) return candidate;
  }

  return null;
};

const normalizeGlimpse = (g: any): Glimpse | null => {
  if (!g) return null;
  const id = g.glimpseId || g.storyId || g.postId || g.id;
  const mediaCandidates = [
    g.mediaURL,
    g.mediaUrl,
    ...(Array.isArray(g.mediaURLs) ? g.mediaURLs : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const inferredVideo = mediaCandidates.find((value) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(value));
  const inferredImage = mediaCandidates.find((value) => !/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(value));
  const isVideo = g.mediaType === 'video' || !!inferredVideo;
  const mediaURL = isVideo
    ? (inferredVideo || g.mediaURL || g.mediaUrl || mediaCandidates[0])
    : (inferredImage || g.mediaURL || g.mediaUrl || mediaCandidates[0]);
  if (!id || !mediaURL) return null;
  return {
    ...g,
    glimpseId: id,
    storyId: id,
    mediaURL,
    mediaType: isVideo ? 'video' : 'image',
    thumbnailURL: g.thumbnailURL || g.thumbnailUrl || g.coverImageURL || g.coverURL || g.posterURL,
    coverImageURL: g.coverImageURL || g.coverURL || g.thumbnailURL || g.posterURL,
    stats: {
      likesCount: g?.stats?.likesCount || g?.likesCount || 0,
      commentsCount: g?.stats?.commentsCount || g?.commentsCount || 0,
      sharesCount: g?.stats?.sharesCount || g?.sharesCount || 0,
      viewsCount: g?.stats?.viewsCount || g?.viewsCount || 0,
    },
  } as Glimpse;
};

export default function GlimpseViewerScreenEnhanced() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const glimpseId = (route.params as any)?.glimpseId || (route.params as any)?.id;
  const initialGlimpsesRaw = Array.isArray((route.params as any)?.glimpses)
    ? (route.params as any)?.glimpses
    : [];
  const initialGlimpses = initialGlimpsesRaw
    .map((g: any) => normalizeGlimpse(g))
    .filter(Boolean) as Glimpse[];
  const initialIndexRaw = Number((route.params as any)?.index || 0);
  const initialIndex = Math.max(
    0,
    Math.min(initialIndexRaw, Math.max(0, initialGlimpses.length - 1))
  );
  const hasExplicitSeed = Boolean(glimpseId || initialGlimpses.length);
  const canGoBack = () => {
    const nav = navigation as any;
    return typeof nav?.canGoBack === 'function' ? nav.canGoBack() : true;
  };

  // State
  const glimpses = useGlimpseViewerScreenEnhancedStore(s => s.glimpses);
    const setGlimpses = useGlimpseViewerScreenEnhancedStore(s => s.setGlimpses);
  const currentIndex = useGlimpseViewerScreenEnhancedStore(s => s.currentIndex);
    const setCurrentIndex = useGlimpseViewerScreenEnhancedStore(s => s.setCurrentIndex);
  const loading = useGlimpseViewerScreenEnhancedStore(s => s.loading);
    const setLoading = useGlimpseViewerScreenEnhancedStore(s => s.setLoading);
  const paused = useGlimpseViewerScreenEnhancedStore(s => s.paused);
    const setPaused = useGlimpseViewerScreenEnhancedStore(s => s.setPaused);
  const muted = useGlimpseViewerScreenEnhancedStore(s => s.muted);
    const setMuted = useGlimpseViewerScreenEnhancedStore(s => s.setMuted);
  const liked = useGlimpseViewerScreenEnhancedStore(s => s.liked);
    const setLiked = useGlimpseViewerScreenEnhancedStore(s => s.setLiked);
  const saved = useGlimpseViewerScreenEnhancedStore(s => s.saved);
    const setSaved = useGlimpseViewerScreenEnhancedStore(s => s.setSaved);
  const commentCounts = useGlimpseViewerScreenEnhancedStore(s => s.commentCounts);
    const setCommentCounts = useGlimpseViewerScreenEnhancedStore(s => s.setCommentCounts);
  const videoProgress = useGlimpseViewerScreenEnhancedStore(s => s.videoProgress);
    const setVideoProgress = useGlimpseViewerScreenEnhancedStore(s => s.setVideoProgress);
  const buffering = useGlimpseViewerScreenEnhancedStore(s => s.buffering);
    const setBuffering = useGlimpseViewerScreenEnhancedStore(s => s.setBuffering);
  const mediaNaturalSizes = useGlimpseViewerScreenEnhancedStore(s => s.mediaNaturalSizes);
    const setMediaNaturalSizes = useGlimpseViewerScreenEnhancedStore(s => s.setMediaNaturalSizes);
  const followingAuthor = useGlimpseViewerScreenEnhancedStore(s => s.followingAuthor);
    const setFollowingAuthor = useGlimpseViewerScreenEnhancedStore(s => s.setFollowingAuthor);
  const showMenu = useGlimpseViewerScreenEnhancedStore(s => s.showMenu);
    const setShowMenu = useGlimpseViewerScreenEnhancedStore(s => s.setShowMenu);
  const editVisible = useGlimpseViewerScreenEnhancedStore(s => s.editVisible);
    const setEditVisible = useGlimpseViewerScreenEnhancedStore(s => s.setEditVisible);
  const editCaption = useGlimpseViewerScreenEnhancedStore(s => s.editCaption);
    const setEditCaption = useGlimpseViewerScreenEnhancedStore(s => s.setEditCaption);
  const menuActionLoading = useGlimpseViewerScreenEnhancedStore(s => s.menuActionLoading);
    const setMenuActionLoading = useGlimpseViewerScreenEnhancedStore(s => s.setMenuActionLoading);
  const likedByFollowing = useGlimpseViewerScreenEnhancedStore(s => s.likedByFollowing);
    const setLikedByFollowing = useGlimpseViewerScreenEnhancedStore(s => s.setLikedByFollowing);
  const likedByFollowingCount = useGlimpseViewerScreenEnhancedStore(s => s.likedByFollowingCount);
    const setLikedByFollowingCount = useGlimpseViewerScreenEnhancedStore(s => s.setLikedByFollowingCount);
  const mutualBy = useGlimpseViewerScreenEnhancedStore(s => s.mutualBy);
    const setMutualBy = useGlimpseViewerScreenEnhancedStore(s => s.setMutualBy);
  const followingIds = useGlimpseViewerScreenEnhancedStore(s => s.followingIds);
    const setFollowingIds = useGlimpseViewerScreenEnhancedStore(s => s.setFollowingIds);
  const captionExpanded = useGlimpseViewerScreenEnhancedStore(s => s.captionExpanded);
    const setCaptionExpanded = useGlimpseViewerScreenEnhancedStore(s => s.setCaptionExpanded);
  const followActionLoading = useGlimpseViewerScreenEnhancedStore(s => s.followActionLoading);
    const setFollowActionLoading = useGlimpseViewerScreenEnhancedStore(s => s.setFollowActionLoading);
  const tapFeedbackIcon = useGlimpseViewerScreenEnhancedStore(s => s.tapFeedbackIcon);
    const setTapFeedbackIcon = useGlimpseViewerScreenEnhancedStore(s => s.setTapFeedbackIcon);
  const showCommentsSheet = useGlimpseViewerScreenEnhancedStore(s => s.showCommentsSheet);
    const setShowCommentsSheet = useGlimpseViewerScreenEnhancedStore(s => s.setShowCommentsSheet);
  const commentsTargetId = useGlimpseViewerScreenEnhancedStore(s => s.commentsTargetId);
    const setCommentsTargetId = useGlimpseViewerScreenEnhancedStore(s => s.setCommentsTargetId);
  const commentText = useGlimpseViewerScreenEnhancedStore(s => s.commentText);
    const setCommentText = useGlimpseViewerScreenEnhancedStore(s => s.setCommentText);
  const submittingComment = useGlimpseViewerScreenEnhancedStore(s => s.submittingComment);
    const setSubmittingComment = useGlimpseViewerScreenEnhancedStore(s => s.setSubmittingComment);
  const replyingToComment = useGlimpseViewerScreenEnhancedStore(s => s.replyingToComment);
    const setReplyingToComment = useGlimpseViewerScreenEnhancedStore(s => s.setReplyingToComment);
  const expandedCommentThreads = useGlimpseViewerScreenEnhancedStore(s => s.expandedCommentThreads);
    const setExpandedCommentThreads = useGlimpseViewerScreenEnhancedStore(s => s.setExpandedCommentThreads);

  // Refs
  const videoRefs = useRef<Map<number, Video>>(new Map());
  const voiceSoundRefs = useRef<Map<string, Audio.Sound>>(new Map());
  const backgroundMusicSoundRef = useRef<Audio.Sound | null>(null);
  const pendingVoiceRefs = useRef<Set<string>>(new Set());
  const panY = useRef(new Animated.Value(0)).current;
  const swipeAnimatingRef = useRef(false);
  const interactionHydrationTokenRef = useRef(0);
  const currentStatusRequestRef = useRef(0);
  const likeMutationVersionRef = useRef<Record<string, number>>({});
  const likedRef = useRef<Record<string, boolean>>({});
  const savedRef = useRef<Record<string, boolean>>({});
  const commentsSheetTranslateY = useRef(new Animated.Value(height)).current;
  const doubleTapRef = useRef<any>(null);
  const heartScale = useRef(new Animated.Value(0.6)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const tapFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const timelineProgress = useRef(new Animated.Value(0)).current;
  const timelineWidthRef = useRef(width);
  const isScrubbingRef = useRef(false);
  const scrubProgressRef = useRef<number | null>(null);
  const playbackMetaRef = useRef<Record<string, { positionMillis: number; durationMillis: number }>>({});
  const lastScrubSeekAtRef = useRef(0);
  const lastTimelineRatioRef = useRef(0);
  const scrubSeekInFlightRef = useRef(false);
  const actionPressScale = useRef({
    like: new Animated.Value(1),
    comment: new Animated.Value(1),
    share: new Animated.Value(1),
    save: new Animated.Value(1),
  }).current;
  const actionEntrance = useRef({
    like: new Animated.Value(0),
    comment: new Animated.Value(0),
    share: new Animated.Value(0),
    save: new Animated.Value(0),
  }).current;
  const viewedBySessionRef = useRef<Set<string>>(new Set());
  const {
    comments: sheetComments,
    loading: commentsLoading,
    addComment: addSheetComment,
    likeComment: likeSheetComment,
    unlikeComment: unlikeSheetComment,
    deleteComment: deleteSheetComment,
  } = useComments(commentsTargetId, 'glimpses');

  const pauseAllVideos = useCallback(async () => {
    const players = Array.from(videoRefs.current.values()) as any[];
    await Promise.all(players.map(async (player) => {
      try {
        if (typeof player?.pauseAsync === 'function') {
          await player.pauseAsync();
        }
      } catch {}
    }));
  }, []);

  const resumeCurrentVideo = useCallback(async () => {
    const current = glimpses[currentIndex];
    if (!current || current.mediaType !== 'video') return;
    const player = videoRefs.current.get(currentIndex) as any;
    if (!player || typeof player?.playAsync !== 'function') return;
    try {
      await player.playAsync();
    } catch {}
  }, [currentIndex, glimpses]);


  const stopBackgroundMusic = useCallback(async () => {
    const sound = backgroundMusicSoundRef.current;
    backgroundMusicSoundRef.current = null;
    if (!sound) return;
    try { await sound.stopAsync(); } catch {}
    try { await sound.unloadAsync(); } catch {}
  }, []);

  const seedInteractionFromGlimpses = useCallback((items: Glimpse[]) => {
    if (!Array.isArray(items) || items.length === 0) return;

    setLiked((prev) => {
      let changed = false;
      const next = { ...prev };
      items.forEach((item) => {
        if (!item?.glimpseId || typeof item?.isLiked !== 'boolean') return;
        if (next[item.glimpseId] === undefined) {
          next[item.glimpseId] = item.isLiked;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSaved((prev) => {
      let changed = false;
      const next = { ...prev };
      items.forEach((item) => {
        if (!item?.glimpseId || typeof item?.isSaved !== 'boolean') return;
        if (next[item.glimpseId] === undefined) {
          next[item.glimpseId] = item.isSaved;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const currentBackgroundMusic = glimpses[currentIndex]?.backgroundMusic;
  const currentBackgroundMusicStream = currentBackgroundMusic?.streamURL || '';
  const currentBackgroundMusicStartMs = Math.max(0, Math.floor(Number(currentBackgroundMusic?.clipStart || 0) * 1000));
  const currentBackgroundMusicEndMs = Math.max(currentBackgroundMusicStartMs, Math.floor(Number(currentBackgroundMusic?.clipEnd || 0) * 1000));

  useEffect(() => {
    if (!currentBackgroundMusicStream || muted || paused) {
      void stopBackgroundMusic();
      return;
    }

    let cancelled = false;
    const loopStartMs = currentBackgroundMusicStartMs;
    const loopEndMs = currentBackgroundMusicEndMs > currentBackgroundMusicStartMs ? currentBackgroundMusicEndMs : 0;

    const loadMusic = async () => {
      try {
        await ensureGlimpseMusicAudioMode();
        await stopBackgroundMusic();
        const { sound } = await Audio.Sound.createAsync(
          { uri: currentBackgroundMusicStream },
          {
            shouldPlay: true,
            isLooping: false,
            volume: 1,
            rate: 1,
            shouldCorrectPitch: true,
            positionMillis: loopStartMs,
          }
        );

        if (cancelled) {
          await sound.unloadAsync();
          return;
        }

        backgroundMusicSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (!status?.isLoaded) return;
          if (loopEndMs > loopStartMs && typeof status.positionMillis === 'number' && status.positionMillis >= loopEndMs - 120) {
            void sound.setPositionAsync(loopStartMs).then(() => sound.playAsync()).catch(() => undefined);
            return;
          }
          if (status.didJustFinish) {
            void sound.setPositionAsync(loopStartMs).then(() => sound.playAsync()).catch(() => undefined);
          }
        });
      } catch (error) {
        console.error('Glimpse music playback failed:', error);
      }
    };

    void loadMusic();

    return () => {
      cancelled = true;
      void stopBackgroundMusic();
    };
  }, [currentBackgroundMusicEndMs, currentBackgroundMusicStartMs, currentBackgroundMusicStream, muted, paused, stopBackgroundMusic]);
  // Load glimpses if not provided
  useEffect(() => {
    if (!glimpses.length) {
      loadGlimpse();
    }
  }, [glimpseId, glimpses.length]);

  useEffect(() => {
    const hydrateSelectedGlimpse = async () => {
      if (!glimpseId || !glimpses.length) return;

      try {
        const fetched = await glimpseService.getGlimpse(glimpseId, user?.userId);
        const normalized = normalizeGlimpse(fetched);
        if (!normalized) return;

        setGlimpses((prev) => {
          const index = prev.findIndex((g) => g.glimpseId === normalized.glimpseId);
          if (index < 0) return prev;

          const next = [...prev];
          next[index] = {
            ...next[index],
            ...normalized,
            stats: { ...next[index].stats, ...normalized.stats },
          };
          return next;
        });
      } catch {}
    };

    void hydrateSelectedGlimpse();
    }, [glimpseId, glimpses.length]);

  useEffect(() => {
    if (!glimpseId || !glimpses.length) return;
    const targetIndex = glimpses.findIndex((entry) => entry.glimpseId === glimpseId || (entry as any)?.storyId === glimpseId);
    if (targetIndex >= 0 && targetIndex !== currentIndex) {
      setCurrentIndex(targetIndex);
    }
  }, [glimpseId, glimpses, currentIndex]);

  // Initialize interaction states
  useEffect(() => {
    likedRef.current = liked;
  }, [liked]);

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  useEffect(() => {
    if (glimpses.length === 0 || !user?.userId) return;
    seedInteractionFromGlimpses(glimpses);
    void initializeInteractionStates();
  }, [glimpses, user?.userId, seedInteractionFromGlimpses]);

  useEffect(() => {
    const current = glimpses[currentIndex];
    if (!current?.glimpseId || !user?.userId) return;

    const currentId = current.glimpseId;
    const seededLiked = typeof current?.isLiked === 'boolean' ? !!current.isLiked : null;
    const seededSaved = typeof current?.isSaved === 'boolean' ? !!current.isSaved : null;

    if (seededLiked !== null && typeof likedRef.current[currentId] !== 'boolean') {
      setLiked((prev) => ({ ...prev, [currentId]: seededLiked }));
    }
    if (seededSaved !== null && typeof savedRef.current[currentId] !== 'boolean') {
      setSaved((prev) => ({ ...prev, [currentId]: seededSaved }));
    }

    const needsLiked = typeof likedRef.current[currentId] !== 'boolean';
    const needsSaved = typeof savedRef.current[currentId] !== 'boolean';
    if (!needsLiked && !needsSaved) return;

    const requestId = ++currentStatusRequestRef.current;
    const likeVersionAtStart = likeMutationVersionRef.current[currentId] || 0;
    let cancelled = false;

    (async () => {
      try {
        const [resolvedLiked, resolvedSaved] = await Promise.all([
          needsLiked ? glimpseService.isGlimpseLiked(currentId, user.userId) : Promise.resolve(likedRef.current[currentId]),
          needsSaved ? glimpseService.isGlimpseSaved(currentId, user.userId) : Promise.resolve(savedRef.current[currentId]),
        ]);

        if (cancelled) return;
        if (requestId !== currentStatusRequestRef.current) return;
        if ((likeMutationVersionRef.current[currentId] || 0) !== likeVersionAtStart) return;

        if (needsLiked) {
          setLiked((prev) => ({ ...prev, [currentId]: !!resolvedLiked }));
        }
        if (needsSaved) {
          setSaved((prev) => ({ ...prev, [currentId]: !!resolvedSaved }));
        }
      } catch (error) {
        console.error('Failed to hydrate current glimpse interaction state:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, glimpses, user?.userId]);

  // Prefetch next image on index change
  useEffect(() => {
    const next = glimpses[currentIndex + 1];
    if (next && next.mediaType === 'image' && next.mediaURL) {
      Image.prefetch(next.mediaURL).catch(() => {});
    }
  }, [currentIndex, glimpses]);

  // Focus effect for video playback + full-screen UI
  useFocusEffect(
    useCallback(() => {
      setPaused(false);
      StatusBar.setHidden(true, 'fade');
      const parent = (navigation as any)?.getParent?.();
      parent?.setOptions?.({ tabBarStyle: { display: 'none' } });
      const resumeTimer = setTimeout(() => {
        void resumeCurrentVideo();
      }, 80);
      return () => {
        clearTimeout(resumeTimer);
        setPaused(true);
        void pauseAllVideos();
        StatusBar.setHidden(false, 'fade');
        parent?.setOptions?.({ tabBarStyle: undefined });
      };
    }, [navigation, pauseAllVideos, resumeCurrentVideo])
  );

  useEffect(() => {
    return () => {
      void pauseAllVideos();
      void stopBackgroundMusic();
    };
  }, [pauseAllVideos, stopBackgroundMusic]);

  useEffect(() => {
    actionEntrance.like.setValue(0);
    actionEntrance.comment.setValue(0);
    actionEntrance.share.setValue(0);
    actionEntrance.save.setValue(0);
    Animated.stagger(55, [
      Animated.timing(actionEntrance.like, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(actionEntrance.comment, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(actionEntrance.share, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(actionEntrance.save, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [currentIndex]);

  const animateActionPress = useCallback(
    (action: 'like' | 'comment' | 'share' | 'save', fn: () => void) => {
      const scale = actionPressScale[action];
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.88, duration: 65, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 190, useNativeDriver: true }),
      ]).start();
      fn();
    },
    [actionPressScale]
  );

  // Load following IDs for follow state + social proof
  useEffect(() => {
    const loadFollowing = async () => {
      if (!user?.userId) {
        setFollowingIds(new Set());
        return;
      }
      try {
        const ids = await userService.getFollowing(user.userId);
        setFollowingIds(new Set(ids || []));
      } catch {
        setFollowingIds(new Set());
      }
    };
    loadFollowing();
  }, [user?.userId]);

  const triggerHeartBurst = useCallback(() => {
    heartScale.setValue(0.6);
    heartOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(heartOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1.12, friction: 5, tension: 140, useNativeDriver: true }),
      ]),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(heartOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 0.85, duration: 220, useNativeDriver: true }),
      ]),
    ]).start();
  }, [heartOpacity, heartScale]);

  const showMuteToggleFeedback = useCallback((nextMuted: boolean) => {
    setTapFeedbackIcon(nextMuted ? 'volume-mute' : 'volume-high');
    tapFeedbackOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(tapFeedbackOpacity, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.delay(260),
      Animated.timing(tapFeedbackOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setTapFeedbackIcon(null));
  }, [tapFeedbackOpacity]);

  const loadLikedByFollowing = useCallback(
    async (targetGlimpseId: string) => {
      if (!user?.userId || !targetGlimpseId) {
        setLikedByFollowing([]);
        setLikedByFollowingCount(0);
        return;
      }
      try {
        const likesRef = collection(db, 'glimpses', targetGlimpseId, 'likes');
        const likesSnap = await getDocs(query(likesRef, limit(120)));
        const followingLikedIds = likesSnap.docs
          .map((d) => d.id)
          .filter((id) => id !== user.userId && followingIds.has(id));

        setLikedByFollowingCount(followingLikedIds.length);
        if (followingLikedIds.length === 0) {
          setLikedByFollowing([]);
          return;
        }

        const previewUsers = await Promise.all(
          followingLikedIds.slice(0, 3).map((id) => userService.getUser(id))
        );

        setLikedByFollowing(
          previewUsers
            .filter(Boolean)
            .map((u: any) => ({
              userId: u.userId,
              username: u.username,
              avatarURL: u.avatarURL,
            }))
        );
      } catch {
        setLikedByFollowing([]);
        setLikedByFollowingCount(0);
      }
    },
    [followingIds, user?.userId]
  );

  useEffect(() => {
    const current = glimpses[currentIndex];
    if (!current || !user?.userId) return;

    const isOwn = current.authorId === user.userId;
    setFollowingAuthor(isOwn || followingIds.has(current.authorId));
    setCaptionExpanded(false);
    loadLikedByFollowing(current.glimpseId);
  }, [currentIndex, glimpses, user?.userId, followingIds, loadLikedByFollowing]);

  useEffect(() => {
    const current = glimpses[currentIndex];
    if (!current || !user?.userId) return;
    if (current.authorId === user.userId) return;

    const key = `${current.glimpseId}:${user.userId}`;
    if (viewedBySessionRef.current.has(key)) return;
    viewedBySessionRef.current.add(key);

    let cancelled = false;
    const markViewed = async () => {
      try {
        const counted = await glimpseService.incrementViewCount(current.glimpseId, user.userId);
        if (!counted || cancelled) return;

        setGlimpses((prev) =>
          prev.map((g) => {
            if (g.glimpseId !== current.glimpseId) return g;
            const currentViews = Math.max(0, Number(g?.stats?.viewsCount ?? (g as any)?.viewsCount ?? 0) || 0);
            return {
              ...g,
              viewsCount: currentViews + 1,
              stats: {
                ...g.stats,
                viewsCount: currentViews + 1,
              },
            };
          })
        );
      } catch (error) {
        viewedBySessionRef.current.delete(key);
        console.error('Failed to increment glimpse view count:', error);
      }
    };

    void markViewed();
    return () => {
      cancelled = true;
    };
  }, [currentIndex, glimpses, user?.userId]);

  useEffect(() => {
    if (!showCommentsSheet || !commentsTargetId) return;
    const totalComments = sheetComments.length;
    setCommentCounts((prev) => ({ ...prev, [commentsTargetId]: totalComments }));
    setGlimpses((prev) =>
      prev.map((g) =>
        g.glimpseId === commentsTargetId
          ? { ...g, stats: { ...g.stats, commentsCount: totalComments } }
          : g
      )
    );
  }, [sheetComments, commentsTargetId, showCommentsSheet]);

  useEffect(() => {
    if (!showCommentsSheet) {
      commentsSheetTranslateY.setValue(height);
      return;
    }
    Animated.timing(commentsSheetTranslateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showCommentsSheet, commentsSheetTranslateY]);

  const loadGlimpse = async () => {
    try {
      const shouldShowLoader = glimpses.length === 0;
      if (shouldShowLoader) setLoading(true);

      // Context feed (shared across all entry points, including tab-open)
      const { glimpses: feed } = await glimpseService.getAllGlimpses(40, undefined, user?.userId);
      const normalizedFeed = (feed || [])
        .map((g: any) => normalizeGlimpse(g))
        .filter(Boolean) as Glimpse[];

      // Tab mode: no explicit glimpse selected, just start from feed
      if (!glimpseId) {
        seedInteractionFromGlimpses(normalizedFeed);
        setGlimpses(normalizedFeed);
        setCurrentIndex(0);
        return;
      }

      // Detail mode: open selected glimpse with feed context
      const fetched = await glimpseService.getGlimpse(glimpseId, user?.userId);
      const selected = normalizeGlimpse(fetched);

      let merged = normalizedFeed;
      if (selected && !normalizedFeed.some((g) => g.glimpseId === selected.glimpseId)) {
        merged = [selected, ...normalizedFeed];
      }
      seedInteractionFromGlimpses(merged);

      if (selected) {
        const selectedIndex = merged.findIndex((g) => g.glimpseId === selected.glimpseId);
        setGlimpses(merged);
        setCurrentIndex(selectedIndex >= 0 ? selectedIndex : 0);
      } else {
        setGlimpses(merged);
        setCurrentIndex(0);
      }
    } catch (error) {
      console.error('Failed to load glimpse:', error);
      Alert.alert('Error', 'Failed to load glimpse');
    } finally {
      setLoading(false);
    }
  };

  const initializeInteractionStates = async () => {
    if (!user?.userId || glimpses.length === 0) return;

    const targetIds = glimpses
      .map((item) => item?.glimpseId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter((id) => liked[id] === undefined || saved[id] === undefined);

    if (targetIds.length === 0) return;

    const token = interactionHydrationTokenRef.current + 1;
    interactionHydrationTokenRef.current = token;

    const resolved = await Promise.all(
      targetIds.map(async (targetId) => {
        try {
          const [isLiked, isSaved] = await Promise.all([
            liked[targetId] === undefined
              ? glimpseService.isGlimpseLiked(targetId, user.userId)
              : Promise.resolve(liked[targetId]),
            saved[targetId] === undefined
              ? glimpseService.isGlimpseSaved(targetId, user.userId)
              : Promise.resolve(saved[targetId]),
          ]);
          return { targetId, isLiked, isSaved };
        } catch (error) {
          console.error('Failed to check interaction state:', error);
          return null;
        }
      })
    );

    if (token !== interactionHydrationTokenRef.current) return;

    setLiked((prev) => {
      let changed = false;
      const next = { ...prev };
      resolved.forEach((entry) => {
        if (!entry) return;
        if (next[entry.targetId] !== entry.isLiked) {
          next[entry.targetId] = entry.isLiked;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSaved((prev) => {
      let changed = false;
      const next = { ...prev };
      resolved.forEach((entry) => {
        if (!entry) return;
        if (next[entry.targetId] !== entry.isSaved) {
          next[entry.targetId] = entry.isSaved;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const animateToIndex = useCallback(
    (direction: 'next' | 'prev') => {
      if (swipeAnimatingRef.current) return;

      const canGoNext = direction === 'next' && currentIndex < glimpses.length - 1;
      const canGoPrev = direction === 'prev' && currentIndex > 0;
      if (!canGoNext && !canGoPrev) {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        return;
      }

      swipeAnimatingRef.current = true;
      const outY = direction === 'next' ? -height : height;
      const inStartY = direction === 'next' ? height : -height;

      Animated.timing(panY, {
        toValue: outY,
        duration: 170,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) =>
          direction === 'next'
            ? Math.min(prev + 1, glimpses.length - 1)
            : Math.max(prev - 1, 0)
        );
        panY.setValue(inStartY);
        Animated.timing(panY, {
          toValue: 0,
          duration: 190,
          useNativeDriver: true,
        }).start(() => {
          swipeAnimatingRef.current = false;
        });
      });
    },
    [currentIndex, glimpses.length, panY]
  );

  const handlePanGesture = ({ nativeEvent }: any) => {
    if (swipeAnimatingRef.current || showCommentsSheet) return;
    const { translationX = 0, translationY = 0, velocityY = 0, state } = nativeEvent;

    if (state === State.ACTIVE) {
      // Reels-like direct drag feedback.
      const drag = Math.max(-height * 0.22, Math.min(height * 0.22, translationY));
      panY.setValue(drag);
      return;
    }

    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const verticalIntent = Math.abs(translationY) > Math.abs(translationX);
      const movedEnough = Math.abs(translationY) > 72 || Math.abs(velocityY) > 900;

      if (verticalIntent && movedEnough) {
        if (translationY < 0 && currentIndex < glimpses.length - 1) {
          animateToIndex('next');
          return;
        } else if (translationY > 0 && currentIndex > 0) {
          animateToIndex('prev');
          return;
        }
      }

      Animated.spring(panY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleTap = () => {
    setMuted((prev) => {
      const next = !prev;
      showMuteToggleFeedback(next);
      return next;
    });
  };

  const handleDoubleTap = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user) return;

    triggerHeartBurst();
    const isCurrentlyLiked = liked[currentGlimpse.glimpseId];
    if (isCurrentlyLiked) return;

    likeMutationVersionRef.current[currentGlimpse.glimpseId] = (likeMutationVersionRef.current[currentGlimpse.glimpseId] || 0) + 1;

    try {
      await glimpseService.likeGlimpse(currentGlimpse.glimpseId, user.userId);

      setLiked((prev) => ({
        ...prev,
        [currentGlimpse.glimpseId]: true,
      }));

      setGlimpses((prev) => prev.map((g) =>
        g.glimpseId === currentGlimpse.glimpseId
          ? {
              ...g,
              isLiked: true,
              stats: {
                ...g.stats,
                likesCount: Math.max(0, (g.stats?.likesCount || 0) + 1),
              },
            }
          : g
      ));
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  const handleLike = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user) return;

    const isCurrentlyLiked = liked[currentGlimpse.glimpseId];
    likeMutationVersionRef.current[currentGlimpse.glimpseId] = (likeMutationVersionRef.current[currentGlimpse.glimpseId] || 0) + 1;

    try {
      if (isCurrentlyLiked) {
        await glimpseService.unlikeGlimpse(currentGlimpse.glimpseId, user.userId);
      } else {
        await glimpseService.likeGlimpse(currentGlimpse.glimpseId, user.userId);
        triggerHeartBurst();
      }

      setLiked((prev) => ({ ...prev, [currentGlimpse.glimpseId]: !isCurrentlyLiked }));
      setGlimpses((prev) =>
        prev.map((g) =>
          g.glimpseId === currentGlimpse.glimpseId
            ? {
                ...g,
                isLiked: !isCurrentlyLiked,
                stats: {
                  ...g.stats,
                  likesCount: Math.max(0, (g.stats?.likesCount || 0) + (isCurrentlyLiked ? -1 : 1)),
                },
              }
            : g
        )
      );
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };
const handleComment = () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    if (currentGlimpse.allowReplies === false || currentGlimpse.settings?.allowComments === false) {
      Alert.alert('Comments off', 'Comments are turned off for this glimpse.');
      return;
    }

    setCommentsTargetId(currentGlimpse.glimpseId);
    setCommentText('');
    setReplyingToComment(null);
    setExpandedCommentThreads(new Set());
    setShowCommentsSheet(true);
  };

  const closeCommentsSheet = useCallback(() => {
    Animated.timing(commentsSheetTranslateY, {
      toValue: height,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowCommentsSheet(false);
      setReplyingToComment(null);
    });
  }, [commentsSheetTranslateY]);

  const getRepliesForComment = useCallback(
    (commentId: string) => sheetComments.filter((c: any) => c.parentCommentId === commentId),
    [sheetComments]
  );

  const toggleCommentReplies = useCallback((commentId: string) => {
    setExpandedCommentThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }, []);

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !commentsTargetId || submittingComment) return;
    setSubmittingComment(true);
    try {
      await addSheetComment(commentText.trim(), replyingToComment?.commentId);
      setCommentText('');
      setReplyingToComment(null);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleLikeSheetComment = async (comment: any) => {
    const currentGlimpse = glimpses[currentIndex];
    const isLiked = !!comment.isLiked || (comment.likedBy?.includes(user?.userId || '') ?? false);
    if (isLiked) await unlikeSheetComment(comment.commentId, currentGlimpse?.authorId);
    else await likeSheetComment(comment.commentId, currentGlimpse?.authorId);
  };

  const handleDeleteSheetComment = async (commentId: string) => {
    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSheetComment(commentId);
          } catch {
            Alert.alert('Error', 'Failed to delete comment');
          }
        },
      },
    ]);
  };

  const handleReportSheetComment = async (comment: any) => {
    if (!user || !commentsTargetId) return;
    try {
      const reportRef = doc(collection(db, 'commentReports'));
      await setDoc(reportRef, {
        postId: commentsTargetId,
        commentId: comment.commentId,
        commentAuthorId: comment.authorId,
        reporterId: user.userId,
        parentCommentId: comment.parentCommentId || null,
        text: comment.text || '',
        source: 'glimpse',
        createdAt: serverTimestamp(),
        status: 'pending',
      });
      Alert.alert('Reported', 'Thanks. We will review this comment.');
    } catch {
      Alert.alert('Error', 'Failed to report comment');
    }
  };

  const renderSheetComment = (comment: any, isReply: boolean = false): React.ReactElement => {
    const currentGlimpse = glimpses[currentIndex];
    const replies = getRepliesForComment(comment.commentId);
    const isExpanded = expandedCommentThreads.has(comment.commentId);
    const isLiked = !!comment.isLiked || (comment.likedBy?.includes(user?.userId || '') ?? false);
    const canDelete =
      comment.authorId === user?.userId ||
      (currentGlimpse?.authorId != null && currentGlimpse.authorId === user?.userId);

    return (
      <View key={comment.commentId} style={[styles.sheetCommentContainer, isReply && styles.sheetReplyContainer]}>
        <Avatar source={comment.authorAvatarURL} size={isReply ? 30 : 34} />
        <View style={styles.sheetCommentBody}>
          <View style={styles.sheetCommentHeader}>
            <Text style={styles.sheetCommentUsername}>{comment.authorUsername}</Text>
            <Text style={styles.sheetCommentTime}>{formatTimeAgo(comment.createdAt)}</Text>
          </View>
          <Text style={styles.sheetCommentText}>{comment.text}</Text>

          <View style={styles.sheetCommentActions}>
            <TouchableOpacity style={styles.sheetActionButton} onPress={() => handleLikeSheetComment(comment)}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={15} color={isLiked ? '#ef4444' : '#9ca3af'} />
              {!!comment.likesCount && <Text style={styles.sheetActionText}>{comment.likesCount}</Text>}
            </TouchableOpacity>
            {!isReply && (
              <TouchableOpacity
                style={styles.sheetActionButton}
                onPress={() => {
                  setReplyingToComment({ username: comment.authorUsername, commentId: comment.commentId });
                  setCommentText(`@${comment.authorUsername} `);
                }}
              >
                <Text style={styles.sheetActionText}>Reply</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetActionButton} onPress={() => handleReportSheetComment(comment)}>
              <Text style={[styles.sheetActionText, styles.sheetReportText]}>Report</Text>
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity style={styles.sheetActionButton} onPress={() => handleDeleteSheetComment(comment.commentId)}>
                <Ionicons name="trash-outline" size={15} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>

          {!isReply && replies.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.sheetRepliesToggle}
                onPress={() => toggleCommentReplies(comment.commentId)}
              >
                <View style={styles.sheetRepliesLine} />
                <Text style={styles.sheetRepliesToggleText}>
                  {isExpanded ? 'Hide replies' : `(${replies.length}) View replies`}
                </Text>
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.sheetRepliesWrap}>
                  {replies.map((r: any) => renderSheetComment(r, true))}
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  const handleExternalShare = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    if (currentGlimpse.allowSharing === false) {
      Alert.alert('Sharing off', 'Resharing is turned off for this glimpse.');
      return;
    }

    try {
      await Share.share({
        message: `Check out this glimpse by ${currentGlimpse.authorUsername}`,
        url: `https://iris.app/glimpse/${currentGlimpse.glimpseId}`,
      });
    } catch (error) {
      console.error('Failed to share glimpse externally:', error);
    }
  };

  const handleShare = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    if (currentGlimpse.allowSharing === false) {
      Alert.alert('Sharing off', 'Resharing is turned off for this glimpse.');
      return;
    }

    (navigation as any).navigate('SharePost', {
      contentType: 'glimpse',
      contentData: {
        id: currentGlimpse.glimpseId,
        authorId: currentGlimpse.authorId,
        authorUsername: currentGlimpse.authorUsername,
        authorAvatarURL: currentGlimpse.authorAvatarURL,
        mediaURL: currentGlimpse.coverImageURL || currentGlimpse.mediaURL,
        caption: currentGlimpse.caption || '',
        mediaType: currentGlimpse.mediaType,
      },
      onShared: (count: number) => {
        if (!count || count <= 0) return;
        setGlimpses(prev => prev.map((g, idx) => (
          idx === currentIndex
            ? { ...g, stats: { ...g.stats, sharesCount: (g.stats?.sharesCount || 0) + count } }
            : g
        )));
      },
    });
  };

  const handleSave = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user) return;

    const isCurrentlySaved = saved[currentGlimpse.glimpseId];
    
    try {
      if (isCurrentlySaved) {
        await glimpseService.unsaveGlimpse(currentGlimpse.glimpseId, user.userId);
        await unsaveGlimpseFromAllCollections(currentGlimpse.glimpseId);
      } else {
        const collections = await collectionService.getUserCollections(user.userId);
        if (collections.length === 0) {
          const createdId = await collectionService.createCollection(user.userId, 'Glimpses', false);
          await glimpseService.saveGlimpse(currentGlimpse.glimpseId, user.userId);
          await saveGlimpseInCollection(currentGlimpse.glimpseId, createdId);
        } else {
          Alert.alert(
            'Save To Playlist',
            'Choose playlist for this glimpse',
            [
              ...collections.slice(0, 4).map((c: any) => ({
                text: c.name,
                onPress: async () => {
                  try {
                    await glimpseService.saveGlimpse(currentGlimpse.glimpseId, user.userId);
                    await saveGlimpseInCollection(currentGlimpse.glimpseId, c.collectionId);
                    setSaved((prev) => ({ ...prev, [currentGlimpse.glimpseId]: true }));
                  } catch (e) {
                    console.error('Failed to save glimpse to playlist:', e);
                  }
                },
              })),
              {
                text: '+ New Playlist',
                onPress: async () => {
                  try {
                    const newId = await collectionService.createCollection(user.userId, 'My Glimpses', false);
                    await glimpseService.saveGlimpse(currentGlimpse.glimpseId, user.userId);
                    await saveGlimpseInCollection(currentGlimpse.glimpseId, newId);
                    setSaved((prev) => ({ ...prev, [currentGlimpse.glimpseId]: true }));
                  } catch (e) {
                    console.error('Failed to create playlist for glimpse:', e);
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
      }
      
      setSaved(prev => ({
        ...prev,
        [currentGlimpse.glimpseId]: !isCurrentlySaved
      }));
    } catch (error) {
      console.error('Failed to toggle save:', error);
    }
  };

  const openEditGlimpse = () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    setEditCaption(currentGlimpse.caption || '');
    setShowMenu(false);
    setEditVisible(true);
  };

  const handleSaveEditGlimpse = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    const nextCaption = editCaption.trim();
    setMenuActionLoading(true);
    try {
      await glimpseService.updateGlimpse(currentGlimpse.glimpseId, { caption: nextCaption });
      setGlimpses((prev) => prev.map((entry, index) => index === currentIndex ? { ...entry, caption: nextCaption } : entry));
      setEditVisible(false);
    } catch (error) {
      console.error('Failed to edit glimpse:', error);
    } finally {
      setMenuActionLoading(false);
    }
  };

  const handleDeleteGlimpse = () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user?.userId) return;
    Alert.alert('Delete glimpse', 'Are you sure you want to delete this glimpse?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setMenuActionLoading(true);
          try {
            await glimpseService.deleteGlimpse(currentGlimpse.glimpseId, user.userId);
            setShowMenu(false);
            const nextItems = glimpses.filter((_, index) => index !== currentIndex);
            setGlimpses(nextItems);
            if (nextItems.length === 0) {
              navigation.goBack();
            } else if (currentIndex >= nextItems.length) {
              setCurrentIndex(nextItems.length - 1);
            }
          } catch (error) {
            console.error('Failed to delete glimpse:', error);
          } finally {
            setMenuActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleReportGlimpse = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user?.userId) return;
    try {
      await reportService.reportGlimpse(
        currentGlimpse.glimpseId,
        currentGlimpse.authorId,
        user.userId,
        user.username || 'user',
        'other',
        'Something else'
      );
      Alert.alert('Report sent', 'Thanks for letting us know.');
      setShowMenu(false);
    } catch (error) {
      console.error('Failed to report glimpse:', error);
    }
  };

  const handleProfilePress = () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return;
    
    (navigation as any).navigate('UserProfile', {
      userId: currentGlimpse.authorId
    });
  };

  const handleFollowAuthor = async () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse || !user?.userId || followActionLoading) return;
    if (currentGlimpse.authorId === user.userId || followingAuthor) return;

    try {
      setFollowActionLoading(true);
      await userService.followUser(user.userId, currentGlimpse.authorId);
      setFollowingAuthor(true);
      setFollowingIds((prev) => new Set([...prev, currentGlimpse.authorId]));
    } catch (error) {
      console.error('Failed to follow author:', error);
    } finally {
      setFollowActionLoading(false);
    }
  };

  const saveGlimpseInCollection = async (glimpseToSaveId: string, collectionId: string) => {
    if (!user?.userId || !glimpseToSaveId || !collectionId) return;
    await collectionService.savePost(user.userId, glimpseToSaveId, collectionId, 'glimpse');
  };

  const unsaveGlimpseFromAllCollections = async (glimpseToUnsaveId: string) => {
    if (!user?.userId || !glimpseToUnsaveId) return;
    await collectionService.unsavePostFromAllCollections(user.userId, glimpseToUnsaveId, 'glimpse');
  };

  const stopVoiceSound = useCallback(async (segmentId: string) => {
    const sound = voiceSoundRefs.current.get(segmentId);
    voiceSoundRefs.current.delete(segmentId);
    pendingVoiceRefs.current.delete(segmentId);
    if (!sound) return;
    try { await sound.stopAsync(); } catch {}
    try { await sound.unloadAsync(); } catch {}
  }, []);

  const stopAllVoiceSounds = useCallback(async () => {
    const segmentIds = Array.from(voiceSoundRefs.current.keys());
    if (!segmentIds.length) return;
    await Promise.all(segmentIds.map((segmentId) => stopVoiceSound(segmentId)));
  }, [stopVoiceSound]);

  const syncVoiceoverPlayback = useCallback(async (glimpse: Glimpse | null | undefined, positionMillis: number, shouldPlay: boolean) => {
    if (!glimpse || glimpse.mediaType !== 'video') {
      await stopAllVoiceSounds();
      return;
    }

    const segments = glimpse.editorMeta?.voiceSegments || [];
    if (!shouldPlay || !segments.length) {
      await stopAllVoiceSounds();
      return;
    }

    const activeSegmentIds = new Set<string>();

    for (const segment of segments) {
      const startMs = Number(segment.startMs || 0);
      const durationMs = Math.max(0, Number(segment.durationMs || 0));
      const endMs = startMs + durationMs;
      const segmentActive = durationMs > 0 && positionMillis >= startMs && positionMillis <= endMs;
      if (!segmentActive) continue;
      activeSegmentIds.add(segment.id);
      if (voiceSoundRefs.current.has(segment.id) || pendingVoiceRefs.current.has(segment.id)) continue;

      pendingVoiceRefs.current.add(segment.id);
      try {
        const startOffset = Math.max(0, positionMillis - startMs);
        const { sound } = await Audio.Sound.createAsync(
          { uri: segment.uri },
          { shouldPlay: true, positionMillis: startOffset, volume: 1 }
        );
        voiceSoundRefs.current.set(segment.id, sound);
        sound.setOnPlaybackStatusUpdate((playbackStatus: any) => {
          if (!playbackStatus?.isLoaded || playbackStatus.didJustFinish) {
            void stopVoiceSound(segment.id);
          }
        });
      } catch {}
      finally {
        pendingVoiceRefs.current.delete(segment.id);
      }
    }

    const staleSegmentIds = Array.from(voiceSoundRefs.current.keys()).filter((segmentId) => !activeSegmentIds.has(segmentId));
    if (staleSegmentIds.length) {
      await Promise.all(staleSegmentIds.map((segmentId) => stopVoiceSound(segmentId)));
    }
  }, [stopAllVoiceSounds, stopVoiceSound]);

  const handlePlaybackStatusUpdate = (status: any, id: string) => {
    try {
      const activeGlimpse = glimpses.find((item) => item.glimpseId === id);
      const trimStartMs = Math.max(0, Number(activeGlimpse?.trimStart ?? activeGlimpse?.editorMeta?.trimStart ?? 0));
      const trimEndCandidate = Number(activeGlimpse?.trimEnd ?? activeGlimpse?.editorMeta?.trimEnd ?? 0);

      if (status && status.isLoaded && status.durationMillis) {
        const trimEndMs = trimEndCandidate > trimStartMs
          ? Math.min(status.durationMillis, trimEndCandidate)
          : status.durationMillis;
        const effectiveWindow = Math.max(1, trimEndMs - trimStartMs);
        const clampedPosition = Math.max(trimStartMs, Math.min(trimEndMs, status.positionMillis || 0));
        const ratio = Math.max(0, Math.min(1, (clampedPosition - trimStartMs) / effectiveWindow));

        playbackMetaRef.current[id] = {
          positionMillis: clampedPosition,
          durationMillis: effectiveWindow,
        };

        if (!isScrubbingRef.current && glimpses[currentIndex]?.glimpseId === id) {
          if (Math.abs(lastTimelineRatioRef.current - ratio) > 0.002) {
            lastTimelineRatioRef.current = ratio;
            timelineProgress.stopAnimation();
            Animated.timing(timelineProgress, {
              toValue: ratio,
              duration: 85,
              easing: Easing.linear,
              useNativeDriver: false,
            }).start();
          }
        }

        if (typeof status.positionMillis === 'number' && status.isPlaying) {
          const glimpseIndex = glimpses.findIndex((item) => item.glimpseId === id);
          const player = glimpseIndex >= 0 ? (videoRefs.current.get(glimpseIndex) as any) : null;
          if (player && trimStartMs > 0 && status.positionMillis < trimStartMs - 60) {
            void player.setPositionAsync(trimStartMs);
          } else if (player && trimEndMs > trimStartMs && status.positionMillis >= trimEndMs - 80) {
            void player.setPositionAsync(trimStartMs);
            void player.playAsync?.();
          }
        }
      }

      if (typeof status.positionMillis === 'number') {
        const activeIndex = glimpses.findIndex((item) => item.glimpseId === id);
        const activeItem = activeIndex >= 0 ? glimpses[activeIndex] : null;
        const shouldPlayVoice = activeIndex === currentIndex && Boolean(status.isPlaying) && !muted && !paused;
        void syncVoiceoverPlayback(activeItem, status.positionMillis, shouldPlayVoice);
      } else {
        void stopAllVoiceSounds();
      }

      if (typeof status.isBuffering === 'boolean') {
        setBuffering(status.isBuffering);
      }
    } catch {}
  };

  useEffect(() => {
    if (muted || paused) {
      void stopAllVoiceSounds();
    }
  }, [muted, paused, currentIndex, stopAllVoiceSounds]);

  useEffect(() => {
    void stopAllVoiceSounds();
  }, [currentIndex, stopAllVoiceSounds]);

  useEffect(() => () => {
    void stopAllVoiceSounds();
  }, [stopAllVoiceSounds]);

  const getResizeModeForGlimpse = useCallback((glimpse: Glimpse) => {
    const dimensions = mediaNaturalSizes[glimpse.glimpseId] || extractMediaDimensions(glimpse);
    if (!dimensions) return ResizeMode.CONTAIN;

    const aspectRatio = dimensions.width / dimensions.height;
    return aspectRatio < 0.58 ? ResizeMode.COVER : ResizeMode.CONTAIN;
  }, [mediaNaturalSizes]);
  const getImageResizeModeForGlimpse = useCallback((glimpse: Glimpse) => (
    getResizeModeForGlimpse(glimpse) === ResizeMode.CONTAIN ? 'contain' : 'cover'
  ), [getResizeModeForGlimpse]);

  useEffect(() => {
    const current = glimpses[currentIndex];
    if (!current) {
      timelineProgress.setValue(0);
      return;
    }

    const meta = playbackMetaRef.current[current.glimpseId];
    const ratio = meta?.durationMillis ? Math.max(0, Math.min(1, meta.positionMillis / meta.durationMillis)) : 0;
    lastTimelineRatioRef.current = ratio;
    timelineProgress.setValue(ratio);
  }, [currentIndex, glimpses, timelineProgress]);
  const updateTimelineProgress = useCallback((locationX: number) => {

    const widthValue = Math.max(1, timelineWidthRef.current);
    const nextProgress = Math.max(0, Math.min(1, locationX / widthValue));
    scrubProgressRef.current = nextProgress;
    lastTimelineRatioRef.current = nextProgress;
    timelineProgress.setValue(nextProgress);
    return nextProgress;
  }, [timelineProgress]);

  const previewSeekCurrentVideo = useCallback(async (nextProgress: number) => {
    const current = glimpses[currentIndex];
    if (!current || current.mediaType !== 'video') return;

    const now = Date.now();
    if (scrubSeekInFlightRef.current || now - lastScrubSeekAtRef.current < 90) return;

    const meta = playbackMetaRef.current[current.glimpseId];
    const durationMillis = meta?.durationMillis;
    const player = videoRefs.current.get(currentIndex) as any;
    if (!player || !durationMillis) return;

    const trimStartMs = Math.max(0, Number(current.trimStart ?? current.editorMeta?.trimStart ?? 0));
    const nextPosition = Math.round(trimStartMs + (durationMillis * nextProgress));
    scrubSeekInFlightRef.current = true;
    lastScrubSeekAtRef.current = now;

    try {
      await player.setPositionAsync(nextPosition);
      playbackMetaRef.current[current.glimpseId] = {
        positionMillis: nextPosition,
        durationMillis,
      };
    } catch {}
    finally {
      scrubSeekInFlightRef.current = false;
    }
  }, [currentIndex, glimpses]);

  const seekCurrentVideo = useCallback(async (nextProgress: number) => {
    const current = glimpses[currentIndex];
    if (!current || current.mediaType !== 'video') return;

    const meta = playbackMetaRef.current[current.glimpseId];
    const durationMillis = meta?.durationMillis;
    const player = videoRefs.current.get(currentIndex) as any;
    if (!player || !durationMillis) return;

    const trimStartMs = Math.max(0, Number(current.trimStart ?? current.editorMeta?.trimStart ?? 0));
    const nextPosition = Math.round(trimStartMs + (durationMillis * nextProgress));

    try {
      await player.setPositionAsync(nextPosition);
      if (!paused && typeof player.playAsync === 'function') {
        await player.playAsync();
      }
    } catch {}

    playbackMetaRef.current[current.glimpseId] = {
      positionMillis: nextPosition,
      durationMillis,
    };
    lastTimelineRatioRef.current = nextProgress;
    timelineProgress.setValue(nextProgress);
  }, [currentIndex, glimpses, paused, timelineProgress]);

  const handleTimelineLayout = useCallback((event: LayoutChangeEvent) => {
    timelineWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  const finishTimelineScrub = useCallback(async () => {
    const progress = scrubProgressRef.current;
    isScrubbingRef.current = false;
    scrubProgressRef.current = null;
    if (typeof progress === 'number') {
      await seekCurrentVideo(progress);
    }
  }, [seekCurrentVideo]);

  const renderProgressBar = () => {
    const current = glimpses[currentIndex];
    if (!current || current.mediaType !== 'video') return null;

    const fillWidth = timelineProgress.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
      extrapolate: 'clamp',
    });

    return (
      <View
        style={[styles.progressBarContainer, { bottom: Math.max(insets.bottom, 0) }]}
        onLayout={handleTimelineLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          isScrubbingRef.current = true;
          const nextProgress = updateTimelineProgress(event.nativeEvent.locationX);
          void previewSeekCurrentVideo(nextProgress);
        }}
        onResponderMove={(event) => {
          const nextProgress = updateTimelineProgress(event.nativeEvent.locationX);
          void previewSeekCurrentVideo(nextProgress);
        }}
        onResponderRelease={() => {
          void finishTimelineScrub();
        }}
        onResponderTerminate={() => {
          void finishTimelineScrub();
        }}
      >
        <View style={styles.progressBarTrack}>
          <Animated.View style={[styles.progressBarFill, { width: fillWidth }]} />
        </View>
      </View>
    );
  };
  const renderGlimpse = (glimpse: Glimpse, index: number) => {
    const isActive = index === currentIndex;
    const editorMeta: GlimpseEditorMeta = glimpse.editorMeta || {};
    const selectedStyle = getGlimpseStylePreset(editorMeta.styleId);
    const overlayText = (editorMeta.overlayText || '').trim();
    const overlayPositionStyle = editorMeta.overlayPosition === 'top'
      ? styles.editorOverlayTop
      : editorMeta.overlayPosition === 'bottom'
        ? styles.editorOverlayBottom
        : styles.editorOverlayCenter;
    const overlayColor = editorMeta.overlayColor || selectedStyle.textColor;
    const overlayAlign = editorMeta.overlayAlign || 'center';
    const overlayBackground = editorMeta.overlayBackground || 'none';
    const overlayEffect = editorMeta.overlayEffect || 'clean';
    const overlayOffsetX = Number(editorMeta.overlayOffsetX || 0);
    const overlayOffsetY = Number(editorMeta.overlayOffsetY || 0);
    const overlayScale = Number(editorMeta.overlayScale || 1);
    const overlayRotation = Number(editorMeta.overlayRotation || 0);
    const editedVideoVolume = Number(editorMeta.videoVolume ?? 1);
    const editedVideoMuted = Boolean(editorMeta.videoMuted ?? false);
    const overlayLayers = editorMeta.overlayLayers || [];
    const overlayShellStyle = overlayBackground === 'black'
      ? styles.editorOverlayShellBlack
      : overlayBackground === 'white'
        ? styles.editorOverlayShellWhite
        : overlayBackground === 'glass'
          ? styles.editorOverlayShellGlass
          : styles.editorOverlayShellNone;
    const safeOverlayColor = overlayBackground === 'white' && (overlayColor === '#FFFFFF' || overlayColor === '#F8FAFC')
      ? '#0F172A'
      : overlayColor;
    const overlayShadowStyle = overlayEffect === 'glow'
      ? styles.editorOverlayGlow
      : overlayEffect === 'shadow'
        ? styles.editorOverlayShadow
        : styles.editorOverlayDefaultShadow;
    const trimStartMs = Math.max(0, Number(glimpse.trimStart ?? editorMeta.trimStart ?? 0));

    return (
      <View key={glimpse.glimpseId} style={styles.glimpseContainer}>
        {glimpse.mediaType === 'video' ? (
          <Video
            ref={(ref) => {
              if (ref) {
                videoRefs.current.set(index, ref);
              }
            }}
            source={{ uri: glimpse.mediaURL }}
            style={styles.media}
            resizeMode={getResizeModeForGlimpse(glimpse)}
            shouldPlay={isActive && !paused}
            progressUpdateIntervalMillis={80}
            isLooping={false}
            isMuted={muted || editedVideoMuted}
            volume={(muted || editedVideoMuted) ? 0 : editedVideoVolume}
            onReadyForDisplay={(event: any) => {
              const naturalSize = event?.naturalSize;
              const mediaWidth = Number(naturalSize?.width);
              const mediaHeight = Number(naturalSize?.height);
              if (mediaWidth > 0 && mediaHeight > 0) {
                setMediaNaturalSizes((prev) => ({ ...prev, [glimpse.glimpseId]: { width: mediaWidth, height: mediaHeight } }));
              }
            }}
            onError={(error) => console.error('Video error:', error)}
            onLoadStart={() => setBuffering(true)}
            onLoad={() => {
              setBuffering(false);
              if (trimStartMs > 0) {
                const player = videoRefs.current.get(index) as any;
                void player?.setPositionAsync?.(trimStartMs);
              }
            }}
            onPlaybackStatusUpdate={(status: any) => handlePlaybackStatusUpdate(status, glimpse.glimpseId)}
          />
        ) : (
          <Image
            source={{ uri: glimpse.mediaURL }}
            style={styles.media}
            contentFit={getImageResizeModeForGlimpse(glimpse)}
          />
        )}

        <LinearGradient
          colors={selectedStyle.gradient}
          style={[styles.editorStyleOverlay, { opacity: selectedStyle.overlayOpacity }]}
        />

        {overlayLayers.map((layer: any) => (
          <View
            key={layer.id}
            style={[
              styles.editorOverlayAsset,
              {
                left: Number(layer.x || 0),
                top: Number(layer.y || 0),
                width: Number(layer.width || 120),
                height: Number(layer.height || 120),
              },
            ]}
            pointerEvents="none"
          >
            <Image source={{ uri: layer.assetUri }} style={styles.editorOverlayAssetImage} contentFit="cover" />
          </View>
        ))}

        {overlayText ? (
          <View style={[styles.editorOverlayTextWrap, overlayPositionStyle]} pointerEvents="none">
            <View style={[styles.editorOverlayShell, overlayShellStyle, { transform: [{ translateX: overlayOffsetX }, { translateY: overlayOffsetY }, { scale: overlayScale }, { rotate: `${overlayRotation}deg` }] }] }>
              <Text style={[styles.editorOverlayText, { color: safeOverlayColor, textAlign: overlayAlign as any }, overlayShadowStyle]} numberOfLines={2}>
                {overlayText}
              </Text>
            </View>
          </View>
        ) : null}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
          style={styles.gradient}
        />

        {buffering && isActive && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </View>
    );
  };

  const renderUI = () => {
    const currentGlimpse = glimpses[currentIndex];
    if (!currentGlimpse) return null;
    const captionWords = (currentGlimpse.caption || '').trim().split(/\s+/).filter(Boolean);
    const hasLongCaption = captionWords.length > 4;
    const collapsedCaption = captionWords.slice(0, 4).join(' ');

    return (
      <View style={styles.uiContainer} pointerEvents="box-none">
        <View style={[styles.topUI, { paddingTop: Math.max(insets.top + 8, 18) }]}>
          {canGoBack() ? (
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={28} color="white" />
            </TouchableOpacity>
          ) : (
            <View style={styles.topLeftSpacer} />
          )}

          <TouchableOpacity
            style={styles.muteButton}
            onPress={() => {
              setMuted((prev) => {
                const next = !prev;
                showMuteToggleFeedback(next);
                return next;
              });
            }}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.topRightSpacer} />
        </View>

        <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom + 58, 72) }]} pointerEvents="box-none">
          <View style={styles.bottomLeft}>
            {likedByFollowingCount > 0 ? (
              <TouchableOpacity
                style={styles.socialProofBadge}
                activeOpacity={0.75}
                onPress={() => (navigation as any).navigate('LikesList', { postId: currentGlimpse.glimpseId, postType: 'glimpse', ownerId: currentGlimpse.authorId })}
              >
                <View style={styles.socialProofAvatars}>
                  {likedByFollowing.slice(0, 3).map((u, idx) => (
                    <View
                      key={u.userId || idx}
                      style={[styles.socialAvatarWrap, idx > 0 ? { marginLeft: -4 } : null, { zIndex: 10 - idx }]}
                    >
                      <Avatar source={u.avatarURL} size={20} style={styles.socialAvatar} />
                    </View>
                  ))}
                </View>
                <View style={styles.socialProofTextWrap}>
                  <Text style={styles.socialProofText} numberOfLines={1}>
                    Liked by <Text style={styles.socialProofPrimaryName}>{likedByFollowing[0]?.username}</Text>{likedByFollowingCount > 1 ? ' and others' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.viewerUserRow} onPress={handleProfilePress} activeOpacity={0.8}>
              <Avatar source={currentGlimpse.authorAvatarURL} size={40} />
              <View style={styles.viewerUserText}>
                <View style={styles.viewerUsernameRow}>
                  <Text style={styles.viewerUsername}>{currentGlimpse.authorUsername}</Text>
                  {currentGlimpse.authorVerified ? <VerifiedBadge size={16} /> : null}
                </View>
                {currentGlimpse.caption ? (
                  <View style={styles.viewerCaptionRow}>
                    <Text style={styles.viewerCaption} numberOfLines={captionExpanded ? 8 : 2}>
                      {captionExpanded || !hasLongCaption ? currentGlimpse.caption : `${collapsedCaption}...`}
                    </Text>
                    {hasLongCaption ? (
                      <TouchableOpacity onPress={() => setCaptionExpanded((prev) => !prev)}>
                        <Text style={styles.viewerCaptionMore}>{captionExpanded ? ' less' : ' more'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>

            {user && currentGlimpse.authorId !== user.userId && !followingAuthor ? (
              <TouchableOpacity style={styles.viewerFollowButton} onPress={handleFollowAuthor} disabled={followActionLoading}>
                <Text style={styles.viewerFollowButtonText}>Follow</Text>
              </TouchableOpacity>
            ) : null}

            {mutualBy.length > 0 ? (
              <Text style={styles.viewerMetaText} numberOfLines={1}>
                Followed by {mutualBy[0]?.username}{mutualBy.length > 1 ? ` and ${mutualBy.length - 1} others` : ''}
              </Text>
            ) : null}

            {currentGlimpse.backgroundMusic ? (
              <View style={styles.viewerMusicRow}>
                <Ionicons name="musical-notes" size={16} color="white" />
                <Text style={styles.viewerMusicText} numberOfLines={1}>
                  {currentGlimpse.backgroundMusic.trackTitle}{' - '}{currentGlimpse.backgroundMusic.artistName}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.viewerActions}>
            <TouchableOpacity style={styles.viewerActionButton} onPress={() => animateActionPress('like', handleLike)}>
              <Ionicons name={liked[currentGlimpse.glimpseId] ? 'heart' : 'heart-outline'} size={34} color={liked[currentGlimpse.glimpseId] ? '#ef4444' : '#fff'} />
              {!currentGlimpseHideLikes ? <Text style={styles.viewerActionText}>{currentGlimpse.stats.likesCount}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewerActionButton, !currentGlimpseCommentsEnabled && styles.viewerActionDisabled]} onPress={() => animateActionPress('comment', handleComment)}>
              <Ionicons name="chatbubble-outline" size={32} color="#fff" />
              <Text style={styles.viewerActionText}>{commentCounts[currentGlimpse.glimpseId] ?? currentGlimpse.stats.commentsCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewerActionButton, !currentGlimpseSharingEnabled && styles.viewerActionDisabled]} onPress={() => animateActionPress('share', handleShare)}>
              <Ionicons name="paper-plane-outline" size={32} color="#fff" />
              <Text style={styles.viewerActionText}>{currentGlimpse.stats.sharesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.viewerActionButton} onPress={() => animateActionPress('save', handleSave)}>
              <Ionicons name={saved[currentGlimpse.glimpseId] ? 'bookmark' : 'bookmark-outline'} size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.viewerActionButton} onPress={() => setShowMenu(true)}>
              <Ionicons name="ellipsis-horizontal" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View style={[styles.bigHeartOverlay, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]} pointerEvents="none">
          <Ionicons name="heart" size={128} color="#FF2D55" />
        </Animated.View>

        {tapFeedbackIcon ? (
          <Animated.View style={[styles.tapFeedbackBubble, { opacity: tapFeedbackOpacity }]} pointerEvents="none">
            <Ionicons name={tapFeedbackIcon} size={28} color="#fff" />
          </Animated.View>
        ) : null}
      </View>
    );
  };

  if (loading && glimpses.length === 0) {
    return (
      <View style={styles.screen}>
        <StatusBar hidden={false} />
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  const currentGlimpse = glimpses[currentIndex];
  const currentGlimpseCommentsEnabled = currentGlimpse?.allowReplies !== false && currentGlimpse?.settings?.allowComments !== false;
  const currentGlimpseSharingEnabled = currentGlimpse?.allowSharing !== false;
  const currentGlimpseHideLikes = currentGlimpse?.settings?.hideLikes === true;

  return (
    <View style={styles.screen}>
      <StatusBar hidden={false} />
      <PanGestureHandler onHandlerStateChange={handlePanGesture} onGestureEvent={handlePanGesture}>
        <Animated.View style={{ flex: 1, transform: [{ translateY: panY }] }}>
          <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onActivated={handleDoubleTap}>
            <TapGestureHandler waitFor={doubleTapRef} numberOfTaps={1} onActivated={handleTap}>
              <View style={styles.screen}>
                {currentGlimpse ? renderGlimpse(currentGlimpse, currentIndex) : null}
                {renderUI()}
                {renderProgressBar()}
              </View>
            </TapGestureHandler>
          </TapGestureHandler>
        </Animated.View>
      </PanGestureHandler>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity style={styles.menuItem} onPress={handleExternalShare}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={styles.menuItemText}>Share externally</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleSave}>
                  <Ionicons name="bookmark-outline" size={20} color="#fff" />
                  <Text style={styles.menuItemText}>{saved[currentGlimpse?.glimpseId || ''] ? 'Saved' : 'Save'}</Text>
                </TouchableOpacity>

                {currentGlimpse?.authorId === user?.userId ? (
                  <>
                    <TouchableOpacity style={styles.menuItem} onPress={openEditGlimpse}>
                      <Ionicons name="create-outline" size={20} color="#fff" />
                      <Text style={styles.menuItemText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={handleDeleteGlimpse} disabled={menuActionLoading}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      <Text style={[styles.menuItemText, styles.sheetReportText]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.menuItem} onPress={handleReportGlimpse}>
                    <Ionicons name="flag-outline" size={20} color="#ef4444" />
                    <Text style={[styles.menuItemText, styles.sheetReportText]}>Report</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.menuItem} onPress={() => setShowMenu(false)}>
                  <Ionicons name="close-outline" size={20} color="#fff" />
                  <Text style={styles.menuItemText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setEditVisible(false)}>
          <View style={styles.editOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.editCard, { marginBottom: Math.max(insets.bottom, 0) }]}>
                <Text style={styles.editTitle}>Edit caption</Text>
                <TextInput
                  style={styles.editInput}
                  value={editCaption}
                  onChangeText={setEditCaption}
                  placeholder="Update your caption"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  multiline
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={[styles.editButton, styles.editSave]} onPress={handleSaveEditGlimpse} disabled={menuActionLoading}>
                    <Text style={styles.editSaveText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.editButton, styles.editCancel]} onPress={() => setEditVisible(false)}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={showCommentsSheet} transparent animationType="none" onRequestClose={closeCommentsSheet}>
        <KeyboardAvoidingView
          style={styles.commentsSheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={closeCommentsSheet}>
            <View style={styles.commentsDismissArea} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.commentsSheet, { paddingBottom: Math.max(insets.bottom, 0), transform: [{ translateY: commentsSheetTranslateY }] }]}>
            <View style={styles.progressBarTrack} />
            <FlashList estimatedItemSize={100}
              data={sheetComments.filter((comment: any) => !comment.parentCommentId)}
              keyExtractor={(item: any) => item.commentId}
              renderItem={({ item }) => renderSheetComment(item)}
              contentContainerStyle={{ padding: 16, paddingBottom: 8 } as any}
              ListEmptyComponent={commentsLoading ? <ButtonLoadingSkeleton /> : <Text style={styles.sheetActionText}>No comments yet</Text>}
            />
            <View style={styles.commentInputBar}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder={replyingToComment ? `Reply to ${replyingToComment.username}` : 'Add a comment'}
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={styles.commentInput}
              />
              <TouchableOpacity
                style={styles.commentSendButton}
                disabled={submittingComment || !commentText.trim()}
                onPress={async () => {
                  const text = commentText.trim();
                  if (!text || !commentsTargetId) return;
                  try {
                    setSubmittingComment(true);
                    await addSheetComment(text, replyingToComment?.commentId || undefined);
                    setCommentText('');
                    setReplyingToComment(null);
                  } finally {
                    setSubmittingComment(false);
                  }
                }}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
