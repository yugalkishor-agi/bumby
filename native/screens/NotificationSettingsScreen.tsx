import { InlineLoadingSkeleton } from '../components/ui/LoadingSkeleton';
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
import { useAuth } from '../contexts/AuthContext';
import { settingsService } from '../services/settings.service';
import { spacing, typography, useColors, ThemeColors } from '../styles/theme';

type Prefs = {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  stories: boolean;
  liveVideos: boolean;
  reels: boolean;
  messages: boolean;
  messageRequests: boolean;
  reminders: boolean;
  productUpdates: boolean;
};

const DEFAULT_PREFS: Prefs = {
  likes: true,
  comments: true,
  follows: true,
  mentions: true,
  stories: true,
  liveVideos: true,
  reels: true,
  messages: true,
  messageRequests: true,
  reminders: true,
  productUpdates: false,
};

// Toggled by the master switch.
const PUSH_KEYS: Array<keyof Prefs> = [
  'likes',
  'comments',
  'follows',
  'mentions',
  'stories',
  'liveVideos',
  'reels',
  'messages',
  'messageRequests',
];

interface ToggleProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  saving: boolean;
  styles: ReturnType<typeof createStyles>;
  c: ThemeColors;
  last?: boolean;
}

/**
 * Declared at module scope on purpose - defining it inside the screen
 * recreates the component type on every render, which remounts the switch and
 * leaves it visually stuck.
 */
function Toggle({ icon, label, value, onChange, saving, styles, c, last }: ToggleProps) {
  return (
    <View
      style={[
        styles.item,
        !last && { borderBottomColor: c.border.subtle, borderBottomWidth: 1 },
        saving && styles.itemDisabled,
      ]}
    >
      <View style={styles.itemLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={c.accent.primary} />
        </View>
        <Text style={styles.itemTitle}>{label}</Text>
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
          thumbColor={value ? c.accent.onAccent : c.text.secondary}
        />
      )}
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const intro = useRef(new Animated.Value(0)).current;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  const pushEnabled = PUSH_KEYS.every((key) => prefs[key]);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const p = await settingsService.getNotificationPreferences(user.userId);
        setPrefs((prev) => ({ ...prev, ...(p as Partial<Prefs>) }));
      } catch (error) {
        console.error('Failed to load notification preferences:', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.userId]);

  const updatePref = async (key: keyof Prefs, value: boolean) => {
    if (savingKeys[key]) return;

    const previous = prefs[key];
    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setPrefs((prev) => ({ ...prev, [key]: value }));
    try {
      if (user) {
        await settingsService.updateNotificationPreferences(user.userId, { [key]: value } as any);
      }
    } catch (error) {
      console.error(`Failed to update notification preference "${key}":`, error);
      setPrefs((prev) => ({ ...prev, [key]: previous }));
    } finally {
      setSavingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const updateAllPrefs = async (value: boolean) => {
    if (savingKeys.all) return;

    const previous = prefs;
    const next: Prefs = { ...prefs };
    PUSH_KEYS.forEach((key) => {
      next[key] = value;
    });

    setSavingKeys((prev) => ({ ...prev, all: true }));
    setPrefs(next);
    try {
      if (user) await settingsService.updateNotificationPreferences(user.userId, next as any);
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      setPrefs(previous);
    } finally {
      setSavingKeys((prev) => ({ ...prev, all: false }));
    }
  };

  const translateY = intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerButton}>
          {loading ? <InlineLoadingSkeleton /> : null}
        </View>
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer as any}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: intro, transform: [{ translateY }] }}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All notifications</Text>
            <View style={styles.card}>
              <Toggle
                icon="notifications"
                label="Push notifications"
                value={pushEnabled}
                onChange={updateAllPrefs}
                saving={!!savingKeys.all}
                styles={styles}
                c={c}
                last
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Posts & media</Text>
            <View style={styles.card}>
              <Toggle icon="heart" label="Likes" value={prefs.likes} onChange={(v) => updatePref('likes', v)} saving={!!savingKeys.likes} styles={styles} c={c} />
              <Toggle icon="chatbubble" label="Comments" value={prefs.comments} onChange={(v) => updatePref('comments', v)} saving={!!savingKeys.comments} styles={styles} c={c} />
              <Toggle icon="at" label="Mentions" value={prefs.mentions} onChange={(v) => updatePref('mentions', v)} saving={!!savingKeys.mentions} styles={styles} c={c} />
              <Toggle icon="images" label="Stories" value={prefs.stories} onChange={(v) => updatePref('stories', v)} saving={!!savingKeys.stories} styles={styles} c={c} />
              <Toggle icon="videocam" label="Live videos" value={prefs.liveVideos} onChange={(v) => updatePref('liveVideos', v)} saving={!!savingKeys.liveVideos} styles={styles} c={c} />
              <Toggle icon="play" label="Glimpses" value={prefs.reels} onChange={(v) => updatePref('reels', v)} saving={!!savingKeys.reels} styles={styles} c={c} last />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People & messages</Text>
            <View style={styles.card}>
              <Toggle icon="person-add" label="New followers" value={prefs.follows} onChange={(v) => updatePref('follows', v)} saving={!!savingKeys.follows} styles={styles} c={c} />
              <Toggle icon="mail" label="Message requests" value={prefs.messageRequests} onChange={(v) => updatePref('messageRequests', v)} saving={!!savingKeys.messageRequests} styles={styles} c={c} />
              <Toggle icon="chatbubbles" label="Messages" value={prefs.messages} onChange={(v) => updatePref('messages', v)} saving={!!savingKeys.messages} styles={styles} c={c} last />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System</Text>
            <View style={styles.card}>
              <Toggle icon="alarm" label="Reminders" value={prefs.reminders} onChange={(v) => updatePref('reminders', v)} saving={!!savingKeys.reminders} styles={styles} c={c} />
              <Toggle icon="information-circle" label="Product updates" value={prefs.productUpdates} onChange={(v) => updatePref('productUpdates', v)} saving={!!savingKeys.productUpdates} styles={styles} c={c} last />
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
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' as any, color: c.text.primary },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700' as any,
    color: c.text.muted,
    paddingHorizontal: 4,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  card: {
    backgroundColor: c.background.tertiary,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemDisabled: {
    opacity: 0.62,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.md },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    backgroundColor: `${c.accent.primary}16`,
  },
  itemTitle: { fontSize: typography.fontSize.base, fontWeight: '600' as any, color: c.text.primary },
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
