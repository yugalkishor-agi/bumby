import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { spacing, typography, useColors, ThemeColors } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';
import { settingsService } from '../services/settings.service';

interface PrivacyState {
  isPrivate: boolean;
  showActivityStatus: boolean;
  showReadReceipts: boolean;
  hideLastSeen: boolean;
  hideOnlineStatus: boolean;
}

const DEFAULT_PRIVACY: PrivacyState = {
  isPrivate: false,
  showActivityStatus: true,
  showReadReceipts: true,
  hideLastSeen: false,
  hideOnlineStatus: false,
};

interface ToggleRowProps {
  c: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ c, styles, icon, title, value, saving, onChange }: ToggleRowProps) {
  return (
    <View style={[styles.row, saving && styles.rowDisabled]}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={c.accent.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      {saving ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>Saving</Text>
        </View>
      ) : (
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: c.border.light, true: `${c.accent.primary}40` }}
          thumbColor={value ? '#FFFFFF' : c.text.secondary}
        />
      )}
    </View>
  );
}

interface NavRowProps {
  c: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
}

function NavRow({ c, styles, icon, title, onPress }: NavRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={c.accent.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.text.muted} />
    </TouchableOpacity>
  );
}

export default function PrivacySettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const intro = useRef(new Animated.Value(0)).current;
  const userId = user?.userId ?? null;

  const [privacy, setPrivacy] = useState<PrivacyState>(DEFAULT_PRIVACY);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const p = await settingsService.getPrivacySettings(userId);
        if (cancelled) return;
        setPrivacy({
          isPrivate: !!p.isPrivate,
          showActivityStatus: !!p.showActivityStatus,
          showReadReceipts: !!p.showReadReceipts,
          hideLastSeen: !!p.hideLastSeen,
          hideOnlineStatus: !!p.hideOnlineStatus,
        });
      } catch {
        // keep defaults when the privacy document is missing
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = async (key: keyof PrivacyState, value: boolean) => {
    if (!userId || savingKeys[key]) return;

    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setPrivacy((prev) => ({ ...prev, [key]: value }));
    try {
      await settingsService.updatePrivacySettings(userId, { [key]: value } as any);
    } catch (error) {
      console.error(`Failed to update ${key}:`, error);
      setPrivacy((prev) => ({ ...prev, [key]: !value }));
    } finally {
      setSavingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const translateY = intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={styles.headerButton} />
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer as any}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: intro, transform: [{ translateY }] }}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{privacy.isPrivate ? 'Private account' : 'Public account'}</Text>
            <Text style={styles.heroText}>
              {privacy.isPrivate
                ? 'Only approved followers can see your posts and stories.'
                : 'Anyone can see your posts and stories.'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <ToggleRow
                c={c}
                styles={styles}
                icon="lock-closed"
                title="Private Account"
                value={privacy.isPrivate}
                saving={!!savingKeys.isPrivate}
                onChange={(v) => update('isPrivate', v)}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity</Text>
            <View style={styles.card}>
              <ToggleRow
                c={c}
                styles={styles}
                icon="pulse"
                title="Show Activity Status"
                value={privacy.showActivityStatus}
                saving={!!savingKeys.showActivityStatus}
                onChange={(v) => update('showActivityStatus', v)}
              />
              <ToggleRow
                c={c}
                styles={styles}
                icon="checkmark-done"
                title="Show Read Receipts"
                value={privacy.showReadReceipts}
                saving={!!savingKeys.showReadReceipts}
                onChange={(v) => update('showReadReceipts', v)}
              />
              <ToggleRow
                c={c}
                styles={styles}
                icon="time"
                title="Hide Last Seen"
                value={privacy.hideLastSeen}
                saving={!!savingKeys.hideLastSeen}
                onChange={(v) => update('hideLastSeen', v)}
              />
              <ToggleRow
                c={c}
                styles={styles}
                icon="wifi"
                title="Hide Online Status"
                value={privacy.hideOnlineStatus}
                saving={!!savingKeys.hideOnlineStatus}
                onChange={(v) => update('hideOnlineStatus', v)}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stories</Text>
            <View style={styles.card}>
              <NavRow c={c} styles={styles} icon="eye-off" title="Hide Story From" onPress={() => (navigation as any).navigate('HideStory')} />
              <NavRow c={c} styles={styles} icon="star" title="Close Friends" onPress={() => (navigation as any).navigate('CloseFriends')} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Safety</Text>
            <View style={styles.card}>
              <NavRow c={c} styles={styles} icon="ban" title="Blocked Users" onPress={() => (navigation as any).navigate('BlockedUsers')} />
            </View>
          </View>
        </Animated.View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
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
  headerButton: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700' as any,
    color: c.text.primary,
  },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  heroCard: {
    backgroundColor: c.background.tertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  heroTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700' as any,
    color: c.text.primary,
    marginBottom: 4,
  },
  heroText: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    color: c.text.secondary,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700' as any,
    color: c.text.muted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: c.background.tertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  rowDisabled: {
    opacity: 0.62,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    backgroundColor: `${c.accent.primary}16`,
  },
  title: { fontSize: typography.fontSize.base, fontWeight: '600' as any, color: c.text.primary },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${c.accent.primary}18`,
    borderWidth: 1,
    borderColor: `${c.accent.primary}36`,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700' as any,
    color: c.accent.primary,
  },
});
