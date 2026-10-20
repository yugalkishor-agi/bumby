import { useEffect, useState } from 'react';
import { messageCacheService } from '../services/messageCache.service';
import type { Message } from '../types/database';

/**
 * Read-only view of the persisted chat cache. Writes happen at the source
 * (message.service on send, useMessages on fetch), not from the screen - so
 * there is deliberately no `persistCache` here.
 */
type UseChatCacheReturn = {
  cachedMessages: Message[];
};

export function useChatCache(
  conversationId: string | undefined,
  userId?: string
): UseChatCacheReturn {
  const [cachedMessages, setCachedMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Drop the previous conversation's snapshot the moment we switch away.
    setCachedMessages([]);
    if (!conversationId || !userId) return;
    let cancelled = false;
    messageCacheService
      .getWithMeta(conversationId, userId)
      .then((val) => {
        if (!cancelled && Array.isArray(val.items)) setCachedMessages(val.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId, userId]);

  return { cachedMessages };
}
