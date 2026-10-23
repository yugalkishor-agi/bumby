import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { useAuth } from './AuthContext';
import { settingsService } from '../services/settings.service';

type ThemePreference = 'dark' | 'light' | 'auto';

interface ThemeContextType {
  theme: 'dark' | 'light';
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'iris-theme-preference';

const resolveTheme = (preference: ThemePreference): 'dark' | 'light' => {
  if (preference === 'auto') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return preference;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);

  const userId = user?.userId ?? null;
  // Tracks the preference the user explicitly picked for the current account so
  // a slow backend sync can never overwrite their choice.
  const localChoiceRef = useRef<{ userId: string | null; pref: ThemePreference | null }>({ userId: null, pref: null });
  const preferenceRef = useRef<ThemePreference>('dark');

  useEffect(() => {
    const load = async () => {
      try {
        const savedPref = await AsyncStorage.getItem(STORAGE_KEY);
        const pref: ThemePreference =
          savedPref === 'light' || savedPref === 'dark' || savedPref === 'auto' ? (savedPref as ThemePreference) : 'dark';
        preferenceRef.current = pref;
        setPreferenceState(pref);
        setTheme(resolveTheme(pref));
      } catch {
        setTheme(resolveTheme('dark'));
      } finally {
        setIsInitialized(true);
      }
    };
    void load();
  }, []);

  // Pull the server-side preference once per account. This is read-only: the
  // remote value never gets written back, so a stale device default can no
  // longer overwrite the account's saved theme.
  useEffect(() => {
    if (!isInitialized) return;

    if (!userId) {
      setSyncedUserId(null);
      return;
    }

    if (syncedUserId === userId) return;

    let active = true;

    const syncFromBackend = async () => {
      try {
        const settings = await settingsService.getUserSettings(userId);
        const remoteTheme = settings?.theme;
        if (!active) return;

        if (remoteTheme === 'light' || remoteTheme === 'dark' || remoteTheme === 'auto') {
          // A local pick for this account always wins over the server value.
          if (localChoiceRef.current.userId !== userId) {
            preferenceRef.current = remoteTheme;
            setPreferenceState(remoteTheme);
            setTheme(resolveTheme(remoteTheme));
          }
        }
      } catch {
        // Keep the local preference when the server is unreachable.
      } finally {
        if (active) setSyncedUserId(userId);
      }
    };

    void syncFromBackend();
    return () => {
      active = false;
    };
  }, [isInitialized, userId, syncedUserId]);

  // Persist the preference locally and resolve the active palette.
  useEffect(() => {
    if (!isInitialized) return;

    preferenceRef.current = preference;

    void AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => undefined);
    setTheme(resolveTheme(preference));
  }, [isInitialized, preference]);

  useEffect(() => {
    if (preference !== 'auto') return;
    const sub: any = Appearance.addChangeListener(({ colorScheme }) => {
      setTheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => {
      try {
        sub?.remove?.();
      } catch {}
    };
  }, [preference]);

  const setPreference = useCallback(
    async (pref: ThemePreference) => {
      const previous = preferenceRef.current;
      if (previous === pref) return;

      preferenceRef.current = pref;
      setPreferenceState(pref);
      localChoiceRef.current = { userId, pref };

      if (!userId) return;

      try {
        await settingsService.updateSettings(userId, { theme: pref });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
        // Roll back so the UI keeps matching what is stored on the server.
        preferenceRef.current = previous;
        setPreferenceState(previous);
        localChoiceRef.current = { userId, pref: previous };
        throw error;
      }
    },
    [userId]
  );

  const toggleTheme = useCallback(async () => {
    await setPreference(preferenceRef.current === 'dark' ? 'light' : 'dark');
  }, [setPreference]);

  const value = useMemo<ThemeContextType>(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
