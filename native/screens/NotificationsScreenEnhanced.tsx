import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Animated, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { NotificationsHeader } from '../components/notifications/NotificationsHeader';
import { NotificationsList } from '../components/notifications/NotificationsList';
import { useNotificationsList } from '../hooks/notifications/useNotificationsList';
import { useNotificationUsers } from '../hooks/notifications/useNotificationUsers';
import { useNotificationActions } from '../hooks/notifications/useNotificationActions';
import { useNotificationFilters } from '../hooks/notifications/useNotificationFilters';
import { NotificationGroup, AppNotification } from '../hooks/notifications/notificationTypes';
import { shouldOpenCommentThread } from '../utils/notifications/notificationUtils';
import { appWarmupService } from '../services/appWarmup.service';

export default function NotificationsScreenEnhanced() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const currentUserId = user?.userId ?? null;

  const [refreshing, setRefreshing] = useState(false);

  // 1. Data Layer: Notifications
  const {
    notifications,
    setNotifications,
    loading,
    fadeAnim,
    autoReadIdsRef,
    deliveredIdsRef,
  } = useNotificationsList(currentUserId);

  // 2. Data Layer: Users & Follow Requests
  const {
    followingUsers,
    isPrivateAccount,
    pendingFollowRequests,
    handleFollow,
    refreshUsersData,
  } = useNotificationUsers(currentUserId);

  // 3. Logic Layer: Actions
  const {
    prefetchCommentThread,
    markGroupAsRead,
    handleMarkAllAsRead,
    handleDeleteGroup,
    handleAcceptCollaboration,
    handleDeclineCollaboration,
  } = useNotificationActions({
    currentUserId,
    notifications,
    setNotifications,
    autoReadIdsRef,
    deliveredIdsRef,
  });

  // 4. Logic Layer: Filters & Grouping
  const {
    activeFilter,
    setActiveFilter,
    groupedFeedItems,
    unreadCount,
  } = useNotificationFilters(notifications, isPrivateAccount);

  // Navigation Logic
  const handleNotificationPress = useCallback(async (group: NotificationGroup) => {
    if (!group.isRead) {
      await markGroupAsRead(group);
    }

    const notification = group.latestNotification;

    if (shouldOpenCommentThread(notification) && notification.refId) {
      void prefetchCommentThread(notification);
      const targetCommentId = notification.commentId || notification.targetCommentId || notification.parentCommentId;
      (navigation as any).navigate('Comments', {
        postId: notification.refId,
        fromGlimpses: notification.refType === 'glimpse',
        postType: notification.refType === 'glimpse' ? 'glimpse' : 'post',
        targetCommentId,
        highlightCommentId: targetCommentId,
        parentCommentId: notification.parentCommentId || undefined,
      });
      return;
    }

    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'mention':
        if (notification.refType === 'post' && notification.refId) {
          (navigation as any).navigate('PostView', { postId: notification.refId });
          return;
        }
        if (notification.refType === 'glimpse' && notification.refId) {
          (navigation as any).navigate('GlimpseViewer', { glimpseId: notification.refId });
          return;
        }
        if (notification.refType === 'story' && notification.refId) {
          (navigation as any).navigate('StoryViewerEnhanced', { storyId: notification.refId });
          return;
        }
        break;
      case 'story_like':
      case 'story_reply':
      case 'story_view':
        if (notification.refId) {
          (navigation as any).navigate('StoryViewerEnhanced', { storyId: notification.refId });
          return;
        }
        break;
      case 'follow':
        if (currentUserId && notification.actorId) {
          void appWarmupService.prefetchProfile(notification.actorId, currentUserId);
        }
        (navigation as any).navigate('UserProfile', { userId: notification.actorId });
        return;
      case 'collaboration_request':
        if ((notification.refType === 'glimpse' || notification.glimpseId) && (notification.glimpseId || notification.refId)) {
          (navigation as any).navigate('GlimpseViewer', { glimpseId: notification.glimpseId || notification.refId });
          return;
        }
        if (notification.refId) {
          (navigation as any).navigate('PostView', { postId: notification.refId });
          return;
        }
        break;
      default:
        break;
    }

    if (currentUserId && notification.actorId) {
      void appWarmupService.prefetchProfile(notification.actorId, currentUserId);
    }
    (navigation as any).navigate('UserProfile', { userId: notification.actorId });
  }, [currentUserId, markGroupAsRead, navigation, prefetchCommentThread]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshUsersData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshUsersData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSide}><LoadingSkeleton width={24} height={24} borderRadius={12} /></View>
          <LoadingSkeleton width={132} height={24} borderRadius={12} />
          <View style={styles.headerSideRight}><LoadingSkeleton width={52} height={16} borderRadius={999} /></View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
              <LoadingSkeleton width={46} height={46} borderRadius={23} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <LoadingSkeleton width={index % 2 === 0 ? '62%' : '54%'} height={15} borderRadius={999} />
                <LoadingSkeleton width={index % 2 === 0 ? '78%' : '70%'} height={13} borderRadius={999} style={{ marginTop: 10 }} />
              </View>
              <LoadingSkeleton width={54} height={54} borderRadius={14} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <NotificationsHeader unreadCount={unreadCount} onMarkAllAsRead={handleMarkAllAsRead} />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <NotificationsList
          groupedFeedItems={groupedFeedItems}
          currentUserId={currentUserId}
          followingUsers={followingUsers}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          unreadCount={unreadCount}
          isPrivateAccount={isPrivateAccount}
          pendingFollowRequests={pendingFollowRequests}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPress={handleNotificationPress}
          onDelete={handleDeleteGroup}
          onFollow={handleFollow}
          onAcceptCollaboration={handleAcceptCollaboration}
          onDeclineCollaboration={handleDeclineCollaboration}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headerSide: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSideRight: {
    minWidth: 56,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  content: {
    flex: 1,
  },
});
