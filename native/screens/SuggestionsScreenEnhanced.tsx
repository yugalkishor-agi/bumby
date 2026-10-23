import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, SafeAreaView, RefreshControl, Alert, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { messageService } from '../services/message.service';
import { suggestionService, type SuggestedUser } from '../services/suggestion.service';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { ScreenSkeleton, InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Avatar } from '../components/ui/Avatar';
import type { User } from '../types/database';
import { FlashList } from '@shopify/flash-list';

const { width } = Dimensions.get('window');

export default function SuggestionsScreenEnhanced() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, [user]);

  const loadSuggestions = async (force = false) => {
    if (!user) return;
    setLoading(true);
    try {
      if (force) {
        suggestionService.clearCache(user.userId);
      }

      const [fetchedSuggestions, followingIds] = await Promise.all([
        suggestionService.getPeopleLikeYouSuggestions(user.userId, 20),
        userService.getFollowing(user.userId),
      ]);

      setFollowing(new Set(followingIds));
      setSuggestions((fetchedSuggestions || []).filter((suggestion) => !followingIds.includes(suggestion.userId)));
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      Alert.alert('Error', 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSuggestions(true);
    setRefreshing(false);
  }, [user]);

  const handleFollow = async (suggestion: SuggestedUser) => {
    if (!user || actionLoading) return;

    const targetUserId = suggestion.userId;
    const isCurrentlyFollowing = following.has(targetUserId);
    setActionLoading(targetUserId);
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isCurrentlyFollowing) next.delete(targetUserId); else next.add(targetUserId);
      return next;
    });
    if (!isCurrentlyFollowing) {
      setSuggestions((prev) => prev.filter((s) => s.userId !== targetUserId));
    }

    try {
      if (suggestion.isPrivate) {
        await userService.sendFollowRequest(user.userId, targetUserId);
      } else if (isCurrentlyFollowing) {
        await userService.unfollowUser(user.userId, targetUserId);
        await loadSuggestions(true);
      } else {
        await userService.followUser(user.userId, targetUserId);
      }
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowing) next.add(targetUserId); else next.delete(targetUserId);
        return next;
      });
      if (!isCurrentlyFollowing) {
        await loadSuggestions(true);
      }
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setActionLoading(null);
    }
  };
  const handleUserPress = (suggestion: SuggestedUser) => {
    (navigation as any).navigate('UserProfile', { userId: suggestion.userId });
  };

  const renderSuggestion = ({ item: suggestion }: { item: SuggestedUser }) => {
    const isFollowingUser = following.has(suggestion.userId);
    const isLoading = actionLoading === suggestion.userId;
    const matchedInterests = (suggestion.matchedInterests || []).slice(0, 3);
    const actionLabel = isFollowingUser ? 'Following' : (suggestion.ctaLabel || (suggestion.isPrivate ? 'Request' : 'Follow'));

    return (
      <TouchableOpacity
        style={styles.suggestionCard}
        onPress={() => handleUserPress(suggestion)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#101725', '#0b0f18']}
          style={styles.cardGradient}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={suggestion.isOnline ? ['#34d399', '#10b981'] : ['#1d4ed8', '#1e293b']}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInner}>
                  <Avatar
                    source={suggestion.avatarURL}
                    size={80}
                    style={styles.avatar}
                  />
                </View>
              </LinearGradient>

              {(suggestion as any).suggestionType === 'active' && (suggestion as any).isOnline && (
                <View style={styles.onlineIndicator}>
                  <View style={styles.onlineDot} />
                </View>
              )}
            </View>
          </View>

          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {suggestion.displayName || suggestion.username}
              </Text>
              {suggestion.verified && (
                <VerifiedBadge size={16} />
              )}
            </View>

            <Text style={styles.username} numberOfLines={1}>
              @{suggestion.username}
            </Text>

            {suggestion.bio && (
              <Text style={styles.bio} numberOfLines={2}>
                {suggestion.bio}
              </Text>
            )}

            <View style={styles.whySection}>
              <Ionicons name="sparkles-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.whyText}>
                {suggestion.reason || 'Suggested based on your activity'}
              </Text>
            </View>

            {matchedInterests.length > 0 ? (
              <View style={styles.interestChipRow}>
                {matchedInterests.map((interest) => (
                  <View key={suggestion.userId + '-' + interest} style={styles.interestChip}>
                    <Text style={styles.interestChipText}>{interest.charAt(0).toUpperCase() + interest.slice(1)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.activityText}>{suggestion.activityLabel || 'Suggested based on your activity'}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{suggestion.stats?.followersCount || 0}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{suggestion.stats?.postsCount || 0}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.followButton, isFollowingUser && styles.followingButton]}
              onPress={() => handleFollow(suggestion)}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <InlineLoadingSkeleton />
              ) : (
                <LinearGradient
                  colors={
                    isFollowingUser
                      ? ['#6b7280', '#4b5563']
                      : suggestion.isPrivate
                        ? ['#475569', '#334155']
                        : actionLabel === 'Connect'
                          ? ['#0f766e', '#115e59']
                          : ['#3b82f6', '#1d4ed8']
                  }
                  style={styles.followButtonGradient}
                >
                  <Ionicons
                    name={isFollowingUser ? 'checkmark' : suggestion.isPrivate ? 'lock-closed' : actionLabel === 'Connect' ? 'sparkles' : 'person-add'}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.followButtonText}>
                    {actionLabel}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.messageButton}
              onPress={() => {
                const conversationId = user ? messageService.getDirectConversationId(user.userId, suggestion.userId) : undefined;
                (navigation as any).navigate('Chat', { userId: suggestion.userId, ...(conversationId ? { conversationId } : {}) });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble" size={16} color={colors.accent.primary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
      </TouchableOpacity>
      
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>People like you</Text>
        <Text style={styles.headerSubtitle}>Suggested from your activity</Text>
      </View>
      
      <TouchableOpacity 
        onPress={handleRefresh}
        style={styles.refreshButton}
      >
        <Ionicons name="refresh" size={24} color={colors.accent.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color={colors.text.secondary} />
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyDescription}>
        We will surface better matches here as your activity grows. Try refreshing in a bit.
      </Text>
      <TouchableOpacity style={styles.refreshEmptyButton} onPress={handleRefresh}>
        <Text style={styles.refreshEmptyText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ScreenSkeleton variant="list" rows={6} />
          <Text style={styles.loadingText}>Finding your matches...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      <FlashList estimatedItemSize={100}
        data={suggestions}
        renderItem={renderSuggestion}
        keyExtractor={(item) => item.userId}
        numColumns={2}
        contentContainerStyle={styles.listContent as any}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent.primary}
          />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: 4,
    color: 'rgba(179, 210, 255, 0.72)',
  },
  refreshButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  listContent: {
    padding: spacing.md,
  },
  row: {
    justifyContent: 'space-between',
  },
  suggestionCard: {
    width: (width - spacing.md * 3) / 2,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0,
    shadowRadius: 4,
  },
  cardGradient: {
    padding: spacing.md,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    borderWidth: 0,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4ade80',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  displayName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginRight: spacing.xs,
  },
  username: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  bio: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border.subtle,
    marginHorizontal: spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.sm,
  },
  followButton: {
    flex: 1,
    height: 36,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  followingButton: {
    // Handled by gradient
  },
  followButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  followButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: '#fff',
  },
  messageButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  refreshEmptyButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  refreshEmptyText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: '#fff',
  },
  whySection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.96)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  interestChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  interestChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(37, 99, 235, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.18)',
  },
  interestChipText: {
    fontSize: typography.fontSize.xs,
    color: '#dbeafe',
    fontWeight: typography.fontWeight.medium as any,
  },
  activityText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  whyText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
});












