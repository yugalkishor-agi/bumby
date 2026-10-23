import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../components/ui/Avatar';
import { useColors, ThemeColors } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { userService } from '../services/user.service';
import { settingsService } from '../services/settings.service';

interface SettingItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  route?: string;
  badge?: string;
  toggle?: boolean;
  checked?: boolean;
  onPress?: () => void;
  onToggle?: () => void;
  disabled?: boolean;
  /** Stable key used for the per-item saving state. */
  key?: string;
}

interface SettingSection {
  title: string;
  items: SettingItem[];
}

const THEME_LABELS: Record<string, string> = {
  dark: 'Dark',
  light: 'Light',
  auto: 'System',
};

export default function SettingsScreenEnhanced() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { preference } = useAppTheme();
  const c = useColors();
  const styles = React.useMemo(() => createStyles(c), [c]);
  const intro = useRef(new Animated.Value(0)).current;
  const userId = user?.userId ?? null;

  const [profileName, setProfileName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [privateAccount, setPrivateAccount] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    if (!user) return;
    setProfileName(user.displayName || user.username || 'Bumby user');
    setProfileHandle(user.username || 'profile');
    setProfileAvatar(user.avatarURL || '');
  }, [user]);

  const loadSettingsSummary = useCallback(async () => {
    if (!userId) return;

    try {
      const [userData, userSettings, privacy] = await Promise.all([
        userService.getUser(userId).catch(() => null),
        settingsService.getUserSettings(userId).catch(() => null),
        settingsService.getPrivacySettings(userId).catch(() => null),
      ]);

      if (userData) {
        setProfileName((prev) => userData.displayName || userData.username || prev);
        setProfileHandle((prev) => userData.username || prev);
        setProfileAvatar(userData.avatarURL || '');
        setTwoFactorAuth(!!(userData as any).twoFactorEnabled);
      }

      if (userSettings) {
        setDataSaver(!!userSettings.dataSaverMode);
      }

      if (privacy) {
        setPrivateAccount(!!privacy.isPrivate);
      }
    } catch (error) {
      console.error('Failed to load settings summary:', error);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadSettingsSummary();
    }, [loadSettingsSummary])
  );

  const runToggle = async (
    key: string,
    currentValue: boolean,
    setValue: React.Dispatch<React.SetStateAction<boolean>>,
    persist: (nextValue: boolean) => Promise<void>,
    label: string
  ) => {
    if (!userId || savingKeys[key]) return;

    const nextValue = !currentValue;
    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setValue(nextValue);
    try {
      await persist(nextValue);
    } catch (error) {
      console.error(`Failed to update ${label}:`, error);
      setValue(currentValue);
      Alert.alert('Update failed', `Couldn't update ${label}. Please try again.`);
    } finally {
      setSavingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            (navigation as any).reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } catch (error) {
            console.error('Logout failed:', error);
          }
        },
      },
    ]);
  };

  const sections: SettingSection[] = [
    {
      title: 'Account',
      items: [
        {
          key: 'edit-profile',
          label: 'Edit Profile',
          icon: 'person-outline',
          description: 'Name, bio, links',
          route: 'EditProfile',
        },
        {
          key: 'privacy',
          label: 'Privacy',
          icon: 'lock-closed-outline',
          description: 'Visibility and interaction controls',
          route: 'PrivacySettings',
          badge: privateAccount ? 'Private' : 'Public',
        },
        {
          key: 'security',
          label: 'Security',
          icon: 'shield-outline',
          description: 'Two-factor auth and app lock',
          route: 'SecuritySettings',
          badge: twoFactorAuth ? '2FA on' : '2FA off',
        },
        {
          key: 'account-settings',
          label: 'Account Settings',
          icon: 'card-outline',
          description: 'Email, password and account actions',
          route: 'AccountSettings',
        },
      ],
    },
    {
      title: 'Messaging',
      items: [
        {
          key: 'message-requests',
          label: 'Message Requests',
          icon: 'mail-outline',
          description: 'Review pending requests',
          onPress: () => (navigation as any).navigate('Messages', { initialTab: 'requests' }),
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          key: 'theme',
          label: 'Theme',
          icon: 'contrast-outline',
          description: 'Light, dark, or system',
          route: 'Theme',
          badge: THEME_LABELS[preference] || 'Dark',
        },
      ],
    },
    {
      title: 'Data',
      items: [
        {
          key: 'data-saver',
          label: 'Data Saver',
          icon: 'cellular-outline',
          description: 'Reduce media usage on mobile data',
          toggle: true,
          checked: dataSaver,
          onToggle: () => runToggle(
            'data-saver',
            dataSaver,
            setDataSaver,
            (nextValue) => settingsService.updateSettings(userId!, { dataSaverMode: nextValue }),
            'data saver'
          ),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          key: 'report-problem',
          label: 'Report a Problem',
          icon: 'flag-outline',
          description: 'Send feedback or a bug report',
          route: 'ReportProblem',
        },
        {
          key: 'help-center',
          label: 'Help Center',
          icon: 'help-circle-outline',
          description: 'FAQs and guides',
          route: 'HelpCenter',
        },
        {
          key: 'privacy-policy',
          label: 'Privacy Policy',
          icon: 'shield-checkmark-outline',
          description: 'How Bumby handles your data',
          route: 'PrivacyPolicy',
        },
        {
          key: 'terms',
          label: 'Terms of Service',
          icon: 'document-text-outline',
          description: 'Account and platform terms',
          route: 'Terms',
        },
        {
          key: 'logs',
          label: 'Logs',
          icon: 'reader-outline',
          description: 'View and share app logs',
          route: 'Logs',
        },
      ],
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number, total: number) => {
    const savingKey = item.key ?? item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const isSaving = !!savingKeys[savingKey];

    const handlePress = () => {
      if (isSaving || item.disabled) return;

      if (item.toggle) {
        item.onToggle?.();
        return;
      }

      if (item.onPress) {
        item.onPress();
        return;
      }

      if (item.route) {
        (navigation as any).navigate(item.route);
      }
    };

    return (
      <TouchableOpacity
        key={`${item.label}-${index}`}
        style={[styles.settingRow, index === total - 1 && styles.lastSettingRow, (isSaving || item.disabled) && styles.settingRowDisabled]}
        onPress={handlePress}
        activeOpacity={0.78}
        disabled={isSaving || item.disabled}
      >
        <View style={styles.settingLeft}>
          <View style={styles.settingIconWrap}>
            <Ionicons
              name={item.icon}
              size={20}
              color={c.accent.primary}
            />
          </View>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingLabel}>{item.label}</Text>
            <Text style={styles.settingDescription}>{item.description}</Text>
          </View>
        </View>

        <View style={styles.settingRight}>
          {isSaving ? (
            <View style={styles.savingBadge}>
              <ActivityIndicator size="small" color={c.accent.primary} style={styles.savingBadgeSpinner} />
              <Text style={styles.savingBadgeText}>Updating</Text>
            </View>
          ) : item.toggle ? (
            <Switch
              value={!!item.checked}
              onValueChange={() => item.onToggle?.()}
              disabled={isSaving || item.disabled}
              trackColor={{ false: c.border.light, true: `${c.accent.primary}66` }}
              thumbColor={item.checked ? c.accent.onAccent : c.text.secondary}
            />
          ) : (
            <>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={c.text.muted} />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const translateY = intro.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerButton} />
      </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer as any}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: intro, transform: [{ translateY }] }}>
          <TouchableOpacity
            style={styles.profileCardWrap}
            onPress={() => (navigation as any).navigate('Main', { screen: 'Profile' })}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[`${c.accent.primary}2A`, c.background.tertiary, c.background.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.profileCard}
            >
              <Avatar source={profileAvatar || undefined} size={56} style={styles.profileAvatar} />
              <View style={styles.profileTextWrap}>
                <Text style={styles.profileName} numberOfLines={1}>{profileName}</Text>
                <Text style={styles.profileHandle} numberOfLines={1}>@{profileHandle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.text.secondary} />
            </LinearGradient>
          </TouchableOpacity>

          {sections.map((section, sectionIndex) => (
            <View key={section.title} style={[styles.section, sectionIndex === 0 && styles.firstSection]}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, itemIndex) => renderSettingItem(item, itemIndex, section.items.length))}
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.82}>
            <Ionicons name="log-out-outline" size={18} color={c.accent.error} style={styles.logoutIcon} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>Bumby v1.0.0</Text>
        </Animated.View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
    backgroundColor: c.background.primary,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 36,
  },
  profileCardWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 22,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: 22,
  },
  profileAvatar: {
    marginRight: 14,
  },
  profileTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: c.text.primary,
    marginBottom: 2,
  },
  profileHandle: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text.secondary,
  },
  section: {
    marginBottom: 20,
  },
  firstSection: {
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: c.background.tertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastSettingRow: {
    borderBottomWidth: 0,
  },
  settingRowDisabled: {
    opacity: 0.62,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: `${c.accent.primary}16`,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text.primary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12.5,
    lineHeight: 17,
    color: c.text.secondary,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 10,
    flexShrink: 0,
  },
  badge: {
    marginRight: 8,
    maxWidth: 96,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: c.background.primary,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text.primary,
  },
  savingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${c.accent.primary}18`,
    borderWidth: 1,
    borderColor: `${c.accent.primary}36`,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingBadgeSpinner: {
    marginRight: 6,
  },
  savingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: c.accent.primary,
  },
  logoutButton: {
    marginTop: 4,
    backgroundColor: c.background.tertiary,
    borderWidth: 1,
    borderColor: `${c.accent.error}33`,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: c.accent.error,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: c.text.muted,
    marginTop: 16,
  },
});
