import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '../styles/theme';
import {
  AppLogEntry,
  clearAppLogs,
  formatAppLogsForExport,
  getAppLogs,
  subscribeAppLogs,
} from '../utils/appLog';

const LEVEL_COLORS: Record<AppLogEntry['level'], string> = {
  log: '#8AB4F8',
  info: '#8AB4F8',
  debug: '#9AA0A6',
  warn: '#F5A623',
  error: '#FF5C5C',
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export default function LogsScreen() {
  const navigation = useNavigation();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [logs, setLogs] = useState<AppLogEntry[]>(() => getAppLogs());
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAppLogs(setLogs);
    return () => {
      unsubscribe();
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // One-click copy of every captured log line.
  const handleCopyAll = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(formatAppLogsForExport(getAppLogs()));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy logs:', error);
      Alert.alert('Copy failed', 'Could not copy logs to the clipboard.');
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: formatAppLogsForExport(getAppLogs()) });
    } catch (error) {
      console.error('Failed to share logs:', error);
    }
  }, []);

  const handleClear = useCallback(() => {
    Alert.alert('Clear logs', 'Remove all captured log entries?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearAppLogs },
    ]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: AppLogEntry }) => (
      <View style={styles.logRow}>
        <Text style={styles.logTime}>{formatTime(item.timestamp)}</Text>
        <View style={styles.logBody}>
          <Text style={[styles.logLevel, { color: LEVEL_COLORS[item.level] }]}>
            {item.level.toUpperCase()}
          </Text>
          <Text style={styles.logMessage} selectable>
            {item.message}
            {item.stack ? `\n${item.stack}` : ''}
          </Text>
        </View>
      </View>
    ),
    [styles]
  );

  const keyExtractor = useCallback((item: AppLogEntry) => String(item.id), []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={24} color={c.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Logs</Text>
          <Text style={styles.headerSubtitle}>Temp · {logs.length} entries</Text>
        </View>
        <TouchableOpacity onPress={handleClear} style={styles.headerButton} activeOpacity={0.75}>
          <Ionicons name="trash-outline" size={20} color={c.text.secondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopyAll} activeOpacity={0.8}>
          <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={18} color="#FFFFFF" />
          <Text style={styles.copyButtonText}>{copied ? 'Copied!' : 'Copy all'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={18} color={c.text.primary} />
          <Text style={styles.actionButtonText}>Share</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={40}
        windowSize={11}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No logs captured yet.</Text>
            <Text style={styles.emptySubtext}>
              Every console line and unhandled error the app produces will appear here.
            </Text>
          </View>
        }
      />

      <Text style={styles.footerNote}>
        Kept in memory only (last 500 lines) · cleared on app restart
      </Text>
    </View>
  );
}

function createStyles(c: any) {
  const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace' }) as string;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.light,
      backgroundColor: c.background.tertiary,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      color: c.text.primary,
      fontSize: 17,
      fontWeight: '600',
    },
    headerSubtitle: {
      color: c.text.muted,
      fontSize: 12,
      marginTop: 1,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    copyButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.accent.primary,
      borderRadius: 10,
      paddingVertical: 11,
    },
    copyButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: c.background.tertiary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
      borderRadius: 10,
      paddingVertical: 11,
      paddingHorizontal: 16,
    },
    actionButtonText: {
      color: c.text.primary,
      fontSize: 14,
      fontWeight: '500',
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    logRow: {
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.light,
    },
    logTime: {
      color: c.text.muted,
      fontSize: 11,
      fontFamily: monoFont,
      marginBottom: 2,
    },
    logBody: {
      flexDirection: 'row',
      gap: 8,
    },
    logLevel: {
      fontSize: 11,
      fontFamily: monoFont,
      fontWeight: '700',
      width: 46,
    },
    logMessage: {
      flex: 1,
      color: c.text.secondary,
      fontSize: 12,
      fontFamily: monoFont,
      lineHeight: 17,
    },
    emptyWrap: {
      paddingTop: 60,
      alignItems: 'center',
      paddingHorizontal: 30,
    },
    emptyText: {
      color: c.text.primary,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 6,
    },
    emptySubtext: {
      color: c.text.muted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },
    footerNote: {
      color: c.text.muted,
      fontSize: 11,
      textAlign: 'center',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border.light,
      backgroundColor: c.background.tertiary,
    },
  });
}
