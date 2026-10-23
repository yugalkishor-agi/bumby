import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography, borderRadius, useColors } from '../../styles/theme';

interface AboutAccountModalProps {
  visible: boolean;
  onClose: () => void;
  profileUser: any;
  isProfileVerified: boolean;
}

const formatJoinedDate = (value: any) => {
  if (!value) return 'Unknown';
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date?.getTime?.())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// `User` has no `country` field - location lives on the profile or the
// business record.
const getLocationLabel = (user: any) => {
  const candidates = [user?.location, user?.businessInfo?.address];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',').map((part: string) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || trimmed;
  }

  return 'Not available';
};

export function AboutAccountModal({ visible, onClose, profileUser, isProfileVerified }: AboutAccountModalProps) {
  const c = useColors();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const cardStyle = isDark
    ? { backgroundColor: '#0B1220', borderColor: 'rgba(255,255,255,0.1)' }
    : { backgroundColor: c.background.tertiary, borderColor: c.border.medium };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, cardStyle]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.text.primary }]}>About this account</Text>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: c.background.elevated }]}
              onPress={onClose}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={c.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.identity, { borderBottomColor: c.border.light }]}>
            <Avatar source={profileUser?.avatarURL} size={56} style={styles.avatar} />
            <View style={styles.identityText}>
              <Text style={[styles.displayName, { color: c.text.primary }]} numberOfLines={1}>
                {profileUser?.displayName || profileUser?.username}
              </Text>
              <View style={styles.usernameRow}>
                <Text style={[styles.username, { color: c.text.secondary }]} numberOfLines={1}>
                  @{profileUser?.username}
                </Text>
                {isProfileVerified ? <VerifiedBadge size={18} style={styles.inlineBadge} /> : null}
              </View>
            </View>
          </View>

          <View style={styles.facts}>
            <Fact
              icon="calendar-outline"
              label="Joined"
              value={formatJoinedDate(profileUser?.createdAt)}
              iconColor={c.accent.primary}
              iconSurface={c.background.secondary}
              labelColor={c.text.secondary}
              valueColor={c.text.primary}
            />
            <Fact
              icon="earth-outline"
              label="Based in"
              value={getLocationLabel(profileUser)}
              iconColor={c.accent.primary}
              iconSurface={c.background.secondary}
              labelColor={c.text.secondary}
              valueColor={c.text.primary}
            />
          </View>

          {isProfileVerified ? (
            <View style={[styles.verifiedPanel, { backgroundColor: c.background.secondary, borderColor: c.border.light }]}>
              <VerifiedBadge size={16} />
              <Text style={[styles.verifiedText, { color: c.text.secondary }]}>
                Verified account
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Fact({
  icon,
  label,
  value,
  iconColor,
  iconSurface,
  labelColor,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  iconColor: string;
  iconSurface: string;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <View style={styles.factRow}>
      <View style={[styles.factIcon, { backgroundColor: iconSurface }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.factText}>
        <Text style={[styles.factLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.factValue, { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: {
    width: '85%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
  },
  avatar: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  identityText: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  displayName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: typography.fontSize.sm,
    flexShrink: 1,
  },
  inlineBadge: {
    marginLeft: 4,
  },
  facts: {
    gap: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  factLabel: {
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
  factValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  verifiedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  verifiedText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
