import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator, View } from 'react-native';
import { createCommonStyles, typography, useColors } from '../../styles/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  loadingText,
  fullWidth = true,
  icon,
  style,
  textStyle,
}: ButtonProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);

  const buttonStyles = [
    styles.button,
    variant === 'primary' && styles.primaryButton,
    variant === 'secondary' && styles.secondaryButton,
    variant === 'danger' && styles.dangerButton,
    size === 'small' && styles.smallButton,
    size === 'large' && styles.largeButton,
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.buttonText,
    variant === 'primary' && styles.primaryText,
    variant === 'secondary' && styles.secondaryText,
    variant === 'danger' && styles.dangerText,
    size === 'small' && styles.smallText,
    size === 'large' && styles.largeText,
    textStyle,
  ];

  const resolvedLoadingText = loadingText || title;
  const spinnerColor = variant === 'secondary' ? c.text.primary : c.accent.onAccent;

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <View style={styles.contentWrap}>
        {icon}
        <Text style={textStyles}>{loading ? resolvedLoadingText : title}</Text>
        {loading ? <ActivityIndicator size="small" color={spinnerColor} style={styles.loader} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (c: ReturnType<typeof useColors>) => {
  const common = createCommonStyles(c);

  return StyleSheet.create({
    button: {
      ...common.button.primary,
      flexDirection: 'row',
      gap: 8,
    },
    contentWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    loader: {
      marginLeft: 4,
    },
    primaryButton: {
      backgroundColor: c.interactive.primary,
    },
    secondaryButton: {
      ...common.button.secondary,
    },
    dangerButton: {
      backgroundColor: c.accent.error,
    },
    smallButton: {
      height: 40,
      paddingHorizontal: 16,
    },
    largeButton: {
      height: 56,
      paddingHorizontal: 32,
    },
    fullWidth: {
      width: '100%',
    },
    disabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
    },
    primaryText: {
      color: c.text.inverse,
    },
    secondaryText: {
      color: c.text.primary,
    },
    dangerText: {
      color: c.accent.onAccent,
    },
    smallText: {
      fontSize: typography.fontSize.sm,
    },
    largeText: {
      fontSize: typography.fontSize.lg,
    },
  });
};
