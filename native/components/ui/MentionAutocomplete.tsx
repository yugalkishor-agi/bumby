import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../ui/LoadingSkeleton';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { userService } from '../../services/user.service';
import { FlashList } from '@shopify/flash-list';
import type { User as DBUser } from '../../types/database';

/** What the mention picker surfaces - a narrow view of a user document. */
type User = Pick<DBUser, 'userId' | 'username' | 'displayName' | 'avatarURL'> &
  Partial<Pick<DBUser, 'verified'>>;

interface MentionAutocompleteProps {
  query: string;
  onSelect: (user: User) => void;
  visible: boolean;
  maxResults?: number;
}

export function MentionAutocomplete({ 
  query, 
  onSelect, 
  visible, 
  maxResults = 5 
}: MentionAutocompleteProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && query.length > 0) {
      searchUsers(query);
    } else {
      setUsers([]);
    }
  }, [query, visible]);

  const searchUsers = async (searchQuery: string) => {
    try {
      setLoading(true);
      const results = await userService.searchUsers(searchQuery, maxResults);
      setUsers(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user: User) => {
    onSelect(user);
    setUsers([]);
  };

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleUserSelect(item)}
      activeOpacity={0.7}
    >
      <Avatar
        source={item.avatarURL}
        size={32}
        style={styles.avatar}
      />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {item.displayName}
          </Text>
          {item.verified ? (
            <VerifiedBadge size={12} style={styles.verifiedBadge} />
          ) : null}
        </View>
        <Text style={styles.username} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (!visible || (!loading && users.length === 0)) {
    return null;
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <InlineLoadingSkeleton />
          <Text style={styles.loadingText}>Searching users...</Text>
        </View>
      ) : (
        <FlashList estimatedItemSize={100}
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.userId}
          style={styles.usersList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  usersList: {
    maxHeight: 200,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatar: {
    borderWidth: 0,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  displayName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    flex: 1,
  },
  verifiedBadge: {
    marginLeft: 2,
  },
  username: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
});

