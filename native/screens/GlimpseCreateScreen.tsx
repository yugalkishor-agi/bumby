import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../components/ui/Avatar';
import { MentionAutocomplete } from '../components/ui/MentionAutocomplete';
import { HashtagAutocomplete } from '../components/ui/HashtagAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { useUpload } from '../contexts/UploadContext';
import { userService } from '../services/user.service';
import { glimpseService } from '../services/glimpse.service';
import { mediaService } from '../services/media.service.native';
import { draftService } from '../services/draft.service';
import { borderRadius, spacing, typography, useColors } from '../styles/theme';
import { Image } from 'expo-image';

type SelectedMedia = {
  uri: string;
  type: 'image' | 'video';
  thumbnail: string;
  width?: number;
  height?: number;
  duration?: number | null;
};

type SelectedCover = {
  uri: string;
  width?: number;
  height?: number;
  source: 'auto' | 'custom';
};

const VISIBILITY_OPTIONS = [
  { id: 'public' as const, label: 'Public' },
  { id: 'followers' as const, label: 'Followers' },
  { id: 'close_friends' as const, label: 'Close Friends' },
];

export default function GlimpseCreateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { startUpload, updateProgress, completeUpload, cancelUpload } = useUpload();
  const c = useColors();
  const captionInputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);
  const tempMediaUrisRef = useRef<string[]>([]);

  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [captionError, setCaptionError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(route.params?.draftId || null);
  const [allowComments, setAllowComments] = useState(true);
  const [allowSharing, setAllowSharing] = useState(true);
  const [hideLikes, setHideLikes] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'close_friends'>('public');
  const [taggedUsers, setTaggedUsers] = useState<any[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [showUserTagging, setShowUserTagging] = useState(false);
  const [showCollaboratorTagging, setShowCollaboratorTagging] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [collaboratorSearchQuery, setCollaboratorSearchQuery] = useState('');
  const [collaboratorSearchResults, setCollaboratorSearchResults] = useState<any[]>([]);
  const [searchingCollaborators, setSearchingCollaborators] = useState(false);
  const [captionSelection, setCaptionSelection] = useState({ start: 0, end: 0 });
  const [activeMentionQuery, setActiveMentionQuery] = useState('');
  const [activeHashtagQuery, setActiveHashtagQuery] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [selectedCover, setSelectedCover] = useState<SelectedCover | null>(null);

  const s = useMemo(() => createStyles(c), [c]);

  const normalizeVisibility = (value?: string): 'public' | 'followers' | 'close_friends' => {
    if (value === 'followers' || value === 'close_friends' || value === 'public') return value;
    if (value === 'closeFriends') return 'close_friends';
    return 'public';
  };

  const openCloseFriendsManager = () => {
    navigation.navigate('CloseFriends');
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      const uris = [...tempMediaUrisRef.current];
      tempMediaUrisRef.current = [];
      uris.forEach((uri) => {
        void cleanupTempUri(uri);
      });
    };
  }, []);

  useEffect(() => {
    if (!user || !route.params?.draftId || route.params?.draftType !== 'glimpse') return;
    const draft = draftService.getGlimpseDraft(user.userId, route.params.draftId);
    if (!draft) return;

    if (draft.mediaURL) {
      setSelectedMedia({
        uri: draft.mediaURL,
        type: (draft as any).mediaType === 'video' ? 'video' : 'image',
        thumbnail: draft.thumbnailURL || draft.mediaURL,
        width: 1,
        height: 1,
      });
    }

    setCaption(draft.caption || '');
    setAllowComments(draft.settings?.allowComments ?? true);
    setAllowSharing((draft as any).allowSharing ?? true);
    setHideLikes(draft.settings?.hideLikes ?? false);
    setVisibility(normalizeVisibility((draft as any).audience));
    setSelectedCover(draft.thumbnailURL ? { uri: draft.thumbnailURL, source: 'auto' } : null);
  }, [route.params, user]);

  const normalizeDuration = (duration?: number | null, mediaType?: 'image' | 'video') => {
    if (mediaType !== 'video') return 5000;
    if (!duration || duration <= 0) return 15000;
    return duration < 1000 ? Math.round(duration * 1000) : Math.round(duration);
  };

  const cleanupTempUri = async (uri?: string | null) => {
    if (!uri) return;
    if (!(uri.startsWith('file:') || uri.startsWith('/'))) return;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {}
  };

  const ensurePreviewableVideoUri = async (uri: string) => {
    if (!uri.startsWith('content:')) {
      return { previewUri: uri } as { previewUri: string; cleanupUri?: string };
    }

    const extMatch = uri.match(/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i);
    const ext = extMatch?.[1]?.toLowerCase() || 'mp4';
    const cleanupUri = `${FileSystem.cacheDirectory || ''}iris-glimpse-preview-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: cleanupUri });
    return { previewUri: cleanupUri, cleanupUri };
  };

  const ensurePersistentVideoUri = async (media: SelectedMedia): Promise<SelectedMedia> => {
    if (media.type !== 'video' || !media.uri.startsWith('content:')) {
      return media;
    }

    const extMatch = String(media.uri).match(/\.(mp4|mov|m4v|webm|3gp)(\?|$)/i);
    const ext = extMatch?.[1]?.toLowerCase() || 'mp4';
    const persistentUri = `${FileSystem.cacheDirectory || ''}iris-glimpse-media-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    await FileSystem.copyAsync({ from: media.uri, to: persistentUri });
    tempMediaUrisRef.current.push(persistentUri);
    return { ...media, uri: persistentUri, thumbnail: media.thumbnail || persistentUri };
  };

  const normalizePickerAsset = (asset: any): SelectedMedia => {
    const mediaType = asset?.type === 'video' ? 'video' : 'image';
    return {
      uri: asset.uri,
      type: mediaType,
      thumbnail: asset.uri,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    };
  };

  const generateAutoCover = async (media: SelectedMedia) => {
    if (!media?.uri) return;

    if (media.type !== 'video') {
      if (!isMountedRef.current) return;
      setCoverGenerating(false);
      setSelectedCover({
        uri: media.uri,
        width: media.width,
        height: media.height,
        source: 'auto',
      });
      return;
    }

    setCoverGenerating(true);
    let cleanupUri: string | undefined;
    try {
      const prepared = await ensurePreviewableVideoUri(media.uri);
      cleanupUri = prepared.cleanupUri;
      const { uri } = await VideoThumbnails.getThumbnailAsync(prepared.previewUri, {
        time: 1000,
        quality: 0.65,
      });

      if (!isMountedRef.current) return;
      setSelectedMedia((prev) => (prev && prev.uri === media.uri ? { ...prev, thumbnail: uri } : prev));
      setSelectedCover((prev) => (prev?.source === 'custom' ? prev : { uri, source: 'auto' }));
    } catch (error) {
      console.warn('Auto glimpse cover generation failed:', error);
      if (!isMountedRef.current) return;
      const fallbackUri = media.thumbnail || media.uri;
      setSelectedMedia((prev) => (prev && prev.uri === media.uri ? { ...prev, thumbnail: fallbackUri } : prev));
      setSelectedCover((prev) => (prev?.source === 'custom' ? prev : { uri: fallbackUri, source: 'auto' }));
    } finally {
      await cleanupTempUri(cleanupUri);
      if (isMountedRef.current) {
        setCoverGenerating(false);
      }
    }
  };

  const applySelectedMedia = (media: SelectedMedia) => {
    const previousUri = selectedMedia?.uri;
    if (previousUri && previousUri !== media.uri && tempMediaUrisRef.current.includes(previousUri)) {
      tempMediaUrisRef.current = tempMediaUrisRef.current.filter((uri) => uri !== previousUri);
      void cleanupTempUri(previousUri);
    }

    setSelectedMedia(media);
    setSelectedCover(null);
    setCoverGenerating(media.type === 'video');
    setPreviewMuted(true);
    setPreviewVisible(false);
    setCaptionError(false);
    void generateAutoCover(media);
  };

  const restoreAutoCover = () => {
    setSelectedCover(null);
    if (selectedMedia) {
      setCoverGenerating(selectedMedia.type === 'video');
      void generateAutoCover(selectedMedia);
    }
  };

  useEffect(() => {
    if (!selectedMedia || selectedCover?.source === 'custom' || selectedCover?.uri || coverGenerating) return;
    void generateAutoCover(selectedMedia);
  }, [selectedMedia?.uri, selectedCover?.uri, selectedCover?.source, coverGenerating]);

  const pickMediaAsset = async (useCamera = false): Promise<SelectedMedia | null> => {
    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission required', 'Camera permission is required to capture a glimpse.');
          return null;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission required', 'Media access is required to choose a photo or video.');
          return null;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: false,
            quality: 0.85,
            videoMaxDuration: 60,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: false,
            quality: 0.85,
            videoMaxDuration: 60,
          });

      if (result.canceled || !result.assets?.[0]) return null;
      const normalized = normalizePickerAsset(result.assets[0]);
      return await ensurePersistentVideoUri(normalized);
    } catch (error) {
      console.error('Error picking glimpse media:', error);
      Alert.alert('Error', 'Failed to pick media.');
      return null;
    }
  };

  const pickMedia = async (useCamera = false) => {
    const normalized = await pickMediaAsset(useCamera);
    if (normalized) {
      applySelectedMedia(normalized);
    }
  };

  const pickCoverImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Media access is required to choose a cover image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.82,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSelectedCover({ uri: asset.uri, width: asset.width, height: asset.height, source: 'custom' });
    } catch (error) {
      console.error('Error picking glimpse cover:', error);
      Alert.alert('Error', 'Failed to pick cover image.');
    }
  };

  const detectActiveCaptionToken = (text: string, cursor: number) => {
    const safeCursor = Math.max(0, Math.min(cursor, text.length));
    const beforeCursor = text.slice(0, safeCursor);
    const match = beforeCursor.match(/(^|\s)([@#][a-zA-Z0-9_]*)$/);
    if (!match) return null;
    const token = match[2] || '';
    return {
      type: token.startsWith('@') ? 'mention' : token.startsWith('#') ? 'hashtag' : null,
      start: safeCursor - token.length,
      end: safeCursor,
      query: token.slice(1),
    };
  };

  const syncCaptionAutocomplete = (nextText: string, cursor: number) => {
    const tokenData = detectActiveCaptionToken(nextText, cursor);
    if (!tokenData || !tokenData.type) {
      setActiveMentionQuery('');
      setActiveHashtagQuery('');
      return;
    }

    if (tokenData.type === 'mention') {
      setActiveMentionQuery(tokenData.query);
      setActiveHashtagQuery('');
      return;
    }

    setActiveHashtagQuery(tokenData.query);
    setActiveMentionQuery('');
  };

  const replaceActiveCaptionToken = (prefix: '@' | '#', value: string) => {
    const tokenData = detectActiveCaptionToken(caption, captionSelection.start);
    if (!tokenData || !tokenData.type) return;

    const cleanValue = value.replace(/^[@#]/, '').trim();
    if (!cleanValue) return;

    const replacement = `${prefix}${cleanValue} `;
    const nextCaption = `${caption.slice(0, tokenData.start)}${replacement}${caption.slice(tokenData.end)}`;
    const nextCursor = tokenData.start + replacement.length;

    setCaption(nextCaption);
    setCaptionSelection({ start: nextCursor, end: nextCursor });
    setActiveMentionQuery('');
    setActiveHashtagQuery('');

    setTimeout(() => {
      captionInputRef.current?.focus();
    }, 0);
  };

  const searchUsersForPicker = async (
    query: string,
    excludedUserIds: string[],
    setLoading: (loading: boolean) => void,
    setResults: (results: any[]) => void,
  ) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const results = await userService.searchUsers(query, 20);
      const filtered = results.filter((candidate: any) => {
        if (!candidate?.userId || candidate.userId === user?.userId) return false;
        return !excludedUserIds.includes(candidate.userId);
      });
      setResults(filtered);
    } catch (error) {
      console.error('User search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    await searchUsersForPicker(query, taggedUsers.map((item) => item.userId), setSearchingUsers, setUserSearchResults);
  };

  const searchCollaborators = async (query: string) => {
    await searchUsersForPicker(query, collaborators.map((item) => item.userId), setSearchingCollaborators, setCollaboratorSearchResults);
  };

  const upsertUniqueUser = (list: any[], userData: any) => {
    const dedup = new Map<string, any>();
    for (const item of [...list, userData]) {
      if (!item?.userId) continue;
      dedup.set(item.userId, item);
    }
    return Array.from(dedup.values());
  };

  const handleUserTag = (userData: any) => {
    if (!userData?.userId || userData.userId === user?.userId) return;
    setTaggedUsers((prev) => upsertUniqueUser(prev, userData).slice(0, 10));
    setUserSearchQuery('');
    setUserSearchResults([]);
    setShowUserTagging(false);
  };

  const handleCollaboratorTag = (userData: any) => {
    if (!userData?.userId || userData.userId === user?.userId) return;
    setCollaborators((prev) => upsertUniqueUser(prev, userData).slice(0, 5));
    setCollaboratorSearchQuery('');
    setCollaboratorSearchResults([]);
    setShowCollaboratorTagging(false);
  };

  const removeUserTag = (userId: string) => {
    setTaggedUsers((prev) => prev.filter((item) => item.userId !== userId));
  };

  const removeCollaborator = (userId: string) => {
    setCollaborators((prev) => prev.filter((item) => item.userId !== userId));
  };

  const extractHashtags = (text: string): string[] => {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const tags = new Set<string>();
    let match: RegExpExecArray | null = null;

    while ((match = hashtagRegex.exec(text)) !== null) {
      if (match[1]) tags.add(match[1].toLowerCase());
    }

    return Array.from(tags);
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const mentions = new Set<string>();
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match[1]) mentions.add(match[1].toLowerCase());
    }

    return Array.from(mentions);
  };

  const handleSaveDraft = () => {
    if (!user) return;

    const hasData = !!selectedMedia || !!selectedCover || !!caption.trim();
    if (!hasData) {
      Alert.alert('Nothing to save', 'Add media or caption before saving this glimpse draft.');
      return;
    }

    const payload = {
      caption: caption.trim(),
      mediaURL: selectedMedia?.uri,
      mediaType: selectedMedia?.type,
      thumbnailURL: selectedCover?.uri || selectedMedia?.thumbnail || selectedMedia?.uri,
      audience: visibility,
      allowSharing,
      settings: {
        allowComments,
        allowDownload: false,
        hideLikes,
        showCaptions: true,
      },
    };

    if (activeDraftId) {
      draftService.updateGlimpseDraft(user.userId, activeDraftId, payload as any);
      Alert.alert('Saved', 'Glimpse draft updated successfully.');
      return;
    }

    const saved = draftService.saveGlimpseDraft(user.userId, payload as any);
    setActiveDraftId(saved.id);
    Alert.alert('Saved', 'Glimpse draft saved successfully.');
  };

  const handlePost = async () => {
    if (!selectedMedia || !user || uploading) return;

    const trimmedCaption = caption.trim();
    if (!trimmedCaption) {
      setCaptionError(true);
      captionInputRef.current?.focus();
      Alert.alert('Caption required', 'Add a caption before sharing this glimpse.');
      return;
    }

    setCaptionError(false);
    setUploading(true);
    setPreviewVisible(false);

    const currentMedia = selectedMedia;
    const currentCover = selectedCover;
    const currentTaggedUsers = taggedUsers;
    const currentCollaborators = collaborators;
    const currentAllowComments = allowComments;
    const currentAllowSharing = allowSharing;
    const currentHideLikes = hideLikes;
    const currentVisibility = visibility;
    const currentDraftId = activeDraftId;

    startUpload('glimpse');
    updateProgress(8);
    navigation.goBack();

    setTimeout(() => {
      void (async () => {
        try {
          updateProgress(18);
          const uploadPayload = {
            uri: currentMedia.uri,
            type: currentMedia.type === 'video' ? 'video/mp4' : 'image/jpeg',
            mimeType: currentMedia.type === 'video' ? 'video/mp4' : 'image/jpeg',
          };

          const { mediaURL, thumbnailURL } = await mediaService.uploadStoryMedia(user.userId, uploadPayload);
          updateProgress(54);

          let coverImageURL = thumbnailURL || currentMedia.thumbnail || mediaURL;
          const shouldUploadSeparateCover = !!currentCover?.uri && (
            currentCover.source === 'custom' ||
            (currentMedia.type === 'video' && currentCover.uri !== currentMedia.uri)
          );

          if (shouldUploadSeparateCover && currentCover?.uri) {
            try {
              updateProgress(68);
              coverImageURL = await mediaService.uploadStoryThumbnail(user.userId, {
                uri: currentCover.uri,
                type: 'image/jpeg',
                mimeType: 'image/jpeg',
              });
            } catch (error) {
              console.warn('Glimpse cover upload fallback used:', error);
            }
          }

          updateProgress(82);
          const hashtags = extractHashtags(trimmedCaption);
          const mentions = extractMentions(trimmedCaption);

          await glimpseService.createGlimpseFromUrl(
            user.userId,
            user.username,
            user.avatarURL || '',
            !!user.verified,
            mediaURL,
            currentMedia.type,
            normalizeDuration(currentMedia.duration, currentMedia.type),
            trimmedCaption,
            {
              allowComments: currentAllowComments,
              allowSharing: currentAllowSharing,
              hideLikes: currentHideLikes,
              showCaptions: true,
              audience: currentVisibility,
              mentions,
              tags: hashtags,
              taggedUsers: currentTaggedUsers.length > 0
                ? currentTaggedUsers.map((taggedUser) => ({
                    userId: taggedUser.userId,
                    username: taggedUser.username,
                  }))
                : undefined,
              thumbnailURL: coverImageURL,
              collaborators: currentCollaborators.length > 0
                ? currentCollaborators.map((collaborator) => ({
                    userId: collaborator.userId,
                    username: collaborator.username,
                    displayName: collaborator.displayName,
                    avatarURL: collaborator.avatarURL,
                  }))
                : undefined,
            },
          );

          if (currentDraftId) {
            draftService.deleteGlimpseDraft(user.userId, currentDraftId);
          }

          updateProgress(100);
          completeUpload();
        } catch (error) {
          console.error('Error creating glimpse:', error);
          cancelUpload();
          const message = error instanceof Error ? error.message : String(error || 'Unknown error');
          Alert.alert('Error', `Failed to share glimpse.\n${message}`);
        } finally {
          if (isMountedRef.current) {
            setUploading(false);
            setActiveDraftId(null);
          }
        }
      })();
    }, 0);
  };

  const renderSelectionChips = (items: any[], onRemove: (id: string) => void) => {
    if (!items.length) return null;

    return (
      <View style={s.selectionWrap}>
        {items.map((item) => (
          <View key={item.userId} style={s.selectionChip}>
            <Avatar source={item.avatarURL} size={22} />
            <Text style={s.selectionChipText} numberOfLines={1}>@{item.username}</Text>
            <TouchableOpacity onPress={() => onRemove(item.userId)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
              <Ionicons name="close-circle" size={17} color={c.text.muted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  const renderUserPickerModal = (
    visible: boolean,
    title: string,
    query: string,
    onQueryChange: (value: string) => void,
    loading: boolean,
    results: any[],
    onClose: () => void,
    onSelect: (userData: any) => void,
  ) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.modalCloseButton}>
              <Ionicons name="close" size={20} color={c.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={s.modalSearchShell}>
            <Ionicons name="search" size={18} color={c.text.muted} />
            <TextInput
              style={s.modalSearchInput}
              placeholder="Search users"
              placeholderTextColor={c.text.muted}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={onQueryChange}
            />
          </View>

          {loading ? (
            <View style={s.modalLoadingState}>
              <ActivityIndicator size="small" color={c.accent.primary} />
            </View>
          ) : (
            <ScrollView style={s.modalList} keyboardShouldPersistTaps="handled">
              {results.map((candidate) => (
                <TouchableOpacity key={candidate.userId} style={s.modalUserRow} onPress={() => onSelect(candidate)}>
                  <Avatar source={candidate.avatarURL} size={42} />
                  <View style={s.modalUserMeta}>
                    <Text style={s.modalUserName}>@{candidate.username}</Text>
                    <Text style={s.modalUserDisplay} numberOfLines={1}>{candidate.displayName || candidate.username}</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={c.accent.primary} />
                </TouchableOpacity>
              ))}
              {!results.length && query.trim().length > 0 ? (
                <View style={s.modalEmptyState}>
                  <Text style={s.modalEmptyText}>No users found.</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderMedia = (mode: 'stage' | 'fullscreen') => {
    if (!selectedMedia) return null;

    if (selectedMedia.type === 'video' && mode === 'fullscreen') {
      return (
        <Video
          source={{ uri: selectedMedia.uri }}
          style={s.stageMedia}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted={previewMuted}
          volume={previewMuted ? 0 : 1}
          onError={(error) => console.warn('Preview video failed in glimpse create:', error)}
        />
      );
    }

    const uri = mode === 'stage'
      ? (selectedCover?.uri || selectedMedia.thumbnail || selectedMedia.uri)
      : selectedMedia.uri;

    return <Image source={{ uri }} style={s.stageMedia} contentFit="cover" />;
  };

  const renderHeader = (subtitle?: string) => (
    <View style={s.header}>
      <TouchableOpacity style={s.headerIcon} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={22} color={c.text.primary} />
      </TouchableOpacity>

      <View style={s.headerTitleWrap}>
        <Text style={s.headerTitle}>New Glimpse</Text>
        {subtitle ? <Text style={s.headerSubtitle}>{subtitle}</Text> : null}
      </View>

      <View style={s.headerActions}>
        <TouchableOpacity onPress={handleSaveDraft} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Text style={s.headerGhostText}>Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePost}
          disabled={uploading || !selectedMedia}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={c.text.link} />
          ) : (
            <Text style={[s.headerShareText, (!selectedMedia || uploading) && s.headerShareTextDisabled]}>Share</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={s.emptyWrap}>
      <Pressable style={s.emptyTile} onPress={() => pickMedia(false)}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="add" size={34} color={c.text.link} />
        </View>
        <Text style={s.emptyTitle}>Add a glimpse</Text>
        <Text style={s.emptyBody}>Choose a photo or video to get started.</Text>
      </Pressable>

      <TouchableOpacity style={s.emptySecondary} onPress={() => pickMedia(true)}>
        <Ionicons name="camera-outline" size={18} color={c.text.primary} />
        <Text style={s.emptySecondaryText}>Use camera</Text>
      </TouchableOpacity>
    </View>
  );

  const captionOverlayText = caption.trim();

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {renderHeader(selectedMedia ? undefined : 'Start with a photo or video')}

        {!selectedMedia ? (
          renderEmptyState()
        ) : (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Hero frame */}
            <View style={s.stage}>
              {renderMedia('stage')}
              <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
                locations={[0, 0.42, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={s.stageTopRow} pointerEvents="box-none">
                <View style={s.stageBadge}>
                  <Text style={s.stageBadgeText}>GLIMPSE</Text>
                </View>
                <View style={s.stageTopActions}>
                  {selectedMedia.type === 'video' ? (
                    <TouchableOpacity style={s.stageIconButton} onPress={() => setPreviewMuted((prev) => !prev)}>
                      <Ionicons name={previewMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={17} color="#FFFFFF" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={s.stageIconButton} onPress={() => setPreviewVisible(true)}>
                    <Ionicons name="expand-outline" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.stageBottom} pointerEvents="none">
                {captionOverlayText ? (
                  <Text style={s.stageCaption} numberOfLines={4}>{captionOverlayText}</Text>
                ) : (
                  <Text style={s.stageCaptionHint}>Your caption shows up on the frame</Text>
                )}
              </View>
            </View>

            {/* Media actions */}
            <View style={s.mediaActions}>
              <TouchableOpacity style={s.mediaAction} onPress={() => pickMedia(false)}>
                <Ionicons name="images-outline" size={17} color={c.text.secondary} />
                <Text style={s.mediaActionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.mediaAction} onPress={() => pickMedia(true)}>
                <Ionicons name="camera-outline" size={17} color={c.text.secondary} />
                <Text style={s.mediaActionText}>Camera</Text>
              </TouchableOpacity>
            </View>

            {/* Caption */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>CAPTION</Text>
              <TextInput
                ref={captionInputRef}
                style={s.captionInput}
                value={caption}
                onChangeText={(text) => {
                  setCaption(text);
                  if (captionError && text.trim()) setCaptionError(false);
                  syncCaptionAutocomplete(text, captionSelection.start);
                }}
                onSelectionChange={(event) => {
                  const nextSelection = event.nativeEvent.selection;
                  setCaptionSelection(nextSelection);
                  syncCaptionAutocomplete(caption, nextSelection.start);
                }}
                placeholder="Say something about this moment"
                placeholderTextColor={c.text.muted}
                multiline
                maxLength={280}
                textAlignVertical="top"
              />
              <View style={s.captionFooter}>
                {captionError ? (
                  <Text style={s.captionErrorText}>A caption is required.</Text>
                ) : (
                  <Text style={s.captionHint}>Use @ to tag people, # for hashtags.</Text>
                )}
                <Text style={[s.counterText, captionError && s.counterTextError]}>{caption.length}/280</Text>
              </View>
              <MentionAutocomplete
                query={activeMentionQuery}
                visible={activeMentionQuery.length > 0}
                onSelect={(mentionedUser) => replaceActiveCaptionToken('@', mentionedUser.username)}
                maxResults={6}
              />
              <HashtagAutocomplete
                query={activeHashtagQuery}
                visible={activeHashtagQuery.length > 0}
                onSelect={(hashtag) => replaceActiveCaptionToken('#', hashtag)}
                maxResults={6}
              />
            </View>

            {/* Add-ons */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>ADD TO GLIMPSE</Text>

              <TouchableOpacity style={s.row} onPress={() => setShowUserTagging(true)}>
                <Ionicons name="person-add-outline" size={19} color={c.text.secondary} />
                <Text style={s.rowLabel}>Tag people</Text>
                <Text style={s.rowValue} numberOfLines={1}>
                  {taggedUsers.length ? `${taggedUsers.length} tagged` : 'Add'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
              </TouchableOpacity>

              <TouchableOpacity style={s.row} onPress={() => setShowCollaboratorTagging(true)}>
                <Ionicons name="people-outline" size={19} color={c.text.secondary} />
                <Text style={s.rowLabel}>Collaborators</Text>
                <Text style={s.rowValue} numberOfLines={1}>
                  {collaborators.length ? `${collaborators.length} invited` : 'Invite'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
              </TouchableOpacity>

              <TouchableOpacity style={s.row} onPress={pickCoverImage}>
                <Ionicons name="image-outline" size={19} color={c.text.secondary} />
                <Text style={s.rowLabel}>Cover image</Text>
                <Text style={s.rowValue} numberOfLines={1}>
                  {coverGenerating ? 'Generating…' : selectedCover ? 'Custom' : 'Auto'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
              </TouchableOpacity>

              {selectedCover ? (
                <View style={s.coverCard}>
                  <Image source={{ uri: selectedCover.uri }} style={s.coverPreview} contentFit="cover" />
                  <View style={s.coverMeta}>
                    <Text style={s.coverTitle}>
                      {selectedCover.source === 'custom' ? 'Custom cover' : 'Auto cover'}
                    </Text>
                    <Text style={s.coverSubtitle} numberOfLines={2}>
                      {selectedCover.source === 'custom'
                        ? 'Used for the feed and profile tile.'
                        : 'Pulled from your media.'}
                    </Text>
                  </View>
                  {selectedCover.source === 'custom' ? (
                    <TouchableOpacity onPress={restoreAutoCover} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="refresh-circle" size={21} color={c.text.secondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {renderSelectionChips(taggedUsers, removeUserTag)}
              {renderSelectionChips(collaborators, removeCollaborator)}
            </View>

            {/* Audience */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>AUDIENCE</Text>
              <View style={s.segmentTrack}>
                {VISIBILITY_OPTIONS.map((option, index) => {
                  const active = visibility === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[s.segment, index > 0 && s.segmentDivider, active && s.segmentActive]}
                      onPress={() => setVisibility(option.id)}
                    >
                      <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {visibility === 'close_friends' ? (
                <TouchableOpacity style={s.manageRow} onPress={openCloseFriendsManager}>
                  <Ionicons name="star-outline" size={16} color={c.text.secondary} />
                  <Text style={s.manageRowText}>Manage close friends</Text>
                  <Ionicons name="chevron-forward" size={15} color={c.text.muted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Controls */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>CONTROLS</Text>

              <View style={s.settingRow}>
                <Text style={s.settingLabel}>Allow comments</Text>
                <Switch value={allowComments} onValueChange={setAllowComments} />
              </View>
              <View style={s.settingRow}>
                <Text style={s.settingLabel}>Allow resharing</Text>
                <Switch value={allowSharing} onValueChange={setAllowSharing} />
              </View>
              <View style={s.settingRow}>
                <Text style={s.settingLabel}>Hide like count</Text>
                <Switch value={hideLikes} onValueChange={setHideLikes} />
              </View>
            </View>
          </ScrollView>
        )}

        {renderUserPickerModal(
          showUserTagging,
          'Tag people',
          userSearchQuery,
          (text) => {
            setUserSearchQuery(text);
            searchUsers(text);
          },
          searchingUsers,
          userSearchResults,
          () => setShowUserTagging(false),
          handleUserTag,
        )}

        {renderUserPickerModal(
          showCollaboratorTagging,
          'Add collaborator',
          collaboratorSearchQuery,
          (text) => {
            setCollaboratorSearchQuery(text);
            searchCollaborators(text);
          },
          searchingCollaborators,
          collaboratorSearchResults,
          () => setShowCollaboratorTagging(false),
          handleCollaboratorTag,
        )}

        {previewVisible && selectedMedia ? (
          <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setPreviewVisible(false)}>
            <SafeAreaView style={s.previewContainer}>
              <View style={s.previewHeader}>
                <TouchableOpacity style={s.headerIcon} onPress={() => setPreviewVisible(false)}>
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={s.previewTitle}>Preview</Text>
                <View style={s.headerIcon} />
              </View>
              <View style={s.previewBody}>
                <View style={s.previewFrame}>
                  {renderMedia('fullscreen')}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
                    locations={[0, 0.4, 1]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {captionOverlayText ? (
                    <View style={s.previewCaptionWrap} pointerEvents="none">
                      <Text style={s.stageCaption} numberOfLines={6}>{captionOverlayText}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </SafeAreaView>
          </Modal>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: c.background.primary },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.light,
    },
    headerIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: { flex: 1, marginHorizontal: spacing.sm },
    headerTitle: {
      color: c.text.primary,
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold as any,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      marginTop: 1,
      color: c.text.muted,
      fontSize: typography.fontSize.xs,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    headerGhostText: {
      color: c.text.secondary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    headerShareText: {
      color: c.text.link,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.bold as any,
    },
    headerShareTextDisabled: { color: c.text.muted },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },

    stage: {
      width: '100%',
      aspectRatio: 9 / 16,
      maxHeight: 520,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      backgroundColor: c.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.medium,
    },
    stageMedia: { width: '100%', height: '100%' },
    stageTopRow: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stageBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: borderRadius.full,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    stageBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: typography.fontWeight.bold as any,
      letterSpacing: 1.4,
    },
    stageTopActions: { flexDirection: 'row', gap: spacing.sm },
    stageIconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    stageBottom: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.lg,
    },
    stageCaption: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.base,
      lineHeight: 22,
      fontWeight: typography.fontWeight.medium as any,
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    stageCaptionHint: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: typography.fontSize.sm,
      fontStyle: 'italic',
    },

    mediaActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    mediaAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      borderRadius: borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
    },
    mediaActionText: {
      color: c.text.secondary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
    },

    section: { marginTop: spacing.xl },
    sectionLabel: {
      color: c.text.muted,
      fontSize: 11,
      fontWeight: typography.fontWeight.bold as any,
      letterSpacing: 1.3,
      marginBottom: spacing.sm,
    },

    captionInput: {
      minHeight: 104,
      maxHeight: 200,
      color: c.text.primary,
      fontSize: typography.fontSize.base,
      lineHeight: 23,
      backgroundColor: c.background.secondary,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    captionFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
      gap: spacing.md,
    },
    captionHint: { flex: 1, color: c.text.muted, fontSize: typography.fontSize.xs },
    captionErrorText: { flex: 1, color: c.accent.error, fontSize: typography.fontSize.xs },
    counterText: { color: c.text.muted, fontSize: typography.fontSize.xs },
    counterTextError: { color: c.accent.error },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.subtle,
    },
    rowLabel: { flex: 1, color: c.text.primary, fontSize: typography.fontSize.base },
    rowValue: { color: c.text.muted, fontSize: typography.fontSize.sm, maxWidth: 140 },

    coverCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
    },
    coverPreview: { width: 48, height: 68, borderRadius: borderRadius.md, backgroundColor: c.background.tertiary },
    coverMeta: { flex: 1 },
    coverTitle: {
      color: c.text.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    coverSubtitle: { marginTop: 2, color: c.text.muted, fontSize: typography.fontSize.xs, lineHeight: 16 },

    selectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    selectionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 4,
      paddingRight: 8,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      backgroundColor: c.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
    },
    selectionChipText: {
      maxWidth: 130,
      color: c.text.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
    },

    segmentTrack: {
      flexDirection: 'row',
      borderRadius: borderRadius.md,
      backgroundColor: c.background.secondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
    },
    segmentDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border.light },
    segmentActive: { backgroundColor: c.accent.primary },
    segmentText: {
      color: c.text.secondary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium as any,
    },
    segmentTextActive: { color: c.accent.onAccent, fontWeight: typography.fontWeight.bold as any },

    manageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    manageRowText: { flex: 1, color: c.text.secondary, fontSize: typography.fontSize.sm },

    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.subtle,
      gap: spacing.md,
    },
    settingLabel: { flex: 1, color: c.text.primary, fontSize: typography.fontSize.base },

    emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
    emptyTile: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xxxl,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border.medium,
      backgroundColor: c.background.secondary,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background.tertiary,
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      color: c.text.primary,
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.bold as any,
    },
    emptyBody: {
      marginTop: spacing.xs,
      color: c.text.muted,
      fontSize: typography.fontSize.sm,
      textAlign: 'center',
    },
    emptySecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
    },
    emptySecondaryText: {
      color: c.text.primary,
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.medium as any,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '78%',
      backgroundColor: c.background.secondary,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    modalTitle: {
      color: c.text.primary,
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold as any,
    },
    modalCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background.tertiary,
    },
    modalSearchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      height: 46,
      borderRadius: borderRadius.md,
      backgroundColor: c.background.tertiary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.light,
    },
    modalSearchInput: { flex: 1, color: c.text.primary, fontSize: typography.fontSize.sm },
    modalLoadingState: { paddingVertical: spacing.xl, alignItems: 'center' },
    modalList: { marginTop: spacing.md },
    modalUserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.subtle,
    },
    modalUserMeta: { flex: 1, marginLeft: spacing.md, marginRight: spacing.md },
    modalUserName: {
      color: c.text.primary,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold as any,
    },
    modalUserDisplay: { marginTop: 2, color: c.text.muted, fontSize: typography.fontSize.xs },
    modalEmptyState: { paddingVertical: spacing.xl, alignItems: 'center' },
    modalEmptyText: { color: c.text.muted, fontSize: typography.fontSize.sm },

    previewContainer: { flex: 1, backgroundColor: '#000000' },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    previewTitle: {
      color: '#FFFFFF',
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold as any,
    },
    previewBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewFrame: {
      width: '100%',
      aspectRatio: 9 / 16,
      maxHeight: '100%',
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      backgroundColor: '#111111',
    },
    previewCaptionWrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.lg,
    },
  });
