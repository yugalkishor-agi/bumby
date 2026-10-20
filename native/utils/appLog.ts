/**
 * In-memory app log capture.
 *
 * Patches console.* and the React Native global error handler so every log
 * line the app produces is kept in a ring buffer that the Logs screen
 * (screens/LogsScreen.tsx) can display and copy. Call `installAppLogCapture()`
 * once at startup (index.js) before anything else logs.
 */

export type AppLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface AppLogEntry {
  id: number;
  /** Epoch milliseconds when the line was recorded. */
  timestamp: number;
  level: AppLogLevel;
  message: string;
  /** Present for unhandled JS errors / fatal errors. */
  stack?: string;
}

const MAX_ENTRIES = 500;
const MAX_MESSAGE_LENGTH = 4000;

let entries: AppLogEntry[] = [];
let nextId = 1;
let installed = false;
const listeners = new Set<(entries: AppLogEntry[]) => void>();

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (value instanceof Error) {
    return value.stack ? `${value.message}\n${value.stack}` : value.message;
  }

  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val as object)) return '[Circular]';
        seen.add(val as object);
      }
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'function') return '[Function]';
      return val;
    });
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => safeStringify(arg))
    .join(' ')
    .slice(0, MAX_MESSAGE_LENGTH);
}

function record(level: AppLogLevel, message: string, stack?: string): void {
  const entry: AppLogEntry = {
    id: nextId++,
    timestamp: Date.now(),
    level,
    message,
    stack,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  listeners.forEach((listener) => {
    try {
      listener(entries);
    } catch {
      // A broken listener must never break logging itself.
    }
  });
}

/**
 * Installs console.* and global-error capture. Safe to call multiple times.
 */
export function installAppLogCapture(): void {
  if (installed) return;
  installed = true;

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const wrap =
    (level: AppLogLevel) =>
    (...args: unknown[]): void => {
      record(level, formatArgs(args));
      (original[level] || original.log).apply(console, args as []);
    };

  console.log = wrap('log');
  console.info = wrap('info');
  console.warn = wrap('warn');
  console.error = wrap('error');
  console.debug = wrap('debug');

  // Uncaught JS errors (including render crashes) - record, then delegate to
  // the default handler so RedBox / crash behaviour is unchanged.
  const ErrorUtils = (global as any)?.ErrorUtils;
  if (ErrorUtils?.getGlobalHandler && ErrorUtils?.setGlobalHandler) {
    const previousHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      try {
        record(
          'error',
          `${isFatal ? 'FATAL' : 'Unhandled'} error: ${error?.message ?? String(error)}`,
          typeof error?.stack === 'string' ? error.stack : undefined
        );
      } catch {
        // Never let logging recursion mask the original crash.
      }
      previousHandler?.(error, isFatal);
    });
  }
}

/** Returns a snapshot of the buffered logs (oldest first). */
export function getAppLogs(): AppLogEntry[] {
  return entries;
}

/** Subscribes to log updates; returns an unsubscribe function. */
export function subscribeAppLogs(listener: (entries: AppLogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearAppLogs(): void {
  entries = [];
  listeners.forEach((listener) => {
    try {
      listener(entries);
    } catch {}
  });
}

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

/** Renders the logs as plain text, ready for the clipboard or a share sheet. */
export function formatAppLogsForExport(list: AppLogEntry[] = getAppLogs()): string {
  if (list.length === 0) return 'No logs captured yet.';

  const header = `Iris app logs - ${list.length} entries - exported ${formatTimestamp(Date.now())}\n`;
  const body = list
    .map((entry) => {
      const level = entry.level.toUpperCase().padEnd(5, ' ');
      const stack = entry.stack ? `\n${entry.stack}` : '';
      return `[${formatTimestamp(entry.timestamp)}] ${level} ${entry.message}${stack}`;
    })
    .join('\n');

  return `${header}${body}`;
}
