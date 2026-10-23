import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useColors, ThemeColors } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { settingsService } from '../services/settings.service';

interface SecurityToggleRowProps {
  c: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  saving: boolean;
  onToggle: () => void;
}

function SecurityToggleRow({
  c,
  styles,
  icon,
  title,
  description,
  value,
  saving,
  onToggle,
}: SecurityToggleRowProps) {
  return (
    <View style={[styles.row, saving && styles.rowDisabled]}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={c.accent.primary} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
      {saving ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>Saving</Text>
        </View>
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: c.border.light, true: `${c.accent.primary}40` }}
          thumbColor={value ? '#FFFFFF' : c.text.secondary}
        />
      )}
    </View>
  );
}

export default function SecuritySettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const intro = useRef(new Animated.Value(0)).current;
  const userId = user?.userId ?? null;

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [requireFaceId, setRequireFaceId] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [profile, settings] = await Promise.all([
        userService.getUser(userId).catch(() => null),
        settingsService.getUserSettings(userId).catch(() => null),
      ]);

      if (profile) {
        setTwoFactorEnabled(!!(profile as any).twoFactorEnabled);
      }
      if (settings) {
        setAppLockEnabled(!!settings.appLockEnabled);
        setRequireFaceId(!!settings.requireFaceId);
      }
    } catch (error) {
      console.error('Failed to load security settings:', error);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const runToggle = async (
    key: string,
    currentValue: boolean,
    setValue: React.Dispatch<React.SetStateAction<boolean>>,
    persist: (next: boolean) => Promise<void>
  ) => {
    if (!userId || savingKeys[key]) return;

    const next = !currentValue;
    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setValue(next);
    try {
      await persist(next);
    } catch (error) {
      console.error(`Failed to update ${key}:`, error);
      setValue(currentValue);
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
        <Text style={styles.headerTitle}>Security</Text>
        <View style={styles.headerButton} />
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer as any}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: intro, transform: [{ translateY }] }}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sign-in</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => (navigation as any).navigate('TwoFactorAuth')}
                activeOpacity={0.78}
              >
                <View style={styles.left}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="shield-checkmark" size={18} color={c.accent.primary} />
                  </View>
                  <View style={styles.textWrap}>
                    <Text style={styles.title}>Two-Factor Authentication</Text>
                    <Text style={styles.description}>Require a code at sign-in</Text>
                  </View>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{twoFactorEnabled ? 'On' : 'Off'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.text.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App lock</Text>
            <View style={styles.card}>
              <SecurityToggleRow
                c={c}
                styles={styles}
                icon="lock-closed"
                title="Lock on resume"
                description="Ask for authentication when Bumby reopens"
                value={appLockEnabled}
                saving={!!savingKeys.appLockEnabled}
                onToggle={() => runToggle(
                  'appLockEnabled',
                  appLockEnabled,
                  setAppLockEnabled,
                  (next) => settingsService.updateSettings(userId!, { appLockEnabled: next })
                )}
              />
              {appLockEnabled ? (
                <SecurityToggleRow
                  c={c}
                  styles={styles}
                  icon="scan"
                  title="Require Face ID"
                  description="Biometrics only, no passcode fallback"
                  value={requireFaceId}
                  saving={!!savingKeys.requireFaceId}
                  onToggle={() => runToggle(
                    'requireFaceId',
                    requireFaceId,
                    setRequireFaceId,
                    (next) => settingsService.updateSettings(userId!, { requireFaceId: next })
                  )}
                />
              ) : null}
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
    fontSize: 18,
    fontWeight: '700',
    color: c.text.primary,
  },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 32 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
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
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  rowDisabled: { opacity: 0.62 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: `${c.accent.primary}16`,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: c.text.primary },
  description: {
    fontSize: 12.5,
    lineHeight: 17,
    color: c.text.secondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: c.background.primary,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: c.text.primary },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${c.accent.primary}18`,
    borderWidth: 1,
    borderColor: `${c.accent.primary}36`,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
});
