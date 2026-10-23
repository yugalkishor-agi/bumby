import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Share, Linking, SafeAreaView, Animated, Dimensions, Pressable, PanResponder, Alert, Platform, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/user.service';
import { shareService } from '../services/share.service';
import { Avatar } from '../components/ui/Avatar';
import { FlashList } from '@shopify/flash-list';

type ContentType = 'post' | 'glimpse' | 'story';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_ITEM_SIZE = Math.floor((SCREEN_WIDTH - 54) / 3);

export default function SharePostScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [allIds, setAllIds] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 30;
  const topPeek = Platform.OS === 'ios' ? Math.max(insets.top + 6, 12) : 10;
  const expandedHeight = Math.min(SCREEN_HEIGHT - topPeek, Math.max(SCREEN_HEIGHT * 0.94, 620));
  const closeOffset = expandedHeight + 56;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(closeOffset)).current;
  const dragStartRef = useRef(closeOffset);

  const { contentType, contentData, onShared } = ((route.params as any) || {
    contentType: 'post',
    contentData: {},
  }) as {
    contentType: ContentType;
    contentData: any;
    onShared?: (count: number) => void;
  };

  const previewImage =
    contentData.coverImage ||
    contentData.coverImageURL ||
    contentData.thumbnailURL ||
    contentData.thumbnail ||
    contentData.posterURL ||
    contentData.posterUrl ||
    contentData.mediaURL ||
    contentData.mediaUrl ||
    contentData.imageURL ||
    contentData.imageUrl ||
    (Array.isArray(contentData.mediaURLs) ? contentData.mediaURLs[0] : '') ||
    (Array.isArray(contentData.assets) ? contentData.assets[0]?.url : '') ||
    '';
  const resolvedMediaURL = previewImage || contentData.mediaURL || contentData.mediaUrl || '';
  const resolvedMediaType: 'image' | 'video' =
    contentData.mediaType === 'video' ||
    /\.(mp4|mov|webm|m3u8)$/i.test(String(resolvedMediaURL || ''))
      ? 'video'
      : 'image';

  const contentUrl = `https://bumby.app/${contentType === 'post' ? 'post' : contentType === 'glimpse' ? 'glimpse' : 'story'}/${contentData.id}`;

  useEffect(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
      mass: 0.9,
    }).start();
    dragStartRef.current = 0;
  }, [sheetTranslateY]);

  useEffect(() => {
    if (!user?.userId) return;

    const load = async () => {
      try {
        setLoading(true);
        const [followers, following] = await Promise.all([
          userService.getFollowers(user.userId),
          userService.getFollowing(user.userId),
        ]);

        const ids = Array.from(new Set([...followers, ...following]));
        setAllIds(ids);
        setPeople([]);
        setPageIndex(0);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.userId]);

  const loadMorePeople = async () => {
    if (!allIds.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const start = pageIndex * pageSize;
      const slice = allIds.slice(start, start + pageSize);
      if (!slice.length) return;
      const details = await Promise.all(
        slice.map(async (id) => {
          try {
            return await userService.getUser(id);
          } catch {
            return null;
          }
        }),
      );
      const nextUsers = details.filter(Boolean) as any[];
      setPeople((prev) => {
        const map = new Map(prev.map((item: any) => [item.userId, item]));
        nextUsers.forEach((item: any) => map.set(item.userId, item));
        return Array.from(map.values());
      });
      setPageIndex((prev) => prev + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (allIds.length) loadMorePeople();
  }, [allIds.length]);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search.trim().toLowerCase()), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const visiblePeople = useMemo(() => {
    const filtered = !debounced
      ? people
      : people.filter(
          (item) =>
            (item.username || '').toLowerCase().includes(debounced) ||
            (item.displayName || '').toLowerCase().includes(debounced),
        );
    return filtered;
  }, [people, debounced, selected]);

  const selectedUsers = useMemo(() => {
    const map = new Map(people.filter(Boolean).map((item: any) => [item.userId, item]));
    return selected.map((id) => map.get(id)).filter(Boolean);
  }, [selected, people]);

  const generateGroupName = () => {
    const names = selectedUsers.map((item: any) => item.username || item.displayName).filter(Boolean);
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} and others`;
  };

  const animateTo = (toValue: number, callback?: () => void) => {
    Animated.spring(sheetTranslateY, {
      toValue,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
      mass: 0.9,
    }).start(({ finished }) => {
      if (finished) callback?.();
    });
    dragStartRef.current = toValue;
  };

  const closeSheet = () => animateTo(closeOffset, () => navigation.goBack());

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        sheetTranslateY.stopAnimation((value: number) => {
          dragStartRef.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(Math.max(dragStartRef.current + gesture.dy, 0), closeOffset);
        sheetTranslateY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const next = dragStartRef.current + gesture.dy;
        if (gesture.vy > 1.1 || next > 120) {
          closeSheet();
          return;
        }
        animateTo(0);
      },
    }),
  ).current;

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const buildExternalPayload = () => {
    const previewText = (contentData.caption || '').trim();
    const messageParts = [
      `Check this ${contentType} on Bumby by ${contentData.authorUsername || 'creator'}`,
      previewText,
      contentUrl,
    ].filter(Boolean);
    return { url: contentUrl, message: messageParts.join('\n') };
  };

  const openQuickShare = async (app: 'whatsapp' | 'telegram' | 'system') => {
    const { url, message: payloadMessage } = buildExternalPayload();
    try {
      if (app === 'system') {
        await Share.share({ message: payloadMessage, url });
        return;
      }
      const targetUrl =
        app === 'whatsapp'
          ? `whatsapp://send?text=${encodeURIComponent(payloadMessage)}`
          : `tg://msg?text=${encodeURIComponent(payloadMessage)}`;
      const canOpen = await Linking.canOpenURL(targetUrl);
      if (canOpen) {
        await Linking.openURL(targetUrl);
        return;
      }
      await Share.share({ message: payloadMessage, url });
    } catch {
      await Share.share({ message: payloadMessage, url });
    }
  };

  const handleCopyLink = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contentUrl);
        return;
      }
      Alert.alert('Link', contentUrl);
    } catch {
      Alert.alert('Link', contentUrl);
    }
  };

  const handleDownload = async () => {
    if (!previewImage) return;
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = previewImage;
        link.download = `${contentType}-${contentData.id || Date.now()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      await Linking.openURL(previewImage);
    } catch {
      Alert.alert('Download', 'Unable to download this media right now.');
    }
  };

  const handleAddToStory = () => {
    Alert.alert('Add to story', 'This will be wired to the story composer next.');
  };

  const handleSend = async () => {
    if (!user || selected.length === 0 || sending) return;
    setSending(true);
    try {
      if (contentType === 'post') {
        await Promise.all(
          selected.map((uid) =>
            shareService.sharePostInDM(
              contentData.id,
              {
                authorId: contentData.authorId,
                authorUsername: contentData.authorUsername,
                authorAvatarURL: contentData.authorAvatarURL,
                authorVerified: !!contentData.authorVerified,
                mediaURL: resolvedMediaURL,
                caption: contentData.caption,
                mediaType: resolvedMediaType,
              },
              user.userId,
              user.username,
              user.avatarURL || '',
              uid,
              message,
            ),
          ),
        );
      } else if (contentType === 'glimpse') {
        await Promise.all(
          selected.map((uid) =>
            shareService.shareGlimpseInDM(
              contentData.id,
              {
                authorId: contentData.authorId,
                authorUsername: contentData.authorUsername,
                authorAvatarURL: contentData.authorAvatarURL,
                authorVerified: !!contentData.authorVerified,
                mediaURL: resolvedMediaURL,
                caption: contentData.caption,
                mediaType: resolvedMediaType,
              },
              user.userId,
              user.username,
              user.avatarURL || '',
              uid,
              message,
            ),
          ),
        );
      } else {
        await Promise.all(
          selected.map((uid) =>
            shareService.shareStoryInDM(
              contentData.id,
              {
                authorId: contentData.authorId,
                authorUsername: contentData.authorUsername,
                authorAvatarURL: contentData.authorAvatarURL,
                authorVerified: !!contentData.authorVerified,
                mediaURL: resolvedMediaURL,
                mediaType: resolvedMediaType,
              },
              user.userId,
              user.username,
              user.avatarURL || '',
              uid,
              message,
            ),
          ),
        );
      }
      onShared?.(selected.length);
      navigation.goBack();
    } finally {
      setSending(false);
    }
  };

  const handleCreateGroup = () => {
    if (selected.length < 2) return;
    (navigation as any).navigate('NewGroup', {
      userIds: selected,
      suggestedName: generateGroupName(),
    });
  };

  const renderPerson = ({ item }: { item: any }) => {
    const isSelected = selected.includes(item.userId);
    return (
      <TouchableOpacity activeOpacity={0.82} style={styles.personTile} onPress={() => toggle(item.userId)}>
        <View style={styles.personAvatarWrap}>
          <Avatar source={item.avatarURL} size={80} fallbackText={item.displayName || item.username} />
          {isSelected ? (
            <View style={styles.personCheck}>
              <Ionicons name="checkmark" size={16} color="#ffffff" />
            </View>
          ) : null}
        </View>
        <Text style={styles.personName} numberOfLines={2}>{item.displayName || item.username}</Text>
      </TouchableOpacity>
    );
  };

  const renderIdleActions = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.actionScrollContent as any}
    >
      {[
        { key: 'story', label: 'Add to story', icon: 'add-circle-outline', color: '#e2e8f0', onPress: handleAddToStory },
        { key: 'copy', label: 'Copy link', icon: 'link-outline', color: '#e2e8f0', onPress: handleCopyLink },
        { key: 'wa', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#22c55e', onPress: () => openQuickShare('whatsapp') },
        { key: 'download', label: 'Download', icon: 'download-outline', color: '#e2e8f0', onPress: handleDownload },
        { key: 'telegram', label: 'Telegram', icon: 'paper-plane-outline', color: '#38bdf8', onPress: () => openQuickShare('telegram') },
        { key: 'other', label: 'Other apps', icon: 'apps-outline', color: '#e2e8f0', onPress: () => openQuickShare('system') },
      ].map((action) => (
        <TouchableOpacity key={action.key} style={styles.actionItem} onPress={action.onPress}>
          <Ionicons name={action.icon as any} size={26} color={action.color} />
          <Text style={styles.actionLabel}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderSelectedActions = () => (
    <View style={styles.selectedPanel}>
      <View style={styles.selectedStackRow}>
        <View style={styles.selectedStack}>
          {selectedUsers.slice(0, 3).map((item, index) => (
            <View key={item.userId} style={[styles.selectedAvatarBubble, { marginLeft: index === 0 ? 0 : -12 }]}>
              <Avatar source={item.avatarURL} size={26} fallbackText={item.displayName || item.username} />
            </View>
          ))}
        </View>
        <Text style={styles.selectedSummary} numberOfLines={1}>
          {selected.length === 1 ? '1 recipient selected' : `${selected.length} recipients selected`}
        </Text>
      </View>

      <View style={styles.messageShell}>
        <TextInput
          style={styles.messageInput}
          placeholder="Write a message..."
          placeholderTextColor="#64748b"
          value={message}
          onChangeText={setMessage}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryAction, sending && styles.primaryActionDisabled]}
        disabled={sending}
        onPress={handleSend}
      >
        {sending ? <ButtonLoadingSkeleton /> : <Text style={styles.primaryActionText}>{selected.length > 1 ? 'Send separately' : 'Send'}</Text>}
      </TouchableOpacity>

      {selected.length > 1 ? (
        <TouchableOpacity style={styles.secondaryAction} onPress={handleCreateGroup}>
          <View style={styles.secondaryAvatarRow}>
            {selectedUsers.slice(0, 3).map((item, index) => (
              <View key={item.userId} style={[styles.secondaryAvatarBubble, { marginLeft: index === 0 ? 0 : -10 }]}>
                <Avatar source={item.avatarURL} size={26} fallbackText={item.displayName || item.username} />
              </View>
            ))}
          </View>
          <Text style={styles.secondaryActionText}>Create group chat</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={styles.backdrop} onPress={closeSheet} />

      <Animated.View
        style={[
          styles.sheet,
          {
            height: expandedHeight,
            paddingBottom: Math.max(insets.bottom, 10),
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        <View style={styles.sheetHeaderRow}>
          <View style={styles.searchShell}>
            <Ionicons name="search" size={18} color="#7c8aa5" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#64748b"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity style={styles.sheetCloseButton} onPress={closeSheet}>
            <Ionicons name="close" size={18} color="#e2e8f0" />
          </TouchableOpacity>
        </View>

        {loading && visiblePeople.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#38bdf8" />
          </View>
        ) : (
          <FlashList estimatedItemSize={100}
            data={visiblePeople}
            keyExtractor={(item) => item.userId}
            numColumns={3}
            contentContainerStyle={[styles.gridContent, { paddingBottom: selected.length === 0 ? 118 : 132 + Math.max(insets.bottom, 8) }] as any}
            renderItem={renderPerson}
            onEndReached={loadMorePeople}
            onEndReachedThreshold={0.45}
            ListFooterComponent={loadingMore ? <View style={styles.footerLoader}><InlineLoadingSkeleton /></View> : <View style={{ height: 10 }} />}
          />
        )}

        <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom + 10, 22) }]}>
          {selected.length === 0 ? renderIdleActions() : renderSelectedActions()}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    overflow: 'hidden',
  },
  sheetHandleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.55)',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#121a2b',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingLeft: 10,
    fontSize: 15,
    color: '#f8fafc',
  },
  sheetCloseButton: {
    width: 44,
    height: 44,
    marginLeft: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a2b',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 132,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  personTile: {
    width: GRID_ITEM_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  personAvatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  personCheck: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#5b6cff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0b1220',
  },
  personName: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 18,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingBottom: 22,
    backgroundColor: '#0b1220',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.1)',
    minHeight: 136,
  },
  actionScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionItem: {
    width: 98,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  actionLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 12,
  },
  selectedPanel: {
    paddingHorizontal: 16,
    gap: 10,
  },
  selectedStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedAvatarBubble: {
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#0b1220',
    overflow: 'hidden',
  },
  selectedSummary: {
    marginLeft: 10,
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  messageShell: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: '#121a2b',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
    justifyContent: 'center',
  },
  messageInput: {
    fontSize: 15,
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryAction: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#5865f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionDisabled: {
    opacity: 0.45,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryAction: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  secondaryAvatarBubble: {
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#111827',
    overflow: 'hidden',
  },
  secondaryActionText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
});








