import { useMemo } from 'react';
import type { User } from '../../types/database';
import type { ChatMessage } from '../../types/chat';
import { toTimestampMs } from '../../screens/chat/chatScreen.utils';

type Params = {
  finalData: ChatMessage[];
  userId?: string;
  otherUserId?: string;
  isGroupConversation: boolean;
  requestMode: boolean;
  formatSeenAge: (timestamp: ChatMessage['readAt']) => string;
};

export function useChatSeenState({
  finalData,
  userId,
  otherUserId,
  isGroupConversation,
  requestMode,
  formatSeenAge,
}: Params) {
  const latestSeenReceipt = useMemo(() => {
    if (!userId || !otherUserId || requestMode) {
      return { messageId: null as string | null, label: '' };
    }

    for (let index = finalData.length - 1; index >= 0; index -= 1) {
      const msg = finalData[index];
      if (msg?.senderId !== userId) continue;
      if (!Array.isArray(msg.readBy) || !msg.readBy.includes(otherUserId)) continue;

      const readAtMs =
        toTimestampMs(msg.readAt) ||
        toTimestampMs(msg.updatedAt) ||
        toTimestampMs(msg.createdAt);
      const hiddenByReply = finalData.some((candidate) => {
        if (candidate?.senderId !== otherUserId) return false;
        return toTimestampMs(candidate.createdAt) > readAtMs;
      });

      if (hiddenByReply) {
        return { messageId: null as string | null, label: '' };
      }

      return {
        messageId: msg.messageId || null,
        label: formatSeenAge(msg.readAt),
      };
    }

    return { messageId: null as string | null, label: '' };
  }, [finalData, formatSeenAge, otherUserId, requestMode, userId]);

  const groupSeenReadersByMessageId = useMemo(() => {
    if (!isGroupConversation || !userId || requestMode || finalData.length === 0) {
      return {} as Record<string, string[]>;
    }

    const lastSeenMessageByUser: Record<string, string> = {};
    finalData.forEach((msg) => {
      if (!msg?.messageId || !Array.isArray(msg.readBy)) return;
      msg.readBy.forEach((uid: string) => {
        if (!uid || uid === userId || uid === msg.senderId) return;
        lastSeenMessageByUser[uid] = msg.messageId;
      });
    });

    const byMessage: Record<string, string[]> = {};
    Object.entries(lastSeenMessageByUser).forEach(([uid, messageId]) => {
      if (!messageId) return;
      if (!byMessage[messageId]) byMessage[messageId] = [];
      byMessage[messageId].push(uid);
    });

    Object.keys(byMessage).forEach((messageId) => {
      byMessage[messageId].sort((a, b) => a.localeCompare(b));
    });

    return byMessage;
  }, [finalData, isGroupConversation, requestMode, userId]);

  return { latestSeenReceipt, groupSeenReadersByMessageId };
}
