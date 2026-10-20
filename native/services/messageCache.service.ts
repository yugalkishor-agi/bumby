import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatE2EE } from './chatE2EE.service';
import type { Message } from '../types/database';

const CACHE_SCHEMA_VERSION = 4;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_STALE_MS = 2 * 60 * 1000;
const CACHE_LIMIT = 160;
const CACHE_BYTE_LIMIT = 512 * 1024;
const USER_CACHE_INDEX_LIMIT = 48;

/** What the cache holds: plain, serialisable message documents - not the UI view model. */
type AnyMessage = Message;

type LegacyMessageCacheEntry<T extends AnyMessage = AnyMessage> = {
  items: T[];
  savedAt: number;
};

type MessageCacheEnvelope<T extends AnyMessage = AnyMessage> = {
  version: number;
  savedAt: number;
  staleAt: number;
  expiresAt: number;
  conversationId: string;
  userId: string;
  itemCount: number;
  lastMessageId: string;
  lastMessageMs: number;
  items: T[];
};

type UserCacheIndexEntry = {
  conversationId: string;
  savedAt: number;
};

type CacheGetResult<T extends AnyMessage = AnyMessage> = {
  items: T[];
  savedAt: number;
  staleAt: number;
  expiresAt: number;
  stale: boolean;
};

type CacheSetOptions = {
  ttlMs?: number;
  staleMs?: number;
  limit?: number;
  byteLimit?: number;
};

const memoryCache = new Map<string, MessageCacheEnvelope>();

const cacheKey = (conversationId: string, userId: string) =>
  `msg_cache:${conversationId}:${userId}`;

const cacheIndexKey = (userId: string) => `msg_cache_index:${userId}`;

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMessageSortMs = (message: AnyMessage): number => {
  return (
    toMillis(message?.createdAt) ||
    Number(message?.clientCreatedAtMs || message?.clientTimestamp || 0)
  );
};

const resolveMessageId = (message: AnyMessage, index: number) => {
  if (typeof message?.messageId === 'string' && message.messageId.length > 0) {
    return message.messageId;
  }
  const senderId = String(message?.senderId || 'unknown');
  const fallbackTime = getMessageSortMs(message);
  return `${senderId}:${fallbackTime}:${index}`;
};

const dedupeAndSortMessages = <T extends AnyMessage = AnyMessage>(messages: T[]): T[] => {
  const deduped = new Map<string, T>();
  messages.forEach((message, index) => {
    const id = resolveMessageId(message, index);
    const existing = deduped.get(id);
    deduped.set(id, existing ? ({ ...existing, ...message } as T) : message);
  });
  const merged = Array.from(deduped.values());
  merged.sort((a: any, b: any) => getMessageSortMs(a) - getMessageSortMs(b));
  return merged;
};

const trimMessages = <T extends AnyMessage = AnyMessage>(messages: T[], limit: number, byteLimit: number): T[] => {
  let trimmed = messages.slice(-Math.max(1, limit));
  if (trimmed.length <= 1 || byteLimit <= 0) return trimmed;

  let serializedLength = JSON.stringify(trimmed).length;
  if (serializedLength <= byteLimit) return trimmed;

  let keepCount = trimmed.length;
  while (keepCount > 24 && serializedLength > byteLimit) {
    keepCount = Math.max(24, keepCount - 12);
    trimmed = trimmed.slice(-keepCount);
    serializedLength = JSON.stringify(trimmed).length;
  }

  return trimmed;
};

const buildEnvelope = <T extends AnyMessage = AnyMessage>(
  conversationId: string,
  userId: string,
  messages: T[],
  options?: CacheSetOptions,
): MessageCacheEnvelope<T> => {
  const limit = Math.max(1, options?.limit ?? CACHE_LIMIT);
  const byteLimit = Math.max(0, options?.byteLimit ?? CACHE_BYTE_LIMIT);
  const ttlMs = Math.max(60 * 1000, options?.ttlMs ?? CACHE_TTL_MS);
  const staleMs = Math.max(15 * 1000, Math.min(ttlMs, options?.staleMs ?? CACHE_STALE_MS));
  const savedAt = Date.now();
  const deduped = dedupeAndSortMessages(messages);
  const items = trimMessages(deduped, limit, byteLimit);
  const lastItem = items[items.length - 1] as AnyMessage;

  return {
    version: CACHE_SCHEMA_VERSION,
    savedAt,
    staleAt: savedAt + staleMs,
    expiresAt: savedAt + ttlMs,
    conversationId,
    userId,
    itemCount: items.length,
    lastMessageId: String(lastItem?.messageId || ''),
    lastMessageMs: getMessageSortMs(lastItem),
    items,
  };
};

const asEnvelope = <T extends AnyMessage = AnyMessage>(
  parsed: any,
  conversationId: string,
  userId: string,
): MessageCacheEnvelope<T> | null => {
  if (!parsed || typeof parsed !== 'object') return null;

  if (
    Array.isArray(parsed.items) &&
    typeof parsed.savedAt === 'number' &&
    typeof parsed.expiresAt === 'number'
  ) {
    const staleAt = typeof parsed.staleAt === 'number'
      ? parsed.staleAt
      : parsed.savedAt + Math.min(CACHE_STALE_MS, Math.max(15 * 1000, parsed.expiresAt - parsed.savedAt));

    return {
      version: Number(parsed.version || CACHE_SCHEMA_VERSION),
      savedAt: parsed.savedAt,
      staleAt,
      expiresAt: parsed.expiresAt,
      conversationId: parsed.conversationId || conversationId,
      userId: parsed.userId || userId,
      itemCount: Number(parsed.itemCount || parsed.items.length || 0),
      lastMessageId: String(parsed.lastMessageId || ''),
      lastMessageMs: Number(parsed.lastMessageMs || 0),
      items: parsed.items as T[],
    };
  }

  if (Array.isArray(parsed.items) && typeof parsed.savedAt === 'number') {
    const legacy = parsed as LegacyMessageCacheEntry<T>;
    const items = Array.isArray(legacy.items) ? legacy.items : [];
    const lastItem = items[items.length - 1] as AnyMessage;
    return {
      version: CACHE_SCHEMA_VERSION,
      savedAt: legacy.savedAt,
      staleAt: legacy.savedAt + CACHE_STALE_MS,
      expiresAt: legacy.savedAt + CACHE_TTL_MS,
      conversationId,
      userId,
      itemCount: items.length,
      lastMessageId: String(lastItem?.messageId || ''),
      lastMessageMs: getMessageSortMs(lastItem),
      items,
    };
  }

  return null;
};

const isExpired = (entry: MessageCacheEnvelope): boolean => Date.now() > entry.expiresAt;
const isStale = (entry: MessageCacheEnvelope): boolean => Date.now() > entry.staleAt;

const getMemoryEnvelope = <T extends AnyMessage = AnyMessage>(conversationId: string, userId: string): MessageCacheEnvelope<T> | null => {
  const key = cacheKey(conversationId, userId);
  const entry = memoryCache.get(key) as MessageCacheEnvelope<T> | undefined;
  if (!entry) return null;
  if (isExpired(entry)) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
};

const setMemoryEnvelope = <T extends AnyMessage = AnyMessage>(conversationId: string, userId: string, envelope: MessageCacheEnvelope<T>) => {
  memoryCache.set(cacheKey(conversationId, userId), envelope as MessageCacheEnvelope);
};

const loadUserIndex = async (userId: string): Promise<UserCacheIndexEntry[]> => {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(cacheIndexKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserCacheIndexEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.conversationId === 'string' &&
        entry.conversationId.length > 0 &&
        typeof entry.savedAt === 'number',
    );
  } catch {
    return [];
  }
};

const saveUserIndex = async (userId: string, entries: UserCacheIndexEntry[]): Promise<void> => {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(cacheIndexKey(userId), JSON.stringify(entries));
  } catch {}
};

const touchUserIndex = async (userId: string, conversationId: string, savedAt: number): Promise<void> => {
  if (!userId || !conversationId) return;
  const index = await loadUserIndex(userId);
  const next = [
    { conversationId, savedAt },
    ...index.filter((entry) => entry.conversationId !== conversationId),
  ];

  const overflow = next.slice(USER_CACHE_INDEX_LIMIT);
  const trimmed = next.slice(0, USER_CACHE_INDEX_LIMIT);

  if (overflow.length > 0) {
    await Promise.all(
      overflow.map((entry) => {
        memoryCache.delete(cacheKey(entry.conversationId, userId));
        return AsyncStorage.removeItem(cacheKey(entry.conversationId, userId));
      }),
    ).catch(() => undefined);
  }

  await saveUserIndex(userId, trimmed);
};

const removeFromUserIndex = async (userId: string, conversationId: string): Promise<void> => {
  if (!userId || !conversationId) return;
  const index = await loadUserIndex(userId);
  const next = index.filter((entry) => entry.conversationId !== conversationId);
  await saveUserIndex(userId, next);
};

const persistEnvelope = async <T extends AnyMessage = AnyMessage>(envelope: MessageCacheEnvelope<T>): Promise<void> => {
  const key = cacheKey(envelope.conversationId, envelope.userId);
  setMemoryEnvelope(envelope.conversationId, envelope.userId, envelope);
  try {
    const sealedEnvelope = await chatE2EE.sealLocalCacheString(JSON.stringify(envelope));
    await AsyncStorage.setItem(key, sealedEnvelope);
    await touchUserIndex(envelope.userId, envelope.conversationId, envelope.savedAt);
  } catch {}
};

export const messageCacheService = {
  peek<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string): T[] {
    const entry = getMemoryEnvelope<T>(conversationId, userId);
    return entry?.items || [];
  },

  peekWithMeta<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string): CacheGetResult<T> {
    const entry = getMemoryEnvelope<T>(conversationId, userId);
    if (!entry) {
      return { items: [], savedAt: 0, staleAt: 0, expiresAt: 0, stale: false };
    }
    return {
      items: entry.items,
      savedAt: entry.savedAt,
      staleAt: entry.staleAt,
      expiresAt: entry.expiresAt,
      stale: isStale(entry),
    };
  },

  async get<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string): Promise<T[]> {
    const result = await messageCacheService.getWithMeta<T>(conversationId, userId);
    return result.items;
  },

  async getWithMeta<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string): Promise<CacheGetResult<T>> {
    if (!conversationId || !userId) {
      return { items: [], savedAt: 0, staleAt: 0, expiresAt: 0, stale: false };
    }

    const memory = getMemoryEnvelope<T>(conversationId, userId);
    if (memory) {
      return {
        items: memory.items,
        savedAt: memory.savedAt,
        staleAt: memory.staleAt,
        expiresAt: memory.expiresAt,
        stale: isStale(memory),
      };
    }

    const key = cacheKey(conversationId, userId);
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return { items: [], savedAt: 0, staleAt: 0, expiresAt: 0, stale: false };
      const unsealedRaw = await chatE2EE.unsealLocalCacheString(raw);
      const parsed = JSON.parse(unsealedRaw);
      const envelope = asEnvelope<T>(parsed, conversationId, userId);
      if (!envelope || !Array.isArray(envelope.items)) {
        await AsyncStorage.removeItem(key);
        await removeFromUserIndex(userId, conversationId);
        return { items: [], savedAt: 0, staleAt: 0, expiresAt: 0, stale: false };
      }

      if (isExpired(envelope)) {
        memoryCache.delete(key);
        await AsyncStorage.removeItem(key);
        await removeFromUserIndex(userId, conversationId);
        return {
          items: [],
          savedAt: envelope.savedAt || 0,
          staleAt: envelope.staleAt || 0,
          expiresAt: envelope.expiresAt || 0,
          stale: true,
        };
      }

      setMemoryEnvelope(conversationId, userId, envelope);
      if (envelope.version !== CACHE_SCHEMA_VERSION) {
        await AsyncStorage.setItem(key, JSON.stringify(envelope)).catch(() => undefined);
      }

      return {
        items: envelope.items as T[],
        savedAt: envelope.savedAt,
        staleAt: envelope.staleAt,
        expiresAt: envelope.expiresAt,
        stale: isStale(envelope),
      };
    } catch {
      return { items: [], savedAt: 0, staleAt: 0, expiresAt: 0, stale: false };
    }
  },

  async set<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string, messages: T[], options?: CacheSetOptions): Promise<void> {
    if (!conversationId || !userId || !Array.isArray(messages)) return;
    if (messages.length === 0) {
      await this.clear(conversationId, userId);
      return;
    }
    const envelope = buildEnvelope(conversationId, userId, messages, options);
    await persistEnvelope(envelope);
  },

  async mergeSet<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string, messages: T[], options?: CacheSetOptions): Promise<T[]> {
    const current = await messageCacheService.get<T>(conversationId, userId);
    const merged = dedupeAndSortMessages<T>([...current, ...(messages || [])]);
    await this.set(conversationId, userId, merged, options);
    return merged;
  },

  async upsertMessages<T extends AnyMessage = AnyMessage>(conversationId: string, userId: string, messages: T[], options?: CacheSetOptions): Promise<T[]> {
    return this.mergeSet(conversationId, userId, messages, options);
  },

  async patchMessage<T extends AnyMessage = AnyMessage>(
    conversationId: string,
    userId: string,
    messageId: string,
    updater: (message: T) => T,
    options?: CacheSetOptions,
  ): Promise<T[]> {
    const current = await messageCacheService.get<T>(conversationId, userId);
    if (current.length === 0) return current;
    const next = current.map((message: any) =>
      String(message?.messageId || '') === messageId ? updater(message as T) : message,
    );
    await this.set(conversationId, userId, next, options);
    return next;
  },

  async removeMessage(conversationId: string, userId: string, messageId: string, options?: CacheSetOptions): Promise<void> {
    const current = await messageCacheService.get<AnyMessage>(conversationId, userId);
    const next = current.filter((message) => String(message?.messageId || '') !== messageId);
    if (next.length === 0) {
      await this.clear(conversationId, userId);
      return;
    }
    await this.set(conversationId, userId, next, options);
  },

  async compactUserCache(userId: string): Promise<void> {
    if (!userId) return;
    const index = await loadUserIndex(userId);
    if (index.length === 0) return;

    const nextIndex: UserCacheIndexEntry[] = [];
    for (const entry of index.slice(0, USER_CACHE_INDEX_LIMIT)) {
      try {
        const key = cacheKey(entry.conversationId, userId);
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const unsealedRaw = await chatE2EE.unsealLocalCacheString(raw);
      const parsed = JSON.parse(unsealedRaw);
        const envelope = asEnvelope(parsed, entry.conversationId, userId);
        if (!envelope || isExpired(envelope)) {
          memoryCache.delete(key);
          await AsyncStorage.removeItem(key);
          continue;
        }
        setMemoryEnvelope(entry.conversationId, userId, envelope);
        nextIndex.push({
          conversationId: entry.conversationId,
          savedAt: envelope.savedAt || entry.savedAt || Date.now(),
        });
      } catch {
        continue;
      }
    }

    await saveUserIndex(userId, nextIndex.slice(0, USER_CACHE_INDEX_LIMIT));
  },

  async clear(conversationId: string, userId: string): Promise<void> {
    if (!conversationId || !userId) return;
    const key = cacheKey(conversationId, userId);
    memoryCache.delete(key);
    try {
      await AsyncStorage.removeItem(key);
      await removeFromUserIndex(userId, conversationId);
    } catch {}
  },
};

