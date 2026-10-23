import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { messageService } from '../services/message.service';
import { ActiveUsersList } from '../components/users/ActiveUsersList';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import type { User } from '../types/database';

export default function ActiveUsersScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const handleUserPress = (user: User) => {
    (navigation as any).navigate('UserProfile', { userId: user.userId });
  };

  const handleMessageUser = (targetUser: User) => {
    const conversationId = user ? messageService.getDirectConversationId(user.userId, targetUser.userId) : undefined;
    (navigation as any).navigate('Chat', { userId: targetUser.userId, ...(conversationId ? { conversationId } : {}) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Active Users</Text>
          <Text style={styles.headerSubtitle}>Currently online and recently active</Text>
        </View>

        <TouchableOpacity 
          onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          style={styles.viewModeButton}
        >
          <Ionicons 
            name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} 
            size={24} 
            color={colors.text.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <View style={styles.infoIconContainer}>
          <Ionicons name="information-circle" size={20} color={colors.accent.primary} />
        </View>
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoTitle}>Real-time Active Users</Text>
          <Text style={styles.infoDescription}>
            Shows users who are currently online or were active in the last 5 minutes
          </Text>
        </View>
      </View>

      {/* Active Users List */}
      <View style={styles.content}>
        <ActiveUsersList
          showHeader={false}
          maxUsers={50}
          horizontal={viewMode === 'grid'}
          onUserPress={handleUserPress}
        />
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => (navigation as any).navigate('Main', { screen: 'Search' })}
        >
          <Ionicons name="search" size={20} color={colors.text.inverse} />
          <Text style={styles.actionButtonText}>Find Users</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => (navigation as any).navigate('Messages')}
        >
          <Ionicons name="chatbubble" size={20} color={colors.accent.primary} />
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Messages</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  viewModeButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent.primary,
  },
  infoIconContainer: {
    marginRight: spacing.md,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  infoDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  actionButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.inverse,
  },
  secondaryButtonText: {
    color: colors.accent.primary,
  },
});
