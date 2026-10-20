/**
 * Multi-Account Management Service
 * Handles storage, encryption, and switching of up to 3 accounts
 */

import { auth, db } from '../config/firebase';
import { 
  signInWithEmailAndPassword, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService } from './storage.service';
import { authService } from './auth.service';

// Storage keys
const STORAGE_KEYS = {
  ACCOUNTS: 'iris_accounts',
  ACTIVE_ACCOUNT: 'iris_active_account',
  LAST_SWITCH: 'iris_last_switch',
  ENCRYPTION_KEY: 'iris_enc_key'
};

// Maximum accounts allowed
const MAX_ACCOUNTS = 3;

// Rate limiting: minimum time between switches (milliseconds)
const SWITCH_COOLDOWN = 2000; // 2 seconds

export interface StoredAccount {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  avatarURL?: string;
  verified: boolean;
  lastActive: number;
  encryptedToken?: string; // Encrypted refresh token
  encryptedPassword?: string; // Encrypted password for seamless switching
}

interface AccountsData {
  accounts: StoredAccount[];
  activeAccountId: string;
}

/**
 * Error contract for this file: mutators throw instead of returning
 * `{ success, error }` envelopes. `code` is stable and safe to branch on;
 * `message` is what gets surfaced to the user or logged. Reads keep using
 * plain null / empty-array sentinels for "not found" and "nothing here".
 */
export type MultiAccountErrorCode =
  | 'limit_reached'
  | 'profile_not_found'
  | 'account_exists'
  | 'cooldown'
  | 'account_not_found'
  | 'biometric_required'
  | 'credentials_missing'
  | 'auth_failed';

export class MultiAccountError extends Error {
  readonly code: MultiAccountErrorCode;

  constructor(code: MultiAccountErrorCode, message: string) {
    super(message);
    this.name = 'MultiAccountError';
    this.code = code;
  }
}

/** True when `error` came out of this service with a reason worth branching on. */
export const isMultiAccountError = (error: unknown, code?: MultiAccountErrorCode): boolean =>
  (error as MultiAccountError | undefined)?.name === 'MultiAccountError' &&
  (code === undefined || (error as MultiAccountError).code === code);

/** Per-account opt-in flag written by AuthContext's enableBiometric/disableBiometric. */
export const biometricPreferenceKey = (accountId: string) => `biometric_${accountId}`;

class MultiAccountService {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Initialize encryption key for token storage
   */
  private async initEncryption(): Promise<void> {
    if (this.encryptionKey) return;

    try {
      // Try to load existing key
      const storedKey = await AsyncStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
      
      if (storedKey) {
        // Import existing key
        const keyData = JSON.parse(storedKey);
        this.encryptionKey = await crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        this.encryptionKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );

        // Export and store key
        const exportedKey = await crypto.subtle.exportKey('jwk', this.encryptionKey);
        await AsyncStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, JSON.stringify(exportedKey));
      }
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * Encrypt a token using AES-GCM
   */
  private async encryptToken(token: string): Promise<string> {
    await this.initEncryption();
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        data
      );

      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedData), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt a token using AES-GCM
   */
  private async decryptToken(encryptedToken: string): Promise<string> {
    await this.initEncryption();
    if (!this.encryptionKey) throw new Error('Encryption key not initialized');

    try {
      // Decode from base64
      const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      // Decrypt
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encryptedData
      );

      // Convert to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Get all stored accounts
   */
  async getAccounts(): Promise<StoredAccount[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (!data) return [];
      
      const accountsData: AccountsData = JSON.parse(data);
      return accountsData.accounts || [];
    } catch (error) {
      console.error('Failed to get accounts:', error);
      return [];
    }
  }

  /**
   * Get active account ID
   */
  async getActiveAccountId(): Promise<string | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (!data) return null;
      
      const parsed: AccountsData = JSON.parse(data);
      return parsed.activeAccountId || null;
    } catch (error) {
      console.error('Failed to get active account ID:', error);
      return null;
    }
  }

  /**
   * Get active account details
   */
  async getActiveAccount(): Promise<StoredAccount | null> {
    const accounts = await this.getAccounts();
    const activeId = await this.getActiveAccountId();
    
    if (!activeId) return null;
    
    return accounts.find((acc: any) => acc.userId === activeId) || null;
  }

  /**
   * Check if we can add more accounts
   */
  async canAddAccount(): Promise<boolean> {
    const accounts = await this.getAccounts();
    return accounts.length < MAX_ACCOUNTS;
  }

  /**
   * Check rate limiting for account switching
   */
  async canSwitch(): Promise<boolean> {
    try {
      const lastSwitch = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SWITCH);
      if (!lastSwitch) return true;

      const timeSinceLastSwitch = Date.now() - parseInt(lastSwitch, 10);
      return timeSinceLastSwitch >= SWITCH_COOLDOWN;
    } catch {
      return true;
    }
  }

  /**
   * Add a new account.
   *
   * @returns the account as it was persisted.
   * @throws {MultiAccountError} `limit_reached`, `profile_not_found` or
   *   `account_exists`; any Firebase auth failure propagates untouched.
   */
  async addAccount(email: string, password: string): Promise<StoredAccount> {
    // Check account limit
    if (!(await this.canAddAccount())) {
      throw new MultiAccountError('limit_reached', 'Maximum 3 accounts allowed');
    }

    // Sign in to verify credentials
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Get user profile from Firestore
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

    if (!userDoc.exists()) {
      throw new MultiAccountError('profile_not_found', 'User profile not found');
    }

    const userData = userDoc.data();

    // Check if account already exists
    if (await this.hasAccount(firebaseUser.uid)) {
      throw new MultiAccountError('account_exists', 'Account already added');
    }

    // Get refresh token (Firebase automatically handles this)
    const refreshToken = await firebaseUser.getIdToken();
    const encryptedToken = await this.encryptToken(refreshToken);

    // Also encrypt password for seamless account switching
    const encryptedPassword = await this.encryptToken(password);

    // Create stored account
    const newAccount: StoredAccount = {
      userId: firebaseUser.uid,
      username: userData.username,
      email: firebaseUser.email || email,
      displayName: userData.displayName || userData.username,
      avatarURL: userData.avatarURL,
      verified: userData.verified || false,
      lastActive: Date.now(),
      encryptedToken,
      encryptedPassword
    };

    // Add to storage
    const accounts = await this.getAccounts();
    accounts.push(newAccount);

    const accountsData: AccountsData = {
      accounts,
      activeAccountId: (await this.getActiveAccountId()) || newAccount.userId
    };

    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accountsData));

    console.log('✅ Account added successfully:', newAccount.username);
    return newAccount;
  }

  /**
   * Check if account exists
   */
  async hasAccount(userId: string): Promise<boolean> {
    const accounts = await this.getAccounts();
    return accounts.find((acc: any) => acc.userId === userId) !== undefined;
  }

  /**
   * Remove an account.
   *
   * A no-op when there is nothing stored; anything else that goes wrong
   * (sign-out, storage write) propagates to the caller.
   */
  async removeAccount(userId: string): Promise<void> {
    const accounts = await this.getAccounts();
    const activeId = await this.getActiveAccountId();

    if (accounts.length === 0) return;

    const updatedAccounts = accounts.filter((acc: any) => acc.userId !== userId);

    // If removing active account, switch to another or clear
    let newActiveId = activeId;
    if (activeId === userId) {
      newActiveId = updatedAccounts.length > 0 ? updatedAccounts[0].userId : '';

      // Sign out current user if removing active account
      await authService.signOut();
    }

    const accountsData: AccountsData = {
      accounts: updatedAccounts,
      activeAccountId: newActiveId || ''
    };

    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accountsData));
    console.log('✅ Account removed:', userId);
  }

  /**
   * Switch to a different account.
   *
   * `biometricVerified` only matters when the user has turned biometrics on
   * for this account (the `biometric_<userId>` preference); otherwise it is
   * ignored. The service owns the policy, the caller owns the prompt.
   *
   * @throws {MultiAccountError} `cooldown`, `account_not_found`,
   *   `biometric_required`, `auth_failed` or `credentials_missing`.
   */
  async switchAccount(targetUserId: string, biometricVerified = false): Promise<void> {
    // Check rate limiting
    if (!(await this.canSwitch())) {
      throw new MultiAccountError('cooldown', 'Please wait before switching accounts again');
    }

    const accounts = await this.getAccounts();
    const targetAccount = accounts.find((acc: any) => acc.userId === targetUserId);

    if (!targetAccount) {
      throw new MultiAccountError('account_not_found', 'Account not found');
    }

    // Biometric gate, armed only when the user opted in for this account.
    const biometricRequired =
      (await AsyncStorage.getItem(biometricPreferenceKey(targetUserId))) === 'true';
    if (biometricRequired && !biometricVerified) {
      throw new MultiAccountError('biometric_required', 'biometric_required');
    }

    const previousActiveId = await this.getActiveAccountId();

    // Sign out current user first
    await authService.signOut();

    // Try to switch using encrypted password if available
    if (targetAccount.encryptedPassword) {
      let decryptedPassword: string;
      try {
        decryptedPassword = await this.decryptToken(targetAccount.encryptedPassword);
      } catch (error: any) {
        throw new MultiAccountError(
          'auth_failed',
          'Authentication failed. Please login again with this account.'
        );
      }

      await signInWithEmailAndPassword(auth, targetAccount.email, decryptedPassword);
      console.log('✅ Signed in with password for:', targetAccount.username);
    } else if (targetAccount.encryptedToken) {
      // Firebase Web SDK has no direct token sign-in, so a decryptable refresh
      // token still isn't enough - the account has to be signed in again.
      try {
        await this.decryptToken(targetAccount.encryptedToken);
      } catch (error) {
        throw new MultiAccountError(
          'credentials_missing',
          'No stored credentials. Please login again.'
        );
      }
      throw new MultiAccountError(
        'credentials_missing',
        'Please login again with this account to enable switching.'
      );
    } else {
      throw new MultiAccountError(
        'credentials_missing',
        'No stored credentials. Please login again with this account.'
      );
    }

    // Update active account and lastActive time
    const accountsData: AccountsData = {
      accounts: accounts.map((acc: any) =>
        acc.userId === targetUserId
          ? { ...acc, lastActive: Date.now() }
          : acc
      ),
      activeAccountId: targetUserId
    };

    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accountsData));
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SWITCH, Date.now().toString());

    // Handle storage switch (clear old cache, load new cache)
    if (previousActiveId && previousActiveId !== targetUserId) {
      await storageService.handleAccountSwitch(previousActiveId, targetUserId);
    }

    console.log('✅ Switched to account:', targetAccount.username);
  }

  /**
   * Get next account in rotation (for quick double-tap switch)
   */
  async getNextAccount(): Promise<StoredAccount | null> {
    const accounts = await this.getAccounts();
    const activeId = await this.getActiveAccountId();

    if (accounts.length <= 1) return null;

    const currentIndex = accounts.findIndex((acc: any) => acc.userId === activeId);
    const nextIndex = (currentIndex + 1) % accounts.length;
    
    return accounts[nextIndex];
  }

  /**
   * Clear all accounts (logout all)
   */
  async clearAllAccounts(): Promise<void> {
    try {
      await authService.signOut();
      await AsyncStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
      await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_ACCOUNT);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SWITCH);
      await AsyncStorage.removeItem(STORAGE_KEYS.ENCRYPTION_KEY);
      this.encryptionKey = null;
      console.log('✅ All accounts cleared');
    } catch (error) {
      console.error('❌ Failed to clear accounts:', error);
      throw error;
    }
  }

  /**
   * Update account info (avatar, username, etc.).
   *
   * A no-op for an unknown userId; storage failures propagate.
   */
  async updateAccountInfo(userId: string, updates: Partial<StoredAccount>): Promise<void> {
    const accounts = await this.getAccounts();
    const activeId = await this.getActiveAccountId();

    const updatedAccounts = accounts.map((acc: any) =>
      acc.userId === userId ? { ...acc, ...updates } : acc
    );

    const accountsData: AccountsData = {
      accounts: updatedAccounts,
      activeAccountId: activeId || ''
    };

    await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accountsData));
  }
}

// Export singleton instance
export const multiAccountService = new MultiAccountService();



