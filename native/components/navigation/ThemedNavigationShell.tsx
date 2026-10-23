import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';
import { navigationRef } from '../../services/navigation.service';
import { useTheme as useAppTheme } from '../../contexts/ThemeContext';
import { ZegoCallInvitationDialog } from '../call/zegoCallComponents';

type ThemedNavigationShellProps = {
  children: React.ReactNode;
};

export default function ThemedNavigationShell({ children }: ThemedNavigationShellProps) {
  const { theme } = useAppTheme();
  const isDark = theme === 'dark';

  const navTheme = useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationDefaultTheme;
    return {
      ...baseTheme,
      dark: isDark,
      colors: {
        ...baseTheme.colors,
        primary: '#EC4899',
        background: isDark ? '#000000' : '#ffffff',
        card: isDark ? '#111111' : '#f8f8f8',
        text: isDark ? '#FFFFFF' : '#000000',
        border: isDark ? '#333333' : '#e5e7eb',
        notification: '#EC4899',
      },
    };
  }, [isDark]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <ZegoCallInvitationDialog />
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={isDark ? '#000000' : '#ffffff'}
        translucent={false}
      />
      {children}
    </NavigationContainer>
  );
}
