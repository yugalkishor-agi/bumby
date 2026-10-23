import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, typography, useColors } from '../../styles/theme';

const BIO_LINE_HEIGHT = 22;
const COLLAPSED_LINES = 3;

/**
 * Profile bio with a "more / less" toggle.
 *
 * The toggle only appears when the bio actually overflows the collapsed
 * height - a word-count heuristic used to show it even for short bios that
 * fit on one line.
 */
export function ProfileBio({ bio, align = 'center' }: { bio?: string; align?: 'center' | 'left' }) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  if (!bio) return null;

  const canToggle = lineCount > COLLAPSED_LINES;

  return (
    <View style={styles.block}>
      <Text
        style={[
          styles.bio,
          { color: c.text.primary, textAlign: align },
          !expanded && {
            maxHeight: BIO_LINE_HEIGHT * COLLAPSED_LINES,
            overflow: 'hidden',
          },
        ]}
        onTextLayout={(event) => setLineCount(event.nativeEvent.lines.length)}
      >
        {bio}
      </Text>

      {canToggle ? (
        <TouchableOpacity
          onPress={() => setExpanded((current) => !current)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide full bio' : 'Show full bio'}
        >
          <Text style={[styles.toggle, { color: c.text.secondary }]}>
            {expanded ? 'less' : 'more'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Total post count for a profile.
 *
 * The grid only loads the first page of posts and glimpses, so the loaded
 * length is capped - prefer the denormalised counter on the user document.
 */
export function getProfilePostCount(
  profileUser: any,
  loadedPosts: number,
  loadedGlimpses: number
): number {
  const statsCount = Number(profileUser?.stats?.postsCount);
  if (Number.isFinite(statsCount) && statsCount > 0) {
    return statsCount;
  }
  return loadedPosts + loadedGlimpses;
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bio: {
    fontSize: typography.fontSize.base,
    lineHeight: BIO_LINE_HEIGHT,
  },
  toggle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
