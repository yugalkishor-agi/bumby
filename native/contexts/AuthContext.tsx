import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Conditional imports for platform compatibility
let AppState: any;
let AppStateStatus: any;

if (Platform.OS !== 'web') {
  const RN = require('react-native');
  AppState = RN.AppState;
  AppStateStatus = RN.AppStateStatus;
}
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { multiAccountService, biometricPreferenceKey, isMultiAccountError } from '../services/multiAccount.service';
import type { User } from '../types/database';
import { zegoCallService } from '../services/zegoCall.service';

interface SavedAccount {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  avatarURL?: string;
  lastLoginAt: Date;
  biometricEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  // Multi-account features
  savedAccounts: SavedAccount[];
  switchAccount: (accountId: string, alreadyBiometricVerified?: boolean) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  enableBiometric: (accountId: string) => Promise<void>;
  disableBiometric: (accountId: string) => Promise<void>;
  quickSwitchWithBiometric: () => Promise<void>;
  // Online status
  setOnlineStatus: (isOnline: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_VOLATILE_FIELDS: Array<keyof User | 'lastSeen' | 'isOnline'> = ['lastSeen', 'isOnline'];

const stripVolatileUserFields = (user: User | null) => {
  if (!user) return null;
  const normalized = { ...(user as any) };
  USER_VOLATILE_FIELDS.forEach((field) => {
    delete normalized[field];
  });
  return normalized;
};

const hasMeaningfulUserChange = (previousUser: User | null, nextUser: User) => {
  if (!previousUser) return true;
  return JSON.stringify(stripVolatileUserFields(previousUser)) !== JSON.stringify(stripVolatileUserFields(nextUser));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const userDocUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentUserId = user?.userId ?? null;

  // Load saved accounts from storage
  const loadSavedAccounts = async () => {
    try {
      const accounts = await multiAccountService.getAccounts();
      const biometricFlags = await Promise.all(
        accounts.map((acc: any) =>
          AsyncStorage.getItem(biometricPreferenceKey(acc.userId)).then((v) => v === 'true')
        )
      );
      setSavedAccounts(accounts.map((acc: any, index) => ({
        userId: acc.userId,
        email: acc.email,
        username: acc.username,
        displayName: acc.displayName,
        avatarURL: acc.avatarURL,
        lastLoginAt: new Date(acc.lastActive),
        biometricEnabled: biometricFlags[index],
      })));
    } catch (error) {
      console.error('Failed to load saved accounts:', error);
    }
  };

  // Save current account for multi-account switching
  const saveCurrentAccount = async (userData: User) => {
    try {
      // For now, just update the accounts list
      // The addAccount method needs email and password which we don't have here
      // We'll implement this properly when we have the credentials
      console.log('Account saved:', userData.username);
      await loadSavedAccounts();
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  // Start heartbeat for online status
  const startHeartbeat = (userId: string) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    const pushOnline = async () => {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp(),
        });
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    };

    void pushOnline();
    heartbeatIntervalRef.current = setInterval(pushOnline, 30000); // Every 30 seconds
  };

  // Stop heartbeat
  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Set online status
  const setOnlineStatus = async (isOnline: boolean) => {
    if (!currentUserId) return;
    
    try {
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, {
        isOnline,
        lastSeen: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to update online status:', error);
    }
  };

  // Load saved accounts on mount
  useEffect(() => {
    loadSavedAccounts();
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('onAuthStateChanged triggered. User:', firebaseUser?.uid);
      try {
        // Reset previous user document listener when auth user changes
        if (userDocUnsubscribeRef.current) {
          userDocUnsubscribeRef.current();
          userDocUnsubscribeRef.current = null;
        }

        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          console.log('Fetching user document for:', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          console.log('User document fetched. Exists:', userDoc.exists());
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            // Normalize: ensure userId always matches auth UID for security rules
            const normalizedUser: User = { ...(userData as any), userId: firebaseUser.uid };
            console.log('Normalizing user and calling setUser...');
            setUser((previousUser) => {
              const changed = hasMeaningfulUserChange(previousUser, normalizedUser);
              console.log('hasMeaningfulUserChange:', changed);
              return changed ? normalizedUser : previousUser;
            });

            // Save account for multi-account switching
            await saveCurrentAccount(normalizedUser);

            // Initialize Zego calling
            try {
              if (Platform.OS === 'android' || Platform.OS === 'ios') {
                await zegoCallService.initialize(normalizedUser);
              }
            } catch (e) {
              console.warn('[AuthContext] Failed to initialize Zego call service:', e);
            }

            // Start heartbeat for online status
            startHeartbeat(normalizedUser.userId);

            // Keep auth user state live-synced with Firestore updates (name/avatar/bio/etc)
            userDocUnsubscribeRef.current = onSnapshot(userRef, (snap) => {
              if (!snap.exists()) return;
              const liveUser = { ...(snap.data() as any), userId: firebaseUser.uid } as User;
              setUser((previousUser) => (hasMeaningfulUserChange(previousUser, liveUser) ? liveUser : previousUser));
            });
            console.log('User state successfully synchronized.');
          } else {
            console.warn('User document DOES NOT EXIST in Firestore! Setting user to null.');
            setUser(null);
          }
        } else {
          console.log('Firebase user is null, setting state to null');
          setUser(null);
          stopHeartbeat();
          try {
            zegoCallService.uninitialize();
          } catch {}
        }
      } catch (error: any) {
        console.error('Auth state change error caught:', error);
        setUser(null);
      } finally {
        console.log('Auth state change finally block. Setting loading to false.');
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (userDocUnsubscribeRef.current) {
        userDocUnsubscribeRef.current();
        userDocUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Handle app state and online status
  useEffect(() => {
    if (!currentUserId || Platform.OS === 'web') return;

    const subscription = AppState?.addEventListener('change', async (nextAppState: any) => {
      const isActive = nextAppState === 'active';
      await setOnlineStatus(isActive);
    });

    return () => {
      subscription?.remove();
    };
  }, [currentUserId]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      await authService.signIn(email, password);
      // User state will be updated by onAuthStateChanged
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => {
    setLoading(true);
    try {
      await authService.register(email, password, username, displayName);
      // User state will be updated by onAuthStateChanged
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      try {
        await zegoCallService.uninitialize();
      } catch {}
      await authService.signOut();
      setUser(null);
      stopHeartbeat();
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    try {
      if (updates.displayName) {
        await authService.updateDisplayName(updates.displayName);
      }
      await refreshUser();
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  const refreshUser = async () => {
    if (!auth.currentUser) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const refreshed = userDoc.data() as User;
        const nextUser = { ...(refreshed as any), userId: auth.currentUser.uid } as User;
        setUser((previousUser) => (hasMeaningfulUserChange(previousUser, nextUser) ? nextUser : previousUser));
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await authService.resetPassword(email);
    } catch (error: any) {
      throw error;
    }
  };

  // Multi-account methods
  const switchAccount = async (accountId: string, alreadyBiometricVerified = false) => {
    try {
      setLoading(true);
      try {
        await multiAccountService.switchAccount(accountId, alreadyBiometricVerified);
      } catch (error) {
        if (alreadyBiometricVerified || !isMultiAccountError(error, 'biometric_required')) {
          throw error;
        }
        // The account store refuses until this device re-authenticates. The
        // prompt lives here because it needs UI; the store owns the policy.
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to switch accounts',
          fallbackLabel: 'Use passcode',
        });
        if (!result.success) throw error;
        await multiAccountService.switchAccount(accountId, true);
      }
      // Auth state change will trigger user update
    } catch (error) {
      console.error('Failed to switch account:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const removeAccount = async (accountId: string) => {
    try {
      await multiAccountService.removeAccount(accountId);
      await loadSavedAccounts();
    } catch (error) {
      console.error('Failed to remove account:', error);
      throw error;
    }
  };

  const enableBiometric = async (accountId: string) => {
    try {
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!isAvailable || !isEnrolled) {
        throw new Error('Biometric authentication not available');
      }

      // Store biometric preference
      await AsyncStorage.setItem(biometricPreferenceKey(accountId), 'true');
      await loadSavedAccounts();
    } catch (error) {
      console.error('Failed to enable biometric:', error);
      throw error;
    }
  };

  const disableBiometric = async (accountId: string) => {
    try {
      await AsyncStorage.removeItem(biometricPreferenceKey(accountId));
      await loadSavedAccounts();
    } catch (error) {
      console.error('Failed to disable biometric:', error);
      throw error;
    }
  };

  const quickSwitchWithBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to switch accounts',
        fallbackLabel: 'Use passcode',
      });

      if (result.success) {
        // Show account picker or switch to last account
        const accounts = await multiAccountService.getAccounts();
        if (accounts.length > 0) {
          await switchAccount(accounts[0].userId, true);
        }
      }
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshUser,
    resetPassword,
    savedAccounts,
    switchAccount,
    removeAccount,
    enableBiometric,
    disableBiometric,
    quickSwitchWithBiometric,
    setOnlineStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

