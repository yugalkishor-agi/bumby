import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  getDoc,
  getDocs,
  limit,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { messageCacheService } from '../services/messageCache.service';
import { db } from "../config/firebase";
import { messageService } from "../services/message.service";
import { chatE2EE } from '../services/chatE2EE.service';
import type { Conversation, Message } from "../types/database";
import { useAuth } from "../contexts/AuthContext";

const inMemoryMessageCache = new Map<string, Message[]>();
const buildMemoryCacheKey = (conversationId: string, userId: string) =>
  `${conversationId}:${userId}`;
const MEMORY_SEED_LIMIT = 160;
const MEMORY_STORE_LIMIT = 260;

export const clearConversationMessageCache = async (conversationId: string, userId: string): Promise<void> => {
  if (!conversationId || !userId) return;
  inMemoryMessageCache.delete(buildMemoryCacheKey(conversationId, userId));
  await messageCacheService.clear(conversationId, userId).catch(() => undefined);
};

// Helpers
const toMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
  }
  if (ts instanceof Date) return ts.getTime();
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMessageSortMs = (message: Message | any): number => {
  return toMillis(message?.createdAt) || Number(message?.clientCreatedAtMs || message?.clientTimestamp || 0);
};
const mergeMessages = (base: Message[], incoming: Message[]) => {
  const map = new Map<string, Message>();
  [...base, ...incoming].forEach((msg) => {
    if (!msg?.messageId) return;
    const existing = map.get(msg.messageId);
    map.set(msg.messageId, existing ? { ...existing, ...msg } : msg);
  });
  const merged = Array.from(map.values());
  merged.sort((a, b) => getMessageSortMs(a) - getMessageSortMs(b));
  return merged;
};

const readBySignature = (value: any): string =>
  Array.isArray(value) ? value.filter(Boolean).join('|') : '';

const messageVersionKey = (message: Message | any): string => {
  const id = String(message?.messageId || '');
  const status = String(message?.status || '');
  const text = String(message?.text || '');
  const mediaURL = String(message?.mediaURL || '');
  const mediaType = String(message?.mediaType || '');
  const isDeleted = message?.isDeleted === true ? '1' : '0';
  const updatedAt = toMillis(message?.updatedAt) || 0;
  const editedAt = toMillis(message?.editedAt) || 0;
  const sortMs = getMessageSortMs(message);
  const readBy = readBySignature(message?.readBy);
  // Include whether createdAt is a server Firestore Timestamp vs a local Date
  // so optimistic→confirmed transitions are never treated as equivalent.
  const createdAtType = message?.createdAt?.nanoseconds != null ? 'ts' : 'local';
  return `${id}:${status}:${isDeleted}:${text.length}:${mediaURL}:${mediaType}:${updatedAt}:${editedAt}:${sortMs}:${readBy}:${createdAtType}`;
};

const areMessageListsEquivalent = (prev: Message[], next: Message[]): boolean => {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i] as any;
    const b = next[i] as any;
    if (a === b) continue;
    if (!a || !b) return false;
    if (a.messageId !== b.messageId) return false;
    if (messageVersionKey(a) !== messageVersionKey(b)) return false;
  }

  return true;
};

export const useConversations = () => {
  const { user } = useAuth();
  const currentUserId = user?.userId ?? null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canSendReadReceipts, setCanSendReadReceipts] = useState(true);
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting'>('connected');

  useEffect(() => {
    if (!currentUserId) return;

    setLoading(true);

    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("participantIds", "array-contains", currentUserId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const convos = snapshot.docs.map((docItem) => ({
            conversationId: docItem.id,
            ...docItem.data(),
          })) as Conversation[];

          const isDeletedForUser = (deletedBy: any, uid: string) =>
            Array.isArray(deletedBy) ? deletedBy.includes(uid) : Boolean((deletedBy as any)?.[uid]);
          const activeConvos = convos.filter((c) => !isDeletedForUser(c.deletedBy, currentUserId));

          activeConvos.sort((a, b) => {
            const aTime = a.lastMessageAt?.seconds || a.createdAt?.seconds || 0;
            const bTime = b.lastMessageAt?.seconds || b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

          setConversations([...activeConvos]);
          setLoading(false);
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  return { conversations, loading, error };
};

export const useMessages = (
  conversationId: string | null | undefined,
  options?: { initialLimit?: number; pageSize?: number }
) => {
  const { user } = useAuth();
  const currentUserId = user?.userId ?? null;
  const memorySeedRaw =
    conversationId && currentUserId
      ? inMemoryMessageCache.get(buildMemoryCacheKey(conversationId, currentUserId)) || []
      : [];
  const serviceSeedRaw =
    conversationId && currentUserId
      ? messageCacheService.peek<Message>(conversationId, currentUserId)
      : [];
  const memorySeed = mergeMessages(memorySeedRaw, serviceSeedRaw).slice(-MEMORY_SEED_LIMIT);
  const [messages, setMessages] = useState<Message[]>(memorySeed);
  const [loading, setLoading] = useState(memorySeed.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canSendReadReceipts, setCanSendReadReceipts] = useState(true);
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting'>('connected');

  const cursorRef = useRef<DocumentSnapshot | null>(null);
  const deletionCutoffRef = useRef<number | null>(null);
  const initialLimit = Math.max(1, options?.initialLimit ?? 30);
  const pageSize = Math.max(1, options?.pageSize ?? 20);
  const hydrateWindowSize = Math.max(initialLimit, pageSize, 24);

  const pendingKeyRef = useRef<string | null>(null);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cachePersistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cachePersistSignatureRef = useRef('');
  const deliveredInFlightRef = useRef<Set<string>>(new Set());
  const markReadInFlightRef = useRef(false);
  const lastReadSignatureRef = useRef('');
  const suppressedReadReceiptIdsRef = useRef<Set<string>>(new Set());
  const suppressedReadReceiptKeyRef = useRef<string | null>(null);
  const restrictedConversationRef = useRef(false);
  const liveHydratedRef = useRef(false);
  const hasServerSyncRef = useRef(false);
  const hydrateSequenceRef = useRef(0);
  const e2eeSignatureRef = useRef('');

  useEffect(() => {
    if (!currentUserId) {
      setCanSendReadReceipts(true);
      return;
    }

    const privacyRef = doc(db, `users/${currentUserId}/privacySettings/main`);
    const unsubscribe = onSnapshot(
      privacyRef,
      (privacySnap) => {
        const privacyData = privacySnap.exists() ? (privacySnap.data() as { showReadReceipts?: boolean }) : null;
        setCanSendReadReceipts(privacyData?.showReadReceipts !== false);
      },
      () => {
        setCanSendReadReceipts(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUserId]);
  const persistSuppressedReadReceipts = useCallback(async () => {
    if (!suppressedReadReceiptKeyRef.current) return;
    try {
      const ids = Array.from(suppressedReadReceiptIdsRef.current);
      await AsyncStorage.setItem(suppressedReadReceiptKeyRef.current, JSON.stringify(ids));
    } catch {}
  }, []);
  const applyDeletionCutoff = useCallback((input: Message[]): Message[] => {
    if (!deletionCutoffRef.current) return input;
    const cutoff = deletionCutoffRef.current;
    return input.filter((msg) => {
      if (!msg?.createdAt) return true;
      return toMillis(msg.createdAt) > cutoff;
    });
  }, []);

  const applyUserVisibility = useCallback(
    (input: Message[]): Message[] => {
      if (!currentUserId) return input;
      const now = Date.now();
      return applyDeletionCutoff(input).filter((msg) => {
        const deletedFor = (msg as Message & { deletedFor?: string[] }).deletedFor;
        if (Array.isArray(deletedFor) && deletedFor.includes(currentUserId)) return false;
        const expiresAt = (msg as Message & { expiresAt?: any }).expiresAt;
        if (expiresAt) {
          const expMs = toMillis(expiresAt);
          if (expMs > 0 && expMs <= now) return false;
        }
        return true;
      });
    },
    [applyDeletionCutoff, currentUserId]
  );

  const hydrateMessagesIfNeeded = useCallback(async (input: Message[]): Promise<Message[]> => {
    if (!conversationId || !currentUserId || !Array.isArray(input) || input.length === 0) return input;
    return chatE2EE.hydrateMessages(conversationId, currentUserId, input);
  }, [conversationId, currentUserId]);

  const markDeliveredIfNeeded = useCallback((input: Message[]) => {
    if (!conversationId || !currentUserId) return;

    const deliverCandidates = input.filter(
      (msg) =>
        msg.senderId !== currentUserId &&
        !(msg as any).deliveredAt &&
        !!msg.messageId &&
        !deliveredInFlightRef.current.has(msg.messageId)
    );

    if (deliverCandidates.length === 0) return;

    const ids = deliverCandidates.map((msg) => msg.messageId).filter(Boolean);
    ids.forEach((id) => deliveredInFlightRef.current.add(id));

    messageService
      .markMessagesDelivered(conversationId, currentUserId, deliverCandidates)
      .catch((err) => console.error('Failed to mark delivered:', err))
      .finally(() => {
        ids.forEach((id) => deliveredInFlightRef.current.delete(id));
      });
  }, [conversationId, currentUserId]);

  useEffect(() => {
    if (!conversationId || !currentUserId) {
      setMessages([]);
      setLoading(false);
      setConnectionState('connected');
      return;
    }

    const memoryKey = buildMemoryCacheKey(conversationId, currentUserId);
    pendingKeyRef.current = `queue:messages:${conversationId}:${currentUserId}`;
    suppressedReadReceiptKeyRef.current = `read-suppressed:${conversationId}:${currentUserId}`;
    suppressedReadReceiptIdsRef.current = new Set();
    restrictedConversationRef.current = false;
    deliveredInFlightRef.current.clear();
    lastReadSignatureRef.current = '';
    cachePersistSignatureRef.current = '';
    if (cachePersistTimerRef.current) {
      clearTimeout(cachePersistTimerRef.current);
      cachePersistTimerRef.current = null;
    }
    cursorRef.current = null;
    setHasMore(true);
    setError(null);
    liveHydratedRef.current = false;
    hasServerSyncRef.current = false;
    e2eeSignatureRef.current = '';
    setConnectionState('connected');
    void chatE2EE.ensureOwnDeviceBundle(currentUserId).catch(() => undefined);
    const seeded = (inMemoryMessageCache.get(memoryKey) || []).slice(-hydrateWindowSize);
    if (seeded.length > 0) {
      setMessages(seeded);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    (async () => {
      try {
        if (!suppressedReadReceiptKeyRef.current) return;
        const raw = await AsyncStorage.getItem(suppressedReadReceiptKeyRef.current);
        const ids = raw ? (JSON.parse(raw) as string[]) : [];
        suppressedReadReceiptIdsRef.current = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
      } catch {
        suppressedReadReceiptIdsRef.current = new Set();
      }
    })();
    // Instant cache load + warm refresh
    let cancelled = false;
    (async () => {
      try {
        const cachedResult = await messageCacheService.getWithMeta<Message>(conversationId, currentUserId);
        if (cachedResult.items.length > 0) {
          const cachedVisible = applyUserVisibility(cachedResult.items).slice(-hydrateWindowSize);
          const cached = await hydrateMessagesIfNeeded(cachedVisible);
          if (cached.length > 0 && !cancelled) {
            inMemoryMessageCache.set(memoryKey, cached);
            setMessages((prev) => {
              const next = prev.length > 0 ? mergeMessages(prev, cached) : cached;
              if (areMessageListsEquivalent(prev, next)) return prev;
              inMemoryMessageCache.set(memoryKey, next.slice(-MEMORY_STORE_LIMIT));
              return next;
            });
            setLoading(false);
          }
        }

        if (cachedResult.stale || cachedResult.items.length === 0) {
          const seededRemote = await messageService.getConversationMessages(conversationId, initialLimit);
          if (!cancelled && seededRemote.length > 0) {
            const filteredRemote = await hydrateMessagesIfNeeded(applyUserVisibility(seededRemote).slice(-hydrateWindowSize));
            setMessages((prev) => {
              const next = prev.length > 0 ? mergeMessages(prev, filteredRemote) : filteredRemote;
              if (areMessageListsEquivalent(prev, next)) return prev;
              inMemoryMessageCache.set(memoryKey, next.slice(-MEMORY_STORE_LIMIT));
              return next;
            });
            setLoading(false);
          }
        }

        messageCacheService.compactUserCache(currentUserId).catch(() => undefined);
      } catch {}
    })();

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    // Use a generous limit so newly sent messages (whose serverTimestamp hasn't
    // resolved yet) are never pushed outside the window. The initialLimit is for
    // the initial load; the live listener needs extra headroom.
    const liveLimit = Math.max(initialLimit + 40, 80);
    const latestQuery = query(messagesRef, orderBy("createdAt", "desc"), limit(liveLimit));

    const messagesUnsubscribe = onSnapshot(
      latestQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata?.fromCache) {
          if (hasServerSyncRef.current) {
            setConnectionState('connecting');
          }
        } else {
          hasServerSyncRef.current = true;
          setConnectionState('connected');
        }
        const docs = snapshot.docs;
        const latest = docs.map((docItem) => {
          const data = docItem.data({ serverTimestamps: 'estimate' }) as Message;
          return {
            ...data,
            messageId: data.messageId || docItem.id,
            __docId: docItem.id,
          } as Message;
        });
        const filtered = applyUserVisibility(latest).reverse();
        markDeliveredIfNeeded(latest);

        if (!cursorRef.current && docs.length > 0) {
          cursorRef.current = docs[docs.length - 1];
        }

        const hydrationRun = ++hydrateSequenceRef.current;
        void (async () => {
          const hydrated = await hydrateMessagesIfNeeded(filtered);
          if (hydrationRun !== hydrateSequenceRef.current) return;

          const firstLiveHydration = !liveHydratedRef.current;
          setMessages((prev) => {
            const pendingLocal = firstLiveHydration
              ? prev.filter((msg: any) => ['pending', 'pending_offline', 'failed'].includes(String(msg?.status || '')))
              : prev;
            const merged = firstLiveHydration ? mergeMessages(hydrated, pendingLocal) : mergeMessages(prev, hydrated);
            // Always return a new array reference on live updates so FlashList
            // re-renders. The equivalence check was preventing render when an
            // optimistic message transitioned to server-confirmed (same key).
            if (firstLiveHydration && areMessageListsEquivalent(prev, merged)) return prev;
            inMemoryMessageCache.set(memoryKey, merged.slice(-MEMORY_STORE_LIMIT));
            return merged;
          });
          liveHydratedRef.current = true;
          setHasMore(docs.length === initialLimit);
          setLoading(false);
        })().catch(() => {
          setHasMore(docs.length === initialLimit);
          setLoading(false);
        });
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    const conversationRef = doc(db, "conversations", conversationId);
    const convUnsubscribe = onSnapshot(
      conversationRef,
      (convDoc) => {
        if (!convDoc.exists()) {
          setMessages([]);
          setLoading(false);
          deletionCutoffRef.current = null;
          return;
        }

        const convData = convDoc.data() as any;
        const e2eeMeta = convData?.e2ee;
        const e2eeWrapped = e2eeMeta?.wrappedKeys && typeof e2eeMeta.wrappedKeys === 'object'
          ? Object.keys(e2eeMeta.wrappedKeys)
              .sort()
              .map((uid) => uid + ':' + String((e2eeMeta.wrappedKeys as any)?.[uid] || '').slice(0, 12))
              .join('|')
          : '';
        const nextE2EESignature = e2eeMeta?.enabled
          ? String(Number(e2eeMeta?.keyVersion || 1)) + ':' + e2eeWrapped
          : '';
        if (nextE2EESignature !== e2eeSignatureRef.current) {
          e2eeSignatureRef.current = nextE2EESignature;
          chatE2EE.invalidateConversation(conversationId);
        }

        const restrictedBy = Array.isArray(convData?.restrictedBy) ? convData.restrictedBy : [];
        restrictedConversationRef.current = restrictedBy.includes(currentUserId);
        const deletionTimestamps = convData?.deletionTimestamps || {};
        const userDeletionTime = deletionTimestamps[currentUserId];
        const nextCutoff = userDeletionTime ? toMillis(userDeletionTime) : null;
        const prevCutoff = deletionCutoffRef.current;
        deletionCutoffRef.current = nextCutoff;

        if (prevCutoff !== nextCutoff) {
          setMessages((prev) => {
            const filtered = applyUserVisibility(prev);
            if (areMessageListsEquivalent(prev, filtered)) return prev;
            inMemoryMessageCache.set(memoryKey, filtered.slice(-MEMORY_STORE_LIMIT));
            return filtered;
          });
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      if (cachePersistTimerRef.current) {
        clearTimeout(cachePersistTimerRef.current);
        cachePersistTimerRef.current = null;
      }
      messagesUnsubscribe();
      convUnsubscribe();
    };
  }, [conversationId, currentUserId, initialLimit, pageSize, hydrateWindowSize, applyUserVisibility, hydrateMessagesIfNeeded]);

  useEffect(() => {
    if (!conversationId || !currentUserId || messages.length === 0) return;
    inMemoryMessageCache.set(
      buildMemoryCacheKey(conversationId, currentUserId),
      messages.slice(-MEMORY_STORE_LIMIT)
    );
  }, [conversationId, currentUserId, messages]);

  useEffect(() => {
    if (!conversationId || !currentUserId || messages.length === 0) return;
    const last = messages[messages.length - 1] as any;
    const signature = `${messages.length}:${String(last?.messageId || '')}:${String(last?.status || '')}:${getMessageSortMs(last)}`;
    if (signature === cachePersistSignatureRef.current) return;

    if (cachePersistTimerRef.current) {
      clearTimeout(cachePersistTimerRef.current);
    }
    cachePersistTimerRef.current = setTimeout(() => {
      messageCacheService
        .set(conversationId, currentUserId, messages)
        .then(() => {
          cachePersistSignatureRef.current = signature;
        })
        .catch(() => undefined);
    }, 450);
  }, [conversationId, currentUserId, messages]);

  

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !hasMore || loadingMore || !currentUserId) return;
    setLoadingMore(true);
    try {
      const messagesRef = collection(db, "conversations", conversationId, "messages");
      const olderQuery = cursorRef.current
        ? query(messagesRef, orderBy("createdAt", "desc"), startAfter(cursorRef.current), limit(pageSize))
        : query(messagesRef, orderBy("createdAt", "desc"), limit(pageSize));

      const snapshot = await getDocs(olderQuery);
      const docs = snapshot.docs;
      const olderBatch = docs.map((docItem) => {
        const data = docItem.data() as Message;
        return {
          ...data,
          messageId: data.messageId || docItem.id,
          __docId: docItem.id,
        } as Message;
      });
      const filtered = await hydrateMessagesIfNeeded(applyUserVisibility(olderBatch).reverse());

      if (docs.length > 0) {
        cursorRef.current = docs[docs.length - 1];
      }

      setMessages((prev) => {
        const next = mergeMessages(filtered, prev);
        if (areMessageListsEquivalent(prev, next)) return prev;
        inMemoryMessageCache.set(buildMemoryCacheKey(conversationId, currentUserId), next.slice(-MEMORY_STORE_LIMIT));
        return next;
      });
      void messageCacheService.mergeSet(conversationId, currentUserId, filtered).catch(() => undefined);
      setHasMore(docs.length === pageSize);
    } catch (err: any) {
      console.error('Failed to load older messages:', err);
      setError(err.message || 'Failed to load older messages');
    } finally {
      setLoadingMore(false);
    }
  }, [applyUserVisibility, conversationId, currentUserId, hasMore, hydrateMessagesIfNeeded, loadingMore, pageSize]);
  const setLocalMessageStatus = useCallback((messageId: string, status: 'sent' | 'failed' | 'pending_offline') => {
    if (!messageId) return;
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((message) => {
        if (message.messageId !== messageId) return message;
        if (String((message as any)?.status || '') === status) return message;
        changed = true;
        return { ...message, status } as Message;
      });
      return changed ? next : prev;
    });
  }, []);

  const dequeuePending = useCallback(
    async (tempId: string) => {
      if (!pendingKeyRef.current) return;
      try {
        const raw = await AsyncStorage.getItem(pendingKeyRef.current);
        if (!raw) return;
        const arr = JSON.parse(raw) as any[];
        const next = arr.filter((m) => m.tempId !== tempId);
        await AsyncStorage.setItem(pendingKeyRef.current, JSON.stringify(next));
      } catch {}
    },
    []
  );

  const flushPendingQueue = useCallback(async () => {
    if (!pendingKeyRef.current) return;
    try {
      const raw = await AsyncStorage.getItem(pendingKeyRef.current);
      if (!raw) return;
      const pending = (JSON.parse(raw) as any[]) || [];
      if (pending.length === 0) return;

      const stillPending: any[] = [];
      for (const item of pending) {
        try {
          await messageService.sendMessage(conversationId, item.payload, item.tempId);
          setConnectionState('connected');
          setLocalMessageStatus(item.tempId, 'sent');
          void messageCacheService.patchMessage<Message>(conversationId, currentUserId!, item.tempId, (message) => ({ ...message, status: 'sent' } as Message)).catch(() => undefined);
          await dequeuePending(item.tempId);
        } catch {
          stillPending.push(item);
        }
      }
      await AsyncStorage.setItem(pendingKeyRef.current, JSON.stringify(stillPending));
    } catch {}
  }, [conversationId, currentUserId, dequeuePending, setLocalMessageStatus]);

  useEffect(() => {
    if (!conversationId || !currentUserId) {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
      return;
    }

    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(() => {
      flushPendingQueue().catch(() => undefined);
    }, 12000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [flushPendingQueue]);

  const sendMessage = async (
    text: string,
    mediaFile?: any,
    replyTo?: { messageId: string; text?: string; senderId?: string; senderUsername?: string },
    extra?: Record<string, any>
  ) => {
    if (!user) throw new Error('Not authenticated');

    const clientCreatedAtMs = Date.now();
    const tempId = `temp-${clientCreatedAtMs}-${Math.random().toString(16).slice(2)}`;
    const mediaFiles = Array.isArray(mediaFile) ? mediaFile.filter(Boolean) : mediaFile ? [mediaFile] : [];
    const firstMediaFile = mediaFiles[0];
    const localMediaUri = typeof firstMediaFile?.uri === 'string' ? firstMediaFile.uri : '';
    const guessedFileType = String(firstMediaFile?.type || '').toLowerCase();
    const extraMediaType = String(extra?.mediaType || '').toLowerCase();
    const extraType = String(extra?.type || '').toLowerCase();
    const optimisticMediaType: 'image' | 'video' | 'audio' | undefined =
      extraMediaType === 'image' || extraMediaType === 'video' || extraMediaType === 'audio'
        ? (extraMediaType as 'image' | 'video' | 'audio')
        : guessedFileType.includes('video') || Number(firstMediaFile?.duration || 0) > 0
        ? 'video'
        : guessedFileType.includes('audio')
        ? 'audio'
        : localMediaUri
        ? 'image'
        : extraType === 'image' || extraType === 'video'
        ? (extraType as 'image' | 'video')
        : undefined;

    const optimisticMediaItems = mediaFiles.length > 1
      ? mediaFiles
          .map((file: any) => ({
            url: String(file?.uri || ''),
            type: String(file?.type || '').toLowerCase().includes('video') || Number(file?.duration || 0) > 0 ? 'video' : 'image',
            thumbnailURL: undefined,
          }))
          .filter((entry) => entry.url)
      : Array.isArray(extra?.mediaItems)
      ? extra.mediaItems
      : undefined;

    const optimisticBase: Message = {
      messageId: tempId,
      senderId: user.userId,
      senderUsername: user.username,
      senderAvatarURL: user.avatarURL || '',
      senderVerified: Boolean((user as any)?.verified),
      text,
      createdAt: new Date(clientCreatedAtMs),
      clientCreatedAtMs,
      status: 'pending',
      ...(localMediaUri
        ? {
            mediaURL: localMediaUri,
            mediaType: optimisticMediaType,
            type: optimisticMediaType === 'video' ? 'video' : optimisticMediaType === 'image' ? 'image' : 'media',
          }
        : {}),
      ...(optimisticMediaItems?.length
        ? {
            mediaItems: optimisticMediaItems,
            mediaURL: optimisticMediaItems[0]?.url,
            mediaType: optimisticMediaItems.some((entry: any) => entry.type === 'video') ? 'video' : 'image',
            type: 'media',
          }
        : {}),
    } as any;

    const optimistic = (extra ? { ...optimisticBase, ...extra } : optimisticBase) as Message;

    setMessages((prev) => {
      const existingIndex = prev.findIndex((message) => message.messageId === tempId);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex] as any;
        const existingSignature = messageVersionKey(existing);
        const optimisticSignature = messageVersionKey(optimistic as any);
        if (existingSignature === optimisticSignature) return prev;
        const next = [...prev];
        next[existingIndex] = { ...existing, ...(optimistic as any) } as Message;
        return next;
      }

      const optimisticSortMs = getMessageSortMs(optimistic as any);
      const last = prev[prev.length - 1] as any;
      const lastSortMs = getMessageSortMs(last);
      if (prev.length === 0 || optimisticSortMs >= lastSortMs) {
        return [...prev, optimistic];
      }

      const next = mergeMessages(prev, [optimistic]);
      if (areMessageListsEquivalent(prev, next)) return prev;
      return next;
    });
    void messageCacheService.upsertMessages(conversationId, user.userId, [optimistic]).catch(() => undefined);

    try {
      let mediaURL = '';
      let mediaType: 'image' | 'video' | 'audio' | undefined = optimisticMediaType;
      let uploadedMediaItems: Array<{ url: string; type: 'image' | 'video' | 'gif' | 'sticker'; thumbnailURL?: string }> = [];

      if (mediaFiles.length > 0) {
        const { mediaService } = await import('../services/media.service.native');
        if (mediaFiles.length > 1) {
          const failedUploads: any[] = [];
          for (const file of mediaFiles) {
            try {
              const uploadedUrl = await mediaService.uploadMessageMedia(user.userId, conversationId, file);
              const itemType: 'image' | 'video' = String(file?.type || '').toLowerCase().includes('video') || Number(file?.duration || 0) > 0 ? 'video' : 'image';
              uploadedMediaItems.push({
                url: uploadedUrl,
                type: itemType,
                thumbnailURL: itemType === 'video' ? uploadedUrl : undefined,
              });
            } catch (uploadErr) {
              failedUploads.push(uploadErr);
            }
          }

          if (failedUploads.length > 0) {
            console.warn('Message media upload partially failed', failedUploads.length, mediaFiles.length, failedUploads);
          }
          if (uploadedMediaItems.length === 0) {
            throw failedUploads[0] || new Error('Failed to upload selected media');
          }

          mediaURL = uploadedMediaItems[0]?.url || '';
          mediaType = uploadedMediaItems.some((entry) => entry.type === 'video') ? 'video' : 'image';
        } else {
          mediaURL = await mediaService.uploadMessageMedia(user.userId, conversationId, firstMediaFile);
          const guessedType = String(firstMediaFile?.type || '').toLowerCase();
          if (guessedType.includes('video') || Number(firstMediaFile?.duration || 0) > 0) mediaType = 'video';
          else if (guessedType.includes('audio')) mediaType = 'audio';
          else mediaType = 'image';
        }
      }

      const messageData: any = {
        senderId: user.userId,
        senderUsername: user.username,
        senderAvatarURL: user.avatarURL || '',
        senderVerified: Boolean((user as any)?.verified),
        text,
      };

      if (uploadedMediaItems.length) {
        messageData.type = 'media';
        messageData.mediaURL = uploadedMediaItems[0]?.url || '';
        messageData.mediaType = mediaType;
        messageData.mediaItems = uploadedMediaItems;
      } else if (mediaURL) {
        messageData.type = mediaType === 'video' ? 'video' : mediaType === 'image' ? 'image' : 'media';
        messageData.mediaURL = mediaURL;
        messageData.mediaType = mediaType;
      }

      if (replyTo) {
        messageData.replyToMessageId = replyTo.messageId;
        if (replyTo.text) messageData.replyToText = replyTo.text;
        messageData.replyTo = {
          messageId: replyTo.messageId,
          text: replyTo.text || '',
          senderId: replyTo.senderId || '',
          senderUsername: replyTo.senderUsername || '',
        };
      }

      if (extra) {
        Object.assign(messageData, extra);
      }

      if (uploadedMediaItems.length) {
        messageData.mediaItems = uploadedMediaItems;
        messageData.mediaURL = uploadedMediaItems[0]?.url || messageData.mediaURL;
      }

      await messageService.sendMessage(conversationId, messageData, tempId);
      setConnectionState('connected');
      setLocalMessageStatus(tempId, 'sent');
      void messageCacheService.patchMessage<Message>(conversationId, user.userId, tempId, (message) => ({ ...message, status: 'sent' } as Message)).catch(() => undefined);
      await dequeuePending(tempId);
    } catch (err: any) {
      const errCode = String(err?.code ?? '');
      const errMsg = String(err?.message ?? '');
      const lowerMsg = errMsg.toLowerCase();
      const isNetwork =
        errCode.includes('unavailable') ||
        errCode.includes('deadline-exceeded') ||
        errCode.includes('network') ||
        lowerMsg.includes('network') ||
        lowerMsg.includes('offline') ||
        lowerMsg.includes('timeout');

      if (!isNetwork || mediaFiles.length > 0) {
        setLocalMessageStatus(tempId, 'failed');
        void messageCacheService.patchMessage<Message>(conversationId, user.userId, tempId, (message) => ({ ...message, status: 'failed' } as Message)).catch(() => undefined);
        throw err;
      }

      if (pendingKeyRef.current) {
        const payload = {
          tempId,
          payload: {
            senderId: user.userId,
            senderUsername: user.username,
            senderAvatarURL: user.avatarURL || '',
            senderVerified: Boolean((user as any)?.verified),
            text,
            ...extra,
          },
        };
        try {
          const raw = await AsyncStorage.getItem(pendingKeyRef.current);
          const arr = raw ? (JSON.parse(raw) as any[]) : [];
          arr.push(payload);
          await AsyncStorage.setItem(pendingKeyRef.current, JSON.stringify(arr));
        } catch {}
      }
      setConnectionState('connecting');
      setLocalMessageStatus(tempId, 'pending_offline');
      void messageCacheService.patchMessage<Message>(conversationId, user.userId, tempId, (message) => ({ ...message, status: 'pending_offline' } as Message)).catch(() => undefined);
    }
  };

  const markAsRead = async () => {
    if (!user || !conversationId || markReadInFlightRef.current) return;

    const unreadIncoming = messages
      .filter((msg) => msg.senderId !== user.userId && (!msg.readBy || !msg.readBy.includes(user.userId)))
      .map((msg) => msg.messageId)
      .filter(Boolean)
      .sort();

    if (unreadIncoming.length === 0) return;

    const shouldEmitReadReceipts = canSendReadReceipts && !restrictedConversationRef.current;
    const actionableIds = shouldEmitReadReceipts
      ? unreadIncoming.filter((messageId) => !suppressedReadReceiptIdsRef.current.has(messageId))
      : unreadIncoming;

    const signature = `${shouldEmitReadReceipts ? 'on' : 'off'}:${actionableIds.join('|') || unreadIncoming.join('|')}`;
    if (signature === lastReadSignatureRef.current) return;

    markReadInFlightRef.current = true;
    try {
      if (shouldEmitReadReceipts) {
        if (actionableIds.length === 0) {
          lastReadSignatureRef.current = signature;
          return;
        }
        await Promise.all([
          messageService.markMessagesRead(conversationId, user.userId, actionableIds),
          messageService.markConversationAsRead(conversationId, user.userId),
        ]);
      } else {
        unreadIncoming.forEach((messageId) => suppressedReadReceiptIdsRef.current.add(messageId));
        await persistSuppressedReadReceipts();
        await messageService.markConversationAsRead(conversationId, user.userId);
      }
      lastReadSignatureRef.current = signature;
    } finally {
      markReadInFlightRef.current = false;
    }
  };

  const pendingMessageCount = messages.filter((msg: any) => ['pending', 'pending_offline'].includes(String(msg?.status || ''))).length;

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    sendMessage,
    markAsRead,
    loadOlderMessages,
    connectionState,
    pendingMessageCount,
  };
};

export const useCreateConversation = () => {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);

  const createDirectConversation = async (recipientId: string) => {
    if (!user) throw new Error('Not authenticated');

    setCreating(true);
    try {
      const conversationDocId = await messageService.getOrCreateDirectConversation(
        user.userId,
        recipientId
      );
      return conversationDocId;
    } catch (error) {
      throw error;
    } finally {
      setCreating(false);
    }
  };

  const createGroupConversation = async (
    participantIds: string[],
    groupName: string,
    groupAvatarFile?: any
  ) => {
    if (!user) throw new Error('Not authenticated');

    setCreating(true);
    try {
      let groupAvatarURL = '';
      if (groupAvatarFile) {
        const { mediaService } = await import('../services/media.service.native');
        groupAvatarURL = await mediaService.uploadAvatar(user.userId, groupAvatarFile);
      }

      const conversationDocId = await messageService.createGroupConversation(
        user.userId,
        participantIds,
        groupName,
        groupAvatarURL
      );
      return conversationDocId;
    } catch (error) {
      throw error;
    } finally {
      setCreating(false);
    }
  };

  return { createDirectConversation, createGroupConversation, creating };
};

































































