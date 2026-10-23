import React from 'react';
import { Text, TouchableOpacity, Linking, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, useColors } from '../../styles/theme';

const ensureProtocol = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

/**
 * Tappable website chip. Opens the link in the system browser and falls back
 * to a short error toast when the URL cannot be handled.
 */
export function ProfileWebsiteLink({
  website,
  variant = 'chip',
}: {
  website?: string;
  variant?: 'chip' | 'plain';
}) {
  const c = useColors();

  if (!website) return null;

  const href = ensureProtocol(website);

  const handlePress = async () => {
    try {
      const supported = await Linking.canOpenURL(href);
      if (!supported) {
        Alert.alert('Could not open link', href);
        return;
      }
      await Linking.openURL(href);
    } catch (error) {
      console.error('Failed to open profile website:', error);
      Alert.alert('Could not open link', href);
    }
  };

  if (variant === 'plain') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        style={styles.plainRow}
        accessibilityRole="link"
        accessibilityLabel={`Open ${website}`}
      >
        <Ionicons name="link" size={16} color={c.accent.primary} />
        <Text style={[styles.plainText, { color: c.accent.primary }]} numberOfLines={1}>
          {website}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[styles.chip, { backgroundColor: c.background.secondary }]}
      accessibilityRole="link"
      accessibilityLabel={`Open ${website}`}
    >
      <Ionicons name="link" size={16} color={c.accent.primary} />
      <Text style={[styles.chipText, { color: c.accent.primary }]} numberOfLines={1}>
        {website}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    maxWidth: 240,
  },
  plainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  plainText: {
    fontSize: typography.fontSize.base,
    flexShrink: 1,
  },
});
