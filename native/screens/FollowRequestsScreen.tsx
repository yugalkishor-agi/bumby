import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { colors, spacing, typography } from '../styles/theme';
import { ScreenSkeleton, InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

export default function FollowRequestsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [user]);

  const loadRequests = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await userService.getFollowRequests(user.userId);
      setRequests(data || []);
    } catch (error) {
      console.error('Failed to load follow requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requesterId: string) => {
    if (!user || processing) return;
    try {
      setProcessing(requesterId);
      await userService.acceptFollowRequest(user.userId, requesterId);
      setRequests((prev) => prev.filter((r) => (r.userId || r.requestId) !== requesterId));
    } catch (error) {
      console.error('Failed to accept request:', error);
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (requesterId: string) => {
    if (!user || processing) return;
    try {
      setProcessing(requesterId);
      await userService.rejectFollowRequest(user.userId, requesterId);
      setRequests((prev) => prev.filter((r) => (r.userId || r.requestId) !== requesterId));
    } catch (error) {
      console.error('Failed to decline request:', error);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Follow Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ScreenSkeleton variant="people" rows={7} showHeader={false} />
      ) : (
        <FlashList estimatedItemSize={100}
          data={requests}
          renderItem={({ item }) => {
            const requesterId = item.userId || item.requestId;
            const isBusy = processing === requesterId;
            return (
              <View style={styles.request}>
                <TouchableOpacity
                  style={styles.userInfo}
                  onPress={() => (navigation as any).navigate('UserProfile', { userId: requesterId })}
                >
                  <Image source={{ uri: item.avatarURL || '' }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.displayName || item.username || 'User'}</Text>
                    <Text style={styles.username}>@{item.username || 'unknown'}</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(requesterId)} disabled={isBusy}>
                    {isBusy ? <ButtonLoadingSkeleton /> : <Text style={styles.acceptText}>Accept</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(requesterId)} disabled={isBusy}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          keyExtractor={(item) => item.userId || item.requestId}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={64} color={colors.text.secondary} />
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold as any, color: colors.text.primary },
  request: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  name: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold as any, marginBottom: 2, color: colors.text.primary },
  username: { fontSize: typography.fontSize.sm, color: colors.text.secondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.sm, marginLeft: 62 },
  acceptBtn: { backgroundColor: colors.accent.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, minWidth: 78, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  declineBtn: { backgroundColor: colors.background.primary, borderWidth: 1, borderColor: colors.border.subtle, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  declineText: { color: colors.text.primary, fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 60 },
  emptyText: { fontSize: typography.fontSize.base, color: colors.text.secondary, marginTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});




