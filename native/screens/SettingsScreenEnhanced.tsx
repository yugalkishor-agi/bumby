import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../components/ui/Avatar';
import { useColors, ThemeColors } from '../styles/theme';
import { useAuth } from '../contexts/AuthContext';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { userService } from '../services/user.service';
import { settingsService } from '../services/settings.service';
import { storageService } from '../services/storage.service';

interface SettingItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  route?: string;
  params?: Record<string, unknown>;
  badge?: string;
  toggle?: boolean;
  checked?: boolean;
  onPress?: () => void;
  onToggle?: () => void;
  danger?: boolean;
  disabled?: boolean;
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

type FeedMood = 'balanced' | 'friends' | 'discover' | 'trending';

interface FeedControlSettings {
  enabled: boolean;
  friendsVsPublic: number;
  photosVsVideos: number;
  newVsOldViral: number;
  localVsGlobal: number;
  mood: FeedMood;
}

const FEED_CONTROL_CACHE_KEY = 'iris_feed_control_settings_v1_';
const FEED_CONTROL_CACHE_TTL_MINUTES = 60 * 24 * 45;

const DEFAULT_FEED_CONTROL_SETTINGS: FeedControlSettings = {
  enabled: false,
  friendsVsPublic: 0.8,
  photosVsVideos: 0.55,
  newVsOldViral: 0.7,
  localVsGlobal: 0.7,
  mood: 'balanced',
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export default function SettingsScreenEnhanced() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const { preference } = useAppTheme();
  const c = useColors();
  const styles = React.useMemo(() => createStyles(c), [c]);
  const intro = useRef(new Animated.Value(0)).current;

  const [profileName, setProfileName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [privateAccount, setPrivateAccount] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(true);
  const [vanishMode, setVanishMode] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [language, setLanguage] = useState('en');
  const [notificationSummary, setNotificationSummary] = useState('All on');
  const [soundSummary, setSoundSummary] = useState('Balanced');
  const [autoPlaySummary, setAutoPlaySummary] = useState('Videos and stories');
  const [captionsSummary, setCaptionsSummary] = useState('Auto-generated');
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [feedControls, setFeedControls] = useState<FeedControlSettings>(DEFAULT_FEED_CONTROL_SETTINGS);
  const [draftFeedControls, setDraftFeedControls] = useState<FeedControlSettings>(DEFAULT_FEED_CONTROL_SETTINGS);
  const [feedControlSheetVisible, setFeedControlSheetVisible] = useState(false);

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
    setProfileName(user.displayName || user.username || 'Iris user');
    setProfileHandle(user.username || 'profile');
    setProfileAvatar(user.avatarURL || '');
  }, [user]);
  useEffect(() => {
    if (!user?.userId) {
      setFeedControls(DEFAULT_FEED_CONTROL_SETTINGS);
      setDraftFeedControls(DEFAULT_FEED_CONTROL_SETTINGS);
      return;
    }

    const cached = storageService.getCachedData<FeedControlSettings>(FEED_CONTROL_CACHE_KEY, user.userId);
    const next: FeedControlSettings = cached
      ? {
          enabled: !!cached.enabled,
          friendsVsPublic: clamp01(cached.friendsVsPublic),
          photosVsVideos: clamp01(cached.photosVsVideos),
          newVsOldViral: clamp01(cached.newVsOldViral),
          localVsGlobal: clamp01(cached.localVsGlobal),
          mood: cached.mood || 'balanced',
        }
      : DEFAULT_FEED_CONTROL_SETTINGS;

    setFeedControls(next);
    setDraftFeedControls(next);
  }, [user?.userId]);

  const loadSettingsSummary = useCallback(async () => {
    if (!user) return;

    try {
      const [userData, userSettings, privacy, notif] = await Promise.all([
        userService.getUser(user.userId).catch(() => null),
        settingsService.getUserSettings(user.userId).catch(() => null),
        settingsService.getPrivacySettings(user.userId).catch(() => null),
        settingsService.getNotificationPreferences(user.userId).catch(() => null),
      ]);

      if (userData) {
        setProfileName(userData.displayName || userData.username || user.displayName || user.username || 'Iris user');
        setProfileHandle(userData.username || user.username || 'profile');
        setProfileAvatar(userData.avatarURL || user.avatarURL || '');
        setTwoFactorAuth(!!(userData as any).twoFactorEnabled);
      }

      if (userSettings) {
        const enabledSoundFlags = [
          userSettings.messageSounds !== false,
          userSettings.notificationSounds !== false,
          !!userSettings.likeSounds,
          userSettings.hapticFeedback !== false,
          !!userSettings.strongVibration,
        ].filter(Boolean).length;

        const autoPlayVideoEnabled = userSettings.autoPlayVideos !== false;
        const autoPlayStoriesEnabled = userSettings.autoPlayStories !== false;

        setTypingIndicator(userSettings.typingIndicator !== false);
        setVanishMode(!!userSettings.vanishMode);
        setDataSaver(!!userSettings.dataSaver);
        setLanguage(userSettings.language || 'en');
        setSoundSummary(
          enabledSoundFlags >= 4 ? 'Full feedback' :
          enabledSoundFlags === 0 ? 'Silent' :
          enabledSoundFlags <= 2 ? 'Minimal' :
          'Balanced'
        );
        setAutoPlaySummary(
          autoPlayVideoEnabled && autoPlayStoriesEnabled ? 'Videos and stories' :
          autoPlayVideoEnabled ? 'Videos only' :
          autoPlayStoriesEnabled ? 'Stories only' :
          'Off'
        );
        setCaptionsSummary(
          userSettings.alwaysShowCaptions ? 'Always on' :
          userSettings.autoGeneratedCaptions !== false ? 'Auto-generated' :
          'Off'
        );
      }

      if (privacy) {
        setPrivateAccount(!!privacy.isPrivate);
        setTwoFactorAuth((prev) => prev || !!(userData as any)?.twoFactorEnabled);
      }

      if (notif) {
        const liveFlags = [
          notif.likes,
          notif.comments,
          notif.follows,
          notif.mentions,
          notif.stories,
          notif.liveVideos,
          notif.reels,
          notif.messages,
          notif.messageRequests,
          notif.reminders,
          notif.productUpdates,
        ];
        const enabled = liveFlags.filter(Boolean).length;
        setNotificationSummary(enabled === liveFlags.length ? 'All on' : enabled === 0 ? 'Off' : `${enabled}/${liveFlags.length} on`);
      }
    } catch (error) {
      console.error('Failed to load settings summary:', error);
    }
  }, [user]);
  useEffect(() => {
    if (!user?.userId) {
      setFeedControls(DEFAULT_FEED_CONTROL_SETTINGS);
      setDraftFeedControls(DEFAULT_FEED_CONTROL_SETTINGS);
      return;
    }

    const cached = storageService.getCachedData<FeedControlSettings>(FEED_CONTROL_CACHE_KEY, user.userId);
    const next: FeedControlSettings = cached
      ? {
          enabled: !!cached.enabled,
          friendsVsPublic: clamp01(cached.friendsVsPublic),
          photosVsVideos: clamp01(cached.photosVsVideos),
          newVsOldViral: clamp01(cached.newVsOldViral),
          localVsGlobal: clamp01(cached.localVsGlobal),
          mood: cached.mood || 'balanced',
        }
      : DEFAULT_FEED_CONTROL_SETTINGS;

    setFeedControls(next);
    setDraftFeedControls(next);
  }, [user?.userId]);

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
    if (!user || savingKeys[key]) return;

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
  const persistFeedControls = useCallback((next: FeedControlSettings) => {
    if (!user?.userId) return;
    storageService.setCachedData(FEED_CONTROL_CACHE_KEY, user.userId, next, FEED_CONTROL_CACHE_TTL_MINUTES);
  }, [user?.userId]);

  const applyFeedMoodPreset = useCallback((mood: FeedMood): FeedControlSettings => {
    switch (mood) {
      case 'friends':
        return { enabled: true, mood, friendsVsPublic: 0.9, photosVsVideos: 0.65, newVsOldViral: 0.78, localVsGlobal: 0.82 };
      case 'discover':
        return { enabled: true, mood, friendsVsPublic: 0.25, photosVsVideos: 0.42, newVsOldViral: 0.52, localVsGlobal: 0.3 };
      case 'trending':
        return { enabled: true, mood, friendsVsPublic: 0.2, photosVsVideos: 0.25, newVsOldViral: 0.15, localVsGlobal: 0.18 };
      case 'balanced':
      default:
        return { enabled: true, mood: 'balanced', friendsVsPublic: 0.62, photosVsVideos: 0.52, newVsOldViral: 0.6, localVsGlobal: 0.55 };
    }
  }, []);

  const toggleFeedControlEnabled = useCallback(() => {
    const next: FeedControlSettings = { ...feedControls, enabled: !feedControls.enabled };
    setFeedControls(next);
    setDraftFeedControls(next);
    persistFeedControls(next);
  }, [feedControls, persistFeedControls]);

  const openFeedControlSheet = useCallback(() => {
    setDraftFeedControls(feedControls);
    setFeedControlSheetVisible(true);
  }, [feedControls]);

  const closeFeedControlSheet = useCallback(() => {
    setFeedControlSheetVisible(false);
    setDraftFeedControls(feedControls);
  }, [feedControls]);

  const updateFeedControlDraft = useCallback((patch: Partial<FeedControlSettings>) => {
    setDraftFeedControls((prev) => ({
      ...prev,
      ...patch,
      friendsVsPublic: patch.friendsVsPublic === undefined ? prev.friendsVsPublic : clamp01(patch.friendsVsPublic),
      photosVsVideos: patch.photosVsVideos === undefined ? prev.photosVsVideos : clamp01(patch.photosVsVideos),
      newVsOldViral: patch.newVsOldViral === undefined ? prev.newVsOldViral : clamp01(patch.newVsOldViral),
      localVsGlobal: patch.localVsGlobal === undefined ? prev.localVsGlobal : clamp01(patch.localVsGlobal),
    }));
  }, []);

  const saveFeedControls = useCallback(() => {
    setFeedControls(draftFeedControls);
    persistFeedControls(draftFeedControls);
    setFeedControlSheetVisible(false);
  }, [draftFeedControls, persistFeedControls]);

  const sections: SettingSection[] = [
    {
      title: 'Identity & Safety',
      items: [
        {
          label: 'Edit Profile',
          icon: 'person-outline',
          description: 'Name, bio, links and profile details',
          route: 'EditProfile',
        },
        {
          label: 'Privacy',
          icon: 'lock-closed-outline',
          description: 'Audience, activity status and interaction controls',
          route: 'PrivacySettings',
          badge: privateAccount ? 'Private' : 'Public',
        },
        {
          label: 'Security',
          icon: 'shield-outline',
          description: '2FA, login activity and app lock',
          route: 'SecuritySettings',
          badge: twoFactorAuth ? '2FA on' : '2FA off',
        },
        {
          label: 'Account Settings',
          icon: 'card-outline',
          description: 'Email, password, exports and account actions',
          route: 'AccountSettings',
        },
      ],
    },
    {
      title: 'Alerts & Messaging',
      items: [
        {
          label: 'Notifications',
          icon: 'notifications-outline',
          description: 'Push, reminders and activity alerts',
          route: 'NotificationSettings',
          badge: notificationSummary,
        },
        {
          label: 'Message Requests',
          icon: 'mail-outline',
          description: 'Review pending chat requests',
          onPress: () => (navigation as any).navigate('Messages', { initialTab: 'requests' }),
        },
        {
          label: 'Typing Indicator',
          icon: 'ellipsis-horizontal-outline',
          description: 'Let people know when you are typing',
          toggle: true,
          checked: typingIndicator,
          onToggle: () => runToggle(
            'typing-indicator',
            typingIndicator,
            setTypingIndicator,
            (nextValue) => settingsService.updateSettings(user!.userId, { typingIndicator: nextValue }),
            'typing indicator'
          ),
        },
        {
          label: 'Vanish Mode',
          icon: 'flame-outline',
          description: 'Enable disappearing message playback mode',
          toggle: true,
          checked: vanishMode,
          onToggle: () => runToggle(
            'vanish-mode',
            vanishMode,
            setVanishMode,
            (nextValue) => settingsService.updateSettings(user!.userId, { vanishMode: nextValue }),
            'vanish mode'
          ),
        },
        {
          label: 'Sound & Haptics',
          icon: 'volume-high-outline',
          description: 'Notification sounds and vibration feedback',
          route: 'SoundSettings',
          badge: soundSummary,
        },
      ],
    },
    {
      title: 'Playback & Preferences',
      items: [
        {
          label: 'Control Feed Mode',
          icon: 'options-outline',
          description: 'Shift feed between friends, trends, local and global content',
          toggle: true,
          checked: feedControls.enabled,
          onToggle: toggleFeedControlEnabled,
          badge: feedControls.enabled ? 'On' : 'Off',
        },
        {
          label: 'Tune Feed Controls',
          icon: 'options-outline',
          description: 'Fine-tune sliders for friends, media type, freshness and reach',
          onPress: openFeedControlSheet,
          badge: `${Math.round(feedControls.friendsVsPublic * 100)}% friends`,
        },
        {
          label: 'Appearance',
          icon: 'color-palette-outline',
          description: 'Theme and accent styling',
          route: 'AppearanceSettings',
          badge: 'Coming soon',
          disabled: true,
        },
        {
          label: 'Language',
          icon: 'language-outline',
          description: 'App language and content preferences',
          route: 'LanguageSettings',
          badge: 'Coming soon',
          disabled: true,
        },
        {
          label: 'Auto-Play',
          icon: 'play-circle-outline',
          description: 'Video, story and preview playback behavior',
          route: 'AutoPlaySettings',
          badge: autoPlaySummary,
        },
        {
          label: 'Captions',
          icon: 'text-outline',
          description: 'Caption visibility and assistive playback',
          route: 'CaptionsSettings',
          badge: captionsSummary,
        },
        {
          label: 'Data Saver',
          icon: 'cellular-outline',
          description: 'Reduce media usage on mobile networks',
          toggle: true,
          checked: dataSaver,
          onToggle: () => runToggle(
            'data-saver',
            dataSaver,
            setDataSaver,
            (nextValue) => settingsService.updateSettings(user!.userId, { dataSaver: nextValue }),
            'data saver'
          ),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          label: 'Report a Problem',
          icon: 'flag-outline',
          description: 'Send feedback or a bug report',
          route: 'ReportProblem',
        },
        {
          label: 'Help Center',
          icon: 'help-circle-outline',
          description: 'FAQs, guides and troubleshooting',
          route: 'HelpCenter',
        },
        {
          label: 'Privacy Policy',
          icon: 'shield-checkmark-outline',
          description: 'How Iris handles your data',
          route: 'PrivacyPolicy',
        },
        {
          label: 'Terms of Service',
          icon: 'document-text-outline',
          description: 'Account and platform terms',
          route: 'Terms',
        },
      ],
    },
    {
      // Temp section - remove once log capture graduates to a proper screen.
      title: 'Temp',
      items: [
        {
          label: 'Logs',
          icon: 'document-text-outline',
          description: 'View, copy and share every app log in one tap',
          route: 'Logs',
        },
      ],
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number, total: number) => {
    const savingKey = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
        (navigation as any).navigate(item.route, item.params);
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
          <View style={[styles.settingIconWrap, item.danger && styles.dangerIconWrap]}>
            <Ionicons
              name={item.icon}
              size={20}
              color={item.danger ? '#F87171' : c.accent.primary}
            />
          </View>
          <View style={styles.settingTextWrap}>
            <Text style={[styles.settingLabel, item.danger && styles.dangerText]}>{item.label}</Text>
            <Text style={styles.settingDescription}>{item.description}</Text>
          </View>
        </View>

        <View style={styles.settingRight}>
          {item.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.badge}</Text>
            </View>
          ) : null}

          {isSaving ? (
            <View style={styles.savingBadge}>
              <ActivityIndicator size="small" color={c.accent.primary} style={styles.savingBadgeSpinner} />
              <Text style={styles.savingBadgeText}>Updating...</Text>
            </View>
          ) : item.toggle ? (
            <Switch
              value={!!item.checked}
              onValueChange={() => item.onToggle?.()}
              disabled={isSaving || item.disabled}
              trackColor={{ false: c.border.light as any, true: `${c.accent.primary}66` as any }}
              thumbColor={item.checked ? '#FFFFFF' : c.text.secondary}
            />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={c.text.muted} />
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.75}>
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
              <Avatar source={profileAvatar || undefined} size={68} style={styles.profileAvatar} />
              <View style={styles.profileTextWrap}>
                <Text style={styles.profileName}>{profileName}</Text>
                <Text style={styles.profileHandle}>{profileHandle}</Text>
                <Text style={styles.profileMeta}>Account, privacy, playback and notification controls</Text>
                <View style={styles.profileChipRow}>
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipText}>{privateAccount ? 'Private' : 'Public'}</Text>
                  </View>
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipText}>{notificationSummary}</Text>
                  </View>
                  <View style={styles.profileChip}>
                    <Text style={styles.profileChipText}>{THEME_LABELS[preference] || 'Dark'}</Text>
                  </View>
                </View>
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
            <Ionicons name="log-out-outline" size={18} color="#F87171" style={styles.logoutIcon} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>Iris v1.0.0</Text>
        </Animated.View>
      </Animated.ScrollView>

      <Modal
        visible={feedControlSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFeedControlSheet}
      >
        <TouchableOpacity style={styles.feedControlBackdrop} activeOpacity={1} onPress={closeFeedControlSheet}>
          <TouchableOpacity style={styles.feedControlSheet} activeOpacity={1} onPress={() => undefined}>
            <View style={styles.feedControlHandle} />
            <Text style={styles.feedControlTitle}>Control Feed</Text>
            <Text style={styles.feedControlSubTitle}>Simple sliders, instant control.</Text>

            <ScrollView contentContainerStyle={styles.feedControlScroll as any} showsVerticalScrollIndicator={false}>
              <View style={styles.feedMoodRow}>
                {([
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'friends', label: 'Friends' },
                  { key: 'discover', label: 'Discover' },
                  { key: 'trending', label: 'Trending' },
                ] as Array<{ key: FeedMood; label: string }>).map((entry) => {
                  const active = draftFeedControls.mood === entry.key;
                  return (
                    <TouchableOpacity
                      key={entry.key}
                      style={[styles.feedMoodChip, active && styles.feedMoodChipActive]}
                      onPress={() => setDraftFeedControls(applyFeedMoodPreset(entry.key))}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.feedMoodChipText, active && styles.feedMoodChipTextActive]}>{entry.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.feedSliderBlock}>
                <View style={styles.feedSliderHeader}>
                  <Text style={styles.feedSliderLabel}>Friends to Public</Text>
                  <Text style={styles.feedSliderValue}>{Math.round(draftFeedControls.friendsVsPublic * 100)}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={1}
                  value={draftFeedControls.friendsVsPublic}
                  onValueChange={(value) => updateFeedControlDraft({ friendsVsPublic: value, mood: 'balanced' })}
                  minimumTrackTintColor={c.accent.primary}
                  maximumTrackTintColor={c.border.subtle}
                  thumbTintColor="#A7F3D0"
                />
              </View>

              <View style={styles.feedSliderBlock}>
                <View style={styles.feedSliderHeader}>
                  <Text style={styles.feedSliderLabel}>Photos to Videos</Text>
                  <Text style={styles.feedSliderValue}>{Math.round(draftFeedControls.photosVsVideos * 100)}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={1}
                  value={draftFeedControls.photosVsVideos}
                  onValueChange={(value) => updateFeedControlDraft({ photosVsVideos: value, mood: 'balanced' })}
                  minimumTrackTintColor="#22C55E"
                  maximumTrackTintColor={c.border.subtle}
                  thumbTintColor="#BBF7D0"
                />
              </View>

              <View style={styles.feedSliderBlock}>
                <View style={styles.feedSliderHeader}>
                  <Text style={styles.feedSliderLabel}>New to Viral</Text>
                  <Text style={styles.feedSliderValue}>{Math.round(draftFeedControls.newVsOldViral * 100)}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={1}
                  value={draftFeedControls.newVsOldViral}
                  onValueChange={(value) => updateFeedControlDraft({ newVsOldViral: value, mood: 'balanced' })}
                  minimumTrackTintColor="#A855F7"
                  maximumTrackTintColor={c.border.subtle}
                  thumbTintColor="#E9D5FF"
                />
              </View>

              <View style={styles.feedSliderBlock}>
                <View style={styles.feedSliderHeader}>
                  <Text style={styles.feedSliderLabel}>Local to Global</Text>
                  <Text style={styles.feedSliderValue}>{Math.round(draftFeedControls.localVsGlobal * 100)}%</Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={1}
                  value={draftFeedControls.localVsGlobal}
                  onValueChange={(value) => updateFeedControlDraft({ localVsGlobal: value, mood: 'balanced' })}
                  minimumTrackTintColor="#F59E0B"
                  maximumTrackTintColor={c.border.subtle}
                  thumbTintColor="#FDE68A"
                />
              </View>

              <View style={styles.feedControlActions}>
                <TouchableOpacity style={styles.feedCancelButton} onPress={closeFeedControlSheet} activeOpacity={0.85}>
                  <Text style={styles.feedCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.feedSaveButton} onPress={saveFeedControls} activeOpacity={0.85}>
                  <Text style={styles.feedSaveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 22,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: 26,
  },
  profileAvatar: {
    marginRight: 14,
  },
  profileTextWrap: {
    flex: 1,
    marginRight: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text.primary,
    marginBottom: 2,
  },
  profileHandle: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text.secondary,
    marginBottom: 8,
  },
  profileMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: c.text.secondary,
    marginBottom: 12,
  },
  profileChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  profileChip: {
    backgroundColor: c.background.primary,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  profileChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text.primary,
  },
  section: {
    marginBottom: 22,
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
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: c.background.tertiary,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 15,
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
    marginRight: 14,
  },
  settingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: `${c.accent.primary}16`,
  },
  dangerIconWrap: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text.primary,
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: c.text.secondary,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 12,
    flexShrink: 0,
    minWidth: 72,
  },
  badge: {
    marginRight: 10,
    maxWidth: 110,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  dangerText: {
    color: '#F87171',
  },
  feedControlBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  feedControlSheet: {
    backgroundColor: c.background.tertiary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: c.border.subtle,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '88%',
  },
  feedControlHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: c.border.light,
    alignSelf: 'center',
    marginBottom: 10,
  },
  feedControlTitle: {
    color: c.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  feedControlSubTitle: {
    color: c.text.secondary,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  feedControlScroll: {
    paddingBottom: 10,
  },
  feedMoodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  feedMoodChip: {
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.background.secondary,
  },
  feedMoodChipActive: {
    borderColor: `${c.accent.primary}AA`,
    backgroundColor: `${c.accent.primary}22`,
  },
  feedMoodChipText: {
    color: c.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  feedMoodChipTextActive: {
    color: c.text.primary,
  },
  feedSliderBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  feedSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedSliderLabel: {
    color: c.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  feedSliderValue: {
    color: c.accent.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  feedControlActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  feedCancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border.light,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.background.secondary,
  },
  feedCancelButtonText: {
    color: c.text.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  feedSaveButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent.primary,
  },
  feedSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  logoutButton: {
    marginTop: 6,
    backgroundColor: c.background.tertiary,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.2)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F87171',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: c.text.muted,
    marginTop: 16,
  },
});











