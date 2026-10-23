import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { borderRadius, spacing, typography, useColors } from '../styles/theme';
import type { User } from '../types/database';

interface ProfileSummary {
  displayName: string;
  username: string;
  bio: string;
  website: string;
  location: string;
  avatarURL?: string;
}

const EMPTY_SUMMARY: ProfileSummary = {
  displayName: '',
  username: '',
  bio: '',
  website: '',
  location: '',
};

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const c = useColors();
  const { user: currentUser } = useAuth();
  const userId = currentUser?.userId ?? null;

  const [profile, setProfile] = useState<ProfileSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const data = await userService.getUser(userId);
      if (!data) {
        // `getUser` resolves to null on failure - fall back to the auth user so
        // the screen still shows something instead of an empty form.
        console.warn('Profile unavailable, using cached session user');
        setProfile({
          displayName: currentUser?.displayName || '',
          username: currentUser?.username || '',
          bio: currentUser?.bio || '',
          website: currentUser?.website || '',
          location: currentUser?.location || '',
          avatarURL: currentUser?.avatarURL,
        });
        return;
      }

      setProfile({
        displayName: data.displayName || '',
        username: data.username || '',
        bio: data.bio || '',
        website: data.website || '',
        location: data.location || '',
        avatarURL: data.avatarURL,
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
      setProfile({
        displayName: currentUser?.displayName || '',
        username: currentUser?.username || '',
        bio: currentUser?.bio || '',
        website: currentUser?.website || '',
        location: currentUser?.location || '',
        avatarURL: currentUser?.avatarURL,
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: c.background.primary }]}>
        <ActivityIndicator size="large" color={c.accent.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background.primary }]}>
      <View style={[styles.header, { borderBottomColor: c.border.subtle }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text.primary }]}>Edit profile</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={c.text.secondary}
          />
        }
      >
        <View style={[styles.summaryCard, { backgroundColor: c.background.secondary, borderColor: c.border.light }]}>
          {profile.avatarURL ? (
            <Image
              source={{ uri: profile.avatarURL }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: c.background.tertiary }]}>
              <Ionicons name="person" size={28} color={c.text.muted} />
            </View>
          )}
          <View style={styles.summaryText}>
            <Text style={[styles.summaryName, { color: c.text.primary }]} numberOfLines={1}>
              {profile.displayName || 'Add a name'}
            </Text>
            <Text style={[styles.summaryHandle, { color: c.text.secondary }]} numberOfLines={1}>
              @{profile.username || 'username'}
            </Text>
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: c.background.tertiary, borderColor: c.border.light }]}>
          <Row
            icon="person-circle-outline"
            label="Profile photo"
            value={profile.avatarURL ? 'Change' : 'Add'}
            onPress={() => (navigation as any).navigate('AvatarEditor')}
          />
          <Row
            icon="text-outline"
            label="Display name"
            value={profile.displayName}
            onPress={() => (navigation as any).navigate('NameEditor')}
          />
          <Row
            icon="document-text-outline"
            label="Bio"
            value={profile.bio}
            onPress={() => (navigation as any).navigate('BioEditor')}
            last
          />
        </View>

        <View style={[styles.group, { backgroundColor: c.background.tertiary, borderColor: c.border.light }]}>
          <Row
            icon="globe-outline"
            label="Website"
            value={profile.website}
            onPress={() => (navigation as any).navigate('WebsiteEditor')}
          />
          <Row
            icon="location-outline"
            label="Location"
            value={profile.location}
            onPress={() => (navigation as any).navigate('LocationEditor')}
            last
          />
        </View>

        <View style={[styles.group, { backgroundColor: c.background.tertiary, borderColor: c.border.light }]}>
          <Row
            icon="at-outline"
            label="Username"
            value={profile.username ? `@${profile.username}` : ''}
            onPress={() =>
              Alert.alert('Username is permanent', 'Your username cannot be changed.')
            }
            locked
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last,
  locked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
  locked?: boolean;
}) {
  const c = useColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !last && { borderBottomColor: c.border.subtle, borderBottomWidth: 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={c.accent.primary} />
      <Text style={[styles.rowLabel, { color: c.text.primary }]}>{label}</Text>
      <Text
        style={[styles.rowValue, { color: value ? c.text.secondary : c.text.muted }]}
        numberOfLines={1}
      >
        {value || 'Not set'}
      </Text>
      <Ionicons
        name={locked ? 'lock-closed' : 'chevron-forward'}
        size={16}
        color={c.text.muted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
  },
  summaryName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryHandle: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  group: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  rowValue: {
    maxWidth: '45%',
    fontSize: typography.fontSize.sm,
    textAlign: 'right',
  },
});
