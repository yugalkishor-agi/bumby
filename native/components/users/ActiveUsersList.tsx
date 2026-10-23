import { ScreenSkeleton } from '../ui/LoadingSkeleton';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '../ui/Avatar';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';
import { userService } from '../../services/user.service';
import { messageService } from '../../services/message.service';
import { useAuth } from '../../contexts/AuthContext';
import type { User } from '../../types/database';
import { FlashList } from '@shopify/flash-list';

interface ActiveUsersListProps {
  showHeader?: boolean;
  maxUsers?: number;
  horizontal?: boolean;
  onUserPress?: (user: User) => void;
}

export function ActiveUsersList({ 
  showHeader = true, 
  maxUsers = 20, 
  horizontal = false,
  onUserPress 
}: ActiveUsersListProps) {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadActiveUsers = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      // Get both currently online and recently active users
      const [onlineUsers, recentUsers] = await Promise.all([
        userService.getActiveUsers(currentUser.userId, Math.ceil(maxUsers / 2)),
        userService.getRecentlyActiveUsers(currentUser.userId, Math.ceil(maxUsers / 2))
      ]);
      
      // Combine and deduplicate users
      const allUsers = [...onlineUsers, ...recentUsers];
      const uniqueUsers = allUsers.filter((user, index, arr) => 
        arr.findIndex(u => u.userId === user.userId) === index
      ).slice(0, maxUsers);
      
      setActiveUsers(uniqueUsers);
      console.log(`📱 Loaded ${uniqueUsers.length} active users`);
    } catch (error) {
      console.error('Failed to load active users:', error);
      setActiveUsers([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, maxUsers]);

  useEffect(() => {
    loadActiveUsers();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadActiveUsers, 30000);
    return () => clearInterval(interval);
  }, [loadActiveUsers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActiveUsers();
    setRefreshing(false);
  }, [loadActiveUsers]);

  const handleUserPress = async (user: User) => {
    if (onUserPress) {
      onUserPress(user);
      return;
    }

    // Default behavior: start chat with the user
    if (!currentUser) return;

    // Open the chat immediately; the conversation document is created in the
    // background by the chat screen.
    const conversationId = messageService.getDirectConversationId(currentUser.userId, user.userId);
    (navigation as any).navigate('Chat', {
      userId: user.userId,
      conversationId,
    });
  };

  const getLastSeenText = (lastSeen: any) => {
    if (!lastSeen) return 'Recently';
    
    try {
      const date = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / (1000 * 60));
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      
      return 'Recently';
    } catch (error) {
      return 'Recently';
    }
  };

  const renderActiveUser = ({ item: user }: { item: User }) => (
    <TouchableOpacity
      style={horizontal ? styles.horizontalUserItem : styles.userItem}
      onPress={() => handleUserPress(user)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        <Avatar
          source={user.avatarURL}
          size={horizontal ? 56 : 48}
          style={styles.avatar}
        />
        {/* Online Status Indicator */}
        {user.settings?.showOnlineStatus !== false && user.isOnline && (
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} />
          </View>
        )}
      </View>
      
      {!horizontal && (
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {user.displayName || user.username}
            </Text>
            {user.verified && (
              <VerifiedBadge size={14} />
            )}
          </View>
          <Text style={styles.lastSeen}>
            {user.settings?.showOnlineStatus === false ? '' : user.isOnline ? 'Online' : getLastSeenText(user.lastSeen)}
          </Text>
        </View>
      )}
      
      {horizontal && (
        <Text style={styles.horizontalUsername} numberOfLines={1}>
          {user.displayName || user.username}
        </Text>
      )}
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Ionicons name="radio-button-on" size={16} color="#4ade80" />
        <Text style={styles.headerTitle}>Active Now</Text>
        <Text style={styles.userCount}>({activeUsers.length})</Text>
      </View>
      <TouchableOpacity onPress={handleRefresh}>
        <Ionicons name="refresh" size={20} color={colors.text.secondary} />
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={48} color={colors.text.secondary} />
      <Text style={styles.emptyTitle}>No Active Users</Text>
      <Text style={styles.emptyDescription}>
        No users are currently online. Check back later!
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ScreenSkeleton variant="people" rows={7} showHeader={false} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && renderHeader()}
      
      <FlashList estimatedItemSize={100}
        data={activeUsers}
        renderItem={renderActiveUser}
        keyExtractor={(item) => item.userId}
        horizontal={horizontal}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          !horizontal ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent.primary}
            />
          ) : undefined
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={(
          horizontal ? styles.horizontalContent : styles.verticalContent
        ) as any}
        ItemSeparatorComponent={() => 
          horizontal ? <View style={styles.horizontalSeparator} /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },
  userCount: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  horizontalUserItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    width: 80,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    borderWidth: 0,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ade80',
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  username: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
    marginRight: spacing.xs,
  },
  lastSeen: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  horizontalUsername: {
    fontSize: typography.fontSize.xs,
    color: colors.text.primary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  horizontalContent: {
    paddingHorizontal: spacing.md,
  },
  verticalContent: {
    flexGrow: 1,
  },
  horizontalSeparator: {
    width: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
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
  },
});


