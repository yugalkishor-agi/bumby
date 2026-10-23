import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  ImageSourcePropType} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { Image } from 'expo-image';

const irisLogo = require('../../../assets/Images/bumbylogo.png');
const { width } = Dimensions.get('window');

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  variant?: 'default' | 'notification';
  title?: string;
  subtitle?: string;
  actorName?: string;
  actorAvatarURL?: string;
  actorVerified?: boolean;
  thumbnailURL?: string;
  brandSource?: ImageSourcePropType;
  timestampLabel?: string;
  duration?: number;
  onHide: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function Toast({
  visible,
  message,
  type = 'info',
  variant = 'default',
  title,
  subtitle,
  actorName,
  actorAvatarURL,
  actorVerified = false,
  thumbnailURL,
  brandSource,
  timestampLabel = 'now',
  duration = 4000,
  onHide,
  action,
}: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const resolvedBrandSource = useMemo(() => brandSource || irisLogo, [brandSource]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 150,
          friction: 16,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }

    hideToast();
  }, [visible, duration]);

  const hideToast = () => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: -100,
        useNativeDriver: true,
        tension: 150,
        friction: 16,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  const getToastStyle = () => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: '#10B981',
          borderColor: '#059669',
        };
      case 'error':
        return {
          backgroundColor: '#EF4444',
          borderColor: '#DC2626',
        };
      case 'warning':
        return {
          backgroundColor: '#F59E0B',
          borderColor: '#D97706',
        };
      default:
        return {
          backgroundColor: colors.accent.primary,
          borderColor: colors.accent.primary,
        };
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'warning';
      default:
        return 'information-circle';
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={[styles.toast, variant === 'notification' ? styles.notificationToast : getToastStyle()]}>
        {variant === 'notification' ? (
          <>
            <View style={styles.notificationTopRow}>
              <View style={styles.brandChip}>
                <Image source={resolvedBrandSource} style={styles.brandLogo} contentFit="contain" />
                <Text style={styles.brandLabel}>Bumby</Text>
              </View>
              <Text style={styles.notificationTime}>{timestampLabel}</Text>
            </View>

            <View style={styles.notificationMainRow}>
              <View style={styles.actorWrap}>
                <Avatar source={actorAvatarURL} size={52} fallbackText={actorName || '?'} />
              </View>

              <View style={styles.notificationBody}>
                <View style={styles.notificationIdentityRow}>
                  <Text style={styles.notificationTitle} numberOfLines={1}>
                    {title || actorName || 'New activity'}
                  </Text>
                  {actorVerified ? <VerifiedBadge size={14} style={styles.notificationVerified} /> : null}
                </View>
                {subtitle ? (
                  <Text style={styles.notificationSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
                <Text style={styles.notificationMessage} numberOfLines={2}>
                  {message}
                </Text>
              </View>

              {thumbnailURL ? (
                <Image source={{ uri: thumbnailURL }} style={styles.notificationThumbnail} contentFit="cover" />
              ) : null}
            </View>

            <View style={styles.notificationBottomRow}>
              {action ? (
                <TouchableOpacity
                  style={styles.notificationActionButton}
                  onPress={action.onPress}
                  activeOpacity={0.85}
                >
                  <Text style={styles.notificationActionText}>{action.label}</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}

              <TouchableOpacity
                style={styles.closeButton}
                onPress={hideToast}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#D9F7FF" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.content}>
              <Ionicons
                name={getIcon() as any}
                size={20}
                color="#FFFFFF"
                style={styles.icon}
              />
              <Text style={styles.message} numberOfLines={2}>
                {message}
              </Text>
            </View>

            {action && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={action.onPress}
                activeOpacity={0.7}
              >
                <Text style={styles.actionText}>{action.label}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={hideToast}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    maxWidth: Math.min(width - spacing.xl, 460),
  },
  notificationToast: {
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: 'rgba(6, 10, 18, 0.98)',
    borderColor: 'rgba(96, 224, 255, 0.24)',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
  },
  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 208, 225, 0.12)',
  },
  brandLogo: {
    width: 16,
    height: 16,
  },
  brandLabel: {
    color: '#D9F7FF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
    letterSpacing: 0.4,
  },
  notificationTime: {
    color: 'rgba(217, 247, 255, 0.62)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
  notificationMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actorWrap: {
    marginRight: spacing.md,
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
  },
  notificationIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
    flexShrink: 1,
  },
  notificationVerified: {
    marginLeft: 4,
  },
  notificationSubtitle: {
    color: '#7DD3FC',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    marginTop: 1,
  },
  notificationMessage: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  notificationThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginLeft: spacing.md,
    backgroundColor: colors.background.tertiary,
  },
  notificationBottomRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#4DD0E1',
  },
  notificationActionText: {
    color: '#04131A',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  actionButton: {
    marginLeft: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: borderRadius.sm,
  },
  actionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: '#FFFFFF',
  },
  closeButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
});
