import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { colors, spacing, typography } from '../styles/theme';
import { ScreenSkeleton, InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Avatar } from '../components/ui/Avatar';
import type { User } from '../types/database';
import { FlashList } from '@shopify/flash-list';

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);

  useEffect(() => {
    loadBlockedUsers();
  }, [user]);

  const loadBlockedUsers = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const blockedIds = await userService.getBlockedUsers(user.userId);
      const users = await Promise.all(
        blockedIds.map(id => userService.getUser(id))
      );
      setBlockedUsers(users.filter((u): u is User => u !== null));
    } catch (error) {
      console.error('Failed to load blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBlockedUsers();
    setRefreshing(false);
  }, []);

  const handleUnblockUser = async (targetUserId: string, username: string) => {
    if (!user || unblockingUserId) return;
    
    Alert.alert(
      'Unblock User',
      `Unblock @${username}? They will be able to follow you and see your posts again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setUnblockingUserId(targetUserId);
            try {
              await userService.unblockUser(user.userId, targetUserId);
              setBlockedUsers(prev => prev.filter(u => u.userId !== targetUserId));
            } catch (error) {
              console.error('Failed to unblock user:', error);
              Alert.alert('Error', 'Failed to unblock user');
            } finally {
              setUnblockingUserId(null);
            }
          }
        }
      ]
    );
  };

  const renderBlockedUser = ({ item }: { item: User }) => (
    <View style={styles.userItem}>
      <TouchableOpacity 
        style={styles.userInfo}
        onPress={() => (navigation as any).navigate('UserProfile', { userId: item.userId })}
      >
        <Avatar source={item.avatarURL} size={50} />
        <View style={styles.userDetails}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.username}>@{item.username}</Text>
          {item.bio && (
            <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => handleUnblockUser(item.userId, item.username)}
        disabled={unblockingUserId === item.userId}
      >
        {unblockingUserId === item.userId ? (
          <InlineLoadingSkeleton />
        ) : (
          <Text style={styles.unblockText}>Unblock</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked Users</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {loading ? (
        <ScreenSkeleton variant="people" rows={7} showHeader={false} />
      ) : blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="ban-outline" size={64} color={colors.text.secondary} />
          <Text style={styles.emptyTitle}>No Blocked Users</Text>
          <Text style={styles.emptySubtitle}>
            Users you block will appear here. You can unblock them anytime.
          </Text>
        </View>
      ) : (
        <FlashList estimatedItemSize={100}
          data={blockedUsers}
          renderItem={renderBlockedUser}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContainer as any}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
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
    borderBottomColor: colors.border.light,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  emptySubtitle: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  listContainer: {
    paddingVertical: spacing.sm,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userDetails: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  displayName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  username: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  bio: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  unblockButton: {
    borderWidth: 1,
    borderColor: colors.accent.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 88,
    alignItems: 'center',
  },
  unblockText: {
    color: colors.accent.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});




