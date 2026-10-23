import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { messageService } from '../services/message.service';
import { colors, spacing, typography } from '../styles/theme';
import { Avatar } from '../components/ui/Avatar';
import type { User } from '../types/database';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

export default function NewChatScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [following, setFollowing] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'recent' | 'following'>('recent');

  useEffect(() => {
    loadFollowing();
  }, [user]);

  useEffect(() => {
    if (search.trim()) {
      const filtered = following.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          u.displayName?.toLowerCase().includes(search.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(following);
    }
  }, [search, following]);

  const loadFollowing = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const followingIds = await userService.getFollowing(user.userId, 100);
      const users = await Promise.all(
        followingIds.map(async (userId) => {
          try {
            return await userService.getUser(userId);
          } catch (err) {
            return null;
          }
        })
      );
      const validUsers = users.filter((u): u is User => u !== null);
      setFollowing(validUsers);
      setFilteredUsers(validUsers);
    } catch (error) {
      console.error('Failed to load following:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (selectedUser: User) => {
    const conversationId = user ? messageService.getDirectConversationId(user.userId, selectedUser.userId) : undefined;
    (navigation as any).navigate('Chat', { userId: selectedUser.userId, ...(conversationId ? { conversationId } : {}) });
  };

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleSelectUser(item)}>
      <Image
        source={{ uri: item.avatarURL || '' }}
        style={styles.avatar}
      />
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.username}</Text>
        {item.displayName && (
          <Text style={styles.displayName}>{item.displayName}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* User List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>
            {search ? 'No users found' : 'No following'}
          </Text>
          <Text style={styles.emptyDescription}>
            {search
              ? 'Try searching for another user'
              : 'Follow people to start messaging them'}
          </Text>
        </View>
      ) : (
        <FlashList estimatedItemSize={100}
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContainer as any}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  placeholder: {
    width: 36,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  listContainer: {
    paddingVertical: 8,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  displayName: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
});
