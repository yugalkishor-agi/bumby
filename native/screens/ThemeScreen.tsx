import { InlineLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, typography, borderRadius, ThemeColors, useColors } from '../styles/theme';

type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_OPTIONS: Array<{ id: ThemePreference; name: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'light', name: 'Light', icon: 'sunny-outline' },
  { id: 'dark', name: 'Dark', icon: 'moon-outline' },
  { id: 'auto', name: 'System', icon: 'phone-portrait-outline' },
];

export default function ThemeScreen() {
  const navigation = useNavigation();
  const { preference, setPreference } = useTheme();
  const themeColors = useColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const [saving, setSaving] = useState(false);

  const handleThemeChange = async (value: ThemePreference) => {
    if (saving || preference === value) return;
    setSaving(true);
    try {
      await setPreference(value);
    } catch {
      Alert.alert('Update failed', "Couldn't change the theme. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Theme</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {THEME_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.option, preference === option.id && styles.selectedOption]}
            onPress={() => handleThemeChange(option.id)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <View style={styles.optionLeft}>
              <Ionicons name={option.icon} size={22} color={themeColors.accent.primary} />
              <Text style={styles.optionText}>{option.name}</Text>
            </View>

            {preference === option.id ? (
              <Ionicons name="checkmark-circle" size={22} color={themeColors.accent.primary} />
            ) : (
              <Ionicons name="ellipse-outline" size={20} color={themeColors.text.secondary} />
            )}
          </TouchableOpacity>
        ))}

        {saving && (
          <View style={styles.savingRow}>
            <InlineLoadingSkeleton />
            <Text style={styles.savingText}>Saving…</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (themeColors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border.subtle,
    },
    title: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold as any,
      color: themeColors.text.primary,
    },
    placeholder: {
      width: 24,
    },
    content: {
      padding: spacing.lg,
      gap: spacing.sm,
    },
    option: {
      backgroundColor: themeColors.background.secondary,
      borderWidth: 1,
      borderColor: themeColors.border.light,
      borderRadius: borderRadius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    selectedOption: {
      borderColor: themeColors.accent.primary,
      backgroundColor: `${themeColors.accent.primary}18`,
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    optionText: {
      fontSize: typography.fontSize.base,
      color: themeColors.text.primary,
      fontWeight: typography.fontWeight.semibold as any,
    },
    savingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    savingText: {
      color: themeColors.text.secondary,
      fontSize: typography.fontSize.sm,
    },
  });
