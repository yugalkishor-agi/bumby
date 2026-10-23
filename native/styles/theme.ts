/**
 * Design System - Matching Web UI
 * Consistent colors, spacing, typography for all screens
 */

import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export const colors = {
  // Background - Instagram-style dark
  background: {
    primary: '#000000',      // Pure black for AMOLED
    secondary: '#0B0B0E',    // Near-black for cards
    tertiary: '#16161A',     // Elevated surfaces
    elevated: '#1C1C1E',     // Modals/overlays
  },
  
  // Borders - Low alpha for dark mode
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',  // Barely visible
    light: 'rgba(255, 255, 255, 0.12)',   // Separators
    medium: 'rgba(255, 255, 255, 0.16)',  // Cards
    strong: 'rgba(255, 255, 255, 0.24)',  // Focus
  },
  
  // Text - High contrast
  text: {
    primary: '#FFFFFF',      // Pure white for readability
    secondary: '#B3B3B3',    // Lighter gray for metadata
    muted: '#808080',        // Medium gray for hints
    inverse: '#000000',
    link: '#4DD0E1',         // Cyan accent
  },
  
  // Accent
  accent: {
    primary: '#3b82f6',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    onAccent: '#FFFFFF',   // Foreground/icon colour on top of an accent fill
  },
  
  // Interactive
  interactive: {
    primary: '#1C1C1E',
    primaryHover: '#2C2C2E',
    secondary: 'transparent',
  },
};

export const lightColors = {
  background: {
    primary: '#FFFFFF',
    secondary: '#F8F9FB',
    tertiary: '#F2F2F7',
    elevated: '#FFFFFF',
  },
  border: {
    subtle: 'rgba(0, 0, 0, 0.06)',
    light: 'rgba(0, 0, 0, 0.10)',
    medium: 'rgba(0, 0, 0, 0.16)',
    strong: 'rgba(0, 0, 0, 0.24)',
  },
  text: {
    primary: '#000000',
    secondary: '#374151',
    muted: '#6B7280',
    inverse: '#FFFFFF',
    link: '#2563EB',
  },
  accent: {
    primary: '#3b82f6',
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
    onAccent: '#FFFFFF',
  },
  interactive: {
    primary: '#FFFFFF',
    primaryHover: '#F3F4F6',
    secondary: 'transparent',
  },
};

export type ThemeMode = 'dark' | 'light';
export type ThemeColors = typeof colors;

export function getColors(theme: ThemeMode): ThemeColors {
  return theme === 'dark' ? colors : (lightColors as ThemeColors);
}

export function useColors(): ThemeColors {
  const { theme } = useTheme();
  return useMemo(() => getColors(theme), [theme]);
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 28,
    xxxxl: 32,
  },
  
  // Font weights
  fontWeight: {
    regular: '400' as any,
    medium: '500' as any,
    semibold: '600' as any,
    bold: '700' as any,
  },
  
  // Line heights
  lineHeight: {
    tight: 20,
    normal: 24,
    relaxed: 28,
    loose: 32,
  },
};

// Common component styles.
//
// These are theme-aware: build them with `createCommonStyles(useColors())` so
// shared components (Button, Input) follow light/dark mode instead of always
// rendering the frozen dark palette.
export function createCommonStyles(c: ThemeColors) {
  return {
    // Buttons
    button: {
      primary: {
        backgroundColor: c.interactive.primary,
        height: 52,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.xl,
        justifyContent: 'center' as any,
        alignItems: 'center' as any,
      },
      secondary: {
        backgroundColor: c.interactive.secondary,
        borderWidth: 1,
        borderColor: c.border.medium,
        height: 52,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.xl,
        justifyContent: 'center' as any,
        alignItems: 'center' as any,
      },
    },

    // Inputs
    input: {
      base: {
        backgroundColor: c.background.tertiary,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: c.border.medium,
        height: 48,
        paddingHorizontal: spacing.lg,
        color: c.text.primary,
        fontSize: typography.fontSize.base,
      },
      withIcon: {
        paddingLeft: spacing.xxxl + spacing.sm,
      },
    },

    // Cards
    card: {
      base: {
        backgroundColor: c.background.tertiary,
        borderRadius: borderRadius.md,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: c.border.light,
      },
    },

    // Containers
    container: {
      screen: {
        flex: 1,
        backgroundColor: c.background.primary,
      },
      content: {
        paddingHorizontal: spacing.xl,
      },
    },

    // Header
    header: {
      base: {
        flexDirection: 'row' as any,
        justifyContent: 'space-between' as any,
        alignItems: 'center' as any,
        padding: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: c.border.light,
      },
      title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.semibold,
        color: c.text.primary,
      },
    },

    // Shadows - Subtle for dark mode
    shadow: {
      card: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      },
      elevated: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
      },
    },
  };
}

// Instagram-style brand colors
export const brandColors = {
  gradient: {
    story: ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'],
    iris: ['#4DD0E1', '#26C6DA', '#00ACC1'],
  },
  like: '#E91E63',
  verified: '#4DD0E1',
};

// Helper functions
export const getSpacing = (...values: (keyof typeof spacing)[]) => {
  return values.map(v => spacing[v]);
};

export const alpha = (color: string, opacity: number) => {
  // Simple alpha helper
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};
