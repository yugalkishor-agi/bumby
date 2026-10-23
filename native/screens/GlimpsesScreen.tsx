import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { CachedImage } from '../components/ui/CachedImage';
import { Avatar } from '../components/ui/Avatar';
import { colors, spacing, typography } from '../styles/theme';
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import { glimpseService } from '../services/glimpse.service';
import { cacheIntegration } from '../services/cacheIntegration.service';
import { feedRankingService } from '../services/feedRanking.service';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

const { width, height } = Dimensions.get('window');
const gridGap = 6;
const tileSize = (width - spacing.lg * 2 - gridGap * 2) / 3;
const tileHeight = Math.round(tileSize * 1.6);
const EXPLORE_PAGE_SIZE = 45;

const GLIMPSES_MEMORY = {
  items: [] as any[],
  hydratedAt: 0,
  sort: 'trending' as GlimpseSortKey,
};
const GLIMPSES_SOFT_REFRESH_COOLDOWN_MS = 45 * 1000;

type GlimpseSortKey = 'trending' | 'popular' | 'newest';

const SORT_OPTIONS: Array<{ key: GlimpseSortKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'trending', label: 'Trending', icon: 'flame-outline' },
  { key: 'popular', label: 'Popular', icon: 'heart-outline' },
  { key: 'newest', label: 'Newest', icon: 'time-outline' },
];

function formatCompactCount(value?: number) {
  const count = value || 0;
  if (count < 1000) return String(count);
  if (count < 1000000) {
    const short = (count / 1000).toFixed(count >= 100000 ? 0 : 1);
    return short.replace(/\.0$/, '') + 'K';
  }
  const short = (count / 1000000).toFixed(count >= 10000000 ? 0 : 1);
  return short.replace(/\.0$/, '') + 'M';
}

function getItemTimestamp(item: any) {
  const timestamp = item?.createdAt || item?.postedAt || item?.timestamp || item?.updatedAt;
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (timestamp?.toMillis) return timestamp.toMillis();
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getViewsCount(item: any) {
  return Number(item?.stats?.viewsCount || item?.viewsCount || 0);
}

function getLikesCount(item: any) {
  return Number(item?.stats?.likesCount || item?.likesCount || 0);
}

function getCommentsCount(item: any) {
  return Number(item?.stats?.commentsCount || item?.commentsCount || 0);
}

function compareTrendingGlimpses(a: any, b: any) {
  const byViews = getViewsCount(b) - getViewsCount(a);
  if (byViews !== 0) return byViews;

  const byLikes = getLikesCount(b) - getLikesCount(a);
  if (byLikes !== 0) return byLikes;

  const byComments = getCommentsCount(b) - getCommentsCount(a);
  if (byComments !== 0) return byComments;

  return getItemTimestamp(b) - getItemTimestamp(a);
}

function comparePopularGlimpses(a: any, b: any) {
  const byLikes = getLikesCount(b) - getLikesCount(a);
  if (byLikes !== 0) return byLikes;

  const byComments = getCommentsCount(b) - getCommentsCount(a);
  if (byComments !== 0) return byComments;

  return getViewsCount(b) - getViewsCount(a);
}

function compareNewestGlimpses(a: any, b: any) {
  return getItemTimestamp(b) - getItemTimestamp(a);
}

function sortGlimpses(items: any[], sort: GlimpseSortKey) {
  const list = [...(items || [])];
  if (sort === 'popular') list.sort(comparePopularGlimpses);
  else if (sort === 'newest') list.sort(compareNewestGlimpses);
  else list.sort(compareTrendingGlimpses);
  return list;
}

function isProbablyImageUri(uri?: string) {
  if (!uri || typeof uri !== 'string') return false;
  if (uri.startsWith('data:image/')) return true;
  return /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(uri);
}

function getMediaUri(item: any) {
  const previewCandidates = [
    item?.thumbnailURL,
    item?.thumbnailUrl,
    item?.coverURL,
    item?.coverUrl,
    item?.posterURL,
    item?.posterUrl,
    item?.previewURL,
    item?.previewUrl,
    item?.imageURL,
    item?.imageUrl,
    item?.mediaThumbnailURL,
    item?.mediaThumbnailUrl,
    item?.coverImageURL,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (previewCandidates.length > 0) {
    return previewCandidates[0];
  }

  const mediaCandidates = [
    item?.mediaURL,
    item?.mediaUrl,
    ...(Array.isArray(item?.mediaURLs) ? item.mediaURLs : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const imageCandidate = mediaCandidates.find((value) => isProbablyImageUri(value));
  return imageCandidate || '';
}

function getVideoUri(item: any) {
  const mediaCandidates = [
    item?.mediaURL,
    item?.mediaUrl,
    ...(Array.isArray(item?.mediaURLs) ? item.mediaURLs : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const videoCandidate = mediaCandidates.find((value) => !isProbablyImageUri(value));
  return videoCandidate || '';
}

function isVideoGlimpse(item: any) {
  return item?.mediaType === 'video' || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(getVideoUri(item));
}

function getAuthorLabel(item: any) {
  const label = item?.authorUsername || item?.username || item?.displayName || item?.authorName;
  return typeof label === 'string' && label.trim().length > 0 ? label.trim() : '';
}

function getAuthorAvatar(item: any) {
  const avatar = item?.authorAvatarURL || item?.avatarURL || item?.avatarUrl || item?.authorAvatarUrl;
  return typeof avatar === 'string' && avatar.trim().length > 0 ? avatar : undefined;
}

function normalizeGlimpsesForViewer(items: any[]) {
  return (items || [])
    .filter((item: any) => isVideoGlimpse(item))
    .map((g: any) => {
      const id = g.glimpseId || g.storyId || g.postId;
      const mediaURL = getVideoUri(g) || g.mediaURL || g.mediaUrl || g.mediaURLs?.[0];
      if (!id || !mediaURL) return null;

      return {
        ...g,
        glimpseId: id,
        storyId: id,
        mediaURL,
        mediaType: 'video',
        thumbnailURL: g.thumbnailURL || g.thumbnailUrl || g.coverImageURL || g.coverURL || g.posterURL,
        coverImageURL: g.coverImageURL || g.coverURL || g.thumbnailURL || g.posterURL,
        stats: {
          likesCount: g?.stats?.likesCount || g?.likesCount || 0,
          commentsCount: g?.stats?.commentsCount || g?.commentsCount || 0,
          sharesCount: g?.stats?.sharesCount || g?.sharesCount || 0,
          viewsCount: g?.stats?.viewsCount || g?.viewsCount || 0,
        },
      };
    })
    .filter(Boolean);
}

interface GlimpseTileProps {
  item: any;
  onPress: () => void;
  shouldAutoPreview: boolean;
}

const GlimpseTile = memo(
  ({ item, onPress, shouldAutoPreview }: GlimpseTileProps) => {
    const previewUri = getMediaUri(item);
    const videoUri = getVideoUri(item);
    const [hasPreviewError, setHasPreviewError] = useState(false);
    const [hasVideoError, setHasVideoError] = useState(false);
    const showVideoPreview = shouldAutoPreview && isVideoGlimpse(item) && Boolean(videoUri) && !hasVideoError;
    const hasPreview = Boolean(previewUri) && !hasPreviewError;

    const authorLabel = getAuthorLabel(item);
    const authorAvatar = getAuthorAvatar(item);
    const views = getViewsCount(item);
    const likes = getLikesCount(item);

    useEffect(() => {
      setHasPreviewError(false);
      setHasVideoError(false);
    }, [previewUri, videoUri]);

    return (
      <TouchableOpacity
        style={styles.tile}
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={authorLabel ? `Glimpse by ${authorLabel}` : 'Glimpse'}
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {showVideoPreview ? (
            <Video
              source={{ uri: videoUri }}
              style={styles.tileMedia}
              resizeMode={ResizeMode.COVER}
              shouldPlay={shouldAutoPreview}
              isLooping
              isMuted
              useNativeControls={false}
              onError={() => setHasVideoError(true)}
              progressUpdateIntervalMillis={1000}
            />
          ) : hasPreview ? (
            <CachedImage
              uri={previewUri}
              style={styles.tileMedia}
              contentFit="cover"
              onError={() => setHasPreviewError(true)}
              cachePolicy="memory-disk"
              transition={160}
            />
          ) : (
            <View style={styles.mediaFallback}>
              <Ionicons name="play" size={22} color="rgba(255,255,255,0.72)" />
            </View>
          )}
        </View>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0.72)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {likes > 0 ? (
          <View style={styles.likesBadge} pointerEvents="none">
            <Ionicons name="heart" size={11} color="#FF2D55" />
            <Text style={styles.likesBadgeText}>{formatCompactCount(likes)}</Text>
          </View>
        ) : null}

        <View style={styles.tileFooter} pointerEvents="none">
          {authorAvatar ? (
            <Avatar source={authorAvatar} size={18} fallbackText="?" style={styles.tileAvatar} />
          ) : (
            <View style={[styles.tileAvatar, styles.tileAvatarFallback]}>
              <Ionicons name="person" size={11} color="#fff" />
            </View>
          )}
          {authorLabel ? (
            <Text style={styles.tileAuthor} numberOfLines={1}>
              {authorLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.viewsBadge} pointerEvents="none">
          <Ionicons name="play-outline" size={10} color="#fff" />
          <Text style={styles.viewsText}>{formatCompactCount(views)}</Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.shouldAutoPreview === next.shouldAutoPreview &&
    prev.onPress === next.onPress,
);

export default function GlimpsesScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const [glimpses, setGlimpses] = useState<any[]>(GLIMPSES_MEMORY.items);
  const [loading, setLoading] = useState(GLIMPSES_MEMORY.items.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<GlimpseSortKey>(GLIMPSES_MEMORY.sort || 'trending');
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const glimpsesRef = useRef<any[]>(GLIMPSES_MEMORY.items);

  useEffect(() => {
    glimpsesRef.current = glimpses;
  }, [glimpses]);

  const prefetchMediaPreviews = useCallback((items: any[]) => {
    items
      .map((item: any) => getMediaUri(item))
      .filter((uri: string) => Boolean(uri))
      .slice(0, 30)
      .forEach((uri: string) => {
        Image.prefetch(uri).catch(() => undefined);
      });
  }, []);

  const applyGlimpses = useCallback(
    (next: any[]) => {
      const sorted = sortGlimpses(next, sort);
      GLIMPSES_MEMORY.items = next;
      GLIMPSES_MEMORY.sort = sort;
      GLIMPSES_MEMORY.hydratedAt = Date.now();
      setGlimpses(sorted);
    },
    [sort],
  );

  const loadGlimpses = useCallback(
    async (refresh: boolean = false) => {
      const cacheKey = `explore:${user?.userId || 'guest'}:${EXPLORE_PAGE_SIZE}`;

      try {
        // 1. Instant paint from the in-memory snapshot (no await, no spinner).
        if (!refresh && GLIMPSES_MEMORY.items.length > 0 && Date.now() - GLIMPSES_MEMORY.hydratedAt < GLIMPSES_SOFT_REFRESH_COOLDOWN_MS) {
          if (glimpsesRef.current.length === 0) {
            setGlimpses(sortGlimpses(GLIMPSES_MEMORY.items, sort));
          }
          setLoading(false);
          return;
        }

        // 2. Instant paint from the synchronous cache peek (no disk I/O wait).
        if (!refresh && glimpsesRef.current.length === 0) {
          const peeked = cacheIntegration.peekCachedExploreGlimpses(cacheKey);
          if (Array.isArray(peeked) && peeked.length > 0) {
            GLIMPSES_MEMORY.items = peeked;
            GLIMPSES_MEMORY.hydratedAt = Date.now();
            setGlimpses(sortGlimpses(peeked, sort));
            setLoading(false);
            prefetchMediaPreviews(peeked);
          }
        }

        // 3. Disk cache hydration (stale-while-revalidate).
        if (!refresh && glimpsesRef.current.length === 0) {
          const cached = await cacheIntegration.getCachedExploreGlimpses(cacheKey);
          if (Array.isArray(cached) && cached.length > 0 && glimpsesRef.current.length === 0) {
            GLIMPSES_MEMORY.items = cached;
            GLIMPSES_MEMORY.hydratedAt = Date.now();
            setGlimpses(sortGlimpses(cached, sort));
            prefetchMediaPreviews(cached);
            setLoading(false);
          }
        }

        // 4. Network (service serves from its own stale-while-revalidate cache).
        const items = await glimpseService.getExploreGlimpses(EXPLORE_PAGE_SIZE, user?.userId, refresh);
        const next = (items || []).filter((item: any) => isVideoGlimpse(item));

        applyGlimpses(next);
        void cacheIntegration.cacheExploreGlimpses(cacheKey, next);
        prefetchMediaPreviews(next);
      } catch (error) {
        console.error('Failed to load glimpses:', error);
      } finally {
        setLoading(false);
      }
    },
    [applyGlimpses, prefetchMediaPreviews, sort, user?.userId],
  );

  useEffect(() => {
    void loadGlimpses();
  }, [loadGlimpses]);

  useEffect(() => {
    if (!isFocused) {
      setActivePreviewId(null);
    }
  }, [isFocused]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGlimpses(true);
    setRefreshing(false);
  }, [loadGlimpses]);

  const handleSortChange = useCallback(
    (next: GlimpseSortKey) => {
      if (next === sort) return;
      setSort(next);
      GLIMPSES_MEMORY.sort = next;
      setGlimpses(sortGlimpses(glimpsesRef.current, next));
    },
    [sort],
  );

  const handleOpenViewer = useCallback(
    async (item: any) => {
      const itemId = item?.glimpseId || item?.storyId || item?.postId;
      if (!itemId) return;

      const normalized = normalizeGlimpsesForViewer(glimpses.length > 0 ? glimpses : [item]);
      const currentIndex = normalized.findIndex((g: any) => (g.glimpseId || g.storyId) === itemId);

      if (user?.userId) {
        feedRankingService.recordOpen(user.userId, {
          postId: itemId,
          userId: item.authorId || item.userId || '',
          mediaType: item.mediaType,
          createdAt: item.createdAt,
          likesCount: getLikesCount(item),
          commentsCount: getCommentsCount(item),
          sharesCount: item?.stats?.sharesCount || item?.sharesCount || 0,
          viewsCount: getViewsCount(item),
          authorFollowersCount: item?.authorFollowersCount || item?.followersCount || 0,
        });
      }

      (navigation as any).navigate('GlimpseViewer', {
        glimpseId: itemId,
        glimpses: normalized,
        index: currentIndex >= 0 ? currentIndex : 0,
      });
    },
    [glimpses, navigation, user?.userId],
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 60,
      minimumViewTime: 150,
    }),
    [],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVisible = viewableItems.find((token) => token.isViewable && token.item);
    const nextId =
      firstVisible?.item?.glimpseId || firstVisible?.item?.storyId || firstVisible?.item?.postId || null;
    setActivePreviewId(nextId);
  }).current;

  const renderHeader = useMemo(
    () => (
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Glimpses</Text>
          <Text style={styles.headerSubtitle}>
            {glimpses.length > 0
              ? `${glimpses.length} ${glimpses.length === 1 ? 'glimpse' : 'glimpses'}`
              : 'Explore the moment'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.headerButton, refreshing && styles.headerButtonBusy]}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="refresh-outline"
            size={21}
            color={refreshing ? colors.text.muted : colors.text.primary}
          />
        </TouchableOpacity>
      </View>
    ),
    [glimpses.length, handleRefresh, navigation, refreshing],
  );

  const renderFilters = useMemo(
    () => (
      <View style={styles.filterRow}>
        {SORT_OPTIONS.map((option) => {
          const active = option.key === sort;
          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => handleSortChange(option.key)}
              activeOpacity={0.8}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Ionicons
                name={option.icon}
                size={13}
                color={active ? colors.text.inverse : colors.text.secondary}
              />
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    ),
    [handleSortChange, sort],
  );

  // FlashList v1 mutates the layout descriptor in place.
  const overrideItemLayout = useCallback((layout: { span?: number; size?: number }) => {
    layout.span = 1;
    layout.size = tileHeight + gridGap;
  }, []);

  if (loading && glimpses.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader}
        <ScreenSkeleton variant="grid" rows={6} showHeader={false} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader}

      <FlashList
        estimatedItemSize={tileHeight + gridGap}
        data={glimpses}
        renderItem={({ item }) => (
          <GlimpseTile
            item={item}
            onPress={() => handleOpenViewer(item)}
            shouldAutoPreview={
              isFocused && activePreviewId === (item.glimpseId || item.storyId || item.postId)
            }
          />
        )}
        keyExtractor={(item, index) => item.glimpseId || item.storyId || item.postId || `glimpse-${index}`}
        numColumns={3}
        overrideItemLayout={overrideItemLayout}
        contentContainerStyle={styles.gridContent as any}
        showsVerticalScrollIndicator={false}
        drawDistance={height * 1.5}
        removeClippedSubviews
        ListHeaderComponent={renderFilters}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="sparkles-outline" size={26} color={colors.text.link} />
            </View>
            <Text style={styles.emptyTitle}>No glimpses yet</Text>
            <Text style={styles.emptyText}>Pull down to refresh and discover new moments.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text.link}
            colors={[colors.text.link]}
            progressBackgroundColor={colors.background.secondary}
          />
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background.primary,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
  },
  headerButtonBusy: {
    opacity: 0.6,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.muted,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  filterChipActive: {
    backgroundColor: colors.text.link,
    borderColor: colors.text.link,
  },
  filterChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.secondary,
  },
  filterChipTextActive: {
    color: colors.text.inverse,
  },
  gridContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  tile: {
    width: tileSize,
    height: tileHeight,
    borderRadius: 12,
    backgroundColor: colors.background.secondary,
    overflow: 'hidden',
    marginBottom: gridGap,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
  },
  tileMedia: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background.secondary,
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
  },
  tileFooter: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileAvatar: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  tileAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  tileAuthor: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 10.5,
    fontWeight: typography.fontWeight.semibold as any,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  likesBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  likesBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: typography.fontWeight.bold as any,
  },
  viewsBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewsText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: typography.fontWeight.bold as any,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  emptyText: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
