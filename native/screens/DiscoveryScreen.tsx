import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { postService } from '../services/post.service';
import { glimpseService } from '../services/glimpse.service';
import { userService } from '../services/user.service';
import { cacheIntegration } from '../services/cacheIntegration.service';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

const { width } = Dimensions.get('window');
const TILE_W = (width - spacing.md * 3) / 2;

type DiscoveryTab = 'all' | 'posts' | 'glimpses' | 'people';

interface DiscoveryItem {
  type: 'post' | 'glimpse';
  id: string;
  data: any;
}

const TABS: Array<{ key: DiscoveryTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'all', label: 'All', icon: 'sparkles-outline' },
  { key: 'posts', label: 'Posts', icon: 'grid-outline' },
  { key: 'glimpses', label: 'Glimpses', icon: 'film-outline' },
  { key: 'people', label: 'People', icon: 'people-outline' },
];

export default function DiscoveryScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<DiscoveryTab>('all');
  const [mediaItems, setMediaItems] = useState<DiscoveryItem[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cacheKey = useMemo(
    () => `discover:${activeTab}:${user?.userId || 'guest'}`,
    [activeTab, user?.userId]
  );

  useEffect(() => {
    loadDiscoveryContent();
  }, [activeTab, user?.userId]);

  const mergeAlternating = (posts: any[], glimpses: any[]): DiscoveryItem[] => {
    const out: DiscoveryItem[] = [];
    const maxLen = Math.max(posts.length, glimpses.length);
    for (let i = 0; i < maxLen; i++) {
      if (posts[i]) {
        out.push({ type: 'post', id: posts[i].postId || `post-${i}`, data: posts[i] });
      }
      if (glimpses[i]) {
        out.push({
          type: 'glimpse',
          id: glimpses[i].glimpseId || glimpses[i].storyId || `glimpse-${i}`,
          data: glimpses[i],
        });
      }
    }
    return out;
  };

  const loadMedia = async () => {
    const cached = await cacheIntegration.getCachedData(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setMediaItems(cached);
      setLoading(false);
    }

    const [postsRaw, glimpsesRaw] = await Promise.all([
      postService.getExplorePosts(30),
      glimpseService.getExploreGlimpses(30),
    ]);

    const posts = Array.isArray(postsRaw) ? postsRaw : [];
    const glimpses = Array.isArray(glimpsesRaw) ? glimpsesRaw : [];

    let merged: DiscoveryItem[] = [];
    if (activeTab === 'posts') {
      merged = posts.map((p: any, idx: number) => ({ type: 'post', id: p.postId || `post-${idx}`, data: p }));
    } else if (activeTab === 'glimpses') {
      merged = glimpses.map((g: any, idx: number) => ({
        type: 'glimpse',
        id: g.glimpseId || g.storyId || `glimpse-${idx}`,
        data: g,
      }));
    } else {
      merged = mergeAlternating(posts, glimpses);
    }

    setMediaItems(merged);
    const previewUrls = merged
      .map((it) => (it.type === 'post' ? it.data?.mediaURLs?.[0] : it.data?.mediaURL))
      .filter(Boolean)
      .slice(0, 12);
    previewUrls.forEach((url) => Image.prefetch(url).catch(() => {}));
    await cacheIntegration.cacheData(cacheKey, merged, 10 * 60 * 1000);
  };

  const loadPeople = async () => {
    if (!user?.userId) {
      setSuggestedUsers([]);
      return;
    }

    const cached = await cacheIntegration.getCachedData(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setSuggestedUsers(cached);
      setLoading(false);
    }

    const [active, recent] = await Promise.all([
      userService.getActiveUsers(user.userId, 30),
      userService.getRecentlyActiveUsers(user.userId, 30),
    ]);

    const merged = [...(active || []), ...(recent || [])];
    const uniqueUsers = merged.filter(
      (u, i, arr) => !!u?.userId && arr.findIndex((x) => x.userId === u.userId) === i
    );

    setSuggestedUsers(uniqueUsers);
    await cacheIntegration.cacheData(cacheKey, uniqueUsers, 10 * 60 * 1000);
  };

  const loadDiscoveryContent = async () => {
    try {
      setLoading(true);
      if (activeTab === 'people') {
        await loadPeople();
      } else {
        await loadMedia();
      }
    } catch (error) {
      console.error('Failed to load discovery content:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cacheIntegration.invalidateData(cacheKey);
    await loadDiscoveryContent();
    setRefreshing(false);
  }, [cacheKey, activeTab, user?.userId]);

  const openItem = (item: DiscoveryItem) => {
    if (item.type === 'post') {
      (navigation as any).navigate('PostView', { postId: item.data.postId || item.id });
      return;
    }
    const glimpseId = item.data.glimpseId || item.data.storyId;
    (navigation as any).navigate('GlimpseViewer', { glimpseId });
  };

  const renderMediaItem = ({ item, index }: { item: DiscoveryItem; index: number }) => {
    const mediaURL = item.type === 'post' ? item.data.mediaURLs?.[0] : item.data.mediaURL;
    const likes = item.data?.stats?.likesCount || item.data?.likesCount || 0;
    const views = item.data?.stats?.viewsCount || item.data?.viewsCount || 0;
    const metric = item.type === 'post' ? likes : views;

    const tileHeight = index % 3 === 0 ? TILE_W * 1.15 : TILE_W;

    return (
      <TouchableOpacity style={[styles.mediaTile, { height: tileHeight }]} onPress={() => openItem(item)} activeOpacity={0.85}>
        {mediaURL ? (
          <Image source={{ uri: mediaURL }} style={styles.mediaImage} contentFit="cover" />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Ionicons name={item.type === 'glimpse' ? 'film-outline' : 'image-outline'} size={20} color="#b7b7b7" />
          </View>
        )}
        <View style={styles.overlayTop}>
          <View style={[styles.typeBadge, item.type === 'glimpse' ? styles.glimpseBadge : styles.postBadge]}>
            <Ionicons name={item.type === 'glimpse' ? 'film' : 'image'} size={12} color="#fff" />
            <Text style={styles.typeBadgeText}>{item.type === 'glimpse' ? 'Glimpse' : 'Post'}</Text>
          </View>
        </View>
        <View style={styles.overlayBottom}>
          <Ionicons name={item.type === 'glimpse' ? 'eye' : 'heart'} size={14} color="#fff" />
          <Text style={styles.metricText}>{metric}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPerson = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => (navigation as any).navigate('UserProfile', { userId: item.userId })}
      activeOpacity={0.85}
    >
      <Avatar source={item.avatarURL} size={66} />
      <Text style={styles.userName} numberOfLines={1}>{item.displayName || item.username}</Text>
      <Text style={styles.userHandle} numberOfLines={1}>@{item.username}</Text>
      <Text style={styles.userMeta}>{item.stats?.followersCount || 0} followers</Text>
    </TouchableOpacity>
  );

  const dataEmpty = activeTab === 'people' ? suggestedUsers.length === 0 : mediaItems.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Discover</Text>
        <TouchableOpacity onPress={() => (navigation as any).navigate('Main', { screen: 'Search' })}>
          <Ionicons name="search" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={[styles.tabChip, active && styles.tabChipActive]} onPress={() => setActiveTab(tab.key)}>
              <Ionicons name={tab.icon} size={14} color={active ? '#000' : colors.text.secondary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ScreenSkeleton variant="grid" rows={6} />
          <Text style={styles.loadingText}>Loading discovery...</Text>
        </View>
      ) : activeTab === 'people' ? (
        <FlashList estimatedItemSize={100}
          data={suggestedUsers}
          renderItem={renderPerson}
          keyExtractor={(item, index) => item.userId || `person-${index}`}
          numColumns={2}
          contentContainerStyle={styles.gridWrap as any}

          
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={colors.text.secondary} />
              <Text style={styles.emptyTitle}>No people found</Text>
            </View>
          }
        />
      ) : (
        <FlashList estimatedItemSize={100}
          data={mediaItems}
          renderItem={renderMediaItem}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          numColumns={2}
          contentContainerStyle={styles.gridWrap as any}

          
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="compass-outline" size={48} color={colors.text.secondary} />
              <Text style={styles.emptyTitle}>No content yet</Text>
            </View>
          }
        />
      )}

      {!loading && dataEmpty ? (
        <View style={styles.emptyFooter}>
          <Text style={styles.emptySubtext}>Pull down to refresh discovery.</Text>
        </View>
      ) : null}
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  tabChipActive: {
    backgroundColor: '#4DD0E1',
    borderColor: '#4DD0E1',
  },
  tabText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  tabTextActive: {
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
  },
  gridWrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  mediaTile: {
    width: TILE_W,
    margin: spacing.xs,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.background.secondary,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
  },
  overlayTop: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  postBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  glimpseBadge: {
    backgroundColor: 'rgba(77, 208, 225, 0.85)',
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  metricText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  userCard: {
    width: TILE_W,
    margin: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  userName: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    marginTop: spacing.sm,
  },
  userHandle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  userMeta: {
    color: colors.text.muted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  emptyWrap: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
  },
  emptyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    alignItems: 'center',
  },
  emptySubtext: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
});


