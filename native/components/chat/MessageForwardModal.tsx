import { ScreenSkeleton, ButtonLoadingSkeleton } from '../ui/LoadingSkeleton';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { userService } from '../../services/user.service';
import { messageService } from '../../services/message.service';
import { FlashList } from '@shopify/flash-list';

interface MessageForwardModalProps {
  isVisible: boolean;
  onClose: () => void;
  messageId: string;
  messageContent: {
    text?: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'shared_post' | 'shared_glimpse' | 'shared_story';
    mediaURL?: string;
    sharedContent?: any;
  };
}

interface ForwardContact {
  userId: string;
  username: string;
  displayName: string;
  avatarURL: string;
  verified?: boolean;
  lastMessageTime?: any;
  isGroup?: boolean;
  participantCount?: number;
}

export function MessageForwardModal({
  isVisible,
  onClose,
  messageId,
  messageContent
}: MessageForwardModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ForwardContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (isVisible) {
      loadContacts();
    }
  }, [isVisible]);

  const loadContacts = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get recent conversations
      const conversations = await messageService.getUserConversations(user.userId);

      // Get followers and following
      const [followers, following] = await Promise.all([
        userService.getFollowers(user.userId),
        userService.getFollowing(user.userId),
      ]);

      // Combine conversation partners with followers/following
      const conversationContacts = conversations.map((conv: any) => {
        const otherParticipant = conv.participants?.find((p: string) => p !== user.userId);
        return {
          userId: otherParticipant || conv.conversationId,
          username: conv.lastMessage?.senderUsername || 'Unknown',
          displayName: conv.displayName || conv.lastMessage?.senderUsername || 'Unknown',
          avatarURL: conv.avatarURL || '',
          lastMessageTime: conv.lastMessageAt,
          isGroup: conv.type === 'group',
          participantCount: conv.participantCount,
        };
      });

      // Get user details for followers/following
      const allUserIds = [...new Set([...followers, ...following])];
      const userContacts = await Promise.all(
        allUserIds.slice(0, 30).map(async (userId) => {
          try {
            const userData = await userService.getUser(userId);
            if (!userData) {
              return null;
            }
            return {
              userId: userData.userId,
              username: userData.username,
              displayName: userData.displayName || userData.username,
              avatarURL: userData.avatarURL || '',
              verified: userData.verified,
            };
          } catch (error) {
            return null;
          }
        })
      );

      // Combine and deduplicate
      const allContacts = [
        ...conversationContacts,
        ...userContacts.filter((u): u is NonNullable<typeof u> => u !== null)
      ].filter((contact, index, self) =>
        index === self.findIndex(c => c.userId === contact.userId)
      );

      // Sort by recent conversations first, then alphabetically
      allContacts.sort((a, b) => {
        const aTime = 'lastMessageTime' in a ? a.lastMessageTime : null;
        const bTime = 'lastMessageTime' in b ? b.lastMessageTime : null;
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;
        if (aTime && bTime) {
          const aSeconds = aTime?.seconds || 0;
          const bSeconds = bTime?.seconds || 0;
          return bSeconds - aSeconds;
        }
        return a.displayName.localeCompare(b.displayName);
      });

      setContacts(allContacts as ForwardContact[]);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter((contact) =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleContactToggle = (userId: string) => {
    setSelectedContacts(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleForward = async () => {
    if (selectedContacts.length === 0) {
      Alert.alert('Error', 'Please select at least one contact to forward to');
      return;
    }

    if (!user) return;

    try {
      setForwarding(true);

      // Forward message to each selected contact
      await Promise.all(
        selectedContacts.map(async (contactId) => {
          const conversationId = await messageService.getOrCreateDirectConversation(
            user.userId,
            contactId
          );

          await messageService.sendMessage(conversationId, {
            senderId: user.userId,
            senderUsername: user.username,
            senderAvatarURL: user.avatarURL || '',
            type: ['image', 'video', 'voice'].includes(messageContent.type)
              ? 'media'
              : (messageContent.type as any),
            text: messageContent.text || '',
            mediaURL: messageContent.mediaURL,
            sharedContent: messageContent.sharedContent,
          });
        })
      );

      Alert.alert(
        'Success',
        `Message forwarded to ${selectedContacts.length} ${selectedContacts.length === 1 ? 'contact' : 'contacts'}`
      );
      onClose();
      setSelectedContacts([]);
    } catch (error) {
      console.error('Failed to forward message:', error);
      Alert.alert('Error', 'Failed to forward message');
    } finally {
      setForwarding(false);
    }
  };

  const getMessagePreview = () => {
    switch (messageContent.type) {
      case 'text':
        return messageContent.text || 'Text message';
      case 'image':
        return 'Photo';
      case 'video':
        return 'Video';
      case 'voice':
        return 'Voice message';
      case 'shared_post':
        return 'Shared post';
      case 'shared_glimpse':
        return 'Shared glimpse';
      case 'shared_story':
        return 'Shared story';
      default:
        return 'Message';
    }
  };

  const renderContact = ({ item }: { item: ForwardContact }) => {
    const isSelected = selectedContacts.includes(item.userId);

    return (
      <TouchableOpacity
        style={[styles.contactItem, isSelected && styles.selectedContactItem]}
        onPress={() => handleContactToggle(item.userId)}
      >
        <Avatar source={item.avatarURL} size={44} fallbackText={item.displayName} />

        <View style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.displayName}
            </Text>
            {item.verified && (
              <VerifiedBadge size={16} />
            )}
            {item.isGroup && (
              <View style={styles.groupBadge}>
                <Ionicons name="people" size={12} color={colors.text.secondary} />
                <Text style={styles.groupCount}>{item.participantCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.contactUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>

        <View style={[
          styles.selectionIndicator,
          isSelected && styles.selectedIndicator
        ]}>
          {isSelected && (
            <Ionicons name="checkmark" size={16} color="white" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Forward Message</Text>
          <TouchableOpacity
            onPress={handleForward}
            disabled={selectedContacts.length === 0 || forwarding}
            style={[styles.forwardButton, (selectedContacts.length === 0 || forwarding) && styles.disabledButton]}
          >
            {forwarding ? (
              <ButtonLoadingSkeleton />
            ) : (
              <Text style={styles.forwardButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Message Preview */}
        <View style={styles.messagePreview}>
          <View style={styles.previewIcon}>
            <Ionicons name="arrow-forward" size={20} color={colors.accent.primary} />
          </View>
          <Text style={styles.previewText}>{getMessagePreview()}</Text>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.text.secondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              placeholderTextColor={colors.text.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Selected Count */}
        {selectedContacts.length > 0 && (
          <View style={styles.selectedCount}>
            <Text style={styles.selectedCountText}>
              {selectedContacts.length} {selectedContacts.length === 1 ? 'contact' : 'contacts'} selected
            </Text>
          </View>
        )}

        {/* Contacts List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ScreenSkeleton variant="people" rows={7} showHeader={false} />
          </View>
        ) : (
          <FlashList estimatedItemSize={100}
            data={filteredContacts}
            renderItem={renderContact}
            keyExtractor={(item) => item.userId}
            style={styles.contactsList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contactsListContent as any}
          />
        )}
      </View>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  forwardButton: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    minWidth: 60,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: colors.text.secondary,
  },
  forwardButtonText: {
    color: 'white',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background.secondary,
    margin: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  previewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  searchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  selectedCount: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  selectedCountText: {
    fontSize: typography.fontSize.sm,
    color: colors.accent.primary,
    fontWeight: typography.fontWeight.semibold as any,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  contactsList: {
    flex: 1,
  },
  contactsListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderRadius: borderRadius.md,
  },
  selectedContactItem: {
    backgroundColor: colors.accent.primary + '20',
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  contactName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    flex: 1,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  groupCount: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  contactUsername: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicator: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
});





