import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { settingsService } from '../../services/settings.service';
import { useColors, ThemeColors } from '../../styles/theme';

type LockStatus = 'idle' | 'checking' | 'denied';

const RELOAD_THROTTLE_MS = 30 * 1000;

/**
 * Gates the app behind the device's own authentication when the user has
 * enabled "App Lock" in Security settings.
 *
 * The lock is intentionally forgiving:
 *  - it never arms while the user is signed out
 *  - it never arms when the device has no biometric hardware or no enrolled
 *    biometric, so a user can never be locked out of their own account
 *  - a failed attempt can always be retried, and signing out stays available
 */
export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);

  const userId = user?.userId ?? null;
  const [status, setStatus] = useState<LockStatus>('idle');
  const [message, setMessage] = useState('');

  const appLockEnabled = useRef(false);
  const requireFaceId = useRef(false);
  const wasBackgrounded = useRef(false);
  const lastCheckedAt = useRef(0);
  const promptInFlight = useRef(false);

  const loadSettings = useCallback(async () => {
    if (!userId) {
      appLockEnabled.current = false;
      requireFaceId.current = false;
      return;
    }
    try {
      const settings = await settingsService.getUserSettings(userId);
      appLockEnabled.current = !!settings.appLockEnabled;
      requireFaceId.current = !!settings.requireFaceId;
    } catch {
      appLockEnabled.current = false;
      requireFaceId.current = false;
    }
  }, [userId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Refresh the flag whenever the app returns to the foreground so toggling
  // App Lock takes effect without a restart.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        loadSettings();
      }
    });
    return () => subscription.remove();
  }, [loadSettings]);

  const authenticate = useCallback(async () => {
    if (promptInFlight.current) return;
    promptInFlight.current = true;
    setStatus('checking');
    setMessage('');

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // Nothing to authenticate against - let the user through rather than
        // trapping them behind a lock they cannot open.
        setStatus('idle');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Bumby',
        cancelLabel: 'Cancel',
        disableDeviceFallback: requireFaceId.current,
        fallbackLabel: 'Use passcode',
      });

      if (result.success) {
        setStatus('idle');
        setMessage('');
        return;
      }

      const errorCode = (result as { error?: string }).error;
      setStatus('denied');
      setMessage(
        errorCode === 'user_cancel' || errorCode === 'system_cancel'
          ? 'Cancelled'
          : 'Authentication failed'
      );
    } catch (error) {
      setStatus('idle');
    } finally {
      promptInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setStatus('idle');
      wasBackgrounded.current = false;
      return;
    }

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        const shouldLock =
          wasBackgrounded.current &&
          appLockEnabled.current &&
          Date.now() - lastCheckedAt.current > RELOAD_THROTTLE_MS;

        wasBackgrounded.current = false;

        if (shouldLock) {
          lastCheckedAt.current = Date.now();
          void authenticate();
        }
        return;
      }

      if (next === 'background' || next === 'inactive') {
        wasBackgrounded.current = true;
      }
    });

    return () => subscription.remove();
  }, [userId, authenticate]);

  const locked = status === 'checking' || status === 'denied';

  return (
    <>
      {children}
      <Modal visible={locked} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={30} color={c.accent.primary} />
            </View>
            <Text style={styles.title}>Bumby is locked</Text>
            <Text style={styles.subtitle}>
              {status === 'checking' ? 'Waiting for authentication…' : message || 'Authentication failed'}
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void authenticate()}
              disabled={status === 'checking'}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: c.background.tertiary,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: `${c.accent.primary}1F`,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: c.text.secondary,
    marginBottom: 20,
  },
  primaryButton: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accent.primary,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
