import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import type { User } from '../types/database';
import { Avatar } from '../components/ui/Avatar';
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import { spacing, typography, useColors } from '../styles/theme';
import { FlashList } from '@shopify/flash-list';

export default function CloseFriendsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [followingUsers, setFollowingUsers] = useState<User[]>([]);
  const [closeFriendIds, setCloseFriendIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.userId) return;

    try {
      setLoading(true);
      const [ids, followingIds] = await Promise.all([
        userService.getCloseFriends(user.userId),
        userService.getFollowing(user.userId, 120),
      ]);
      const profiles = await Promise.all(followingIds.map((id) => userService.getUser(id)));
      setFollowingUsers(profiles.filter((item): item is User => item !== null));
      setCloseFriendIds(ids);
    } catch (error) {
      console.error('Failed to load close friends screen:', error);
      setFollowingUsers([]);
      setCloseFriendIds([]);
    } finally {
      setLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggle = async (targetUserId: string) => {
    if (!user?.userId || savingId) return;

    const isCloseFriend = closeFriendIds.includes(targetUserId);
    try {
      setSavingId(targetUserId);
      if (isCloseFriend) {
        await userService.removeCloseFriend(user.userId, targetUserId);
        setCloseFriendIds((prev) => prev.filter((id) => id !== targetUserId));
      } else {
        await userService.addCloseFriend(user.userId, targetUserId);
        setCloseFriendIds((prev) => Array.from(new Set([...prev, targetUserId])));
      }
    } catch (error) {
      console.error('Failed to update close friends:', error);
      Alert.alert('Update failed', 'Close friends could not be updated right now.');
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return followingUsers;
    return followingUsers.filter((item) => {
      const displayName = String(item.displayName || '').toLowerCase();
      const username = String(item.username || '').toLowerCase();
      return displayName.includes(query) || username.includes(query);
    });
  }, [followingUsers, search]);

  const renderItem = ({ item }: { item: User }) => {
    const saving = savingId === item.userId;
    const isCloseFriend = closeFriendIds.includes(item.userId);

    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.profileArea}
          onPress={() => navigation.navigate('UserProfile', { username: item.username })}
          activeOpacity={0.78}
        >
          <Avatar source={item.avatarURL} size={52} fallbackText={item.displayName || item.username} />
          <View style={styles.profileCopy}>
            <Text style={styles.displayName} numberOfLines={1}>{item.displayName || item.username}</Text>
            <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, isCloseFriend && styles.actionButtonActive, saving && styles.actionButtonDisabled]}
          onPress={() => handleToggle(item.userId)}
          disabled={saving}
          activeOpacity={0.82}
        >
          <Text style={styles.actionText}>
            {saving ? (isCloseFriend ? 'Removing...' : 'Adding...') : (isCloseFriend ? 'Added' : 'Add')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Close Friends</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <ScreenSkeleton variant="people" rows={7} showHeader={false} />
      ) : (
        <FlashList estimatedItemSize={100}
          data={filteredUsers}
          renderItem={renderItem}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={(filteredUsers.length === 0 ? styles.emptyContent : styles.listContent) as any}
          ListHeaderComponent={
            <>
              <View style={styles.heroCard}>
                <Text style={styles.heroTitle}>Private story circle</Text>
                <Text style={styles.heroText}>Choose people who should see close-friends stories first. This screen does a single fetch and does not keep a live listener open.</Text>
                <View style={styles.heroPillRow}>
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>{closeFriendIds.length} selected</Text>
                  </View>
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>{followingUsers.length} following loaded</Text>
                  </View>
                </View>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={c.text.muted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search people you follow"
                  placeholderTextColor={c.text.muted}
                />
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="star-outline" size={44} color={c.text.muted} />
              <Text style={styles.emptyTitle}>{followingUsers.length === 0 ? 'No following found' : 'No matches found'}</Text>
              <Text style={styles.emptyText}>
                {followingUsers.length === 0
                  ? 'Follow accounts first, then add them to your close friends list here.'
                  : 'Try a different search term.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border.subtle,
    },
    headerButton: { width: 28, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' as any, color: c.text.primary },
    listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    emptyContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    heroCard: {
      backgroundColor: c.background.tertiary,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border.subtle,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    heroTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' as any, color: c.text.primary, marginBottom: 6 },
    heroText: { fontSize: typography.fontSize.sm, lineHeight: 20, color: c.text.secondary, marginBottom: spacing.md },
    heroPillRow: { flexDirection: 'row', flexWrap: 'wrap' },
    heroPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      marginRight: spacing.sm,
      marginBottom: spacing.xs,
      backgroundColor: c.background.secondary,
      borderWidth: 1,
      borderColor: c.border.subtle,
    },
    heroPillText: { fontSize: 12, fontWeight: '700' as any, color: c.text.primary },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.background.tertiary,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border.subtle,
      paddingHorizontal: spacing.md,
      height: 52,
      marginBottom: spacing.lg,
    },
    searchInput: { flex: 1, marginLeft: spacing.sm, color: c.text.primary, fontSize: typography.fontSize.base },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 84,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: c.background.tertiary,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border.subtle,
    },
    profileArea: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md },
    profileCopy: { flex: 1, marginLeft: spacing.md },
    displayName: { fontSize: typography.fontSize.base, fontWeight: '600' as any, color: c.text.primary },
    username: { marginTop: 2, fontSize: typography.fontSize.sm, color: c.text.secondary },
    actionButton: {
      minWidth: 88,
      height: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${c.accent.primary}22`,
      borderWidth: 1,
      borderColor: `${c.accent.primary}4A`,
      paddingHorizontal: 14,
    },
    actionButtonActive: {
      backgroundColor: `${c.accent.success}22`,
      borderColor: `${c.accent.success}52`,
    },
    actionButtonDisabled: { opacity: 0.72 },
    actionText: { fontSize: typography.fontSize.sm, fontWeight: '700' as any, color: c.text.primary },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    emptyTitle: { marginTop: spacing.md, fontSize: typography.fontSize.lg, fontWeight: '700' as any, color: c.text.primary },
    emptyText: { marginTop: spacing.sm, fontSize: typography.fontSize.sm, lineHeight: 20, color: c.text.secondary, textAlign: 'center' },
  });

