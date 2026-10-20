import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
  writeBatch,
  runTransaction,
  Timestamp,
  deleteField,
  documentId,
  startAfter,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { User, CreateUserData, Following, Follower } from '../types/database';
import { cacheIntegration } from './cacheIntegration.service';
import { cacheService } from './cache.service';

const ACTIVE_USERS_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_USERS_CACHE_TTL_MS = 30 * 1000;
const USER_SEARCH_CACHE_TTL_MS = 45 * 1000;
const USER_SEARCH_SCAN_PAGE_SIZE = 250;
const USER_SEARCH_SCAN_MAX_DOCS = 3000;

export class UserService {
  private activeUsersCache = new Map<string, { users: User[]; expiresAt: number }>();
  private searchUsersCache: { users: User[]; expiresAt: number } | null = null;

  private normalizeUserFromDoc(docSnap: any): User {
    const raw = (docSnap?.data?.() || {}) as any;
    return {
      ...(raw as User),
      userId: String(raw?.userId || docSnap?.id || ''),
    } as User;
  }

  private async getSearchUserPool(forceRefresh = false): Promise<User[]> {
    const now = Date.now();
    if (!forceRefresh && this.searchUsersCache && this.searchUsersCache.expiresAt > now) {
      return this.searchUsersCache.users;
    }

    const usersRef = collection(db, 'users');
    const users: User[] = [];
    let lastDoc: any = null;

    while (users.length < USER_SEARCH_SCAN_MAX_DOCS) {
      let q = query(usersRef, orderBy(documentId()), limit(USER_SEARCH_SCAN_PAGE_SIZE));
      if (lastDoc) {
        q = query(usersRef, orderBy(documentId()), startAfter(lastDoc), limit(USER_SEARCH_SCAN_PAGE_SIZE));
      }

      const snapshot = await getDocs(q);
      if (snapshot.empty) break;

      snapshot.docs.forEach((docSnap) => {
        users.push(this.normalizeUserFromDoc(docSnap));
      });

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (!lastDoc || snapshot.docs.length < USER_SEARCH_SCAN_PAGE_SIZE) break;
    }

    this.searchUsersCache = {
      users,
      expiresAt: now + USER_SEARCH_CACHE_TTL_MS,
    };

    return users;
  }

  private async refreshUserInBackground(userIdOrUsername: string) {
    await cacheIntegration.scheduleBackgroundRefresh(`user:${userIdOrUsername}`, async () => {
      const userRef = doc(db, 'users', userIdOrUsername);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const user = { ...userSnap.data(), userId: userSnap.id } as User;
        await cacheIntegration.cacheUser(user.userId, user);
        if (user.username) {
          await cacheIntegration.cacheUser(user.username.toLowerCase(), user);
        }
        await cacheIntegration.warmUserAssets(user);
      }
    }, 12000);
  }

  // ==========================================
  // USER CRUD OPERATIONS
  // ==========================================

  /**
   * Create a new user
   */
  async createUser(userId: string, userData: CreateUserData): Promise<void> {
    const userRef = doc(db, 'users', userId);

    await setDoc(userRef, {
      userId,
      ...userData,
      usernameLowercase: userData.username.toLowerCase(), // For case-insensitive search
      bio: userData.bio || '',
      verified: false,
      accountType: 'personal',
      isPrivate: false,
      isOnline: true,
      lastSeen: serverTimestamp(),
      stats: {
        postsCount: 0,
        storiesCount: 0,
        followersCount: 0,
        followingCount: 0,
        highlightsCount: 0,
      },
      settings: {
        theme: 'auto',
        language: 'en',
        notificationsEnabled: true,
        showOnlineStatus: true,
        allowMessageRequests: true,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  /**
   * Get user by ID or username
   * With caching (1 hour TTL)
   */
  async getUser(userIdOrUsername: string): Promise<User | null> {
    try {
      const lookup = userIdOrUsername.trim();
      const cached = await cacheIntegration.getCachedUser(lookup);
      if (cached) {
        void this.refreshUserInBackground(lookup);
        void cacheIntegration.warmUserAssets(cached as User);
        return cached as User;
      }

      const userRef = doc(db, 'users', lookup);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const user = { ...userSnap.data(), userId: userSnap.id } as User;
        await cacheIntegration.cacheUser(user.userId, user);
        if (user.username) {
          await cacheIntegration.cacheUser(user.username.toLowerCase(), user);
        }
        await cacheIntegration.warmUserAssets(user);
        return user;
      }

      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('usernameLowercase', '==', lookup.toLowerCase()), limit(1));
      let snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const user = { ...snapshot.docs[0].data(), userId: snapshot.docs[0].id } as User;
        await cacheIntegration.cacheUser(user.userId, user);
        await cacheIntegration.cacheUser(lookup, user);
        if (user.username) {
          await cacheIntegration.cacheUser(user.username.toLowerCase(), user);
        }
        await cacheIntegration.warmUserAssets(user);
        return user;
      }

      q = query(usersRef, where('username', '==', lookup.toLowerCase()), limit(1));
      snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const user = { ...snapshot.docs[0].data(), userId: snapshot.docs[0].id } as User;
        await cacheIntegration.cacheUser(user.userId, user);
        await cacheIntegration.cacheUser(lookup, user);
        if (user.username) {
          await cacheIntegration.cacheUser(user.username.toLowerCase(), user);
        }
        await cacheIntegration.warmUserAssets(user);
        return user;
      }

      return null;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  async getUsersByIds(userIds: string[]): Promise<Record<string, User>> {
    const uniqueIds = Array.from(new Set((userIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (uniqueIds.length === 0) return {};

    const usersById: Record<string, User> = {};
    const missingIds: string[] = [];

    const cachedUsers = await Promise.all(
      uniqueIds.map(async (userId) => {
        try {
          const cached = await cacheIntegration.getCachedUser(userId);
          return { userId, user: cached as User | null };
        } catch {
          return { userId, user: null };
        }
      })
    );

    cachedUsers.forEach(({ userId, user }) => {
      if (user?.userId) {
        usersById[userId] = user;
      } else {
        missingIds.push(userId);
      }
    });

    if (missingIds.length === 0) {
      return usersById;
    }

    const usersRef = collection(db, 'users');
    for (let index = 0; index < missingIds.length; index += 10) {
      const chunk = missingIds.slice(index, index + 10);
      if (chunk.length === 0) continue;

      try {
        const q = query(usersRef, where(documentId(), 'in', chunk));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach((docSnap) => {
          const user = { ...docSnap.data(), userId: docSnap.id } as User;
          usersById[user.userId] = user;
          void cacheIntegration.cacheUser(user.userId, user);
          if (typeof user.username === 'string' && user.username.length > 0) {
            void cacheIntegration.cacheUser(user.username.toLowerCase(), user);
          }
          void cacheIntegration.warmUserAssets(user);
        });
      } catch (error) {
        console.error('Batch user fetch chunk failed:', error);
      }
    }

    return usersById;
  }

  /**
   * Update user online status
   */
  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isOnline,
      lastSeen: serverTimestamp(),
    });
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const userRef = doc(db, 'users', userId);

    // Firestore rejects `undefined` as a field value, so a caller clearing a
    // field (e.g. removing the profile photo passes `{ avatarURL: undefined }`)
    // would throw "Unsupported field value: undefined". Translate cleared
    // fields into explicit deletions instead.
    const sanitized: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      sanitized[key] = value === undefined ? deleteField() : value;
    });

    await updateDoc(userRef, {
      ...sanitized,
      updatedAt: serverTimestamp(),
    });

    // Bust stale profile cache immediately so UI reflects updates without app restart.
    try {
      await cacheIntegration.invalidateUser(userId);
      const freshSnap = await getDoc(userRef);
      if (freshSnap.exists()) {
        const freshUser = { ...freshSnap.data(), userId } as User;
        await cacheIntegration.cacheUser(userId, freshUser);

        const username = (freshUser as any)?.username;
        if (typeof username === 'string' && username.trim().length > 0) {
          await cacheIntegration.cacheUser(username.toLowerCase(), freshUser);
        }
      }
    } catch (cacheError) {
      console.warn('Failed to refresh user cache after update:', cacheError);
    }

    // If the avatar changed (set OR removed), update all posts and stories.
    // A removal arrives as `undefined`, which becomes '' on the denormalized copies.
    if ('avatarURL' in updates) {
      await this.updateUserContentAvatar(userId, updates.avatarURL ?? '');
    }
  }

  /**
   * Update user's avatar in all their posts and stories
   */
  async updateUserContentAvatar(userId: string, newAvatarURL: string): Promise<void> {
    try {
      let total = 0;

      const postsRef = collection(db, 'posts');
      const postsQuery = query(postsRef, where('authorId', '==', userId));
      const postsSnapshot = await getDocs(postsQuery);
      if (!postsSnapshot.empty) {
        const batchPosts = writeBatch(db);
        postsSnapshot.docs.forEach((postDoc) => {
          const data = postDoc.data() as any;
          if (data?.authorId === userId) {
            batchPosts.update(postDoc.ref, { authorAvatarURL: newAvatarURL });
          }
        });
        await batchPosts.commit();
        total += postsSnapshot.size;
      }

      const storiesRef = collection(db, 'stories');
      const storiesQuery = query(storiesRef, where('authorId', '==', userId));
      const storiesSnapshot = await getDocs(storiesQuery);
      if (!storiesSnapshot.empty) {
        const batchStories = writeBatch(db);
        storiesSnapshot.docs.forEach((storyDoc) => {
          batchStories.update(storyDoc.ref, { authorAvatarURL: newAvatarURL });
        });
        await batchStories.commit();
        total += storiesSnapshot.size;
      }

      // NOTE: Top-level /comments collection uses canReadTarget() rules that
      // require a per-doc get() on the parent, which Firestore blocks for
      // collection-level list queries. Post comments live in
      // /posts/{postId}/comments/ (subcollection) and are not denormalized
      // with authorAvatarURL in a way that needs bulk-updating here, so we
      // intentionally skip this step.

      if (total > 0) {
        console.log(`Updated avatar in ${total} content items`);
      }
    } catch (error) {
      console.error('Failed to update user content avatar:', error);
    }
  }

  /**
   * Search users by username
   */
  async searchUsers(searchTerm: string, limitCount = 20): Promise<User[]> {
    if (!searchTerm || searchTerm.length < 1) {
      return [];
    }

    const searchLower = searchTerm.toLowerCase().trim();

    const scoreText = (text: string): number => {
      const value = String(text || '').toLowerCase().trim();
      if (!value) return 0;
      if (value === searchLower) return 1200;
      if (value.startsWith(searchLower)) return 900;

      const parts = value.split(/[^a-z0-9_]+/).filter(Boolean);
      if (parts.some((part) => part.startsWith(searchLower))) return 700;
      if (searchLower.length >= 2 && value.includes(searchLower)) return 220;
      return 0;
    };

    const rankUsers = (users: User[]): User[] => {
      return users
        .map((user) => {
          const username = String(user.username || (user as any).usernameLowercase || '').toLowerCase();
          const displayName = String(user.displayName || (user as any).displayNameLowercase || '').toLowerCase();
          const usernameScore = scoreText(username);
          const displayScore = scoreText(displayName);
          const matchScore = Math.max(usernameScore, displayScore);
          return {
            user,
            matchScore,
            followers: Number(user?.stats?.followersCount || 0),
            username,
          };
        })
        .filter((entry) => entry.matchScore > 0)
        .sort((a, b) => {
          if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
          if (a.followers !== b.followers) return b.followers - a.followers;
          return a.username.localeCompare(b.username);
        })
        .slice(0, limitCount)
        .map((entry) => entry.user);
    };

    const mergeUniqueUsers = (...groups: User[][]): User[] => {
      const merged = new Map<string, User>();
      groups.flat().forEach((user) => {
        const userId = String(user?.userId || '').trim();
        if (!userId || merged.has(userId)) return;
        merged.set(userId, user);
      });
      return Array.from(merged.values());
    };

    const collectPrefixMatches = async (): Promise<User[]> => {
      const usersRef = collection(db, 'users');
      const prefixLimit = Math.max(limitCount * 2, 24);

      const usernameQuery = getDocs(
        query(
          usersRef,
          orderBy('usernameLowercase'),
          where('usernameLowercase', '>=', searchLower),
          where('usernameLowercase', '<=', `${searchLower}\uf8ff`),
          limit(prefixLimit)
        )
      ).catch(() => null);

      const displayNameQuery = getDocs(
        query(
          usersRef,
          orderBy('displayNameLowercase'),
          where('displayNameLowercase', '>=', searchLower),
          where('displayNameLowercase', '<=', `${searchLower}\uf8ff`),
          limit(prefixLimit)
        )
      ).catch(() => null);

      const [usernameSnapshot, displayNameSnapshot] = await Promise.all([usernameQuery, displayNameQuery]);
      const usernameMatches = usernameSnapshot?.docs?.map((docSnap) => this.normalizeUserFromDoc(docSnap)) || [];
      const displayNameMatches = displayNameSnapshot?.docs?.map((docSnap) => this.normalizeUserFromDoc(docSnap)) || [];
      return mergeUniqueUsers(usernameMatches, displayNameMatches);
    };

    try {
      const prefixMatches = await collectPrefixMatches();
      if (prefixMatches.length >= limitCount) {
        return rankUsers(prefixMatches);
      }

      const poolMatches = rankUsers(await this.getSearchUserPool(prefixMatches.length === 0));
      return rankUsers(mergeUniqueUsers(prefixMatches, poolMatches));
    } catch (error) {
      console.error('Search users error:', error);
      return [];
    }
  }

  /**
   * Update user online status
   */
  async setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        isOnline,
        lastSeen: serverTimestamp(),
      });
    } catch (error) {
      // Silently fail - this is a non-critical background operation
      console.log('Failed to update online status:', error);
    }
  }

  /**
   * Get active/online users
   * Uses a single recent-activity query and a short-lived in-memory cache to avoid
   * the old online->fallback double fetch pattern on every focus/render cycle.
   */
  async getActiveUsers(excludeUserId?: string, limitCount: number = 20): Promise<User[]> {
    const cacheKey = `${excludeUserId || 'all'}:${limitCount}`;
    const cached = this.activeUsersCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.users;
    }

    try {
      const usersRef = collection(db, 'users');
      const recentThreshold = Timestamp.fromDate(new Date(Date.now() - ACTIVE_USERS_WINDOW_MS));
      const q = query(
        usersRef,
        where('lastSeen', '>=', recentThreshold),
        orderBy('lastSeen', 'desc'),
        limit(limitCount + (excludeUserId ? 1 : 0))
      );

      const snapshot = await getDocs(q);
      const activeUsers = snapshot.docs
        .map(doc => ({ userId: doc.id, ...doc.data() }))
        .filter(u => (excludeUserId ? u.userId !== excludeUserId : true))
        .slice(0, limitCount) as User[];

      this.activeUsersCache.set(cacheKey, {
        users: activeUsers,
        expiresAt: Date.now() + ACTIVE_USERS_CACHE_TTL_MS,
      });

      console.log(`Found ${activeUsers.length} active users`);
      return activeUsers;
    } catch (error) {
      console.error('Failed to get active users:', error);
      return cached?.users || [];
    }
  }


  /**
   * Get recently active users (online in last 5 minutes)
   */
  async getRecentlyActiveUsers(excludeUserId?: string, limitCount: number = 20): Promise<User[]> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('lastSeen', '>=', Timestamp.fromDate(fiveMinutesAgo)),
        orderBy('lastSeen', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const recentUsers = snapshot.docs
        .map(doc => ({ userId: doc.id, ...doc.data() }))
        .filter(u => excludeUserId ? u.userId !== excludeUserId : true) as User[];
      
      console.log(`Ã¢ÂÂ° Found ${recentUsers.length} recently active users`);
      return recentUsers;
    } catch (error) {
      console.error('Failed to get recently active users:', error);
      return [];
    }
  }

  /**
   * Set typing status in conversation
   */
  async setTypingStatus(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    const typingRef = doc(db, `conversations/${conversationId}/typing/${userId}`);
    
    if (isTyping) {
      await setDoc(typingRef, {
        isTyping: true,
        timestamp: serverTimestamp(),
      });
    } else {
      await deleteDoc(typingRef);
    }
  }

  /**
   * Mute user
   */
  async muteUser(userId: string, mutedUserId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const mutedRef = doc(db, `users/${userId}/mutedUsers/${mutedUserId}`);
    const userDoc = await getDoc(userRef);
    const mutedUsers = Array.isArray(userDoc.data()?.mutedUsers) ? userDoc.data()?.mutedUsers : [];

    const batch = writeBatch(db);
    batch.set(mutedRef, {
      userId: mutedUserId,
      mutedAt: serverTimestamp(),
    });
    batch.update(userRef, {
      mutedUsers: [...new Set([...mutedUsers, mutedUserId])],
    });

    await batch.commit();
  }

  async unmuteUser(userId: string, mutedUserId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    const mutedRef = doc(db, `users/${userId}/mutedUsers/${mutedUserId}`);
    const userDoc = await getDoc(userRef);
    const mutedUsers = Array.isArray(userDoc.data()?.mutedUsers) ? userDoc.data()?.mutedUsers : [];

    const batch = writeBatch(db);
    batch.delete(mutedRef);
    batch.update(userRef, {
      mutedUsers: mutedUsers.filter((id: string) => id !== mutedUserId),
    });

    await batch.commit();
  }
  // ==========================================
  // FOLLOW OPERATIONS
  // ==========================================

  /**
   * Follow a user
   */
  async followUser(followerId: string, followingId: string): Promise<void> {
    const targetUser = await this.getUser(followingId);

    await cacheIntegration.runOptimisticFollowMutation({
      followerId,
      targetUserId: followingId,
      targetUsername: targetUser?.username,
      isFollowing: true,
      throttleMs: 180,
      retries: 2,
      execute: async () => {
        await runTransaction(db, async (tx) => {
          const followingRef = doc(db, `users/${followerId}/following/${followingId}`);
          const followerRef = doc(db, `users/${followingId}/followers/${followerId}`);
          const followerUserRef = doc(db, 'users', followerId);
          const followingUserRef = doc(db, 'users', followingId);
          const existing = await tx.get(followingRef);
          if (existing.exists()) return;

          tx.set(followingRef, {
            userId: followingId,
            followedAt: serverTimestamp(),
            notificationsEnabled: true,
          });
          tx.set(followerRef, {
            userId: followerId,
            followedAt: serverTimestamp(),
            isCloseFriend: false,
          });
          tx.update(followerUserRef, {
            'stats.followingCount': increment(1),
          });
          tx.update(followingUserRef, {
            'stats.followersCount': increment(1),
          });
        });
      },
      revalidate: async () => {
        await this.refreshUserInBackground(followerId);
        await this.refreshUserInBackground(followingId);
      },
    });

    void (async () => {
      try {
        const followerUser = await this.getUser(followerId);
        if (!followerUser) return;
        const { notificationService } = await import('./notification.service');
        await notificationService.notifyFollow(
          followingId,
          followerId,
          followerUser.username,
          followerUser.avatarURL || ''
        );
      } catch (error) {
        console.error('Failed to create follow notification:', error);
      }
    })();
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    const targetUser = await this.getUser(followingId);

    await cacheIntegration.runOptimisticFollowMutation({
      followerId,
      targetUserId: followingId,
      targetUsername: targetUser?.username,
      isFollowing: false,
      throttleMs: 180,
      retries: 2,
      execute: async () => {
        await runTransaction(db, async (tx) => {
          const followingRef = doc(db, `users/${followerId}/following/${followingId}`);
          const followerRef = doc(db, `users/${followingId}/followers/${followerId}`);
          const followerUserRef = doc(db, 'users', followerId);
          const followingUserRef = doc(db, 'users', followingId);
          const [existingSnap, followerDoc, followingDoc] = await Promise.all([
            tx.get(followingRef),
            tx.get(followerUserRef),
            tx.get(followingUserRef),
          ]);
          if (!existingSnap.exists()) return;

          const currentFollowingCount = Number(followerDoc.data()?.stats?.followingCount || 0);
          const currentFollowersCount = Number(followingDoc.data()?.stats?.followersCount || 0);

          tx.delete(followingRef);
          tx.delete(followerRef);
          tx.update(followerUserRef, {
            'stats.followingCount': increment(currentFollowingCount > 0 ? -1 : 0),
          });
          tx.update(followingUserRef, {
            'stats.followersCount': increment(currentFollowersCount > 0 ? -1 : 0),
          });
        });
      },
      revalidate: async () => {
        await this.refreshUserInBackground(followerId);
        await this.refreshUserInBackground(followingId);
      },
    });
  }
  async sendFollowRequest(requesterId: string, targetUserId: string): Promise<void> {
    const requestRef = doc(db, `users/${targetUserId}/followRequests/${requesterId}`);
    const requesterUser = await this.getUser(requesterId);
    
    if (!requesterUser) {
      throw new Error('Requester not found');
    }
    
    await setDoc(requestRef, {
      userId: requesterId,
      username: requesterUser.username,
      displayName: requesterUser.displayName,
      avatarURL: requesterUser.avatarURL || '',
      requestedAt: serverTimestamp(),
      status: 'pending',
    });
    
    // Send notification to target user
    const { notificationService } = await import('./notification.service');
    await notificationService.createNotification(
      targetUserId,
      'follow_request',
      requesterId,
      requesterUser.username,
      requesterUser.avatarURL || '',
      'user',
      requesterId,
      `${requesterUser.displayName || requesterUser.username} requested to follow you`,
      undefined
    );
  }

  /**
   * Check if user has requested to follow another user
   */
  async hasRequestedFollow(requesterId: string, targetUserId: string): Promise<boolean> {
    const requestRef = doc(db, `users/${targetUserId}/followRequests/${requesterId}`);
    const requestSnap = await getDoc(requestRef);
    return requestSnap.exists() && requestSnap.data()?.status === 'pending';
  }

  /**
   * Cancel follow request
   */
  async cancelFollowRequest(requesterId: string, targetUserId: string): Promise<void> {
    const requestRef = doc(db, `users/${targetUserId}/followRequests/${requesterId}`);
    await deleteDoc(requestRef);
  }

  /**
   * Accept follow request
   */
  async acceptFollowRequest(targetUserId: string, requesterId: string): Promise<void> {
    // First, establish the follow relationship
    await this.followUser(requesterId, targetUserId);
    
    // Then delete the follow request
    const requestRef = doc(db, `users/${targetUserId}/followRequests/${requesterId}`);
    await deleteDoc(requestRef);
  }

  /**
   * Reject follow request
   */
  async rejectFollowRequest(targetUserId: string, requesterId: string): Promise<void> {
    const requestRef = doc(db, `users/${targetUserId}/followRequests/${requesterId}`);
    await deleteDoc(requestRef);
  }

  /**
   * Get pending follow requests for a user
   */
  async getFollowRequests(userId: string): Promise<any[]> {
    const requestsRef = collection(db, `users/${userId}/followRequests`);
    const q = query(requestsRef, where('status', '==', 'pending'), orderBy('requestedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      requestId: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Get user's followers (with caching)
   */
  async getFollowers(userId: string, limitCount = 50): Promise<string[]> {
    const { cacheService } = await import('./cache.service');
    const cacheKey = `followers_${userId}_${limitCount}`;
    
    return cacheService.get(cacheKey, async () => {
      const followersRef = collection(db, `users/${userId}/followers`);
      const q = query(followersRef, orderBy('followedAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => doc.id);
    }, 5 * 60 * 1000); // Cache for 5 minutes
  }

  /**
   * Get user's following (with caching)
   */
  async getFollowing(userId: string, limitCount = 50): Promise<string[]> {
    const { cacheService } = await import('./cache.service');
    const cacheKey = `following_${userId}_${limitCount}`;
    
    return cacheService.get(cacheKey, async () => {
      const followingRef = collection(db, `users/${userId}/following`);
      const q = query(followingRef, orderBy('followedAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => doc.id);
    }, 5 * 60 * 1000); // Cache for 5 minutes
  }

  async isFollowingUser(followerId: string, targetUserId: string): Promise<boolean> {
    const followingRef = doc(db, `users/${followerId}/following/${targetUserId}`);
    const followingSnap = await getDoc(followingRef);
    return followingSnap.exists();
  }

  // ==========================================
  // CLOSE FRIENDS
  // ==========================================

  /**
   * Add user to close friends
   */
  async addCloseFriend(userId: string, friendId: string): Promise<void> {
    const closeFriendRef = doc(db, `users/${userId}/closeFriends/${friendId}`);
    await setDoc(closeFriendRef, {
      userId: friendId,
      addedAt: serverTimestamp(),
    });

    try {
      const followerRef = doc(db, `users/${userId}/followers/${friendId}`);
      const followerSnap = await getDoc(followerRef);
      if (followerSnap.exists()) {
        await updateDoc(followerRef, {
          isCloseFriend: true,
        });
      }
    } catch (error) {
      console.warn('Failed to mirror close friend status on follower record:', error);
    }
  }

  /**
   * Remove user from close friends
   */
  async removeCloseFriend(userId: string, friendId: string): Promise<void> {
    const closeFriendRef = doc(db, `users/${userId}/closeFriends/${friendId}`);
    await deleteDoc(closeFriendRef);

    try {
      const followerRef = doc(db, `users/${userId}/followers/${friendId}`);
      const followerSnap = await getDoc(followerRef);
      if (followerSnap.exists()) {
        await updateDoc(followerRef, {
          isCloseFriend: false,
        });
      }
    } catch (error) {
      console.warn('Failed to clear close friend status on follower record:', error);
    }
  }

  /**
   * Get close friends list
   */
  async getCloseFriends(userId: string): Promise<string[]> {
    const closeFriendsRef = collection(db, `users/${userId}/closeFriends`);
    const snapshot = await getDocs(closeFriendsRef);
    return snapshot.docs.map((doc) => doc.id);
  }

  // ==========================================
  // BLOCK OPERATIONS
  // ==========================================

  /**
   * Block a user
   */
  async blockUser(userId: string, blockedUserId: string): Promise<void> {
    const batch = writeBatch(db);

    // Add to blocked list
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${blockedUserId}`);
    batch.set(blockedRef, {
      userId: blockedUserId,
      blockedAt: serverTimestamp(),
    });

    // Unfollow if following
    const followingRef = doc(db, `users/${userId}/following/${blockedUserId}`);
    batch.delete(followingRef);

    const followerRef = doc(db, `users/${blockedUserId}/followers/${userId}`);
    batch.delete(followerRef);

    // Update counts safely (prevent negative)
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const currentFollowingCount = userDoc.data()?.stats?.followingCount || 0;
    
    if (currentFollowingCount > 0) {
      batch.update(userRef, {
        'stats.followingCount': increment(-1),
      });
    }

    const blockedUserRef = doc(db, 'users', blockedUserId);
    const blockedUserDoc = await getDoc(blockedUserRef);
    const currentFollowersCount = blockedUserDoc.data()?.stats?.followersCount || 0;
    
    if (currentFollowersCount > 0) {
      batch.update(blockedUserRef, {
        'stats.followersCount': increment(-1),
      });
    }

    await batch.commit();
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string, blockedUserId: string): Promise<void> {
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${blockedUserId}`);
    await deleteDoc(blockedRef);
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(userId: string): Promise<string[]> {
    const blockedRef = collection(db, `users/${userId}/blockedUsers`);
    const snapshot = await getDocs(blockedRef);
    return snapshot.docs.map(doc => doc.data().userId);
  }

  /**
   * Check if user is blocked
   */
  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const blockedRef = doc(db, `users/${userId}/blockedUsers/${targetUserId}`);
    const blockedSnap = await getDoc(blockedRef);
    return blockedSnap.exists();
  }

  /**
   * Deactivate user account (reversible)
   */
  async deactivateAccount(userId: string, reason?: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isActive: false,
      deactivatedAt: serverTimestamp(),
      deactivationReason: reason || '',
    });
  }

  /**
   * Delete user account permanently (with 7-day grace period)
   */
  async deleteAccount(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    
    // Calculate deletion date (7 days from now)
    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 7);
    
    await updateDoc(userRef, {
      isDeleted: true,
      scheduledDeletionAt: Timestamp.fromDate(scheduledDeletionAt),
      deletedAt: serverTimestamp(),
    });
  }

  /**
   * Permanently delete all user data from Firestore
   * This is called by a Cloud Function after grace period expires
   */
  async deleteAccountData(userId: string): Promise<void> {
    const batch = writeBatch(db);
    
    try {
      // 1. Delete all user's posts
      const postsQuery = query(collection(db, 'posts'), where('userId', '==', userId));
      const postsSnapshot = await getDocs(postsQuery);
      postsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // 2. Delete all user's glimpses
      const glimpsesQuery = query(collection(db, 'glimpses'), where('userId', '==', userId));
      const glimpsesSnapshot = await getDocs(glimpsesQuery);
      glimpsesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // 3. Delete all user's stories
      const storiesQuery = query(collection(db, 'stories'), where('userId', '==', userId));
      const storiesSnapshot = await getDocs(storiesQuery);
      storiesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // 4. Delete all conversations where user is participant
      const conversationsQuery = query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', userId)
      );
      const conversationsSnapshot = await getDocs(conversationsQuery);
      
      // Delete messages in each conversation
      for (const convDoc of conversationsSnapshot.docs) {
        const messagesQuery = collection(db, `conversations/${convDoc.id}/messages`);
        const messagesSnapshot = await getDocs(messagesQuery);
        messagesSnapshot.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
        batch.delete(convDoc.ref);
      }
      
      // 5. Delete user's notifications
      const notificationsQuery = collection(db, `users/${userId}/notifications`);
      const notificationsSnapshot = await getDocs(notificationsQuery);
      notificationsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // 6. Delete user's saved collections
      const collectionsQuery = query(collection(db, 'collections'), where('userId', '==', userId));
      const collectionsSnapshot = await getDocs(collectionsQuery);
      collectionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      
      // 7. Delete user document itself
      batch.delete(doc(db, 'users', userId));
      
      // Commit all deletions
      await batch.commit();
      
      console.log(`Successfully deleted all data for user: ${userId}`);
    } catch (error) {
      console.error('Error deleting user data:', error);
      throw new Error('Failed to delete user data');
    }
  }

  /**
   * Cancel scheduled account deletion (called on login)
   */
  async cancelAccountDeletion(userId: string): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isDeleted: false,
      scheduledDeletionAt: null,
      deletedAt: null,
    });
  }

  /**
   * Get list of muted users
   */
  async getMutedUsers(userId: string): Promise<string[]> {
    const [snapshot, userDoc] = await Promise.all([
      getDocs(collection(db, `users/${userId}/mutedUsers`)),
      getDoc(doc(db, 'users', userId)),
    ]);

    const fromCollection = snapshot.docs.map((entry) => entry.data().userId || entry.id);
    const fromUserDoc = Array.isArray(userDoc.data()?.mutedUsers) ? userDoc.data()?.mutedUsers : [];

    return Array.from(new Set([...fromCollection, ...fromUserDoc])).filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
  }

  /**
   * Check if username exists (case-insensitive)
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const usernameQuery = query(
        collection(db, 'users'),
        where('usernameLowercase', '==', username.toLowerCase())
      );
      const existingUser = await getDocs(usernameQuery);
      return existingUser.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      throw error;
    }
  }

  /**
   * Generate username suggestions based on a taken username
   */
  generateUsernameSuggestions(username: string): string[] {
    // Clean base: remove all special characters
    const cleanBase = username.toLowerCase().replace(/[_.]/g, '');
    const suggestions: string[] = [];
    
    // Add 3-digit numbers with underscore
    for (let i = 0; i < 3; i++) {
      const randomNum = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
      suggestions.push(`${cleanBase}_${randomNum}`);
    }
    
    // Add single digit variations (no special char)
    suggestions.push(`${cleanBase}1`);
    suggestions.push(`${cleanBase}2`);
    
    // Add year
    const year = new Date().getFullYear();
    suggestions.push(`${year}_${cleanBase}`);
    
    return suggestions;
  }

  /**
   * Check if user is following another user
   */
  async isFollowing(userId: string, targetUserId: string): Promise<boolean> {
    try {
      const followingRef = doc(db, 'users', userId, 'following', targetUserId);
      const followingSnap = await getDoc(followingRef);
      return followingSnap.exists();
    } catch (error) {
      console.error('Error checking follow status:', error);
      return false;
    }
  }

  /**
   * Get mutual followers between two users
   */
  async getMutualFollowers(userId: string, targetUserId: string): Promise<string[]> {
    try {
      // Get current user's following
      const userFollowing = await this.getFollowing(userId);
      
      // Get target user's followers
      const targetFollowers = await this.getFollowers(targetUserId);
      
      // Find intersection (mutual followers)
      const mutualFollowers = userFollowing.filter(followingId => 
        targetFollowers.includes(followingId)
      );
      
      return mutualFollowers;
    } catch (error) {
      console.error('Error getting mutual followers:', error);
      return [];
    }
  }
}

// Export singleton instance
export const userService = new UserService();























