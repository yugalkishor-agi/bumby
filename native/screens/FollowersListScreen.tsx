import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, SafeAreaView, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { postService } from '../services/post.service';
import { glimpseService } from '../services/glimpse.service';
import { cacheIntegration } from '../services/cacheIntegration.service';
import { suggestionService, type SuggestedUser } from '../services/suggestion.service';
import { borderRadius, colors, spacing, typography } from '../styles/theme';
import { ScreenSkeleton, InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Avatar } from '../components/ui/Avatar';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import type { User } from '../types/database';
import { FlashList } from '@shopify/flash-list';

const MAX_RELATIONSHIPS = 200;
const SUGGESTIONS_BATCH = 10;

const loadUsersByIds = async (ids: string[]) => {
  const results = await Promise.allSettled(ids.map((id) => userService.getUser(id)));
  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((user): user is User => Boolean(user));
};

export default function FollowersListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user: currentUser } = useAuth();

  const userId = (route.params as any)?.userId || currentUser?.userId;
  const [followers, setFollowers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [discoverPeople, setDiscoverPeople] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsVisibleCount, setSuggestionsVisibleCount] = useState(SUGGESTIONS_BATCH);
  const [hasMoreSuggestions, setHasMoreSuggestions] = useState(false);
  const warmedProfileIdsRef = useRef<Set<string>>(new Set());

  const isOwnProfile = userId === currentUser?.userId;

  useEffect(() => {
    void loadFollowers();
  }, [userId, currentUser?.userId]);

  useEffect(() => {
    void loadDiscoverPeople(suggestionsVisibleCount);
  }, [userId, currentUser?.userId, suggestionsVisibleCount, followers.length]);

  const loadFollowers = async (showLoader = true) => {
    if (!userId) {
      if (showLoader) setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);
    try {
      const [userInfo, followerIds, followingIds] = await Promise.all([
        userService.getUser(userId),
        userService.getFollowers(userId, MAX_RELATIONSHIPS),
        currentUser?.userId ? userService.getFollowing(currentUser.userId, MAX_RELATIONSHIPS) : Promise.resolve([]),
      ]);

      setProfileUser(userInfo);
      setFollowingUsers(new Set(followingIds));
      setFollowers(await loadUsersByIds(followerIds));
    } catch (error) {
      console.error('Failed to load followers:', error);
      Alert.alert('Could not load followers', 'Please try again.');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const loadDiscoverPeople = async (limit: number) => {
    if (!currentUser?.userId || !userId) return;

    setSuggestionsLoading(true);
    try {
      const suggestions = await suggestionService.getEnhancedSuggestions(currentUser.userId, userId, limit + SUGGESTIONS_BATCH);
      const blockedIds = new Set<string>([
        currentUser.userId,
        ...followers.map((user) => user.userId),
      ]);

      const filtered = suggestions.filter((user) => !blockedIds.has(user.userId));
      setDiscoverPeople(filtered.slice(0, limit));
      setHasMoreSuggestions(filtered.length > limit);
    } catch (error) {
      console.error('Failed to load discover people:', error);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const warmUserProfileCache = (target: { userId: string; username?: string; avatarURL?: string | null; verified?: boolean }) => {
    if (!currentUser?.userId || !target?.userId || target.userId === currentUser.userId) return;
    if (warmedProfileIdsRef.current.has(target.userId)) return;
    warmedProfileIdsRef.current.add(target.userId);

    const cacheKey = `profile_snapshot_v3:${target.userId}:${currentUser.userId}`;
    void (async () => {
      try {
        const [postsRaw, glimpsesRaw] = await Promise.all([
          postService.getUserPosts(target.userId, 6),
          glimpseService.getUserGlimpses(target.userId, 6),
        ]);
        const posts = Array.isArray(postsRaw) ? postsRaw : (postsRaw?.posts || []);
        const preloadedSnapshot = {
          profileUser: {
            userId: target.userId,
            username: target.username || '',
            avatarURL: target.avatarURL || null,
            verified: !!target.verified,
          },
          userPosts: posts,
          userGlimpses: glimpsesRaw || [],
          taggedPosts: [],
          highlights: [],
          mutualFollowers: [],
          followersCount: 0,
          followingCount: 0,
          isFollowing: false,
          hasPendingFollowRequest: false,
          isPrivateRestricted: false,
          profilePrivacy: null,
        };
        await cacheIntegration.cacheData(cacheKey, preloadedSnapshot, 2 * 60 * 1000);
      } catch {
        // Prefetch failures are non-blocking.
      }
    })();
  };

  useEffect(() => {
    if (!currentUser?.userId || followers.length === 0) return;
    followers.slice(0, 4).forEach((user) => {
      warmUserProfileCache(user);
    });
  }, [currentUser?.userId, followers]);

  useEffect(() => {
    if (!currentUser?.userId || discoverPeople.length === 0) return;
    discoverPeople.slice(0, 3).forEach((user) => {
      warmUserProfileCache(user);
    });
  }, [currentUser?.userId, discoverPeople]);
  const onRefresh = async () => {
    setRefreshing(true);
    await loadFollowers(false);
    await loadDiscoverPeople(suggestionsVisibleCount);
    setRefreshing(false);
  };

  const openProfile = (targetUserId: string, seedUser?: User | SuggestedUser) => {
    if (!targetUserId) return;
    if (targetUserId === currentUser?.userId) {
      (navigation as any).navigate('Profile');
      return;
    }
    if (seedUser) {
      warmUserProfileCache(seedUser);
    } else {
      warmUserProfileCache({ userId: targetUserId });
    }
    (navigation as any).navigate('UserProfile', { userId: targetUserId });
  };

  const handleFollowToggle = async (targetUserId: string) => {
    if (!currentUser || actionLoading) return;

    setActionLoading(targetUserId);
    try {
      const isFollowing = followingUsers.has(targetUserId);
      if (isFollowing) {
        await userService.unfollowUser(currentUser.userId, targetUserId);
        setFollowingUsers((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
      } else {
        await userService.followUser(currentUser.userId, targetUserId);
        setFollowingUsers((prev) => new Set(prev).add(targetUserId));
        setDiscoverPeople((prev) => prev.filter((user) => user.userId !== targetUserId));
      }
    } catch (error) {
      console.error('Failed to update follow state:', error);
      Alert.alert('Action failed', 'Could not update follow state.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFollower = (targetUser: User) => {
    if (!currentUser || actionLoading) return;

    Alert.alert(
      'Remove follower',
      `Remove ${targetUser.username} from your followers? They will not be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(targetUser.userId);
            try {
              await userService.unfollowUser(targetUser.userId, currentUser.userId);
              setFollowers((prev) => prev.filter((user) => user.userId !== targetUser.userId));
            } catch (error) {
              console.error('Failed to remove follower:', error);
              Alert.alert('Remove failed', 'Could not remove this follower.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const filteredFollowers = followers.filter((user) => {
    if (!deferredQuery) return true;
    return user.username.toLowerCase().includes(deferredQuery) || (user.bio || '').toLowerCase().includes(deferredQuery);
  });

  const renderFollower = ({ item }: { item: User }) => {
    const isFollowing = followingUsers.has(item.userId);
    const isLoading = actionLoading === item.userId;
    const followLabel = isFollowing ? 'Following' : isOwnProfile ? 'Follow back' : 'Follow';
    const secondaryText = item.bio?.trim() || (isFollowing ? 'You follow each other' : 'Follower');

    return (
      <View style={styles.rowCard}>
        <TouchableOpacity style={styles.rowMain} activeOpacity={0.82} onPress={() => openProfile(item.userId, item)}>
          <Avatar source={item.avatarURL} size={56} fallbackText={item.username?.slice(0, 1)?.toUpperCase()} />
          <View style={styles.rowMeta}>
            <View style={styles.identityRow}>
              <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
              {item.verified ? <VerifiedBadge size={15} style={styles.inlineBadge} /> : null}
            </View>
            <Text style={styles.secondaryText} numberOfLines={1}>{secondaryText}</Text>
          </View>
        </TouchableOpacity>

        {item.userId !== currentUser?.userId ? (
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton]}
              activeOpacity={0.85}
              onPress={() => handleFollowToggle(item.userId)}
              disabled={isLoading}
            >
              {isLoading ? (
                <InlineLoadingSkeleton />
              ) : (
                <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>{followLabel}</Text>
              )}
            </TouchableOpacity>

            {isOwnProfile ? (
              <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.85} onPress={() => handleRemoveFollower(item)} disabled={isLoading}>
                <Ionicons name="close-outline" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSuggestion = ({ item }: { item: SuggestedUser }) => {
    const isLoading = actionLoading === item.userId;
    const reason = item.reason || 'Suggested for you';

    return (
      <View style={styles.suggestionCard}>
        <TouchableOpacity style={styles.rowMain} activeOpacity={0.82} onPress={() => openProfile(item.userId, item)}>
          <Avatar source={item.avatarURL} size={52} fallbackText={item.username?.slice(0, 1)?.toUpperCase()} />
          <View style={styles.rowMeta}>
            <View style={styles.identityRow}>
              <Text style={styles.username} numberOfLines={1}>{item.username}</Text>
              {item.verified ? <VerifiedBadge size={15} style={styles.inlineBadge} /> : null}
            </View>
            <Text style={styles.secondaryText} numberOfLines={1}>{reason}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.followButton} activeOpacity={0.85} onPress={() => handleFollowToggle(item.userId)} disabled={isLoading}>
          {isLoading ? (
            <InlineLoadingSkeleton />
          ) : (
            <Text style={styles.followButtonText}>Follow</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.screenTitle}>Followers</Text>
          <Text style={styles.screenSubtitle}>
            {isOwnProfile ? 'People who follow you' : `People following ${profileUser?.username || 'this account'}`}
          </Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{followers.length}</Text>
        </View>
      </View>

      <View style={styles.searchShell}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search username or bio"
          placeholderTextColor={colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.75}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={deferredQuery ? 'search-outline' : 'people-outline'} size={28} color={colors.text.secondary} />
      </View>
      <Text style={styles.emptyTitle}>{deferredQuery ? 'No matching followers' : 'No followers yet'}</Text>
      <Text style={styles.emptyBody}>
        {deferredQuery ? 'Try a different username or bio keyword.' : 'This list will fill as people start following the account.'}
      </Text>
    </View>
  );

  const renderDiscoverFooter = () => {
    if (deferredQuery) return null;
    if (discoverPeople.length === 0 && !suggestionsLoading) return null;

    return (
      <View style={styles.discoverSection}>
        <Text style={styles.discoverTitle}>Discover people</Text>
        <Text style={styles.discoverSubtitle}>Suggested from this account's network.</Text>

        {suggestionsLoading && discoverPeople.length === 0 ? (
          <View style={styles.discoverLoading}>
            <InlineLoadingSkeleton />
          </View>
        ) : (
          <FlashList estimatedItemSize={100}
            data={discoverPeople}
            renderItem={renderSuggestion}
            keyExtractor={(item) => `discover-${item.userId}`}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        {hasMoreSuggestions ? (
          <TouchableOpacity
            style={styles.moreSuggestionsButton}
            activeOpacity={0.85}
            onPress={() => setSuggestionsVisibleCount((current) => current + SUGGESTIONS_BATCH)}
            disabled={suggestionsLoading}
          >
            {suggestionsLoading ? (
              <InlineLoadingSkeleton />
            ) : (
              <Text style={styles.moreSuggestionsText}>Suggest more</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenSkeleton variant="people" rows={7} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlashList estimatedItemSize={100}
        data={filteredFollowers}
        renderItem={renderFollower}
        keyExtractor={(item) => item.userId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent as any}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderDiscoverFooter}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerBlock: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  topBarTitleWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  screenTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  screenSubtitle: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  countPill: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  countPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
  },
  separator: {
    height: spacing.sm,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMeta: {
    flex: 1,
    marginLeft: spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  username: {
    flexShrink: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  inlineBadge: {
    marginLeft: 4,
  },
  secondaryText: {
    marginTop: 3,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  followButton: {
    minWidth: 108,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
  },
  followingButton: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.medium,
  },
  followButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  followingButtonText: {
    color: colors.text.primary,
  },
  secondaryButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  discoverSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  discoverTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  discoverSubtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  discoverLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  moreSuggestionsButton: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.medium,
  },
  moreSuggestionsText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});



