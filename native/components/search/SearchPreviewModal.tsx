import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Avatar } from '../ui/Avatar';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { CachedImage } from '../ui/CachedImage';
import { colors, spacing } from '../../styles/theme';
import { SearchCreatorGlimpse } from '../../hooks/search/searchTypes';

interface SearchPreviewModalProps {
  previewItem: SearchCreatorGlimpse | null;
  /** Called when the user taps the backdrop or presses Android back. */
  onDismiss: () => void;
}

export function SearchPreviewModal({ previewItem, onDismiss }: SearchPreviewModalProps) {
  if (!previewItem) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android hardware back must always have an escape hatch; without this
      // the modal can outlive the long-press that opened it and block touches.
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.previewOverlay}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close preview"
      >
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Pressable style={styles.previewCard} onPress={() => {}}>
          <CachedImage uri={previewItem.previewURL} style={styles.previewImage} resizeMode="cover" />
          <View style={styles.previewShade} />
          <View style={styles.previewHeader}>
            <Avatar source={previewItem.authorAvatarURL} size={46} />
            <View style={styles.previewIdentity}>
              <View style={styles.previewIdentityRow}>
                <Text style={styles.previewUsername} numberOfLines={1}>
                  {previewItem.authorUsername}
                </Text>
                {previewItem.authorVerified ? <VerifiedBadge size={14} /> : null}
              </View>
              <Text style={styles.previewMeta}>{previewItem.reason}</Text>
            </View>
          </View>
          {previewItem.caption ? (
            <View style={styles.previewFooter}>
              <Text style={styles.previewCaption} numberOfLines={3}>
                {previewItem.caption}
              </Text>
              <Text style={styles.previewHint}>Tap outside to close</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,12,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    height: 460,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#080C13',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,10,18,0.18)',
  },
  previewHeader: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIdentity: {
    flex: 1,
    marginLeft: 12,
  },
  previewIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewUsername: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    maxWidth: '86%',
  },
  previewMeta: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  previewFooter: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  previewCaption: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  previewHint: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
});
