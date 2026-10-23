import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { settingsService } from '../services/settings.service';
import { useColors } from '../styles/theme';

type SettingScope = 'settings' | 'privacy' | 'notifications';

interface SettingItem {
  label: string;
  type: 'toggle' | 'navigation' | 'action';
  icon: string;
  description?: string;
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  navigateTo?: string;
  danger?: boolean;
  settingKey?: string;
  settingScope?: SettingScope;
  settingValue?: string | number | boolean;
  badge?: string;
  disabled?: boolean;
}

interface SettingsTemplateProps {
  title: string;
  sections: {
    title?: string;
    items: SettingItem[];
  }[];
}

export function createSettingsScreen(config: SettingsTemplateProps) {
  return function SettingsScreen() {
    const navigation = useNavigation();
    const { user } = useAuth();
    const themeColors = useColors();
    const styles = useMemo(() => createStyles(themeColors), [themeColors]);
    const intro = useRef(new Animated.Value(0)).current;

    const [toggleValues, setToggleValues] = useState<Record<string, boolean>>({});
    const [selectedValues, setSelectedValues] = useState<Record<string, any>>({});
    const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

    // Keys the user has already changed. The initial load must not overwrite
    // them - otherwise a slow read clobbers an optimistic update.
    const dirtyKeysRef = useRef<Set<string>>(new Set());

    const allItems = useMemo(() => config.sections.flatMap((section) => section.items), []);

    useEffect(() => {
      Animated.timing(intro, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, [intro]);

    useEffect(() => {
      let cancelled = false;

      const loadPersistedValues = async () => {
        if (!user?.userId) return;

        try {
          const [settings, privacy, notifications] = await Promise.all([
            settingsService.getUserSettings(user.userId).catch(() => ({} as any)),
            settingsService.getPrivacySettings(user.userId).catch(() => ({} as any)),
            settingsService.getNotificationPreferences(user.userId).catch(() => ({} as any)),
          ]);

          if (cancelled) return;

          const nextToggles: Record<string, boolean> = {};
          const nextSelected: Record<string, any> = {};

          allItems.forEach((item) => {
            if (!item.settingKey) return;
            if (dirtyKeysRef.current.has(item.settingKey)) return;

            const scope = item.settingScope || 'settings';
            const source = scope === 'privacy' ? privacy : scope === 'notifications' ? notifications : settings;
            const persistedValue = (source as any)?.[item.settingKey];

            if (item.type === 'toggle') {
              if (typeof persistedValue === 'boolean') {
                nextToggles[item.settingKey] = persistedValue;
              } else if (typeof item.value === 'boolean') {
                nextToggles[item.settingKey] = item.value;
              }
            }

            if (item.type === 'action' && item.settingValue !== undefined) {
              if (persistedValue !== undefined) {
                nextSelected[item.settingKey] = persistedValue;
              } else if (!(item.settingKey in nextSelected)) {
                // Nothing persisted (or the read failed) - fall back to the
                // first declared option so the group always shows a selection.
                nextSelected[item.settingKey] = item.settingValue;
              }
            }
          });

          if (cancelled) return;

          setToggleValues((prev) => ({ ...nextToggles, ...prev }));
          setSelectedValues((prev) => ({ ...nextSelected, ...prev }));
        } catch (error) {
          console.error('Failed to load template settings values:', error);
        }
      };

      void loadPersistedValues();

      return () => {
        cancelled = true;
      };
    }, [allItems, user?.userId]);

    const persistValue = async (item: SettingItem, value: any) => {
      if (!user?.userId || !item.settingKey) return;

      const payload = { [item.settingKey]: value } as any;
      const scope = item.settingScope || 'settings';

      if (scope === 'privacy') {
        await settingsService.updatePrivacySettings(user.userId, payload);
        return;
      }

      if (scope === 'notifications') {
        await settingsService.updateNotificationPreferences(user.userId, payload);
        return;
      }

      await settingsService.updateSettings(user.userId, payload);
    };

    const handleToggle = async (item: SettingItem, value: boolean) => {
      const key = item.settingKey || item.label;
      const previous = toggleValues[key] ?? !!item.value;
      if (savingKeys[key]) return;

      dirtyKeysRef.current.add(key);
      setSavingKeys((prev) => ({ ...prev, [key]: true }));
      setToggleValues((prev) => ({ ...prev, [key]: value }));

      try {
        await persistValue(item, value);
        item.onToggle?.(value);
      } catch (error) {
        console.error('Failed to persist toggle setting:', error);
        setToggleValues((prev) => ({ ...prev, [key]: previous }));
      } finally {
        setSavingKeys((prev) => ({ ...prev, [key]: false }));
      }
    };

    const handleItemPress = async (item: SettingItem) => {
      const key = item.settingKey || item.label;
      if (savingKeys[key]) return;

      if (item.disabled) {
        return;
      }

      if (item.type === 'navigation' && item.navigateTo) {
        navigation.navigate(item.navigateTo as never);
        return;
      }

      if (item.type === 'action' && item.settingKey && item.settingValue !== undefined) {
        const previous = selectedValues[item.settingKey];
        dirtyKeysRef.current.add(item.settingKey);
        setSavingKeys((prev) => ({ ...prev, [key]: true }));
        setSelectedValues((prev) => ({ ...prev, [item.settingKey!]: item.settingValue }));
        try {
          await persistValue(item, item.settingValue);
          item.onPress?.();
        } catch (error) {
          console.error('Failed to persist action setting:', error);
          setSelectedValues((prev) => ({ ...prev, [item.settingKey!]: previous }));
        } finally {
          setSavingKeys((prev) => ({ ...prev, [key]: false }));
        }
        return;
      }

      item.onPress?.();
    };

    const renderItem = (item: SettingItem, index: number, total: number) => {
      const iconName = item.icon as any;
      const key = item.settingKey || item.label;
      const toggleValue = item.type === 'toggle' ? (toggleValues[key] ?? !!item.value) : false;
      const isSaving = !!savingKeys[key];
      const isSelectedAction =
        item.type === 'action' &&
        item.settingKey &&
        item.settingValue !== undefined &&
        selectedValues[item.settingKey] === item.settingValue;

      return (
        <TouchableOpacity
          key={`${item.label}-${item.settingKey || item.icon}`}
          style={[styles.settingItem, index === total - 1 && styles.lastSettingItem, (isSaving || item.disabled) && styles.settingItemDisabled]}
          onPress={() => handleItemPress(item)}
          disabled={item.type === 'toggle' || isSaving || item.disabled}
          activeOpacity={0.78}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrap, item.danger && styles.dangerIconWrap]}>
              <Ionicons
                name={iconName}
                size={20}
                color={item.danger ? themeColors.accent.error : themeColors.accent.primary}
              />
            </View>

            <View style={styles.settingLabelWrap}>
              <Text style={[styles.settingLabel, item.danger && styles.dangerText]}>
                {item.label}
              </Text>
              {!!item.description && (
                <Text style={styles.settingDescription}>{item.description}</Text>
              )}
            </View>
          </View>

          {item.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}

          {item.type === 'toggle' ? (
            <Switch
              value={toggleValue}
              onValueChange={(value) => handleToggle(item, value)}
              trackColor={{ false: themeColors.border.light, true: `${themeColors.accent.primary}66` }}
              thumbColor={toggleValue ? themeColors.accent.onAccent : themeColors.text.secondary}
              disabled={isSaving || item.disabled}
            />
          ) : (
            <Ionicons
              name={
                item.type === 'action'
                  ? isSelectedAction
                    ? 'checkmark-circle'
                    : 'ellipse-outline'
                  : 'chevron-forward'
              }
              size={20}
              color={item.disabled ? themeColors.text.muted : isSelectedAction ? themeColors.accent.primary : themeColors.text.muted}
            />
          )}
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={26} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{config.title}</Text>
          <View style={styles.placeholder} />
        </View>

        <Animated.ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer as any}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: intro,
              transform: [{ translateY }],
            }}
          >
            {config.sections.map((section, index) => (
              <View key={index} style={styles.section}>
                {section.title ? (
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                ) : null}
                <View style={styles.settingsGroup}>
                  {section.items.map((item, itemIndex) => renderItem(item, itemIndex, section.items.length))}
                </View>
              </View>
            ))}
          </Animated.View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  };
}

const createStyles = (themeColors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border.subtle,
      backgroundColor: themeColors.background.primary,
    },
    backButton: {
      width: 36,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: themeColors.text.primary,
      textAlign: 'center',
    },
    placeholder: {
      width: 36,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 22,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: themeColors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    settingsGroup: {
      backgroundColor: themeColors.background.tertiary,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: themeColors.border.subtle,
      overflow: 'hidden',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 15,
      minHeight: 70,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border.subtle,
    },
    lastSettingItem: {
      borderBottomWidth: 0,
    },
    settingItemDisabled: {
      opacity: 0.62,
    },
    settingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 14,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: `${themeColors.accent.primary}16`,
    },
    dangerIconWrap: {
      backgroundColor: `${themeColors.accent.error}1F`,
    },
    settingLabelWrap: {
      flex: 1,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.text.primary,
    },
    settingDescription: {
      marginTop: 3,
      fontSize: 13,
      color: themeColors.text.secondary,
      lineHeight: 18,
    },
    settingRight: {
      minWidth: 76,
      alignItems: 'flex-end',
      justifyContent: 'center',
      marginLeft: 12,
    },
    badge: {
      marginRight: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: themeColors.background.secondary,
      borderWidth: 1,
      borderColor: themeColors.border.light,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: themeColors.text.secondary,
      letterSpacing: 0.2,
    },
    dangerText: {
      color: themeColors.accent.error,
    },
  });








