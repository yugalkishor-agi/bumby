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
  startAfter,
  increment,
  serverTimestamp,
  writeBatch,
  deleteField,
  runTransaction,
  DocumentSnapshot,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { messageCacheService } from "./messageCache.service";
import { chatE2EE } from './chatE2EE.service';
import type { Conversation, Message, CreateMessageData } from "../types/database";

type DirectMessageAccess = {
  allowed: boolean;
  direct: boolean;
  requiresRequest: boolean;
  reason: 'blocked' | 'followers_only' | null;
};

type ConversationCacheEntry = {
  data: Conversation;
  expiresAt: number;
};

type DirectAccessCacheEntry = {
  value: DirectMessageAccess;
  expiresAt: number;
};

/**
 * Deterministic document id for a 1:1 conversation. Both participants derive
 * the same id, so the conversation can be resolved without a collection scan.
 */
export const buildDirectConversationId = (userId1: string, userId2: string): string => {
  const sortedIds = [userId1, userId2].sort();
  return `dm_${sortedIds[0]}_${sortedIds[1]}`;
};

export class MessageService {
  private static readonly CONVERSATION_CACHE_TTL_MS = 8000;
  private static readonly DIRECT_ACCESS_CACHE_TTL_MS = 12000;
  private static readonly LEGACY_LOOKUP_TTL_MS = 5 * 60 * 1000;

  private readonly conversationCache = new Map<string, ConversationCacheEntry>();
  private readonly directAccessCache = new Map<string, DirectAccessCacheEntry>();
  /** Memoised result of the legacy-ID lookup so repeat opens stay instant. */
  private readonly legacyConversationCache = new Map<string, { id: string | null; expiresAt: number }>();
  /** In-flight `getOrCreateDirectConversation` calls, keyed by participant pair. */
  private readonly pendingConversationResolves = new Map<string, Promise<string>>();

  private getDirectAccessCacheKey(senderId: string, recipientId: string): string {
    return `${senderId}:${recipientId}`;
  }

  private getCachedConversation(conversationId: string): Conversation | null {
    const now = Date.now();
    const cached = this.conversationCache.get(conversationId);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
      this.conversationCache.delete(conversationId);
      return null;
    }
    return cached.data;
  }

  private cacheConversation(conversationId: string, data: Conversation): void {
    this.conversationCache.set(conversationId, {
      data,
      expiresAt: Date.now() + MessageService.CONVERSATION_CACHE_TTL_MS,
    });
  }

  private invalidateConversationCache(conversationId: string): void {
    this.conversationCache.delete(conversationId);
  }

  private async getConversationForSend(conversationId: string): Promise<Conversation | null> {
    const cached = this.getCachedConversation(conversationId);
    if (cached) return cached;

    const conversationRef = doc(db, 'conversations', conversationId);
    let conversationSnap = await getDoc(conversationRef);

    // If the doc doesn't exist yet (e.g. just created, Firestore still propagating),
    // wait briefly and retry once before giving up.
    if (!conversationSnap.exists()) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      conversationSnap = await getDoc(conversationRef);
    }

    if (!conversationSnap.exists()) return null;

    const conversation = { conversationId: conversationSnap.id, ...conversationSnap.data() } as Conversation;
    this.cacheConversation(conversationId, conversation);
    return conversation;
  }

  private async getDirectMessageAccessCached(senderId: string, recipientId: string): Promise<DirectMessageAccess> {
    const cacheKey = this.getDirectAccessCacheKey(senderId, recipientId);
    const now = Date.now();
    const cached = this.directAccessCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const computed = await this.getDirectMessageAccess(senderId, recipientId);
    this.directAccessCache.set(cacheKey, {
      value: computed,
      expiresAt: now + MessageService.DIRECT_ACCESS_CACHE_TTL_MS,
    });

    return computed;
  }
  // ==========================================
  // CONVERSATION OPERATIONS
  // ==========================================
  async setChatTheme(conversationId: string, userId: string, themeKey: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      [`chatThemes.${userId}`]: themeKey,
      updatedAt: serverTimestamp(),
    });
  }

  async setDisappearingMessages(
    conversationId: string,
    userId: string,
    minutes: number | null
  ): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      [`disappearingBy.${userId}`]: minutes == null ? deleteField() : minutes,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Check if two users can message based on privacy, follow state, and blocking.
   */
  async getDirectMessageAccess(
    senderId: string,
    recipientId: string
  ): Promise<DirectMessageAccess> {
    try {
      const { userService } = await import("./user.service");
      const { settingsService } = await import("./settings.service");

      const [senderBlockedRecipient, senderFollowsRecipient, recipientFollowsSender, privacy] = await Promise.all([
        userService.isBlocked(senderId, recipientId),
        userService.isFollowingUser(senderId, recipientId),
        userService.isFollowingUser(recipientId, senderId),
        settingsService.getPrivacySettings(recipientId).catch(() => null),
      ]);

      if (senderBlockedRecipient) {
        return { allowed: false, direct: false, requiresRequest: false, reason: 'blocked' };
      }

      const whoCanMessage = privacy?.whoCanMessage || 'everyone';
      const allowed = whoCanMessage === 'everyone' || senderFollowsRecipient;
      const direct = allowed && senderFollowsRecipient && recipientFollowsSender;

      return {
        allowed,
        direct,
        requiresRequest: allowed && !direct,
        reason: allowed ? null : 'followers_only',
      };
    } catch (error) {
      console.error("Error checking message access:", error);
      return { allowed: false, direct: false, requiresRequest: false, reason: 'followers_only' };
    }
  }

  /**
   * Check if two users can message directly (must follow each other)
   * Returns true if they follow each other, false otherwise
   */
  async canMessageDirectly(userId1: string, userId2: string): Promise<boolean> {
    const access = await this.getDirectMessageAccessCached(userId1, userId2);
    return access.direct;
  }

  /**
   * Resolve the conversation id for a pair of users without touching the
   * network. Callers can use this to open a chat instantly and let the
   * conversation document be created in the background.
   */
  getDirectConversationId(userId1: string, userId2: string): string {
    return buildDirectConversationId(userId1, userId2);
  }

  /**
   * Look for a conversation that was created before the deterministic-id
   * scheme (those used an auto-generated Firestore id).
   *
   * The query intentionally filters on `participantIds` only: an additional
   * `type == 'direct'` equality filter would require a composite index, and
   * the missing index turned this into a multi-second stall (or a hard
   * failure) every time a new chat was opened. Filtering on the single
   * array field uses the default index and only reads the caller's own
   * conversations.
   */
  private async findLegacyDirectConversation(
    userId1: string,
    userId2: string,
    sortedIds: string[]
  ): Promise<string | null> {
    const cacheKey = `${sortedIds[0]}:${sortedIds[1]}`;
    const now = Date.now();
    const cached = this.legacyConversationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.id;

    let legacyId: string | null = null;
    try {
      const legacyQ = query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', userId1)
      );
      const legacySnapshot = await getDocs(legacyQ);
      const legacyDoc = legacySnapshot.docs.find((d) => {
        const data = d.data();
        if (data.type !== 'direct') return false;
        const parts: string[] = (data.participantIds ?? []).slice().sort();
        return parts.length === 2 && parts[0] === sortedIds[0] && parts[1] === sortedIds[1];
      });
      if (legacyDoc) legacyId = legacyDoc.id;
    } catch (error) {
      // A missing index or an offline read must never block opening a chat.
      console.warn('Legacy conversation lookup failed:', error);
    }

    this.legacyConversationCache.set(cacheKey, {
      id: legacyId,
      expiresAt: now + MessageService.LEGACY_LOOKUP_TTL_MS,
    });
    return legacyId;
  }

  /**
   * Make sure the conversation document behind `conversationId` exists.
   *
   * The inbox opens a chat with the deterministic id straight away, so the
   * document may not have been written yet. When it is missing the
   * conversation is resolved (legacy id lookup) or created in the background,
   * and the real id is returned — it can differ from `conversationId` when the
   * pair still has a conversation from before the deterministic-id scheme.
   */
  async ensureDirectConversation(
    userId1: string,
    userId2: string,
    conversationId: string
  ): Promise<string> {
    try {
      const snap = await getDoc(doc(db, 'conversations', conversationId));
      if (snap.exists()) return conversationId;
    } catch (error) {
      console.warn('Conversation existence check failed:', error);
    }

    try {
      return await this.getOrCreateDirectConversation(userId1, userId2);
    } catch (error) {
      console.warn('Failed to ensure conversation:', error);
      return conversationId;
    }
  }

  async getOrCreateDirectConversation(
    userId1: string,
    userId2: string
  ): Promise<string> {
    const resolveKey = `${[userId1, userId2].sort().join(':')}`;
    const inFlight = this.pendingConversationResolves.get(resolveKey);
    if (inFlight) return inFlight;

    const promise = this.resolveDirectConversation(userId1, userId2).finally(() => {
      this.pendingConversationResolves.delete(resolveKey);
    });
    this.pendingConversationResolves.set(resolveKey, promise);
    return promise;
  }

  private async resolveDirectConversation(
    userId1: string,
    userId2: string
  ): Promise<string> {
    const sortedIds = [userId1, userId2].sort();

    // Use a deterministic conversation ID derived from both user IDs.
    // This makes the document ID predictable and idempotent — concurrent calls
    // from both sides always resolve to the same document, eliminating the race
    // condition that caused duplicate conversations.
    const deterministicId = buildDirectConversationId(userId1, userId2);
    const conversationRef = doc(db, 'conversations', deterministicId);

    // Check cache first
    const cached = this.getCachedConversation(deterministicId);
    if (cached) {
      return deterministicId;
    }

    // The access check and the document lookup are independent, so run them
    // together instead of paying for two sequential round trips.
    const accessPromise = this.getDirectMessageAccessCached(userId1, userId2);
    const conversationSnap = await getDoc(conversationRef);

    if (conversationSnap.exists()) {
      const access = await accessPromise;
      if (!access.allowed) {
        throw new Error(access.reason === 'blocked' ? 'Messaging unavailable for this account.' : 'This user only accepts messages from followers.');
      }

      // Conversation already exists — restore it if the user had deleted/archived it
      try {
        await updateDoc(conversationRef, {
          deletedBy: arrayRemove(userId1),
          archivedBy: arrayRemove(userId1),
          // Clear the deletion cutoff so the user sees all messages going forward
          [`deletionTimestamps.${userId1}`]: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // no-op: legacy docs may not have these fields
      }
      this.invalidateConversationCache(deterministicId);
      return deterministicId;
    }

    // ── Migration: look for an existing conversation with a legacy random ID ──
    // Old conversations were created with auto-generated Firestore IDs. If one
    // exists, keep using it so the message history stays in one place.
    const [access, legacyId] = await Promise.all([
      accessPromise,
      this.findLegacyDirectConversation(userId1, userId2, sortedIds),
    ]);

    if (!access.allowed) {
      throw new Error(access.reason === 'blocked' ? 'Messaging unavailable for this account.' : 'This user only accepts messages from followers.');
    }

    if (legacyId) {
      // Restore deleted/archived state and return the legacy ID.
      try {
        await updateDoc(doc(db, 'conversations', legacyId), {
          deletedBy: arrayRemove(userId1),
          archivedBy: arrayRemove(userId1),
          [`deletionTimestamps.${userId1}`]: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // no-op
      }
      this.invalidateConversationCache(legacyId);
      return legacyId;
    }

    // No existing conversation — create one with the deterministic ID
    const clientTimestamp = Date.now();
    const restrictedBy: string[] = [];

    await setDoc(conversationRef, {
      conversationId: deterministicId,
      type: 'direct',
      participantIds: sortedIds,
      participantCount: 2,
      createdBy: userId1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: clientTimestamp,
      unreadCounts: {
        [userId1]: 0,
        [userId2]: 0,
      },
      lastMessage: null,
      pinnedBy: [],
      mutedBy: [],
      deletedBy: [],
      restrictedBy,
    });

    return deterministicId;
  }

  async createGroupConversation(
    creatorId: string,
    participantIds: string[],
    groupName: string,
    groupAvatarURL?: string
  ): Promise<string> {
    const normalizedParticipantIds = Array.from(
      new Set((participantIds || []).filter((id) => typeof id === "string" && id.trim().length > 0 && id !== creatorId))
    );

    if (normalizedParticipantIds.length < 2) {
      throw new Error("A group requires at least 2 members besides the creator.");
    }

    const conversationRef = doc(collection(db, "conversations"));
    const conversationId = conversationRef.id;
    const clientTimestamp = Date.now();

    const allParticipants = [creatorId, ...normalizedParticipantIds];
    const unreadCounts: { [key: string]: number } = {};
    allParticipants.forEach((id) => {
      unreadCounts[id] = 0;
    });

    const normalizedGroupName = String(groupName || "").trim() || "New group";
    const normalizedGroupAvatarURL =
      typeof groupAvatarURL === "string" && groupAvatarURL.trim().length > 0
        ? groupAvatarURL.trim()
        : undefined;

    const conversationPayload: Record<string, any> = {
      conversationId,
      type: "group",
      groupName: normalizedGroupName,
      groupAdmins: [creatorId],
      groupJoinMode: "invite_only",
      groupJoinRequests: [],
      groupMemberMutes: {},
      groupBans: {},
      participantIds: allParticipants,
      participantCount: allParticipants.length,
      createdBy: creatorId,
      unreadCounts,
      lastMessage: null,
      pinnedBy: [],
      mutedBy: [],
      archivedBy: [],
      deletedBy: [],
      restrictedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: clientTimestamp,
    };

    if (normalizedGroupAvatarURL) {
      conversationPayload.groupAvatarURL = normalizedGroupAvatarURL;
    }

    await setDoc(conversationRef, conversationPayload);

    return conversationId;
  }

  async updateGroupConversation(
    conversationId: string,
    actorId: string,
    updates: {
      groupName?: string;
      groupDescription?: string | null;
      groupAvatarURL?: string | null;
    }
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const adminIds = Array.isArray(conversation.groupAdmins) ? conversation.groupAdmins : [];
    const createdBy = String((conversation as any)?.createdBy || '');
    const canManage = adminIds.includes(actorId) || createdBy === actorId;

    if (!canManage) {
      throw new Error('Only group admins can update group info.');
    }

    const patch: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'groupName')) {
      const nextName = String(updates.groupName || '').trim();
      if (!nextName) {
        throw new Error('Group name cannot be empty.');
      }
      patch.groupName = nextName;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'groupDescription')) {
      const nextDescription = String(updates.groupDescription || '').trim();
      patch.groupDescription = nextDescription.length > 0 ? nextDescription : deleteField();
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'groupAvatarURL')) {
      const nextAvatar = String(updates.groupAvatarURL || '').trim();
      patch.groupAvatarURL = nextAvatar.length > 0 ? nextAvatar : deleteField();
    }

    await updateDoc(doc(db, 'conversations', conversationId), patch);
    this.invalidateConversationCache(conversationId);
  }

  async updateGroupSecuritySettings(
    conversationId: string,
    actorId: string,
    updates: {
      groupJoinMode?: 'invite_only' | 'approval_required';
    }
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const adminIds = Array.isArray(conversation.groupAdmins) ? conversation.groupAdmins : [];
    const createdBy = String((conversation as any)?.createdBy || '');
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can change security settings.');
    }

    const patch: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'groupJoinMode')) {
      const mode = String(updates.groupJoinMode || '').trim();
      if (mode !== 'invite_only' && mode !== 'approval_required') {
        throw new Error('Invalid group join mode.');
      }
      patch.groupJoinMode = mode;
    }

    await updateDoc(doc(db, 'conversations', conversationId), patch);
    this.invalidateConversationCache(conversationId);
  }
  async addGroupMembers(conversationId: string, actorId: string, memberIds: string[]): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    const createdBy = String((conversation as any)?.createdBy || '');
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can add members.');
    }
    const existingIds = Array.isArray(conversation.participantIds) ? [...conversation.participantIds] : [];
    const removedMembers = { ...((conversation as any)?.removedMembers || {}) } as Record<string, { removedBy: string; removedAtMs: number }>;
    const groupBans = { ...((conversation as any)?.groupBans || {}) } as Record<string, number>;
    const now = Date.now();
    const requestedIds = Array.from(new Set((memberIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0)));
    const blockedIds = requestedIds.filter((id) => Number(groupBans[id] || 0) > now);
    if (blockedIds.length > 0) {
      throw new Error('One or more selected members are temporarily banned.');
    }

    const restoredIds = requestedIds.filter((id) => !!removedMembers[id]);
    const newMemberIds = requestedIds.filter((id) => !existingIds.includes(id));
    if (restoredIds.length === 0 && newMemberIds.length === 0) {
      return;
    }

    restoredIds.forEach((id) => {
      delete removedMembers[id];
    });

    const participantIds = [...existingIds, ...newMemberIds];
    const unreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    [...restoredIds, ...newMemberIds].forEach((id) => {
      unreadCounts[id] = 0;
    });

    await updateDoc(doc(db, 'conversations', conversationId), {
      participantIds,
      participantCount: participantIds.filter((id) => !removedMembers[id]).length,
      unreadCounts,
      removedMembers,
      deletedBy: arrayRemove(...requestedIds),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);

    const { userService } = await import('./user.service');
    const addedProfiles = await Promise.all(
      requestedIds.map(async (id) => {
        try {
          return await userService.getUser(id);
        } catch {
          return null;
        }
      })
    );
    const addedLabels = addedProfiles.map((profile, index) => profile?.username || requestedIds[index]).filter(Boolean) as string[];
    const actor = await this.getActorSnapshot(actorId);
    await this.sendGroupActivityMessage(
      conversationId,
      actorId,
      actor.username + ' added ' + this.formatGroupUserList(addedLabels) + ' to this group',
      {
        participantIds,
        unreadCounts,
        removedMembers,
      }
    );
  }
  async setGroupAdmin(conversationId: string, actorId: string, memberId: string, isAdmin: boolean): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }
    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can manage admins.');
    }
    if (!conversation.participantIds?.includes(memberId)) {
      throw new Error('Member not found in this group.');
    }
    const nextAdmins = new Set(adminIds);
    nextAdmins.add(createdBy);
    if (memberId === createdBy) {
      return;
    }
    if (isAdmin) {
      nextAdmins.add(memberId);
    } else {
      nextAdmins.delete(memberId);
    }
    await updateDoc(doc(db, 'conversations', conversationId), {
      groupAdmins: Array.from(nextAdmins).filter(Boolean),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
  }
  async removeGroupMember(conversationId: string, actorId: string, memberId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }
    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can remove members.');
    }
    if (memberId === createdBy) {
      throw new Error('The group owner cannot be removed.');
    }
    if (!conversation.participantIds?.includes(memberId)) {
      return;
    }

    const participantIds = Array.isArray(conversation.participantIds) ? [...conversation.participantIds] : [];
    const unreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    unreadCounts[memberId] = 0;
    const nextAdmins = adminIds.filter((id) => id !== memberId);
    const removedMembers = {
      ...((conversation as any)?.removedMembers || {}),
      [memberId]: {
        removedBy: actorId,
        removedAtMs: Date.now(),
      },
    };

    await updateDoc(doc(db, 'conversations', conversationId), {
      participantIds,
      participantCount: participantIds.filter((id) => !removedMembers[id]).length,
      unreadCounts,
      removedMembers,
      groupAdmins: Array.from(new Set([createdBy, ...nextAdmins])).filter((id) => participantIds.includes(id) && !removedMembers[id]),
      deletedBy: arrayRemove(memberId),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
    const removedProfile = await this.getActorSnapshot(memberId);
    const actor = await this.getActorSnapshot(actorId);
    await this.sendGroupActivityMessage(
      conversationId,
      actorId,
      actor.username + ' removed ' + removedProfile.username + ' from this group',
      {
        participantIds,
        unreadCounts,
        removedMembers,
      }
    );
  }
  async temporarilyBanGroupMember(
    conversationId: string,
    actorId: string,
    memberId: string,
    durationHours = 24
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can ban members.');
    }

    if (memberId === createdBy) {
      throw new Error('The group owner cannot be banned.');
    }

    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds.filter((id) => id !== memberId)
      : [];
    const unreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    delete unreadCounts[memberId];
    const nextAdmins = adminIds.filter((id) => id !== memberId && participantIds.includes(id));
    const banUntil = Date.now() + Math.max(1, durationHours) * 60 * 60 * 1000;

    await updateDoc(doc(db, 'conversations', conversationId), {
      participantIds,
      participantCount: participantIds.length,
      unreadCounts,
      groupAdmins: Array.from(new Set([createdBy, ...nextAdmins])).filter((id) => participantIds.includes(id)),
      [`groupBans.${memberId}`]: banUntil,
      deletedBy: arrayUnion(memberId),
      updatedAt: serverTimestamp(),
    });

    this.invalidateConversationCache(conversationId);
  }

  async setGroupMemberMute(
    conversationId: string,
    actorId: string,
    memberId: string,
    durationMinutes = 60
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can mute members.');
    }
    if (!conversation.participantIds?.includes(memberId)) {
      throw new Error('Member not found in this group.');
    }
    if (memberId === createdBy) {
      throw new Error('The group owner cannot be muted.');
    }

    const mutedUntilMs = Date.now() + Math.max(1, durationMinutes) * 60 * 1000;
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`groupMemberMutes.${memberId}`]: {
        mutedBy: actorId,
        mutedAtMs: Date.now(),
        mutedUntilMs,
      },
      updatedAt: serverTimestamp(),
    });

    this.invalidateConversationCache(conversationId);
    const actor = await this.getActorSnapshot(actorId);
    const mutedProfile = await this.getActorSnapshot(memberId);
    await this.sendGroupActivityMessage(
      conversationId,
      actorId,
      actor.username + ' muted ' + mutedProfile.username + ' in this group'
    );
  }

  async clearGroupMemberMute(conversationId: string, actorId: string, memberId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can unmute members.');
    }
    const existingMute = ((conversation as any)?.groupMemberMutes || {}) as Record<string, { mutedUntilMs?: number }>;
    const wasMuted = Number(existingMute[memberId]?.mutedUntilMs || 0) > Date.now();

    await updateDoc(doc(db, 'conversations', conversationId), {
      [`groupMemberMutes.${memberId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
    if (wasMuted) {
      const actor = await this.getActorSnapshot(actorId);
      const mutedProfile = await this.getActorSnapshot(memberId);
      await this.sendGroupActivityMessage(
        conversationId,
        actorId,
        actor.username + ' unmuted ' + mutedProfile.username + ' in this group'
      );
    }
  }

  async clearGroupMemberBan(conversationId: string, actorId: string, memberId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can unban members.');
    }

    await updateDoc(doc(db, 'conversations', conversationId), {
      ['groupBans.' + memberId]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
  }
  async requestJoinGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const participantIds = Array.isArray(conversation.participantIds) ? conversation.participantIds : [];
    if (participantIds.includes(userId)) {
      return;
    }

    const mode = String((conversation as any)?.groupJoinMode || 'invite_only');
    if (mode !== 'approval_required') {
      throw new Error('This group does not accept join requests.');
    }

    const groupBans = { ...((conversation as any)?.groupBans || {}) } as Record<string, number>;
    if (Number(groupBans[userId] || 0) > Date.now()) {
      throw new Error('You are temporarily restricted from joining this group.');
    }

    await updateDoc(doc(db, 'conversations', conversationId), {
      groupJoinRequests: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
  }

  async approveGroupJoinRequest(conversationId: string, actorId: string, memberId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can approve join requests.');
    }

    const existingIds = Array.isArray(conversation.participantIds) ? [...conversation.participantIds] : [];
    const joinRequests = Array.isArray((conversation as any)?.groupJoinRequests)
      ? [...(conversation as any).groupJoinRequests]
      : [];
    if (!joinRequests.includes(memberId) && !existingIds.includes(memberId)) {
      throw new Error('Join request not found.');
    }
    if (existingIds.includes(memberId)) {
      await updateDoc(doc(db, 'conversations', conversationId), {
        groupJoinRequests: arrayRemove(memberId),
        updatedAt: serverTimestamp(),
      });
      this.invalidateConversationCache(conversationId);
      return;
    }

    const groupBans = { ...((conversation as any)?.groupBans || {}) } as Record<string, number>;
    if (Number(groupBans[memberId] || 0) > Date.now()) {
      throw new Error('Member is temporarily banned from this group.');
    }

    const participantIds = [...existingIds, memberId];
    const unreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    unreadCounts[memberId] = 0;

    await updateDoc(doc(db, 'conversations', conversationId), {
      participantIds,
      participantCount: participantIds.length,
      unreadCounts,
      groupJoinRequests: arrayRemove(memberId),
      deletedBy: arrayRemove(memberId),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);

    const actor = await this.getActorSnapshot(actorId);
    const approvedProfile = await this.getActorSnapshot(memberId);
    await this.sendGroupActivityMessage(
      conversationId,
      actorId,
      actor.username + ' approved ' + approvedProfile.username + ' to join this group',
      {
        participantIds,
        unreadCounts,
      }
    );
  }
  async rejectGroupJoinRequest(conversationId: string, actorId: string, memberId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    if (!(adminIds.includes(actorId) || createdBy === actorId)) {
      throw new Error('Only group admins can reject join requests.');
    }

    await updateDoc(doc(db, 'conversations', conversationId), {
      groupJoinRequests: arrayRemove(memberId),
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
  }
  async leaveGroupConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const existingIds = Array.isArray(conversation.participantIds) ? [...conversation.participantIds] : [];
    if (!existingIds.includes(userId)) {
      return;
    }

    const remainingIds = existingIds.filter((id) => id !== userId);
    if (remainingIds.length === 0) {
      throw new Error('Last member cannot leave the group.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    let nextCreatedBy = createdBy;
    if (createdBy === userId) {
      nextCreatedBy = remainingIds[0];
    }

    const unreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    delete unreadCounts[userId];

    const currentAdmins = Array.isArray(conversation.groupAdmins) ? [...conversation.groupAdmins] : [];
    let nextAdmins = currentAdmins.filter((id) => id !== userId && remainingIds.includes(id));
    if (!nextAdmins.includes(nextCreatedBy)) {
      nextAdmins = [nextCreatedBy, ...nextAdmins];
    }

    await updateDoc(doc(db, 'conversations', conversationId), {
      participantIds: remainingIds,
      participantCount: remainingIds.length,
      unreadCounts,
      groupAdmins: Array.from(new Set(nextAdmins)).filter(Boolean),
      createdBy: nextCreatedBy,
      deletedBy: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });

    this.invalidateConversationCache(conversationId);
    const actor = await this.getActorSnapshot(userId);
    await this.sendGroupActivityMessage(
      conversationId,
      userId,
      actor.username + ' left this group',
      {
        participantIds: remainingIds,
        unreadCounts,
      }
    );
    await messageCacheService.clear(conversationId, userId).catch(() => undefined);
  }
  async deleteGroupConversation(conversationId: string, actorId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const createdBy = String((conversation as any)?.createdBy || '');
    const adminIds = Array.isArray(conversation.groupAdmins) ? conversation.groupAdmins : [];
    const canDelete = createdBy ? createdBy === actorId : adminIds.includes(actorId);
    if (!canDelete) {
      throw new Error('Only the group owner can delete this group.');
    }

    const participantIds = Array.isArray(conversation.participantIds) ? [...conversation.participantIds] : [];
    await deleteDoc(doc(db, 'conversations', conversationId));
    this.invalidateConversationCache(conversationId);

    for (const participantId of participantIds) {
      await messageCacheService.clear(conversationId, participantId).catch(() => undefined);
    }
  }
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const cached = this.getCachedConversation(conversationId);
    if (cached) return cached;

    const conversationRef = doc(db, "conversations", conversationId);
    const conversationSnap = await getDoc(conversationRef);
    if (!conversationSnap.exists()) return null;

    const conversation = { conversationId: conversationSnap.id, ...conversationSnap.data() } as Conversation;
    this.cacheConversation(conversationId, conversation);
    return conversation;
  }

  async isConversationRestricted(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return false;
    const restrictedBy = conversation.restrictedBy || [];
    return restrictedBy.includes(userId);
  }

  async shouldShowActiveStatus(conversationId: string, userId: string): Promise<boolean> {
    const isRestricted = await this.isConversationRestricted(conversationId, userId);
    return !isRestricted;
  }

  async unrestrictConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      restrictedBy: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  }

  async restrictConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      restrictedBy: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
  }

  
  async archiveConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      archivedBy: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
  }

  
  async unarchiveConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      archivedBy: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  }

  
  async pinConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      pinnedBy: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
  }

  async unpinConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      pinnedBy: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  }

  async muteConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    const snap = await getDoc(conversationRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const mutedBy = data.mutedBy;
    if (Array.isArray(mutedBy)) {
      await updateDoc(conversationRef, {
        mutedBy: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(conversationRef, {
        [`mutedBy.${userId}`]: { mutedAt: serverTimestamp(), isMuted: true },
        updatedAt: serverTimestamp(),
      });
    }
  }

  async unmuteConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    const snap = await getDoc(conversationRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const mutedBy = data.mutedBy;
    if (Array.isArray(mutedBy)) {
      await updateDoc(conversationRef, {
        mutedBy: arrayRemove(userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      const nextMutedBy = { ...(mutedBy || {}) };
      delete nextMutedBy[userId];
      await updateDoc(conversationRef, {
        mutedBy: nextMutedBy,
        updatedAt: serverTimestamp(),
      });
    }
  }

  private async _legacyMuteConversation(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    const conversationSnap = await getDoc(conversationRef);
    if (!conversationSnap.exists()) {
      throw new Error("Conversation not found");
    }
    const data = conversationSnap.data();
    const mutedBy = data.mutedBy || {};
    mutedBy[userId] = { mutedAt: serverTimestamp(), isMuted: true };
    await updateDoc(conversationRef, { mutedBy });
  }

  
  async markConversationAsUnread(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      [`unreadCounts.${userId}`]: 1,
      updatedAt: serverTimestamp(),
    });
  }

  async getUserConversations(
    userId: string,
    limitCount = 50,
    lastDoc?: DocumentSnapshot
  ): Promise<Conversation[]> {
    const conversationsRef = collection(db, "conversations");
    let q = query(
      conversationsRef,
      where("participantIds", "array-contains", userId),
      orderBy("lastMessageAt", "desc"),
      limit(limitCount)
    );
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as Conversation);
  }

  async getConversationMessages(
    conversationId: string,
    limitCount = 50,
    lastDoc?: DocumentSnapshot
  ): Promise<Message[]> {
    const messagesRef = collection(db, "conversations", conversationId, "messages");
    let q = query(messagesRef, orderBy("createdAt", "desc"), limit(limitCount));
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }
    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map((docSnap) => docSnap.data() as Message);
    return messages.reverse();
  }

  subscribeToConversationMessages(
    conversationId: string,
    callback: (messages: Message[]) => void,
    limitCount = 20
  ): () => void {
    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(limitCount));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const messages = snapshot.docs.map((docSnap: any) => docSnap.data() as Message);
      callback(messages.reverse());
    });
    return unsubscribe;
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<Conversation>
  ): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  async shareContent(
    fromUserId: string,
    toUserId: string,
    contentType: "post" | "glimpse",
    contentId: string,
    sharedContent: any,
    message?: string
  ): Promise<string> {
    const conversationId = await this.getOrCreateDirectConversation(fromUserId, toUserId);
    const messageData: CreateMessageData = {
      senderId: fromUserId,
      senderUsername: sharedContent.username || "User",
      text: message || "",
      type: contentType === "post" ? "shared_post" : "shared_glimpse",
      sharedContent: {
        contentId,
        type: contentType,
        ...sharedContent,
      },
    };
    return await this.sendMessage(conversationId, messageData);
  }

  async shareStory(
    conversationId: string,
    fromUserId: string,
    storyId: string,
    storyAuthor: string,
    storyCover: string,
    authorVerified: boolean = false
  ): Promise<string> {
    const messageData: CreateMessageData = {
      senderId: fromUserId,
      senderUsername: storyAuthor,
      text: "",
      type: "shared_story",
      sharedContent: {
        contentId: storyId,
        type: "story",
        username: storyAuthor,
        coverImage: storyCover,
        verified: authorVerified,
      },
    };
    return await this.sendMessage(conversationId, messageData);
  }

  async forwardMessage(
    fromConversationId: string,
    messageId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<string> {
    const sourceMessageRef = doc(db, "conversations", fromConversationId, "messages", messageId);
    const sourceMessageSnap = await getDoc(sourceMessageRef);
    if (!sourceMessageSnap.exists()) {
      throw new Error("Message not found");
    }

    const sourceMessage = sourceMessageSnap.data() as Message;
    const targetConversationId = await this.getOrCreateDirectConversation(fromUserId, toUserId);

    let senderUsername = sourceMessage.senderUsername || "User";
    let senderAvatarURL = sourceMessage.senderAvatarURL || "";

    try {
      const { userService } = await import("./user.service");
      const forwardingUser = await userService.getUser(fromUserId);
      if (forwardingUser) {
        senderUsername = forwardingUser.username;
        senderAvatarURL = forwardingUser.avatarURL || "";
      }
    } catch {
      // Ignore lookup failures and keep fallback values.
    }

    const forwardedMessage: CreateMessageData = {
      senderId: fromUserId,
      senderUsername,
      senderAvatarURL,
      text: sourceMessage.text || "",
      type: sourceMessage.type || (sourceMessage.mediaURL ? "media" : "text"),
      mediaURL: sourceMessage.mediaURL,
      mediaType: sourceMessage.mediaType,
      thumbnailURL: sourceMessage.thumbnailURL,
      poll: sourceMessage.poll,
      location: sourceMessage.location,
      storyReply: sourceMessage.storyReply,
      sharedContent: sourceMessage.sharedContent,
      glimpseId: sourceMessage.glimpseId,
      isForwarded: true,
      forwardedFrom: {
        conversationId: fromConversationId,
        messageId: sourceMessage.messageId,
        senderId: sourceMessage.senderId,
        senderUsername: sourceMessage.senderUsername,
      },
    };

    return await this.sendMessage(targetConversationId, forwardedMessage);
  }

  async sendDirectActivityMessage(
    conversationId: string,
    actorId: string,
    text: string
  ): Promise<void> {
    const conversation = await this.getConversationForSend(conversationId);
    if (!conversation || conversation.type !== 'direct') {
      throw new Error('Direct conversation not found.');
    }

    const actor = await this.getActorSnapshot(actorId);
    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds.filter(Boolean)
      : [];
    const baseUnreadCounts = { ...(conversation.unreadCounts || {}) } as Record<string, number>;
    const nextUnreadCounts = { ...baseUnreadCounts };

    participantIds.forEach((participantId) => {
      nextUnreadCounts[participantId] = participantId === actorId ? 0 : (nextUnreadCounts[participantId] || 0) + 1;
    });

    const clientTimestamp = Date.now();
    const messageRef = doc(collection(db, `conversations/${conversationId}/messages`));
    const messageId = messageRef.id;
    const conversationRef = doc(db, 'conversations', conversationId);
    const readBy = participantIds.includes(actorId) ? [actorId] : [];
    const messageDoc: Message = {
      messageId,
      conversationId,
      senderId: actorId,
      senderUsername: actor.username,
      senderAvatarURL: actor.avatarURL || '',
      type: 'system',
      text,
      status: 'sent',
      readBy,
      isEdited: false,
      isDeleted: false,
      deletedFor: [],
      pinnedBy: [],
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      clientCreatedAtMs: clientTimestamp,
    } as Message;

    const batch = writeBatch(db);
    batch.set(messageRef, messageDoc as any);
    batch.update(conversationRef, {
      lastMessage: {
        text,
        senderId: actorId,
        senderUsername: actor.username,
        type: 'system',
        timestamp: serverTimestamp(),
        clientTimestamp,
      },
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: clientTimestamp,
      unreadCounts: nextUnreadCounts,
      updatedAt: serverTimestamp(),
      deletedBy: participantIds.length > 0 ? arrayRemove(...participantIds) : [],
    });
    await batch.commit();
    this.invalidateConversationCache(conversationId);

    if (participantIds.includes(actorId)) {
      const localMessageRecord = {
        ...messageDoc,
        createdAt: new Date(clientTimestamp),
        updatedAt: new Date(clientTimestamp),
      } as unknown as Message;
      await messageCacheService.upsertMessages(conversationId, actorId, [localMessageRecord], {
        limit: 220,
        ttlMs: 12 * 60 * 60 * 1000,
      }).catch(() => undefined);
    }
  }
  private async getActorSnapshot(userId: string): Promise<{ username: string; avatarURL: string }> {
    try {
      const { userService } = await import('./user.service');
      const profile = await userService.getUser(userId);
      return {
        username: profile?.username || profile?.displayName || 'user',
        avatarURL: profile?.avatarURL || '',
      };
    } catch {
      return { username: 'user', avatarURL: '' };
    }
  }
  private formatGroupUserList(labels: string[]): string {
    const clean = Array.from(new Set(labels.map((label) => String(label || '').trim()).filter(Boolean)));
    if (clean.length === 0) return 'members';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return clean[0] + ' and ' + clean[1];
    return clean.slice(0, 2).join(', ') + ' and ' + (clean.length - 2) + ' others';
  }
  private extractMentionTokens(text?: string): string[] {
    if (typeof text !== 'string' || text.trim().length === 0) return [];
    const matches = text.match(/@(?:everyone|admin|owner|[a-zA-Z0-9._]+)/gi) || [];
    return Array.from(new Set(matches.map((entry) => entry.slice(1).toLowerCase()).filter(Boolean)));
  }
  private async sendGroupActivityMessage(
    conversationId: string,
    actorId: string,
    text: string,
    options?: {
      participantIds?: string[];
      unreadCounts?: Record<string, number>;
      removedMembers?: Record<string, { removedBy: string; removedAtMs: number }>;
    }
  ): Promise<void> {
    const conversation = await this.getConversationForSend(conversationId);
    if (!conversation || conversation.type !== 'group') {
      throw new Error('Group conversation not found.');
    }

    const actor = await this.getActorSnapshot(actorId);
    const participantIds = Array.isArray(options?.participantIds)
      ? options.participantIds.filter(Boolean)
      : Array.isArray(conversation.participantIds)
      ? conversation.participantIds.filter(Boolean)
      : [];
    const removedMembers = options?.removedMembers || ((conversation as any)?.removedMembers || {});
    const activeParticipantIds = participantIds.filter((id) => !!id && !removedMembers[id]);
    const baseUnreadCounts = { ...(options?.unreadCounts || conversation.unreadCounts || {}) } as Record<string, number>;
    const nextUnreadCounts = { ...baseUnreadCounts };

    activeParticipantIds.forEach((participantId) => {
      nextUnreadCounts[participantId] = participantId === actorId ? 0 : (nextUnreadCounts[participantId] || 0) + 1;
    });

    const clientTimestamp = Date.now();
    const messageRef = doc(collection(db, `conversations/${conversationId}/messages`));
    const messageId = messageRef.id;
    const conversationRef = doc(db, 'conversations', conversationId);
    const readBy = activeParticipantIds.includes(actorId) ? [actorId] : [];
    const messageDoc: Message = {
      messageId,
      conversationId,
      senderId: actorId,
      senderUsername: actor.username,
      senderAvatarURL: actor.avatarURL || '',
      type: 'group_activity',
      text,
      status: 'sent',
      readBy,
      isEdited: false,
      isDeleted: false,
      deletedFor: [],
      pinnedBy: [],
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      clientCreatedAtMs: clientTimestamp,
    } as Message;

    const batch = writeBatch(db);
    batch.set(messageRef, messageDoc as any);

    const conversationPatch: any = {
      lastMessage: {
        text,
        senderId: actorId,
        senderUsername: actor.username,
        type: 'group_activity',
        timestamp: serverTimestamp(),
        clientTimestamp,
      },
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: clientTimestamp,
      unreadCounts: nextUnreadCounts,
      updatedAt: serverTimestamp(),
    };

    if (activeParticipantIds.length > 0) {
      conversationPatch.deletedBy = arrayRemove(...activeParticipantIds);
    }

    batch.update(conversationRef, conversationPatch);
    await batch.commit();
    this.invalidateConversationCache(conversationId);

    if (activeParticipantIds.includes(actorId)) {
      const localMessageRecord = {
        ...messageDoc,
        createdAt: new Date(clientTimestamp),
        updatedAt: new Date(clientTimestamp),
      } as unknown as Message;
      await messageCacheService.upsertMessages(conversationId, actorId, [localMessageRecord], {
        limit: 220,
        ttlMs: 12 * 60 * 60 * 1000,
      }).catch(() => undefined);
    }
  }
  private async notifyMentionsForGroupMessage(
    conversation: Conversation,
    conversationId: string,
    safeMessageData: CreateMessageData,
    messagePreview: string
  ): Promise<void> {
    const tokens = this.extractMentionTokens(safeMessageData.text);
    if (tokens.length === 0) return;
    const senderId = String(safeMessageData.senderId || '');
    const participantIds = Array.isArray(conversation.participantIds) ? conversation.participantIds.filter(Boolean) : [];
    if (!senderId || participantIds.length === 0) return;
    const targetIds = new Set<string>();
    if (tokens.includes('everyone')) {
      participantIds.forEach((id) => {
        if (id !== senderId) targetIds.add(id);
      });
    }
    if (tokens.includes('admin')) {
      (conversation.groupAdmins || []).forEach((id) => {
        if (id && id !== senderId) targetIds.add(id);
      });
    }
    if (tokens.includes('owner')) {
      const ownerId = String((conversation as any)?.createdBy || '');
      if (ownerId && ownerId !== senderId) targetIds.add(ownerId);
    }
    const usernameTokens = tokens.filter((token) => !['everyone', 'admin', 'owner'].includes(token));
    if (usernameTokens.length > 0) {
      try {
        const { userService } = await import('./user.service');
        const participantProfiles = await Promise.all(
          participantIds.map(async (participantId) => {
            try {
              return await userService.getUser(participantId);
            } catch {
              return null;
            }
          })
        );
        participantProfiles.forEach((profile) => {
          const username = String(profile?.username || '').toLowerCase();
          if (!profile?.userId || !username || profile.userId === senderId) return;
          if (usernameTokens.includes(username)) {
            targetIds.add(profile.userId);
          }
        });
      } catch (error) {
        console.error('[Messages] Failed to resolve mention targets', error);
      }
    }
    const finalTargets = Array.from(targetIds).filter((id) => id !== senderId);
    if (finalTargets.length === 0) return;
    try {
      const { notificationService } = await import('./notification.service');
      await Promise.all(
        finalTargets.map((recipientId) =>
          notificationService.notifyMention(
            recipientId,
            senderId,
            safeMessageData.senderUsername,
            safeMessageData.senderAvatarURL || '',
            'message',
            conversationId,
            messagePreview
          )
        )
      );
    } catch (error) {
      console.error('[Messages] Failed to create mention notifications', error);
    }
  }
  async sendMessage(
    conversationId: string,
    messageData: CreateMessageData,
    clientMessageId?: string
  ): Promise<string> {
    const batch = writeBatch(db);
    const messageRef = clientMessageId
      ? doc(collection(db, `conversations/${conversationId}/messages`), clientMessageId)
      : doc(collection(db, `conversations/${conversationId}/messages`));
    const messageId = messageRef.id;

    const safeMessageData = Object.fromEntries(
      Object.entries(messageData).filter(([, value]) => value !== undefined)
    ) as CreateMessageData;
    const safeText = typeof safeMessageData.text === 'string' ? safeMessageData.text : String(safeMessageData.text ?? '');
    safeMessageData.text = safeText;

    const conversationRef = doc(db, "conversations", conversationId);
    const conversation = await this.getConversationForSend(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found. Please create a conversation first.");
    }
    const isFirstMessage = !conversation.lastMessage || conversation.lastMessage === null;
    let updatedRestrictedBy = (conversation.restrictedBy || []).filter(Boolean);
    const removedMembers = { ...((conversation as any)?.removedMembers || {}) } as Record<string, { removedBy: string; removedAtMs: number }>;
    const activeParticipantIds = (conversation.participantIds || []).filter((pid) => !!pid && !removedMembers[pid]);
    const senderId = String(messageData.senderId || '');

    if (conversation.type === "direct") {
      const recipientId = conversation.participantIds.find((id) => id !== messageData.senderId);
      if (recipientId) {
        const access = await this.getDirectMessageAccessCached(messageData.senderId, recipientId);
        if (!access.allowed) {
          throw new Error(access.reason === 'blocked' ? 'Messaging unavailable for this account.' : 'This user only accepts messages from followers.');
        }
        if ((isFirstMessage || access.requiresRequest) && access.requiresRequest) {
          if (!updatedRestrictedBy.includes(recipientId)) {
            updatedRestrictedBy = [...updatedRestrictedBy, recipientId];
          }
          if (updatedRestrictedBy.includes(senderId)) {
            updatedRestrictedBy = updatedRestrictedBy.filter((id) => id !== senderId);
          }
        } else {
          updatedRestrictedBy = [];
        }
      }
    } else if (conversation.type === "group") {
      const senderId = String(messageData.senderId || '');
      if (!conversation.participantIds?.includes(senderId) || removedMembers[senderId]) {
        throw new Error('You are no longer a member of this group.');
      }

      const groupMemberMutes = { ...((conversation as any)?.groupMemberMutes || {}) } as Record<string, { mutedUntilMs?: number }>;
      const senderMute = groupMemberMutes[senderId];
      if (Number(senderMute?.mutedUntilMs || 0) > Date.now()) {
        throw new Error('You are temporarily muted in this group.');
      }
    }

    const e2eePrepared = await chatE2EE.prepareOutgoingMessage(conversationId, conversation, safeMessageData);
    const persistedMessageData = e2eePrepared.messageData;
    const persistedText = typeof persistedMessageData.text === 'string' ? persistedMessageData.text : '';

    const messageDoc: any = {
      messageId,
      conversationId,
      ...persistedMessageData,
      status: "sent",
      readBy: [persistedMessageData.senderId],
      isForwarded: Boolean((persistedMessageData as any).isForwarded),
      isEdited: false,
      isDeleted: false,
      deletedFor: [],
      pinnedBy: [],
      clientCreatedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if ((persistedMessageData as any).forwardedFrom) {
      messageDoc.forwardedFrom = (persistedMessageData as any).forwardedFrom;
    }
    if ((persistedMessageData as any).replyTo) {
      messageDoc.replyTo = (persistedMessageData as any).replyTo;
    }

    batch.set(messageRef, messageDoc as Message);

    const unreadCounts = { ...(conversation.unreadCounts || {}) };

    const clientTimestamp = Date.now();
    activeParticipantIds.forEach((pid) => {
      unreadCounts[pid] = pid === messageData.senderId ? 0 : (unreadCounts[pid] || 0) + 1;
    });

    const previewText = e2eePrepared.enabled ? 'Encrypted message' : persistedText || '';
    const lastMessage: any = {
      text: previewText,
      senderId: persistedMessageData.senderId,
      timestamp: serverTimestamp(),
      clientTimestamp,
    };
    if ((persistedMessageData as any).mediaType) {
      lastMessage.mediaType = (persistedMessageData as any).mediaType;
    }
    if ((persistedMessageData as any).type) {
      lastMessage.type = (persistedMessageData as any).type;
    }

    const conversationPatch: any = {
      lastMessage: lastMessage,
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: clientTimestamp,
      unreadCounts,
      restrictedBy: updatedRestrictedBy,
      updatedAt: serverTimestamp(),
      // Clear the sender's deletion timestamp so their message cutoff resets.
      // Without this, applyDeletionCutoff filters out all messages sent after
      // the previous "delete for me" action, making them invisible to the sender.
      [`deletionTimestamps.${persistedMessageData.senderId}`]: deleteField(),
    };

    if (e2eePrepared.conversationE2EE) {
      conversationPatch.e2ee = e2eePrepared.conversationE2EE;
    }

    if (activeParticipantIds.length > 0) {
      conversationPatch.deletedBy = arrayRemove(...activeParticipantIds);
    }

    batch.update(conversationRef, conversationPatch);

    await batch.commit();

    const cachedNextConversation = {
      ...conversation,
      unreadCounts,
      restrictedBy: updatedRestrictedBy,
      removedMembers,
      deletedBy: [],
      e2ee: e2eePrepared.conversationE2EE || (conversation as any).e2ee,
      lastMessage: {
        text: previewText,
        senderId: persistedMessageData.senderId,
        senderUsername: persistedMessageData.senderUsername || (conversation.lastMessage as any)?.senderUsername || "",
        type: (persistedMessageData as any).type || undefined,
        mediaType: (persistedMessageData as any).mediaType || undefined,
        timestamp: (conversation.lastMessage as any)?.timestamp || (new Date() as any),
      },
      lastMessageAtMs: clientTimestamp,
    } as Conversation;
    this.cacheConversation(conversationId, cachedNextConversation);
    chatE2EE.invalidateConversation(conversationId);

    const localMessageRecord = {
      ...messageDoc,
      messageId,
      text: safeText,
      replyToText: safeMessageData.replyToText,
      replyTo: (safeMessageData as any).replyTo,
      forwardedFrom: safeMessageData.forwardedFrom,
      e2eeState: e2eePrepared.enabled ? 'decrypted' : (messageDoc.e2eeState || undefined),
      status: 'sent',
      createdAt: new Date(clientTimestamp),
      updatedAt: new Date(clientTimestamp),
      clientCreatedAtMs: clientTimestamp,
    } as Message;
    await messageCacheService.upsertMessages(conversationId, persistedMessageData.senderId, [localMessageRecord], {
      limit: 220,
      ttlMs: 12 * 60 * 60 * 1000,
    }).catch(() => undefined);

    const messagePreview =
      e2eePrepared.previewText ||
      safeText.trim() ||
      ((persistedMessageData as any).type === "shared_post"
        ? "Shared a post"
        : (persistedMessageData as any).type === "shared_glimpse"
        ? "Shared a glimpse"
        : (persistedMessageData as any).type === "shared_story"
        ? "Shared a story"
        : (persistedMessageData as any).type === "story_reply"
        ? "Replied to your story"
        : (persistedMessageData as any).type === "glimpse_collab_request"
        ? "Sent a glimpse collaboration request"
        : (persistedMessageData as any).mediaType === "video"
        ? "Sent a video"
        : (persistedMessageData as any).mediaType === "audio"
        ? "Sent a voice message"
        : (persistedMessageData as any).mediaType === "image"
        ? "Sent a photo"
        : (persistedMessageData as any).type === "location"
        ? "Shared a location"
        : (persistedMessageData as any).type === "poll"
        ? "Sent a poll"
        : "Sent you a message");

    const recipientIds = activeParticipantIds.filter((pid) => pid !== messageData.senderId);
    if (conversation.type === 'group') {
      void this.notifyMentionsForGroupMessage({ ...conversation, participantIds: activeParticipantIds } as Conversation, conversationId, safeMessageData, messagePreview);
    }
    if (recipientIds.length > 0) {
      void import("./notification.service")
        .then(({ notificationService }) =>
          Promise.all(
            recipientIds.map((recipientId) =>
              notificationService.notifyDM(
                recipientId,
                messageData.senderId,
                messageData.senderUsername,
                messageData.senderAvatarURL || "",
                conversationId,
                messagePreview
              )
            )
          )
        )
        .catch((error) => {
          console.error("[Messages] Failed to create DM notification", error);
        });
    }

    return messageId;
  }

  async markMessagesDelivered(
    conversationId: string,
    userId: string,
    messages: Message[]
  ): Promise<void> {
    const uniqueMessages = Array.from(
      new Map(
        messages
          .filter((msg) => msg?.messageId && msg.senderId !== userId)
          .map((msg) => [msg.messageId, msg])
      ).values()
    );

    if (uniqueMessages.length === 0) return;

    const batch = writeBatch(db);
    uniqueMessages.forEach((msg) => {
      const msgRef = doc(db, `conversations/${conversationId}/messages`, msg.messageId);
      batch.update(msgRef, {
        deliveredAt: serverTimestamp(),
      });
    });
      await batch.commit();
      this.invalidateConversationCache(conversationId);
  }

  async markMessagesRead(conversationId: string, userId: string, messageIds?: string[]): Promise<void> {
    const explicitIds = Array.isArray(messageIds)
      ? Array.from(new Set(messageIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      : [];

    if (explicitIds.length > 0) {
      const batch = writeBatch(db);
      explicitIds.forEach((messageId) => {
        const msgRef = doc(db, `conversations/${conversationId}/messages`, messageId);
        batch.update(msgRef, {
          readBy: arrayUnion(userId),
          deliveredAt: serverTimestamp(),
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
      this.invalidateConversationCache(conversationId);
      return;
    }

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const recentQuery = query(messagesRef, orderBy("createdAt", "desc"), limit(25));
    const snapshot = await getDocs(recentQuery);

    const unreadIncoming = snapshot.docs.filter((docSnap) => {
      const data = docSnap.data() as Message;
      if (data.senderId === userId) return false;
      return !Array.isArray(data.readBy) || !data.readBy.includes(userId);
    });

    if (unreadIncoming.length === 0) {
      return;
    }

    const batch = writeBatch(db);
    unreadIncoming.forEach((docSnap) => {
      const data = docSnap.data() as Message;
      batch.update(docSnap.ref, {
        readBy: arrayUnion(userId),
        deliveredAt: data.deliveredAt || serverTimestamp(),
        readAt: serverTimestamp(),
      });
    });

    await batch.commit();
    this.invalidateConversationCache(conversationId);
  }

  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      [`unreadCounts.${userId}`]: 0,
    });
    this.invalidateConversationCache(conversationId);
  }

  async markMessagesAsDeleted(
    conversationId: string,
    userId: string,
    messageIds: string[]
  ): Promise<void> {
    const batch = writeBatch(db);
    messageIds.forEach((mid) => {
      const msgRef = doc(db, `conversations/${conversationId}/messages`, mid);
      batch.update(msgRef, {
        deletedFor: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    this.invalidateConversationCache(conversationId);
  }

  async pinMessage(conversationId: string, userId: string, messageId: string): Promise<void> {
    const convRef = doc(db, "conversations", conversationId);
    await updateDoc(convRef, {
      [`pinnedMessageIdsBy.${userId}`]: increment(0),
    });
    const pinRef = doc(db, `conversations/${conversationId}/pinned`, messageId);
    await setDoc(pinRef, { messageId, pinnedBy: userId, createdAt: serverTimestamp() });
  }

  async voteInPoll(
    conversationId: string,
    messageId: string,
    optionId: string,
    userId: string
  ): Promise<void> {
    const msgRef = doc(db, `conversations/${conversationId}/messages`, messageId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists()) return;

      const data: any = snap.data();
      const poll = data.poll;
      if (!poll || !Array.isArray(poll.options)) return;

      const options = [...poll.options];
      const idx = options.findIndex((opt: any) => opt.id === optionId);
      if (idx < 0) return;

      const target = options[idx];
      const voterIds = Array.isArray(target.voterIds) ? target.voterIds : [];
      if (voterIds.includes(userId)) return;

      options[idx] = {
        ...target,
        votes: (target.votes || 0) + 1,
        voterIds: [...voterIds, userId],
      };

      tx.update(msgRef, {
        poll: {
          ...poll,
          options,
          totalVotes: (poll.totalVotes || 0) + 1,
        },
        updatedAt: serverTimestamp(),
      });
    });
  }

  async unsendMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    const messageRef = doc(db, `conversations/${conversationId}/messages`, messageId);
    const messageSnap = await getDoc(messageRef);
    if (!messageSnap.exists()) return;

    const messageData = messageSnap.data() as any;
    if (messageData?.senderId !== userId) {
      throw new Error('Only the sender can delete this message for everyone.');
    }

    await updateDoc(messageRef, {
      text: 'This message was unsent',
      type: 'text',
      mediaURL: deleteField(),
      mediaType: deleteField(),
      mediaUrl: deleteField(),
      url: deleteField(),
      imageUrl: deleteField(),
      gif: deleteField(),
      sticker: deleteField(),
      sharedContent: deleteField(),
      sharedPostId: deleteField(),
      sharedGlimpseId: deleteField(),
      sharedStoryId: deleteField(),
      poll: deleteField(),
      location: deleteField(),
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const convRef = doc(db, "conversations", conversationId);
    await updateDoc(convRef, {
      deletedBy: arrayUnion(userId),
      [`deletionTimestamps.${userId}`]: serverTimestamp(),
      [`unreadCounts.${userId}`]: 0,
      updatedAt: serverTimestamp(),
    });
    this.invalidateConversationCache(conversationId);
    await messageCacheService.clear(conversationId, userId).catch(() => undefined);
  }
}

export const messageService = new MessageService();



























































































