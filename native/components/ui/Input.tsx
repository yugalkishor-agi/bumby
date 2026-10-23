import React, { useMemo } from 'react';
import { View, TextInput, StyleSheet, ViewStyle, TextInputProps } from 'react-native';
import { createCommonStyles, typography, useColors } from '../../styles/theme';

interface InputProps extends TextInputProps {
  containerStyle?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: boolean;
  success?: boolean;
}

export default function Input({
  containerStyle,
  leftIcon,
  rightIcon,
  error,
  success,
  style,
  ...props
}: InputProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);

  const inputContainerStyles = [
    styles.container,
    leftIcon && styles.withLeftIcon,
    rightIcon && styles.withRightIcon,
    error && styles.errorContainer,
    success && styles.successContainer,
    containerStyle,
  ];

  const inputStyles = [
    styles.input,
    leftIcon && styles.inputWithLeftIcon,
    rightIcon && styles.inputWithRightIcon,
    style,
  ];

  return (
    <View style={inputContainerStyles}>
      {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
      <TextInput
        style={inputStyles}
        placeholderTextColor={c.text.muted}
        {...props}
      />
      {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
    </View>
  );
}

const createStyles = (c: ReturnType<typeof useColors>) => {
  const common = createCommonStyles(c);

  return StyleSheet.create({
    container: {
      ...common.input.base,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
    },
    withLeftIcon: {
      paddingLeft: 48,
    },
    withRightIcon: {
      paddingRight: 48,
    },
    errorContainer: {
      borderColor: c.accent.error,
    },
    successContainer: {
      borderColor: c.accent.success,
    },
    input: {
      flex: 1,
      height: '100%',
      color: c.text.primary,
      fontSize: typography.fontSize.base,
      paddingHorizontal: 0,
    },
    inputWithLeftIcon: {
      paddingLeft: 0,
    },
    inputWithRightIcon: {
      paddingRight: 0,
    },
    leftIconContainer: {
      position: 'absolute',
      left: 16,
      zIndex: 1,
    },
    rightIconContainer: {
      position: 'absolute',
      right: 16,
      zIndex: 1,
    },
  });
};
