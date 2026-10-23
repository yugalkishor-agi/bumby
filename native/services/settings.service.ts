import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { preferencesService } from './preferences.service';
import {
  buildOtpAuthUri,
  generateBackupCode,
  generateTotpSecret,
  verifyTotpToken,
} from '../utils/totp';

export interface UserSettings {
  theme: 'auto' | 'light' | 'dark';
  language: string;
  region: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  notificationsEnabled: boolean;
  showOnlineStatus: boolean;
  allowMessageRequests: boolean;
  requireFaceId?: boolean;
  appLockEnabled?: boolean;
  hapticFeedback?: boolean;
  strongVibration?: boolean;
  dataSaverMode?: boolean;
  hiddenPosts?: string[];
}

export interface PrivacySettings {
  isPrivate: boolean;
  whoCanSeeStories: 'everyone' | 'followers' | 'closeFriends';
  whoCanComment: 'everyone' | 'following' | 'followers' | 'off';
  whoCanTag: 'everyone' | 'following' | 'followers';
  whoCanMessage: 'everyone' | 'followers';
  showActivityStatus: boolean;
  showReadReceipts: boolean;
  hideLastSeen: boolean;
  hideOnlineStatus: boolean;
  profileVisibility: 'everyone' | 'followers' | 'nobody';
  shareLocation: boolean;
  hideLikeCounts: boolean;
  allowStorySharing?: boolean;
  mentionPermission?: 'everyone' | 'following' | 'none';
  manualMentionApproval?: boolean;
}

export interface NotificationPreferences {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  stories: boolean;
  liveVideos: boolean;
  reels: boolean;
  messages: boolean;
  messageRequests: boolean;
  reminders: boolean;
  productUpdates: boolean;
}

export interface ContentFilter {
  hiddenWords: string[];
  hideOffensiveComments: boolean;
  filterDMs: boolean;
  restrictedAccounts: string[];
}

export interface ConnectedApp {
  appId: string;
  name: string;
  permissions: string[];
  connectedAt?: any;
  lastUsedAt?: any;
}

export class SettingsService {
  private lastSettingsWrite: { [userId: string]: { payload: string; ts: number } } = {};
  private lastPrivacyWrite: { [userId: string]: { payload: string; ts: number } } = {};
  private lastNotificationWrite: { [userId: string]: { payload: string; ts: number } } = {};

  private shouldSkipWrite(
    store: { [userId: string]: { payload: string; ts: number } },
    userId: string,
    payload: string,
    windowMs: number
  ): boolean {
    const last = store[userId];
    return Boolean(last && last.payload === payload && Date.now() - last.ts < windowMs);
  }

// ==========================================
  // USER SETTINGS
  // ==========================================

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings> {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User not found');
    }

    const userData = userSnap.data();
    const merged = {
      ...this.getDefaultSettings(),
      ...(userData.settings || {}),
    } as UserSettings;

    // Keep the app-wide media preferences in sync with what is stored.
    preferencesService.setDataSaverEnabled(!!merged.dataSaverMode);

    return merged;
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    settings: Partial<UserSettings>
  ): Promise<void> {
    const payload = JSON.stringify(settings || {});
    const now = Date.now();
    const last = this.lastSettingsWrite[userId];
    // Only guard against an identical write fired twice in quick succession.
    // A long window would silently swallow legitimate changes.
    if (last && last.payload === payload && now - last.ts < 1000) {
      return;
    }
    this.lastSettingsWrite[userId] = { payload, ts: now };

    const userRef = doc(db, 'users', userId);

    const updates: any = {};
    Object.keys(settings).forEach((key) => {
      updates[`settings.${key}`] = settings[key as keyof UserSettings];
    });

    updates.updatedAt = serverTimestamp();

    try {
      await updateDoc(userRef, updates);
      if (settings.dataSaverMode !== undefined) {
        preferencesService.setDataSaverEnabled(!!settings.dataSaverMode);
      }
    } catch (error) {
      delete this.lastSettingsWrite[userId];
      throw error;
    }
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): UserSettings {
    return {
      theme: 'auto',
      language: 'en',
      region: 'US',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      notificationsEnabled: true,
      showOnlineStatus: true,
      allowMessageRequests: true,
      requireFaceId: false,
      appLockEnabled: false,
      hapticFeedback: true,
      strongVibration: false,
      dataSaverMode: false,
      hiddenPosts: [],
    };
  }

  // ==========================================
  // PRIVACY SETTINGS
  // ==========================================

  /**
   * Get privacy settings
   */
  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    const privacyRef = doc(db, `users/${userId}/privacySettings/main`);
    const userRef = doc(db, 'users', userId);
    const [privacySnap, userSnap] = await Promise.all([
      getDoc(privacyRef),
      getDoc(userRef).catch(() => null),
    ]);

    const defaults = this.getDefaultPrivacySettings();
    const privacyData = privacySnap.exists() ? (privacySnap.data() as Partial<PrivacySettings>) : {};
    const userData = userSnap?.exists() ? userSnap.data() : null;
    const userSettings = (userData as any)?.settings || {};

    const merged: PrivacySettings = {
      ...defaults,
      ...privacyData,
    } as PrivacySettings;

    if (privacyData.isPrivate === undefined && typeof (userData as any)?.isPrivate === 'boolean') {
      merged.isPrivate = !!(userData as any).isPrivate;
    }

    if (privacyData.whoCanMessage === undefined && typeof userSettings.allowMessageRequests === 'boolean') {
      merged.whoCanMessage = userSettings.allowMessageRequests ? 'everyone' : 'followers';
    }

    if (
      privacyData.showActivityStatus === undefined &&
      privacyData.hideOnlineStatus === undefined &&
      typeof userSettings.showOnlineStatus === 'boolean'
    ) {
      merged.showActivityStatus = userSettings.showOnlineStatus;
      merged.hideOnlineStatus = !userSettings.showOnlineStatus;
    }

    return merged;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    userId: string,
    privacy: Partial<PrivacySettings>
  ): Promise<void> {
    const payload = JSON.stringify(privacy || {});
    if (this.shouldSkipWrite(this.lastPrivacyWrite, userId, payload, 3000)) {
      return;
    }
    this.lastPrivacyWrite[userId] = { payload, ts: Date.now() };
    const privacyRef = doc(db, `users/${userId}/privacySettings/main`);

    try {
      await setDoc(
        privacyRef,
        {
          ...privacy,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (
        privacy.isPrivate !== undefined ||
        privacy.showActivityStatus !== undefined ||
        privacy.hideOnlineStatus !== undefined ||
        privacy.whoCanMessage !== undefined
      ) {
        const mergedPrivacySnap = await getDoc(privacyRef);
        const mergedPrivacy = {
          ...this.getDefaultPrivacySettings(),
          ...(mergedPrivacySnap.exists() ? (mergedPrivacySnap.data() as Partial<PrivacySettings>) : {}),
        } as PrivacySettings;
        const userRef = doc(db, 'users', userId);
        const userUpdates: Record<string, any> = {
          updatedAt: serverTimestamp(),
        };

        if (privacy.isPrivate !== undefined) {
          userUpdates.isPrivate = mergedPrivacy.isPrivate;
        }

        if (privacy.showActivityStatus !== undefined || privacy.hideOnlineStatus !== undefined) {
          userUpdates['settings.showOnlineStatus'] =
            mergedPrivacy.showActivityStatus && !mergedPrivacy.hideOnlineStatus;
        }

        if (privacy.whoCanMessage !== undefined) {
          userUpdates['settings.allowMessageRequests'] = mergedPrivacy.whoCanMessage === 'everyone';
        }

        await updateDoc(userRef, userUpdates);
      }
    } catch (error) {
      delete this.lastPrivacyWrite[userId];
      throw error;
    }
  }

  /**
   * Get default privacy settings
   */
  private getDefaultPrivacySettings(): PrivacySettings {
    return {
      isPrivate: false,
      whoCanSeeStories: 'followers',
      whoCanComment: 'everyone',
      whoCanTag: 'everyone',
      whoCanMessage: 'everyone',
      showActivityStatus: true,
      showReadReceipts: true,
      hideLastSeen: false,
      hideOnlineStatus: false,
      profileVisibility: 'everyone',
      shareLocation: false,
      hideLikeCounts: false,
      allowStorySharing: true,
      mentionPermission: 'everyone',
      manualMentionApproval: false,
    };
  }

  // ==========================================
  // NOTIFICATION PREFERENCES
  // ==========================================

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(
    userId: string
  ): Promise<NotificationPreferences> {
    const notifRef = doc(db, `users/${userId}/notificationPreferences/main`);
    const notifSnap = await getDoc(notifRef);

    if (!notifSnap.exists()) {
      return this.getDefaultNotificationPreferences();
    }

    return {
      ...this.getDefaultNotificationPreferences(),
      ...(notifSnap.data() as Partial<NotificationPreferences>),
    } as NotificationPreferences;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<void> {
    const payload = JSON.stringify(prefs || {});
    if (this.shouldSkipWrite(this.lastNotificationWrite, userId, payload, 3000)) {
      return;
    }
    this.lastNotificationWrite[userId] = { payload, ts: Date.now() };
    const notifRef = doc(db, `users/${userId}/notificationPreferences/main`);

    try {
      await setDoc(
        notifRef,
        {
          ...prefs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      delete this.lastNotificationWrite[userId];
      throw error;
    }
  }

  /**
   * Get default notification preferences
   */
  private getDefaultNotificationPreferences(): NotificationPreferences {
    return {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      stories: true,
      liveVideos: true,
      reels: true,
      messages: true,
      messageRequests: true,
      reminders: true,
      productUpdates: false,
    };
  }

  // ==========================================
  // BLOCKED USERS
  // ==========================================

  /**
   * Get blocked users list
   */
  async getBlockedUsers(userId: string): Promise<Array<{
    userId: string;
    blockedAt: any;
  }>> {
    const blockedRef = collection(db, `users/${userId}/blockedUsers`);
    const snapshot = await getDocs(blockedRef);

    return snapshot.docs.map((doc) => doc.data() as any);
  }

  /**
   * Block a user
   */
  async blockUser(userId: string, targetUserId: string): Promise<void> {
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${targetUserId}`);

    await setDoc(blockedRef, {
      userId: targetUserId,
      blockedAt: serverTimestamp(),
    });
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string, targetUserId: string): Promise<void> {
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${targetUserId}`);
    await deleteDoc(blockedRef);
  }

  /**
   * Check if user is blocked
   */
  async isUserBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${targetUserId}`);
    const blockedSnap = await getDoc(blockedRef);
    return blockedSnap.exists();
  }

  // ==========================================
  // MUTED USERS
  // ==========================================

  /**
   * Get muted users list
   */
  async getMutedUsers(userId: string): Promise<Array<{
    userId: string;
    mutedAt: any;
    mutedUntil: any;
  }>> {
    const mutedRef = collection(db, `users/${userId}/mutedUsers`);
    const snapshot = await getDocs(mutedRef);

    return snapshot.docs.map((doc) => doc.data() as any);
  }

  /**
   * Mute a user
   */
  async muteUser(
    userId: string,
    targetUserId: string,
    duration?: number // in milliseconds
  ): Promise<void> {
    const mutedRef = doc(db, `users/${userId}/mutedUsers/${targetUserId}`);

    await setDoc(mutedRef, {
      userId: targetUserId,
      mutedAt: serverTimestamp(),
      mutedUntil: duration ? new Date(Date.now() + duration) : null,
    });
  }

  /**
   * Unmute a user
   */
  async unmuteUser(userId: string, targetUserId: string): Promise<void> {
    const mutedRef = doc(db, `users/${userId}/mutedUsers/${targetUserId}`);
    await deleteDoc(mutedRef);
  }

  // ==========================================
  // CLOSE FRIENDS
  // ==========================================

  /**
   * Get close friends list
   */
  async getCloseFriends(userId: string): Promise<string[]> {
    const closeFriendsRef = collection(db, `users/${userId}/closeFriends`);
    const snapshot = await getDocs(closeFriendsRef);

    return snapshot.docs.map((doc) => doc.id);
  }

  /**
   * Add to close friends
   */
  async addCloseFriend(userId: string, friendId: string): Promise<void> {
    const closeFriendRef = doc(db, `users/${userId}/closeFriends/${friendId}`);

    await setDoc(closeFriendRef, {
      userId: friendId,
      addedAt: serverTimestamp(),
    });
  }

  /**
   * Remove from close friends
   */
  async removeCloseFriend(userId: string, friendId: string): Promise<void> {
    const closeFriendRef = doc(db, `users/${userId}/closeFriends/${friendId}`);
    await deleteDoc(closeFriendRef);
  }

  /**
   * Check if user is close friend
   */
  async isCloseFriend(userId: string, friendId: string): Promise<boolean> {
    const closeFriendRef = doc(db, `users/${userId}/closeFriends/${friendId}`);
    const closeFriendSnap = await getDoc(closeFriendRef);
    return closeFriendSnap.exists();
  }

  // ==========================================
  // CONTENT FILTERS
  // ==========================================

  /**
   * Get content filters
   */
  async getContentFilters(userId: string): Promise<ContentFilter> {
    const filterRef = doc(db, `users/${userId}/contentFilters/main`);
    const filterSnap = await getDoc(filterRef);

    if (!filterSnap.exists()) {
      return this.getDefaultContentFilters();
    }

    return filterSnap.data() as ContentFilter;
  }

  /**
   * Update content filters
   */
  async updateContentFilters(
    userId: string,
    filters: Partial<ContentFilter>
  ): Promise<void> {
    const filterRef = doc(db, `users/${userId}/contentFilters/main`);

    await setDoc(
      filterRef,
      {
        ...filters,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * Get default content filters
   */
  private getDefaultContentFilters(): ContentFilter {
    return {
      hiddenWords: [],
      hideOffensiveComments: false,
      filterDMs: false,
      restrictedAccounts: [],
    };
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    const sessionsRef = collection(db, `users/${userId}/sessions`);
    const snapshot = await getDocs(sessionsRef);
    
    return snapshot.docs.map(doc => ({
      sessionId: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Create new session
   */
  async createSession(userId: string, device: string, location: string): Promise<string> {
    const sessionRef = doc(collection(db, `users/${userId}/sessions`));
    const sessionId = sessionRef.id;
    
    await setDoc(sessionRef, {
      device,
      location,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });
    
    return sessionId;
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(userId: string, sessionId: string): Promise<void> {
    const sessionRef = doc(db, `users/${userId}/sessions/${sessionId}`);
    await updateDoc(sessionRef, {
      lastActive: serverTimestamp(),
    });
  }

  /**
   * End a specific session
   */
  async endSession(userId: string, sessionId: string): Promise<void> {
    const sessionRef = doc(db, `users/${userId}/sessions/${sessionId}`);
    await deleteDoc(sessionRef);
  }

  /**
   * End all sessions except current
   */
  async endAllSessions(userId: string, currentSessionId?: string): Promise<void> {
    const sessionsRef = collection(db, `users/${userId}/sessions`);
    const snapshot = await getDocs(sessionsRef);
    
    const deletePromises = snapshot.docs
      .filter(doc => !currentSessionId || doc.id !== currentSessionId)
      .map(doc => deleteDoc(doc.ref));
    
    await Promise.all(deletePromises);
  }

  // ==========================================
  // CONNECTED APPS & WEBSITES
  // ==========================================

  /**
   * Get connected third-party apps for the user
   */
  async getConnectedApps(userId: string): Promise<ConnectedApp[]> {
    const appsRef = collection(db, `users/${userId}/connectedApps`);
    const snapshot = await getDocs(appsRef);

    return snapshot.docs.map((appDoc) => ({
      appId: appDoc.id,
      ...(appDoc.data() as any),
    })) as ConnectedApp[];
  }

  /**
   * Save connected app metadata
   */
  async connectApp(
    userId: string,
    app: { name: string; permissions: string[]; appId?: string }
  ): Promise<string> {
    const appRef = app.appId
      ? doc(db, `users/${userId}/connectedApps/${app.appId}`)
      : doc(collection(db, `users/${userId}/connectedApps`));

    await setDoc(
      appRef,
      {
        name: app.name,
        permissions: app.permissions,
        connectedAt: serverTimestamp(),
        lastUsedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return appRef.id;
  }

  /**
   * Revoke app access
   */
  async revokeConnectedApp(userId: string, appId: string): Promise<void> {
    const appRef = doc(db, `users/${userId}/connectedApps/${appId}`);
    await deleteDoc(appRef);
  }

  // ==========================================
  // DATA EXPORT
  // ==========================================

  /**
   * Request data export
   */
  async requestDataExport(userId: string): Promise<void> {
    const exportRef = doc(collection(db, `users/${userId}/dataExports`));
    
    await setDoc(exportRef, {
      status: 'pending',
      requestedAt: serverTimestamp(),
      format: 'json',
    });
    
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      dataExportRequested: true,
      dataExportRequestedAt: serverTimestamp(),
    });
  }

  /**
   * Get data export status
   */
  async getDataExportStatus(userId: string): Promise<any[]> {
    const exportsRef = collection(db, `users/${userId}/dataExports`);
    const snapshot = await getDocs(exportsRef);
    
    return snapshot.docs.map(doc => ({
      exportId: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Download data export
   */
  async downloadDataExport(userId: string, exportId: string): Promise<any> {
    const exportRef = doc(db, `users/${userId}/dataExports/${exportId}`);
    const exportSnap = await getDoc(exportRef);
    
    if (!exportSnap.exists()) {
      throw new Error('Export not found');
    }
    
    return exportSnap.data();
  }

  // ==========================================
  // HIDDEN WORDS
  // ==========================================

  /**
   * Get hidden words list
   */
  async getHiddenWords(userId: string): Promise<string[]> {
    const settingsRef = doc(db, 'settings', userId);
    const settingsSnap = await getDoc(settingsRef);
    return settingsSnap.exists() ? ((settingsSnap.data() as any).hiddenWords || []) : [];
  }

  /**
   * Add a word to hidden words list
   */
  async addHiddenWord(userId: string, word: string): Promise<void> {
    const settingsRef = doc(db, 'settings', userId);
    const settingsSnap = await getDoc(settingsRef);
    const currentWords = settingsSnap.exists() ? ((settingsSnap.data() as any).hiddenWords || []) : [];

    if (!currentWords.includes(word.toLowerCase())) {
      // `updateDoc` fails when the settings document does not exist yet.
      await setDoc(
        settingsRef,
        { hiddenWords: [...currentWords, word.toLowerCase()] },
        { merge: true }
      );
    }
  }

  /**
   * Remove a word from hidden words list
   */
  async removeHiddenWord(userId: string, word: string): Promise<void> {
    const settingsRef = doc(db, 'settings', userId);
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) return;

    const currentWords = (settingsSnap.data() as any).hiddenWords || [];
    await setDoc(
      settingsRef,
      { hiddenWords: currentWords.filter((w: string) => w !== word.toLowerCase()) },
      { merge: true }
    );
  }

  // ==========================================
  // TWO-FACTOR AUTHENTICATION
  // ==========================================

  /**
   * Enable 2FA for user
   */
  async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes();

    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    await setDoc(twoFactorRef, {
      enabled: true,
      secret,
      enabledAt: serverTimestamp(),
      backupCodes,
    });

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      twoFactorEnabled: true,
      updatedAt: serverTimestamp(),
    });

    return {
      secret,
      qrCode: buildOtpAuthUri(secret, userId),
    };
  }

  /**
   * Disable 2FA for user
   */
  async disable2FA(userId: string): Promise<void> {
    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    await setDoc(
      twoFactorRef,
      {
        enabled: false,
        disabledAt: serverTimestamp(),
      },
      { merge: true }
    );

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      twoFactorEnabled: false,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Verify 2FA code
   */
  async verify2FACode(userId: string, code: string): Promise<boolean> {
    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    const twoFactorSnap = await getDoc(twoFactorRef);

    if (!twoFactorSnap.exists()) return false;

    const data = twoFactorSnap.data() as any;
    if (data?.enabled === false) return false;

    const secret = data?.secret;
    if (secret) return this.verifyTOTP(secret, code);

    // Fall back to a one-time backup code.
    return this.consumeBackupCode(userId, code);
  }

  /**
   * Read the stored backup codes for a user.
   */
  async getBackupCodes(userId: string): Promise<string[]> {
    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    const twoFactorSnap = await getDoc(twoFactorRef);
    if (!twoFactorSnap.exists()) return [];

    const codes = (twoFactorSnap.data() as any)?.backupCodes;
    return Array.isArray(codes) ? codes : [];
  }

  /**
   * Read the stored two-factor setup (secret + state) for a user.
   */
  async getTwoFactorSetup(
    userId: string
  ): Promise<{ enabled: boolean; secret: string; backupCodes: string[] }> {
    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    const twoFactorSnap = await getDoc(twoFactorRef);
    if (!twoFactorSnap.exists()) {
      return { enabled: false, secret: '', backupCodes: [] };
    }

    const data = twoFactorSnap.data() as any;
    return {
      enabled: data?.enabled !== false,
      secret: typeof data?.secret === 'string' ? data.secret : '',
      backupCodes: Array.isArray(data?.backupCodes) ? data.backupCodes : [],
    };
  }

  /**
   * Replace the stored backup codes with a fresh set.
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const backupCodes = this.generateBackupCodes();
    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    await setDoc(twoFactorRef, { backupCodes }, { merge: true });
    return backupCodes;
  }

  /**
   * Consume a backup code (single use).
   */
  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return false;

    const twoFactorRef = doc(db, `users/${userId}/security/twoFactor`);
    const twoFactorSnap = await getDoc(twoFactorRef);
    if (!twoFactorSnap.exists()) return false;

    const codes: string[] = (twoFactorSnap.data() as any)?.backupCodes || [];
    const match = codes.find((entry) => entry.toUpperCase() === trimmed);
    if (!match) return false;

    await setDoc(
      twoFactorRef,
      { backupCodes: codes.filter((entry) => entry !== match) },
      { merge: true }
    );
    return true;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    const seen = new Set<string>();
    while (codes.length < 10) {
      const code = generateBackupCode();
      if (seen.has(code)) continue;
      seen.add(code);
      codes.push(code);
    }
    return codes;
  }

  /**
   * Generate secret key
   */
  private generateSecret(): string {
    return generateTotpSecret();
  }

  /**
   * Verify a TOTP code against the stored secret.
   */
  private verifyTOTP(secret: string, code: string): boolean {
    return verifyTotpToken(secret, code);
  }


  // ==========================================
  // ACCOUNT MANAGEMENT
  // ==========================================

  /**
   * Deactivate account
   */
  async deactivateAccount(userId: string, reason?: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isActive: false,
      deactivatedAt: serverTimestamp(),
      deactivationReason: reason || '',
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Reactivate account
   */
  async reactivateAccount(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isActive: true,
      reactivatedAt: serverTimestamp(),
      deactivatedAt: null,
      deactivationReason: null,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Delete account permanently
   */
  async deleteAccount(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    // In production, this would trigger a cloud function to:
    // 1. Delete all user data (posts, comments, messages, etc.)
    // 2. Remove from all followers/following lists
    // 3. Delete media files from storage
    // 4. Anonymize any required data for legal compliance
  }

  // ==========================================
  // PROFESSIONAL ACCOUNT
  // ==========================================

  /**
   * Switch to professional account
   */
  async switchToProfessional(userId: string, category: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      accountType: 'professional',
      professionalCategory: category,
      switchedToProfessionalAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Switch to personal account
   */
  async switchToPersonal(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      accountType: 'personal',
      professionalCategory: null,
      updatedAt: serverTimestamp(),
    });
  }
}

// Export singleton instance
export const settingsService = new SettingsService();












