import { InlineLoadingSkeleton, ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { db } from '../config/firebase';
import { collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { storyService } from '../services/story.service';
import { Avatar } from '../components/ui/Avatar';
import { colors, spacing, typography } from '../styles/theme';
import { FlashList } from '@shopify/flash-list';

export default function HideStoryScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { user } = useAuth();
  const storyId: string | undefined = route?.params?.storyId;
  const [hidden, setHidden] = useState<string[]>([]);
  const [initialHidden, setInitialHidden] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingStory, setSavingStory] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [followingIds, hiddenSnap, story] = await Promise.all([
        userService.getFollowing(user.userId, 200),
        storyId ? Promise.resolve(null) : getDocs(collection(db, `users/${user.userId}/storyHiddenUsers`)),
        storyId ? storyService.getStory(storyId) : Promise.resolve(null),
      ]);
      const profiles = await Promise.all(followingIds.map((id) => userService.getUser(id)));
      setUsers(profiles.filter((u): u is any => u !== null));

      if (storyId) {
        const storyHidden = Array.isArray((story as any)?.hiddenFrom) ? (story as any).hiddenFrom : [];
        setHidden(storyHidden);
        setInitialHidden(storyHidden);
      } else {
        const defaultHidden = hiddenSnap?.docs?.map((d: any) => d.id) || [];
        setHidden(defaultHidden);
        setInitialHidden(defaultHidden);
      }
    } catch (error) {
      console.error('Failed to load hide story data:', error);
      setUsers([]);
      setHidden([]);
      setInitialHidden([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleHide = async (targetUserId: string) => {
    if (!user || savingUserId) return;

    if (storyId) {
      setHidden((prev) => (
        prev.includes(targetUserId)
          ? prev.filter((id) => id !== targetUserId)
          : [...prev, targetUserId]
      ));
      return;
    }

    try {
      setSavingUserId(targetUserId);
      const rowRef = doc(db, `users/${user.userId}/storyHiddenUsers/${targetUserId}`);
      const isHidden = hidden.includes(targetUserId);
      if (isHidden) {
        await deleteDoc(rowRef);
        setHidden((prev) => prev.filter((id) => id !== targetUserId));
      } else {
        await setDoc(rowRef, {
          userId: targetUserId,
          hiddenAt: serverTimestamp(),
        });
        setHidden((prev) => [...prev, targetUserId]);
      }
    } catch (error) {
      console.error('Failed to update hidden story user:', error);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDone = async () => {
    if (!storyId || !user) {
      navigation.goBack();
      return;
    }

    try {
      setSavingStory(true);
      const normalized = Array.from(new Set(hidden.filter((id) => typeof id === 'string' && id && id !== user.userId)));
      await storyService.updateStorySettings(storyId, user.userId, { hiddenFrom: normalized });
      Alert.alert('Updated', 'Story visibility has been updated.');
      navigation.goBack();
    } catch (error) {
      console.error('Failed to update story hidden list:', error);
      Alert.alert('Error', 'Could not update story visibility.');
    } finally {
      setSavingStory(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.displayName || '').toLowerCase();
      const username = String(u.username || '').toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [users, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{storyId ? 'Story Visibility' : 'Hide Story From'}</Text>
        <TouchableOpacity onPress={handleDone} disabled={savingStory}>
          {savingStory ? (
            <InlineLoadingSkeleton />
          ) : (
            <Text style={styles.done}>Done</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor={colors.text.secondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ScreenSkeleton variant="list" rows={6} />
      ) : (
        <FlashList estimatedItemSize={100}
          data={filteredUsers}
          renderItem={({ item }) => {
            const checked = hidden.includes(item.userId);
            const saving = savingUserId === item.userId;
            return (
              <TouchableOpacity style={styles.user} onPress={() => toggleHide(item.userId)} disabled={saving}>
                <Avatar source={item.avatarURL} size={50} fallbackText={item.displayName || item.username || '?'} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{item.displayName || item.username}</Text>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                {saving ? (
                  <InlineLoadingSkeleton />
                ) : (
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item) => item.userId}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="eye-off-outline" size={48} color={colors.text.secondary} />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
      {storyId && hidden.join('|') !== initialHidden.join('|') ? (
        <View style={styles.footerHint}>
          <Text style={styles.footerHintText}>Tap Done to apply changes to this story.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold as any, color: colors.text.primary },
  done: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold as any, color: colors.accent.primary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text.primary },
  user: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  name: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold as any, marginBottom: 2, color: colors.text.primary },
  username: { fontSize: typography.fontSize.sm, color: colors.text.secondary },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border.subtle, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  emptyText: { color: colors.text.secondary, fontSize: typography.fontSize.base },
  footerHint: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
  },
  footerHintText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
});
