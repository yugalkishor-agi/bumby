import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius } from '../../styles/theme';

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
  animated?: boolean;
}

export function LoadingSkeleton({
  width = '100%',
  height = 20,
  borderRadius: radius = borderRadius.sm,
  style,
  animated = true,
}: LoadingSkeletonProps) {
  const opacity = useSharedValue(animated ? 0.58 : 1);

  React.useEffect(() => {
    if (animated) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 850 }),
          withTiming(0.58, { duration: 850 })
        ),
        -1,
        true
      );
      return;
    }
    opacity.value = 1;
  }, [animated, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: radius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function PostSkeleton() {
  return (
    <View style={styles.postSkeleton}>
      <View style={styles.postHeader}>
        <LoadingSkeleton width={40} height={40} borderRadius={20} />
        <View style={styles.postHeaderText}>
          <LoadingSkeleton width={120} height={16} />
          <LoadingSkeleton width={80} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
      <LoadingSkeleton width="100%" height={200} style={{ marginVertical: spacing.md }} />
      <LoadingSkeleton width="80%" height={14} />
      <LoadingSkeleton width="60%" height={14} style={{ marginTop: 4 }} />
    </View>
  );
}

export function UserSkeleton() {
  return (
    <View style={styles.userSkeleton}>
      <LoadingSkeleton width={50} height={50} borderRadius={25} />
      <View style={styles.userSkeletonText}>
        <LoadingSkeleton width={100} height={16} />
        <LoadingSkeleton width={80} height={12} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

/**
 * Row shaped like the "people" lists (likes, followers, suggestions):
 * avatar + name/handle stack + a trailing action pill.
 */
export function PeopleRowSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <View style={styles.peopleRowSkeleton}>
      <LoadingSkeleton width={44} height={44} borderRadius={22} />
      <View style={styles.peopleRowSkeletonBody}>
        <LoadingSkeleton width={120} height={15} borderRadius={999} />
        <LoadingSkeleton width={84} height={12} borderRadius={999} style={{ marginTop: 6 }} />
      </View>
      {withAction ? <LoadingSkeleton width={78} height={32} borderRadius={8} /> : null}
    </View>
  );
}

export function CommentSkeleton() {
  return (
    <View style={styles.commentSkeleton}>
      <LoadingSkeleton width={32} height={32} borderRadius={16} />
      <View style={styles.commentSkeletonText}>
        <LoadingSkeleton width={60} height={12} />
        <LoadingSkeleton width="90%" height={14} style={{ marginTop: 4 }} />
        <LoadingSkeleton width="70%" height={14} style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

export function GridSkeleton({ columns = 3, rows = 3 }: { columns?: number; rows?: number }) {
  const items = Array.from({ length: columns * rows }, (_, i) => i);

  return (
    <View style={styles.gridSkeleton}>
      {items.map((item) => (
        <LoadingSkeleton
          key={item}
          width={(100 - (columns - 1) * 2) / columns + '%'}
          height={120}
          style={styles.gridItem}
        />
      ))}
    </View>
  );
}

export function InlineLoadingSkeleton({
  size = 18,
  width,
  height,
  style,
}: {
  size?: number;
  width?: number | string;
  height?: number;
  style?: any;
}) {
  const resolvedHeight = height ?? size;
  const resolvedWidth = width ?? size;
  const radius = typeof resolvedHeight === 'number' ? resolvedHeight / 2 : 999;
  return <LoadingSkeleton width={resolvedWidth} height={resolvedHeight} borderRadius={radius} style={style} />;
}

export function ButtonLoadingSkeleton({
  width = 56,
  inverse = true,
  style,
}: {
  width?: number | string;
  inverse?: boolean;
  style?: any;
}) {
  return (
    <LoadingSkeleton
      width={width}
      height={12}
      borderRadius={999}
      animated={!inverse}
      style={[inverse ? styles.buttonLoaderInverse : styles.buttonLoader, style]}
    />
  );
}
export function ScreenSkeleton({
  variant = 'list',
  rows = 5,
  showHeader = true,
}: {
  variant?: 'list' | 'grid' | 'comments' | 'cards' | 'chat' | 'people';
  rows?: number;
  showHeader?: boolean;
}) {
  const header = showHeader ? (
    <View style={styles.screenHeader}>
      <LoadingSkeleton width={28} height={28} borderRadius={14} />
      <LoadingSkeleton width={132} height={24} borderRadius={12} />
      <LoadingSkeleton width={28} height={28} borderRadius={14} />
    </View>
  ) : null;

  if (variant === 'grid') {
    return (
      <View style={styles.screenSkeleton}>
        {header}
        <GridSkeleton rows={rows} />
      </View>
    );
  }

  if (variant === 'comments') {
    return (
      <View style={styles.screenSkeleton}>
        {header}
        {Array.from({ length: rows }).map((_, index) => (
          <CommentSkeleton key={index} />
        ))}
      </View>
    );
  }

  if (variant === 'cards') {
    return (
      <View style={styles.screenSkeleton}>
        {header}
        {Array.from({ length: rows }).map((_, index) => (
          <View key={index} style={styles.cardSkeleton}>
            <LoadingSkeleton width={42} height={42} borderRadius={21} />
            <View style={styles.cardSkeletonBody}>
              <LoadingSkeleton width={index % 2 === 0 ? '36%' : '48%'} height={16} borderRadius={999} />
              <LoadingSkeleton width="78%" height={12} borderRadius={999} style={{ marginTop: 8 }} />
              <LoadingSkeleton width="52%" height={12} borderRadius={999} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'chat') {
    return (
      <View style={styles.screenSkeleton}>
        <View style={styles.chatHeaderSkeleton}>
          <LoadingSkeleton width={24} height={24} borderRadius={12} />
          <LoadingSkeleton width={42} height={42} borderRadius={21} />
          <View style={styles.chatHeaderText}>
            <LoadingSkeleton width={132} height={16} borderRadius={999} />
            <LoadingSkeleton width={88} height={12} borderRadius={999} style={{ marginTop: 8 }} />
          </View>
        </View>
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.chatBubbleSkeleton,
              index % 3 === 0 ? styles.chatBubbleRight : styles.chatBubbleLeft,
            ]}
          >
            <LoadingSkeleton width={index % 2 === 0 ? '78%' : '56%'} height={46} borderRadius={18} />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'people') {
    return (
      <View style={styles.screenSkeleton}>
        {header}
        {Array.from({ length: rows }).map((_, index) => (
          <PeopleRowSkeleton key={index} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screenSkeleton}>
      {header}
      {Array.from({ length: rows }).map((_, index) => (
        <UserSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.background.secondary,
  },
  postSkeleton: {
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    marginBottom: spacing.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  postHeaderText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  userSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background.primary,
  },
  userSkeletonText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  peopleRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  peopleRowSkeletonBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  commentSkeleton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.sm,
    backgroundColor: colors.background.primary,
  },
  commentSkeletonText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  gridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  gridItem: {
    marginBottom: spacing.sm,
  },
  screenSkeleton: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background.secondary,
  },
  cardSkeletonBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatHeaderSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  chatHeaderText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatBubbleSkeleton: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  chatBubbleLeft: {
    alignItems: 'flex-start',
  },
  chatBubbleRight: {
    alignItems: 'flex-end',
  },
  buttonLoader: {
    opacity: 0.9,
  },
  buttonLoaderInverse: {
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
});

