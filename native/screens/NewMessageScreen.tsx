import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Avatar } from '../components/ui/Avatar';
import { userService } from '../services/user.service';
import { messageService } from '../services/message.service';
import { useAuth } from '../contexts/AuthContext';
import { ScreenSkeleton } from '../components/ui/LoadingSkeleton';
import { db } from '../config/firebase';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { User } from '../types/database';
import { FlashList } from '@shopify/flash-list';

const SEARCH_DEBOUNCE_MS = 240;
const RECENT_CHAT_LIMIT = 12;

export default function NewMessageScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user: currentUser } = useAuth();
  const { forwardMessage, conversationId: fromConversationId } = (route.params as any) || {};

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);

  const activeSearchRequestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadRecentChats = useCallback(async () => {
    if (!currentUser?.userId) {
      setRecentChats([]);
      setLoadingRecent(false);
      return;
    }

    try {
      setLoadingRecent(true);

      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participantIds', 'array-contains', currentUser.userId),
        where('type', '==', 'direct'),
        orderBy('lastMessageAt', 'desc'),
        limit(24)
      );

      const snapshot = await getDocs(q);
      const recentUserIds: string[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const deletedBy = Array.isArray(data?.deletedBy) ? data.deletedBy : [];
        if (deletedBy.includes(currentUser.userId)) return;

        const participantIds = Array.isArray(data?.participantIds) ? data.participantIds : [];
        const otherUserId = participantIds.find((id: string) => id && id !== currentUser.userId);
        if (!otherUserId) return;
        if (recentUserIds.includes(otherUserId)) return;
        recentUserIds.push(otherUserId);
      });

      const users = await Promise.all(
        recentUserIds.slice(0, RECENT_CHAT_LIMIT).map(async (userId) => {
          try {
            return await userService.getUser(userId);
          } catch {
            return null;
          }
        })
      );

      setRecentChats(users.filter((u): u is User => Boolean(u)));
    } catch (error) {
      console.error('Failed to load recent chats:', error);
      setRecentChats([]);
    } finally {
      setLoadingRecent(false);
    }
  }, [currentUser?.userId]);

  useEffect(() => {
    loadRecentChats();
  }, [loadRecentChats]);

  useEffect(() => {
    if (!currentUser?.userId || debouncedQuery.length < 2) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    const requestId = activeSearchRequestRef.current + 1;
    activeSearchRequestRef.current = requestId;

    const runSearch = async () => {
      setLoadingSearch(true);
      try {
        const results = await userService.searchUsers(debouncedQuery);
        if (activeSearchRequestRef.current !== requestId) return;

        const filtered = results
          .filter((item) => item.userId !== currentUser.userId)
          .sort((a, b) => {
            if (a.verified && !b.verified) return -1;
            if (!a.verified && b.verified) return 1;
            return (a.username || '').localeCompare(b.username || '');
          });

        setSearchResults(filtered);
      } catch (error) {
        if (activeSearchRequestRef.current !== requestId) return;
        console.error('User search failed:', error);
        setSearchResults([]);
      } finally {
        if (activeSearchRequestRef.current === requestId) {
          setLoadingSearch(false);
        }
      }
    };

    runSearch();
  }, [debouncedQuery, currentUser?.userId]);

  const handleNewGroup = useCallback(() => {
    (navigation as any).navigate('NewGroup');
  }, [navigation]);

  const handleStartChat = useCallback(
    async (selectedUser: User) => {
      if (!currentUser?.userId || !selectedUser?.userId || startingUserId) return;

      setStartingUserId(selectedUser.userId);
      try {
        const access = await messageService.getDirectMessageAccess(currentUser.userId, selectedUser.userId);

        if (!access.allowed) {
          Alert.alert(
            access.reason === 'blocked' ? 'Messaging unavailable' : 'Followers only',
            access.reason === 'blocked'
              ? 'Messaging is unavailable for this account.'
              : 'This user only accepts messages from followers.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'View Profile',
                onPress: () => (navigation as any).navigate('UserProfile', { userId: selectedUser.userId }),
              },
            ]
          );
          return;
        }

        if (forwardMessage && fromConversationId) {
          await messageService.forwardMessage(
            String(fromConversationId),
            String(forwardMessage.messageId),
            currentUser.userId,
            selectedUser.userId
          );

          (navigation as any).navigate('Chat', {
            userId: selectedUser.userId,
            initialUser: selectedUser,
          });
          return;
        }

        // Open the chat straight away — resolving/creating the conversation
        // needs extra Firestore round trips and the chat screen creates the
        // document in the background.
        const conversationId = messageService.getDirectConversationId(currentUser.userId, selectedUser.userId);

        (navigation as any).navigate('Chat', {
          userId: selectedUser.userId,
          conversationId,
          initialUser: selectedUser,
        });
      } catch (error) {
        console.error('Failed to start chat:', error);
        Alert.alert('Error', 'Failed to start conversation. Please try again.');
      } finally {
        setStartingUserId(null);
      }
    },
    [currentUser?.userId, forwardMessage, fromConversationId, navigation, startingUserId]
  );

  const renderUserItem = ({ item }: { item: User }) => {
    const isStarting = startingUserId === item.userId;

    return (
      <TouchableOpacity
        style={[styles.userItem, isStarting && styles.userItemBusy]}
        onPress={() => handleStartChat(item)}
        activeOpacity={0.78}
        disabled={Boolean(startingUserId)}
      >
        <Avatar source={item.avatarURL || undefined} size={50} style={styles.avatar} />
        <View style={styles.userInfo}>
          <View style={styles.nameContainer}>
            <Text style={styles.displayName}>{item.displayName || item.username}</Text>
            {item.verified ? <VerifiedBadge size={16} /> : null}
          </View>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        {isStarting ? (
          <ActivityIndicator size="small" color="#38bdf8" />
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    const hasSearch = debouncedQuery.length >= 2;
    return (
      <View style={styles.emptyState}>
        <Ionicons name={hasSearch ? 'search-outline' : 'chatbubbles-outline'} size={64} color="#8E8E93" />
        <Text style={styles.emptyTitle}>{hasSearch ? 'No users found' : 'No recent chats'}</Text>
        <Text style={styles.emptyMessage}>
          {hasSearch ? 'Try searching with a different keyword.' : 'Search people or create a group to start messaging.'}
        </Text>
      </View>
    );
  };

  const showSearchResults = debouncedQuery.length >= 2;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{forwardMessage ? 'Forward to' : 'New Message'}</Text>
        {!forwardMessage ? (
          <TouchableOpacity onPress={handleNewGroup} style={styles.groupShortcutButton} activeOpacity={0.85}>
            <Ionicons name="people-outline" size={18} color="#7dd3fc" />
            <Text style={styles.groupShortcutText}>Group</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#64748b" />
            </TouchableOpacity>
          ) : null}
          {loadingSearch ? <ActivityIndicator size="small" color="#38bdf8" style={styles.loadingIcon} /> : null}
        </View>
      </View>

      <View style={styles.content}>
        {forwardMessage ? (
          <View style={styles.forwardPreview}>
            <Text style={styles.forwardLabel}>Forwarding</Text>
            <Text style={styles.forwardText} numberOfLines={1}>
              {forwardMessage.text || (forwardMessage.type === 'media' ? 'Media' : forwardMessage.type)}
            </Text>
          </View>
        ) : null}

        {!showSearchResults && !forwardMessage ? (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickActionCard} onPress={handleNewGroup} activeOpacity={0.85}>
              <View style={styles.quickActionIconWrap}>
                <Ionicons name="people" size={18} color="#38bdf8" />
              </View>
              <View style={styles.quickActionTextWrap}>
                <Text style={styles.quickActionTitle}>Create Group</Text>
                <Text style={styles.quickActionSubtitle}>Start a new group conversation</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#64748b" />
            </TouchableOpacity>
          </View>
        ) : null}

        {showSearchResults ? (
          <FlashList estimatedItemSize={100}
            data={searchResults}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.userId}
            ListEmptyComponent={!loadingSearch ? renderEmptyState : undefined}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={(searchResults.length === 0 ? styles.emptyContainer : undefined) as any}
          />
        ) : (
          <View style={styles.listWrap}>
            <Text style={styles.sectionTitle}>Recent</Text>
            {loadingRecent ? (
              <View style={styles.loadingContainer}>
                <ScreenSkeleton variant="list" rows={6} />
                <Text style={styles.loadingText}>Loading recent chats...</Text>
              </View>
            ) : (
              <FlashList estimatedItemSize={100}
                data={recentChats}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.userId}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={renderEmptyState}
              />
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f8fafc',
  },
  headerSpacer: {
    width: 56,
  },
  groupShortcutButton: {
    minWidth: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    backgroundColor: 'rgba(56,189,248,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  groupShortcutText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e293b',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#f8fafc',
  },
  loadingIcon: {
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  listWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickActions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  quickActionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickActionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56,189,248,0.12)',
    marginRight: 10,
  },
  quickActionTextWrap: {
    flex: 1,
  },
  quickActionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e293b',
  },
  userItemBusy: {
    opacity: 0.65,
  },
  avatar: {
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginRight: 4,
  },
  username: {
    fontSize: 14,
    color: '#94a3b8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  forwardPreview: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  forwardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 4,
  },
  forwardText: {
    fontSize: 14,
    color: '#f8fafc',
  },
});

