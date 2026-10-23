import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../styles/theme';
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import { userService } from '../services/user.service';
import { postService } from '../services/post.service';
import { glimpseService } from '../services/glimpse.service';
import { FlashList } from '@shopify/flash-list';

interface LikeUser {
  userId: string;
  username: string;
  displayName?: string;
  avatarURL?: string;
  verified?: boolean;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  likedAt: any;
}

export default function LikesListScreenEnhanced() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();

  const { postId, postType = 'post', ownerId: routeOwnerId } = (route.params as any) || {};

  const [likes, setLikes] = useState<LikeUser[]>([]);
  const [filteredLikes, setFilteredLikes] = useState<LikeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [contentOwnerId, setContentOwnerId] = useState(routeOwnerId || '');
  const [visibleCount, setVisibleCount] = useState(10);

  const loadLikes = useCallback(async () => {
    if (!postId || !user?.userId) return;

    try {
      setLoading(true);

      const currentUserFollowing = await userService.getFollowing(user.userId);
      const followingSet = new Set(currentUserFollowing || []);

      let resolvedOwnerId = routeOwnerId || '';
      if (!resolvedOwnerId) {
        if (postType === 'glimpse') {
          const glimpseData = await glimpseService.getGlimpse(postId, user?.userId);
          resolvedOwnerId = glimpseData?.authorId || '';
        } else {
          const postData = await postService.getPost(postId, user?.userId);
          resolvedOwnerId = postData?.authorId || '';
        }
      }

      setContentOwnerId(resolvedOwnerId);
      const canViewAll = !!resolvedOwnerId && resolvedOwnerId === user.userId;

      const rawLikes = postType === 'glimpse'
        ? await glimpseService.getGlimpseLikes(postId, 50)
        : await postService.getPostLikes(postId, 50);

      const allowedLikes = canViewAll
        ? (rawLikes || [])
        : (rawLikes || []).filter((like) => followingSet.has(like.userId));

      const likesWithUserData = (await Promise.all(
        allowedLikes.map(async (like) => {
          try {
            const userData = await userService.getUser(like.userId);
            if (!userData) return null;

            const isFollowing = followingSet.has(like.userId);
            const userFollowing = await userService.getFollowing(like.userId);
            const isFollowedBy = userFollowing.includes(user.userId);

            return {
              ...userData,
              isFollowing,
              isFollowedBy,
              likedAt: like.likedAt,
            } as LikeUser;
          } catch (error) {
            console.error('Error loading user data for like:', error);
            return null;
          }
        })
      )).filter(Boolean) as LikeUser[];

      likesWithUserData.sort((a, b) => {
        const timeA = a.likedAt?.toDate?.()?.getTime?.() || new Date(a.likedAt || 0).getTime() || 0;
        const timeB = b.likedAt?.toDate?.()?.getTime?.() || new Date(b.likedAt || 0).getTime() || 0;
        return timeB - timeA;
      });

      setLikes(likesWithUserData);
      setFollowingUsers(followingSet);
      setVisibleCount(10);
    } catch (error) {
      console.error('Error loading likes:', error);
    } finally {
      setLoading(false);
    }
  }, [postId, postType, routeOwnerId, user?.userId]);

  useEffect(() => {
    if (postId && user?.userId) {
      void loadLikes();
    }
  }, [loadLikes, postId, user?.userId]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredLikes(likes);
      return;
    }

    const query = searchQuery.toLowerCase();
    setFilteredLikes(
      likes.filter((like) =>
        like.username.toLowerCase().includes(query) ||
        like.displayName?.toLowerCase().includes(query)
      )
    );
  }, [likes, searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setVisibleCount(10);
    await loadLikes();
    setRefreshing(false);
  }, [loadLikes]);

  const handleFollowToggle = async (targetUserId: string) => {
    if (!user?.userId) return;

    try {
      const isCurrentlyFollowing = followingUsers.has(targetUserId);

      if (isCurrentlyFollowing) {
        await userService.unfollowUser(user.userId, targetUserId);
        setFollowingUsers((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
      } else {
        await userService.followUser(user.userId, targetUserId);
        setFollowingUsers((prev) => new Set(prev).add(targetUserId));
      }

      setLikes((prev) => prev.map((like) => (
        like.userId === targetUserId
          ? { ...like, isFollowing: !isCurrentlyFollowing }
          : like
      )));
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const handleUserPress = (userId: string) => {
    (navigation as any).navigate('UserProfile', { userId });
  };

  const visibleLikes = useMemo(() => filteredLikes.slice(0, visibleCount), [filteredLikes, visibleCount]);
  const isOwnerView = !!user?.userId && !!contentOwnerId && user.userId === contentOwnerId;

  const renderLikeItem = ({ item }: { item: LikeUser }) => {
    const isCurrentUser = item.userId === user?.userId;
    const isFollowing = followingUsers.has(item.userId);

    return (
      <TouchableOpacity style={styles.likeItem} onPress={() => handleUserPress(item.userId)}>
        <View style={styles.userInfo}>
          <Avatar source={item.avatarURL} size={44} />

          <View style={styles.userDetails}>
            <View style={styles.usernameContainer}>
              <Text style={styles.username}>{item.username}</Text>
              {item.verified ? <VerifiedBadge size={16} /> : null}
            </View>

            {item.displayName ? (
              <Text style={styles.displayName}>{item.displayName}</Text>
            ) : null}

            {item.isFollowedBy && item.isFollowing ? (
              <Text style={styles.mutualText}>Follows you</Text>
            ) : null}
          </View>
        </View>

        {!isCurrentUser ? (
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={() => handleFollowToggle(item.userId)}
          >
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.likesCount}>
        {filteredLikes.length} {filteredLikes.length === 1 ? 'like' : 'likes'}
      </Text>

      {likes.length > 0 ? (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#8E8E93" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#8E8E93"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#8E8E93" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="heart-outline" size={64} color="#8E8E93" />
      <Text style={styles.emptyTitle}>No likes yet</Text>
      <Text style={styles.emptyMessage}>
        {isOwnerView
          ? `When people like this ${postType}, you'll see them here.`
          : `Only people from your following who liked this ${postType} show here.`}
      </Text>
    </View>
  );

  const renderSearchEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={64} color="#8E8E93" />
      <Text style={styles.emptyTitle}>No results found</Text>
      <Text style={styles.emptyMessage}>
        Try searching for a different username.
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (filteredLikes.length <= visibleCount) {
      return <View style={styles.footerSpacer} />;
    }

    return (
      <TouchableOpacity style={styles.showMoreButton} onPress={() => setVisibleCount((prev) => prev + 10)}>
        <Text style={styles.showMoreText}>Show more</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Likes</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.loadingContainer}>
          <ScreenSkeleton variant="people" rows={7} showHeader={false} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Likes</Text>
        <View style={styles.placeholder} />
      </View>

      <FlashList estimatedItemSize={100}
        data={visibleLikes}
        renderItem={renderLikeItem}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={searchQuery.length > 0 ? renderSearchEmptyState : renderEmptyState}
        ListFooterComponent={renderFooter}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={(visibleLikes.length === 0 ? styles.emptyContainer : styles.listContent) as any}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  likesCount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  searchContainer: {
    marginTop: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    marginLeft: 8,
  },
  likeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginRight: 4,
  },
  displayName: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  mutualText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  followButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  followingButtonText: {
    color: colors.text.primary,
  },
  emptyContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  showMoreButton: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  footerSpacer: {
    height: 16,
  },
});



