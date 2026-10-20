import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import type { User } from '../types/database';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';

interface UserListTemplateProps {
  title: string;
  fetchUsers: (userId: string) => Promise<string[]>;
  emptyMessage: string;
  actionButton?: (user: User) => React.ReactNode;
  showSearch?: boolean;
}

export function createUserListScreen(config: UserListTemplateProps) {
  return function UserListScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { user: currentUser } = useAuth();
    
    const userId = (route.params as any)?.userId || currentUser?.userId;
    
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
      loadUsers();
    }, [userId]);

    const loadUsers = async () => {
      if (!userId) return;
      
      setLoading(true);
      try {
        const userIds = await config.fetchUsers(userId);
        const userDetails = await Promise.all(
          userIds.map(id => userService.getUser(id))
        );
        setUsers(userDetails.filter((u): u is User => u !== null));
      } catch (error) {
        console.error('Failed to load users:', error);
      } finally {
        setLoading(false);
      }
    };

    const filteredUsers = users.filter(u =>
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderUser = ({ item }: { item: User }) => (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => (navigation as any).navigate('UserProfile', { userId: item.userId })}
      >
        <Image
          source={{ uri: item.avatarURL || 'https://via.placeholder.com/50' }}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.username}>@{item.username}</Text>
          {item.bio && <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>}
        </View>
        {config.actionButton && config.actionButton(item)}
      </TouchableOpacity>
    );

    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{config.title}</Text>
          <Text style={styles.count}>{users.length}</Text>
        </View>

        {/* Search */}
        {config.showSearch && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {/* User List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No users found' : config.emptyMessage}
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
  };
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
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginLeft: 12,
  },
  count: {
    fontSize: 14,
    color: '#6b7280',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    textAlign: 'center',
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
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  username: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  bio: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});
