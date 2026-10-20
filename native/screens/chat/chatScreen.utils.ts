import type { DisplayMessage } from './chatScreen.types';
import type { TimestampLike } from '../../types/chat';

export const MESSAGE_TIME_GAP_SEPARATOR_MS = 20 * 60 * 1000;

export const normalizeChatText = (value: string): string =>
  value
    .replace(/\u2028|\u2029/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');

export const stabilizeChatTextForRender = (value: string): string => {
  const normalized = normalizeChatText(value);
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const lineBreakCount = Math.max(0, lines.length - 1);
  const shortLineCount = lines.filter((line) => line.trim().length <= 1).length;
  const suspiciousLineBreaks =
    lineBreakCount > 10 ||
    (lineBreakCount > 0 && lineBreakCount >= Math.floor(normalized.length * 0.35)) ||
    (lines.length >= 12 && shortLineCount / lines.length > 0.62);

  if (!suspiciousLineBreaks) return normalized;
  return normalized.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export const toTimestampMs = (timestamp: TimestampLike): number => {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return Number.isFinite(timestamp) ? timestamp : 0;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (timestamp instanceof Date) {
    const ms = timestamp.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof timestamp?.toMillis === 'function') {
    const ms = timestamp.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }

  const legacyTimestamp = timestamp as { _seconds?: number; _nanoseconds?: number };
  const seconds =
    typeof timestamp?.seconds === 'number'
      ? timestamp.seconds
      : typeof legacyTimestamp._seconds === 'number'
      ? legacyTimestamp._seconds
      : null;
  const nanoseconds =
    typeof timestamp?.nanoseconds === 'number'
      ? timestamp.nanoseconds
      : typeof legacyTimestamp._nanoseconds === 'number'
      ? legacyTimestamp._nanoseconds
      : 0;
  const date =
    typeof timestamp?.toDate === 'function'
      ? timestamp.toDate()
      : seconds !== null
      ? new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000))
      : new Date(timestamp as string | number | Date);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const toDate = (timestamp: TimestampLike): Date | null => {
  const ms = toTimestampMs(timestamp);
  return ms ? new Date(ms) : null;
};

export const formatMessageTime = (timestamp: TimestampLike): string => {
  const date = toDate(timestamp);
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export const getDayKey = (timestamp: TimestampLike): string => {
  const date = toDate(timestamp);
  if (!date) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export const formatDayLabel = (timestamp: TimestampLike): string => {
  const date = toDate(timestamp);
  if (!date) return '';

  const now = new Date();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((todayStart - dayStart) / 86400000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatDayTimeLabel = (timestamp: TimestampLike): string => {
  const dayLabel = formatDayLabel(timestamp);
  const timeLabel = formatMessageTime(timestamp);
  if (dayLabel && timeLabel) return `${dayLabel} ${timeLabel}`;
  return dayLabel || timeLabel || '';
};

export const formatSeenAge = (timestamp: TimestampLike, seenClockMs: number): string => {
  const seenMs = toTimestampMs(timestamp);
  if (!seenMs) return 'Seen';
  const diffMs = Math.max(0, seenClockMs - seenMs);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Seen';
  if (diffMinutes < 60) return `Seen ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Seen ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Seen ${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `Seen ${diffWeeks}w ago`;
};

export const formatPresenceTime = (timestamp: TimestampLike): string => {
  const date = toDate(timestamp);
  if (!date) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (!Number.isFinite(diffMinutes) || diffMinutes < 0) return '';
  if (diffMinutes < 1) return 'Last seen just now';
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Last seen ${diffDays}d ago`;
};

export const buildDisplayMessageSignature = (
  message: DisplayMessage,
  overrideText: string | undefined,
  pinnedMessage: boolean,
  isDeletedMessage: boolean
): string => {
  const textSource = overrideText ?? (isDeletedMessage ? 'This message was unsent' : message?.text);
  const safeText = typeof textSource === 'string' ? textSource : String(textSource ?? '');
  const boundedText = safeText.length > 1500 ? `${safeText.slice(0, 1500)}...` : safeText;
  const readBySig = Array.isArray(message?.readBy) ? message.readBy.filter(Boolean).join('|') : '';
  const reactionsSig =
    message?.reactions && typeof message.reactions === 'object' && !Array.isArray(message.reactions)
      ? Object.entries(message.reactions)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([uid, emoji]) => `${uid}:${emoji}`)
          .join('|')
      : '';
  const updatedAtMs = toTimestampMs(message?.updatedAt);
  const editedAtMs = toTimestampMs((message as DisplayMessage & { editedAt?: TimestampLike })?.editedAt);
  const createdAtMs = toTimestampMs(message?.createdAt);

  return [
    String(message?.messageId || ''),
    String(message?.status || ''),
    message?.isDeleted === true ? '1' : '0',
    String(message?.type || ''),
    String(message?.mediaType || ''),
    String(message?.mediaURL || ''),
    boundedText.length.toString(),
    boundedText.slice(0, 64),
    boundedText.slice(-24),
    readBySig,
    reactionsSig,
    String(message?.replyTo?.messageId || ''),
    String(message?.replyTo?.text || ''),
    String(updatedAtMs || 0),
    String(editedAtMs || 0),
    String(createdAtMs || 0),
    pinnedMessage ? '1' : '0',
  ].join('::');
};


