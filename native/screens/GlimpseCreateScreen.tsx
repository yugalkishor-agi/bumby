import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { MusicPicker, type PickedSong } from '../components/story/MusicPicker';
import { NativeGlimpseEditor } from '../components/media/NativeGlimpseEditor';
import { useAuth } from '../contexts/AuthContext';
import { useUpload } from '../contexts/UploadContext';
import { userService } from '../services/user.service';
import { glimpseService } from '../services/glimpse.service';
import { mediaService } from '../services/media.service.native';
import { draftService } from '../services/draft.service';
import { transcoderService } from '../services/transcoder.service';
import { borderRadius, spacing, typography } from '../styles/theme';
import { GlimpseEditorMeta, getGlimpseStylePreset } from '../utils/glimpseEditor';
import { Image } from 'expo-image';

type SelectedMedia = {
  uri: string;
  type: 'image' | 'video';
  thumbnail: string;
  width?: number;
  height?: number;
  duration?: number | null;
  editorMeta?: GlimpseEditorMeta;
};

type SelectedCover = {
  uri: string;
  width?: number;
  height?: number;
  source: 'auto' | 'custom';
};

export default function GlimpseCreateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { startUpload, updateProgress, completeUpload, cancelUpload } = useUpload();
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
  const [musicTitle, setMusicTitle] = useState('');
  const [musicArtist, setMusicArtist] = useState('');
  const [selectedSong, setSelectedSong] = useState<PickedSong | null>(null);
  const [songClipStart, setSongClipStart] = useState(0);
  const [songClipEnd, setSongClipEnd] = useState(20);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
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
  const [editorVisible, setEditorVisible] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [selectedCover, setSelectedCover] = useState<SelectedCover | null>(null);

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
        editorMeta: (draft as any).editorMeta,
      });
    }

    setCaption(draft.caption || '');
    setAllowComments(draft.settings?.allowComments ?? true);
    setAllowSharing((draft as any).allowSharing ?? true);
    setHideLikes(draft.settings?.hideLikes ?? false);
    setVisibility(normalizeVisibility((draft as any).audience));
    setMusicTitle(draft.musicTitle || '');
    setMusicArtist((draft as any).musicArtist || '');
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
      editorMeta: undefined,
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

  const handleReplaceMedia = async () => {
    const replacement = await pickMediaAsset(false);
    if (!replacement) return;
    applySelectedMedia(replacement);
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

  const handleAddClip = async () => {
    if (!selectedMedia || selectedMedia.type !== 'video') {
      Alert.alert('Video only', 'Add clip works only when the current glimpse is a video.');
      return;
    }

    if (!transcoderService.supportsConcat()) {
      Alert.alert('Concat unavailable', 'This build is missing native clip merge support. Add the native video concat backend first, otherwise Add clip cannot append videos.');
      return;
    }

    const nextClip = await pickMediaAsset(false);
    if (!nextClip) return;
    if (nextClip.type !== 'video') {
      Alert.alert('Pick a video', 'Choose a video clip to extend the current glimpse.');
      return;
    }

    try {
      const mergedUri = await transcoderService.concat([selectedMedia.uri, nextClip.uri]);
      setSelectedMedia({
        uri: mergedUri,
        type: 'video',
        thumbnail: mergedUri,
        width: selectedMedia.width,
        height: selectedMedia.height,
        duration: normalizeDuration(selectedMedia.duration, 'video') + normalizeDuration(nextClip.duration, 'video'),
        editorMeta: selectedMedia.editorMeta
          ? { ...selectedMedia.editorMeta, trimStart: 0, trimEnd: undefined, splitAt: undefined }
          : undefined,
      });
    } catch (error) {
      console.error('Error extending glimpse clip:', error);
      Alert.alert('Add clip failed', 'Could not append the selected clip to the current video.');
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

  const formatClipRange = (start: number, end: number) => {
    const safeStart = Math.max(0, Math.floor(start || 0));
    const safeEnd = Math.max(safeStart, Math.floor(end || safeStart));
    return `${safeStart}s - ${safeEnd}s`;
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

    const hasData = !!selectedMedia || !!selectedCover || !!caption.trim() || !!musicTitle.trim() || !!musicArtist.trim() || !!selectedSong;
    if (!hasData) {
      Alert.alert('Nothing to save', 'Add media or caption before saving this glimpse draft.');
      return;
    }

    const payload = {
      caption: caption.trim(),
      mediaURL: selectedMedia?.uri,
      mediaType: selectedMedia?.type,
      thumbnailURL: selectedCover?.uri || selectedMedia?.thumbnail || selectedMedia?.uri,
      musicTitle: selectedSong?.title || musicTitle.trim() || undefined,
      musicArtist: selectedSong?.artist || musicArtist.trim() || undefined,
      audience: visibility,
      allowSharing,
      editorMeta: selectedMedia?.editorMeta,
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

  const buildBackgroundMusicPayload = () => {
    if (selectedSong) {
      const payload: any = {
        trackId: selectedSong.id,
        trackTitle: selectedSong.title,
        artistName: selectedSong.artist || user?.username || 'Unknown Artist',
        clipStart: songClipStart,
        clipEnd: songClipEnd,
      };
      if (selectedSong.artworkUrl) payload.coverArtURL = selectedSong.artworkUrl;
      if (selectedSong.streamUrl) payload.streamURL = selectedSong.streamUrl;
      return payload;
    }

    if (musicTitle.trim() || musicArtist.trim()) {
      return {
        trackTitle: musicTitle.trim() || 'Original Audio',
        artistName: musicArtist.trim() || user?.username || 'Unknown Artist',
      };
    }

    return undefined;
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
    setEditorVisible(false);

    const currentMedia = selectedMedia;
    const currentCover = selectedCover;
    const currentTaggedUsers = taggedUsers;
    const currentCollaborators = collaborators;
    const currentMusic = buildBackgroundMusicPayload();
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
              editorMeta: currentMedia.editorMeta,
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
              backgroundMusic: currentMusic,
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

  const handleEditorSave = (meta: GlimpseEditorMeta) => {
    setSelectedMedia((prev) => (prev ? { ...prev, editorMeta: meta } : prev));
    if (selectedCover?.source !== 'custom' && selectedMedia) {
      setSelectedCover(null);
      setCoverGenerating(selectedMedia.type === 'video');
      void generateAutoCover({ ...selectedMedia, editorMeta: meta });
    }
    setEditorVisible(false);
  };

  const renderSelectionChips = (items: any[], onRemove: (id: string) => void) => {
    if (!items.length) return null;

    return (
      <View style={styles.selectionWrap}>
        {items.map((item) => (
          <View key={item.userId} style={styles.selectionChip}>
            <Avatar source={item.avatarURL} size={24} />
            <Text style={styles.selectionChipText} numberOfLines={1}>@{item.username}</Text>
            <TouchableOpacity onPress={() => onRemove(item.userId)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
              <Ionicons name="close-circle" size={18} color="#93A2BE" />
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
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalSearchShell}>
            <Ionicons name="search" size={18} color="#7F8DA8" />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search users"
              placeholderTextColor="#6B7A97"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={onQueryChange}
            />
          </View>

          {loading ? (
            <View style={styles.modalLoadingState}>
              <ActivityIndicator size="small" color="#4F7CFF" />
            </View>
          ) : (
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {results.map((candidate) => (
                <TouchableOpacity key={candidate.userId} style={styles.modalUserRow} onPress={() => onSelect(candidate)}>
                  <Avatar source={candidate.avatarURL} size={42} />
                  <View style={styles.modalUserMeta}>
                    <Text style={styles.modalUserName}>@{candidate.username}</Text>
                    <Text style={styles.modalUserDisplay} numberOfLines={1}>{candidate.displayName || candidate.username}</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color="#4F7CFF" />
                </TouchableOpacity>
              ))}
              {!results.length && query.trim().length > 0 ? (
                <View style={styles.modalEmptyState}>
                  <Text style={styles.modalEmptyText}>No users found.</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderMediaPreview = (mode: 'stage' | 'fullscreen') => {
    if (!selectedMedia) return null;
    const selectedStyle = getGlimpseStylePreset(selectedMedia.editorMeta?.styleId);
    const overlayText = selectedMedia.editorMeta?.overlayText?.trim();
    const overlayPosition = selectedMedia.editorMeta?.overlayPosition || 'center';
    const overlayColor = selectedMedia.editorMeta?.overlayColor || selectedStyle.textColor;
    const overlayAlign = selectedMedia.editorMeta?.overlayAlign || 'center';
    const overlayBackground = selectedMedia.editorMeta?.overlayBackground || 'none';
    const overlayEffect = selectedMedia.editorMeta?.overlayEffect || 'clean';
    const overlayOffsetX = Number((selectedMedia.editorMeta as any)?.overlayOffsetX || 0);
    const overlayOffsetY = Number((selectedMedia.editorMeta as any)?.overlayOffsetY || 0);
    const overlayScale = Number((selectedMedia.editorMeta as any)?.overlayScale || 1);
    const overlayRotation = Number((selectedMedia.editorMeta as any)?.overlayRotation || 0);
    const videoVolume = Number((selectedMedia.editorMeta as any)?.videoVolume ?? 1);
    const videoMuted = Boolean((selectedMedia.editorMeta as any)?.videoMuted ?? true);
    const overlayLayers = (selectedMedia.editorMeta as any)?.overlayLayers || [];
    const stagePreviewUri = selectedCover?.uri || selectedMedia.thumbnail || selectedMedia.uri;
    const overlayPositionStyle =
      overlayPosition === 'top'
        ? styles.editorOverlayTop
        : overlayPosition === 'bottom'
          ? styles.editorOverlayBottom
          : styles.editorOverlayCenter;

    const textContainerStyle =
      overlayBackground === 'black'
        ? { backgroundColor: 'rgba(0,0,0,0.82)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1 }
        : overlayBackground === 'white'
          ? { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(15,23,42,0.12)', borderWidth: 1 }
          : overlayBackground === 'glass'
            ? { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 }
            : { backgroundColor: 'transparent', borderWidth: 0 };

    const safeColor = overlayBackground === 'white' && (overlayColor === '#FFFFFF' || overlayColor === '#F8FAFC')
      ? '#0F172A'
      : overlayColor;

    const textShadowStyle =
      overlayEffect === 'glow'
        ? { textShadowColor: safeColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 }
        : overlayEffect === 'shadow'
          ? { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 12 }
          : { textShadowColor: 'rgba(0,0,0,0.32)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 };

    return (
      <View style={mode === 'stage' ? styles.mediaStageCard : styles.previewModalStage}>
        {selectedMedia.type === 'video' ? (
          mode === 'fullscreen' ? (
            <Video
              source={{ uri: selectedMedia.uri }}
              style={styles.mediaStageImage}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted={previewMuted || videoMuted}
              volume={(previewMuted || videoMuted) ? 0 : videoVolume}
              onError={(error) => console.warn('Preview video failed in glimpse create:', error)}
            />
          ) : (
            <Image source={{ uri: stagePreviewUri }} style={styles.mediaStageImage} contentFit="cover" />
          )
        ) : (
          <Image source={{ uri: selectedMedia.uri }} style={styles.mediaStageImage} contentFit="cover" />
        )}
        <LinearGradient
          colors={selectedStyle.gradient}
          style={[styles.mediaStyleOverlay, { opacity: selectedStyle.overlayOpacity }]}
        />
        {overlayLayers.map((layer: any) => (
          <View key={layer.id} style={[styles.editorOverlayAsset, { left: Number(layer.x || 0), top: Number(layer.y || 0), width: Number(layer.width || 120), height: Number(layer.height || 120), transform: [{ rotate: `${Number(layer.rotation || 0)}deg` }] }]} pointerEvents="none">
            {layer.assetUri ? (
              <Image source={{ uri: layer.assetUri }} style={styles.editorOverlayAssetImage} contentFit="cover" />
            ) : layer.content ? (
              <View style={styles.editorOverlaySticker}>
                <Text style={styles.editorOverlayStickerText}>{layer.content}</Text>
              </View>
            ) : null}
          </View>
        ))}
        {overlayText ? (
          <View style={[styles.editorOverlayTextWrap, overlayPositionStyle]} pointerEvents="none">
            <View style={[styles.editorOverlayShell, textContainerStyle, { transform: [{ translateX: overlayOffsetX }, { translateY: overlayOffsetY }, { scale: overlayScale }, { rotate: `${overlayRotation}deg` }] }]}>
              <Text style={[styles.editorOverlayText, { color: safeColor, textAlign: overlayAlign as any }, textShadowStyle]} numberOfLines={2}>{overlayText}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderEmptyState = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>New Glimpse</Text>
          <Text style={styles.subtitle}>Create and share.</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.emptyHero}>
        <View style={styles.emptyArtwork}>
          <Ionicons name="flash-outline" size={40} color="#FFFFFF" />
        </View>
        <Text style={styles.emptyTitle}>Create glimpse</Text>
        <Text style={styles.emptyBody}>Pick a photo or video, shape it in the editor, then publish.</Text>

        <View style={styles.emptyActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => pickMedia(false)}>
            <Ionicons name="images-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => pickMedia(true)}>
            <Ionicons name="camera-outline" size={18} color="#DCE7FF" />
            <Text style={styles.secondaryButtonText}>Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  if (!selectedMedia) {
    return renderEmptyState();
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>New Glimpse</Text>
            <Text style={styles.subtitle}>Polish, then share.</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.ghostPill} onPress={handleSaveDraft}>
              <Text style={styles.ghostPillText}>Draft</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryPill, uploading && styles.primaryPillDisabled]} onPress={handlePost} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.primaryPillText}>Share</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent as any} keyboardShouldPersistTaps="handled">
          <View style={styles.mediaStageSection}>
            <TouchableOpacity activeOpacity={0.94} onPress={() => setPreviewVisible(true)}>
              {renderMediaPreview('stage')}
              <View style={styles.mediaOverlayTop}>
                <View style={styles.mediaTypeBadge}>
                  <Text style={styles.mediaTypeText}>Glimpse</Text>
                </View>
                <View style={styles.mediaTopActions}>
                  {selectedMedia.type === 'video' ? (
                    <TouchableOpacity style={styles.overlayIconButton} onPress={() => setPreviewMuted((prev) => !prev)}>
                      <Ionicons name={previewMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.overlayIconButton} onPress={() => setEditorVisible(true)}>
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.mediaOverlayBottom}>
                <Text style={styles.mediaOverlayTitle}>Preview</Text>
                <Text style={styles.mediaOverlayHint}>Review the frame here, then edit only if you need to trim or style it.</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.mediaRail}>
              <TouchableOpacity style={styles.mediaRailButton} onPress={() => setEditorVisible(true)}>
                <Ionicons name="sparkles-outline" size={16} color="#8FB3FF" />
                <Text style={styles.mediaRailButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaRailButton} onPress={() => pickMedia(false)}>
                <Ionicons name="images-outline" size={16} color="#8FB3FF" />
                <Text style={styles.mediaRailButtonText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaRailButton} onPress={() => pickMedia(true)}>
                <Ionicons name="camera-outline" size={16} color="#8FB3FF" />
                <Text style={styles.mediaRailButtonText}>Camera</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Caption</Text>
            <Text style={styles.sectionHint}>Keep it direct. Mentions and hashtags work here.</Text>
            <View style={[styles.captionShell, captionError && styles.captionShellError]}>
              <TextInput
                ref={captionInputRef}
                style={styles.captionInput}
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
                placeholder="Write caption"
                placeholderTextColor="#6B7A97"
                multiline
                maxLength={280}
                textAlignVertical="top"
              />
              <Text style={[styles.counterText, captionError && styles.counterTextError]}>{caption.length}/280</Text>
            </View>
            {captionError ? <Text style={styles.captionErrorText}>Add a caption before sharing this glimpse.</Text> : null}
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

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Enhance</Text>
            <View style={styles.actionList}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowUserTagging(true)}>
                <View style={styles.actionIconWrap}>
                  <Ionicons name="person-add-outline" size={18} color="#8FB3FF" />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Tag people</Text>
                  <Text style={styles.actionSubtitle}>{taggedUsers.length ? `${taggedUsers.length} selected` : 'Attach people to this glimpse.'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#72839F" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={() => setShowCollaboratorTagging(true)}>
                <View style={styles.actionIconWrap}>
                  <Ionicons name="people-outline" size={18} color="#8FB3FF" />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Collaborators</Text>
                  <Text style={styles.actionSubtitle}>{collaborators.length ? `${collaborators.length} invited` : 'Send collaboration requests with this glimpse.'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#72839F" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={pickCoverImage}>
                <View style={styles.actionIconWrap}>
                  <Ionicons name="image-outline" size={18} color="#8FB3FF" />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Cover image</Text>
                  <Text style={styles.actionSubtitle}>{selectedCover ? (selectedCover.source === 'custom' ? 'Custom cover selected for feed and profile preview.' : 'Auto-generated cover ready for feed and profile preview.') : coverGenerating ? 'Generating a cover in the background.' : 'Choose a cleaner cover for the glimpse tile.'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#72839F" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={() => setShowMusicPicker(true)}>
                <View style={styles.actionIconWrap}>
                  <Ionicons name="musical-notes-outline" size={18} color="#8FB3FF" />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Music</Text>
                  <Text style={styles.actionSubtitle}>{selectedSong ? `${selectedSong.title} - ${selectedSong.artist || 'Unknown Artist'} - ${songClipStart}s to ${songClipEnd}s` : 'Attach soundtrack metadata.'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#72839F" />
              </TouchableOpacity>
            </View>
            {(selectedCover || coverGenerating) ? (
              <View style={styles.coverCard}>
                {selectedCover ? (
                  <Image source={{ uri: selectedCover.uri }} style={styles.coverPreview} contentFit="cover" />
                ) : (
                  <View style={[styles.coverPreview, styles.coverPreviewPlaceholder]}>
                    <ActivityIndicator size="small" color="#8FB3FF" />
                  </View>
                )}
                <View style={styles.coverMeta}>
                  <Text style={styles.coverTitle}>{coverGenerating && !selectedCover ? 'Generating cover' : selectedCover?.source === 'custom' ? 'Custom cover ready' : 'Auto cover ready'}</Text>
                  <Text style={styles.coverSubtitle}>{coverGenerating && !selectedCover ? 'We are preparing a cleaner frame for feed and profile tiles in the background.' : selectedCover?.source === 'custom' ? 'Compressed before upload for faster share and cleaner tiles.' : 'Generated from your media so the glimpse card already has a clean preview.'}</Text>
                </View>
                <TouchableOpacity onPress={restoreAutoCover} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                  <Ionicons name="refresh-circle" size={22} color="#93A2BE" />
                </TouchableOpacity>
              </View>
            ) : null}
            {renderSelectionChips(taggedUsers, removeUserTag)}
            {renderSelectionChips(collaborators, removeCollaborator)}

            {selectedSong ? (
              <View style={styles.musicCard}>
                <View style={styles.musicCardMeta}>
                  <Ionicons name="musical-note" size={16} color="#8FB3FF" />
                  <Text style={styles.musicCardTitle} numberOfLines={1}>{selectedSong.title}</Text>
                  <Text style={styles.musicCardArtist} numberOfLines={1}>{selectedSong.artist || 'Unknown Artist'} - {formatClipRange(songClipStart, songClipEnd)}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelectedSong(null); setSongClipStart(0); setSongClipEnd(20); }}>
                  <Ionicons name="close-circle" size={20} color="#93A2BE" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.manualMusicGrid}>
              <TextInput
                style={styles.inlineInput}
                value={musicTitle}
                onChangeText={setMusicTitle}
                placeholder="Track title"
                placeholderTextColor="#6B7A97"
                maxLength={60}
              />
              <TextInput
                style={styles.inlineInput}
                value={musicArtist}
                onChangeText={setMusicArtist}
                placeholder="Artist"
                placeholderTextColor="#6B7A97"
                maxLength={60}
              />
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Audience & controls</Text>
            <View style={styles.visibilityRow}>
              {(['public', 'followers', 'close_friends'] as const).map((option) => {
                const label = option === 'close_friends' ? 'Close Friends' : option === 'followers' ? 'Followers' : 'Public';
                const active = visibility === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.visibilityChip, active && styles.visibilityChipActive]}
                    onPress={() => setVisibility(option)}
                  >
                    <Text style={[styles.visibilityChipText, active && styles.visibilityChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
              {visibility === 'close_friends' ? (
                <TouchableOpacity
                  style={styles.visibilityManageButton}
                  onPress={openCloseFriendsManager}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Manage close friends"
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color="#DCE7FF" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.settingsList}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Allow comments</Text>
                  <Text style={styles.settingSubtitle}>People can comment on the glimpse.</Text>
                </View>
                <Switch value={allowComments} onValueChange={setAllowComments} />
              </View>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Allow sharing</Text>
                  <Text style={styles.settingSubtitle}>Others can reshare the glimpse.</Text>
                </View>
                <Switch value={allowSharing} onValueChange={setAllowSharing} />
              </View>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Hide like count</Text>
                  <Text style={styles.settingSubtitle}>Reactions stay private on the card.</Text>
                </View>
                <Switch value={hideLikes} onValueChange={setHideLikes} />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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

      <MusicPicker
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(song) => {
          setSelectedSong(song);
          setMusicTitle(song.title || '');
          setMusicArtist(song.artist || '');
          setSongClipStart(0);
          setSongClipEnd(Math.max(1, Math.min(song.duration || 20, 20)));
          setShowMusicPicker(false);
        }}
      />

      {previewVisible ? (
        <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setPreviewVisible(false)}>
          <SafeAreaView style={styles.previewModalContainer}>
            <View style={styles.previewModalHeader}>
              <TouchableOpacity style={styles.iconButton} onPress={() => setPreviewVisible(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.previewModalTitle}>Preview</Text>
              <TouchableOpacity style={styles.previewEditButton} onPress={() => { setPreviewVisible(false); setEditorVisible(true); }}>
                <Text style={styles.previewEditButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.previewModalBody}>{renderMediaPreview('fullscreen')}</View>
          </SafeAreaView>
        </Modal>
      ) : null}

      <NativeGlimpseEditor
        visible={editorVisible}
        mediaUri={selectedMedia.uri}
        mediaType={selectedMedia.type}
        initialMeta={selectedMedia.editorMeta}
        currentSong={selectedSong ? { title: selectedSong.title, artist: selectedSong.artist, duration: selectedSong.duration, clipStart: songClipStart, clipEnd: songClipEnd, streamUrl: selectedSong.streamUrl } : null}
        onClose={() => setEditorVisible(false)}
        onSave={handleEditorSave}
        onRequestReplace={() => { void handleReplaceMedia(); }}
        onRequestAddClip={() => { void handleAddClip(); }}
        onRequestMusic={() => setShowMusicPicker(true)}
        onMusicRangeChange={({ clipStart, clipEnd }) => {
          setSongClipStart(clipStart);
          setSongClipEnd(clipEnd);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#050B16' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#050B16',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleWrap: { flex: 1, marginHorizontal: spacing.md },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: '#8EA0BE',
  },
  headerSpacer: { width: 42 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ghostPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ghostPillText: {
    color: '#DCE7FF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  primaryPill: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: '#2563EB',
  },
  primaryPillDisabled: { opacity: 0.7 },
  primaryPillText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  mediaStageSection: { gap: spacing.md },
  mediaStageCard: {
    height: 500,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#09111F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewModalStage: {
    width: '100%',
    height: '82%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#09111F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mediaStageImage: { width: '100%', height: '100%' },
  mediaStyleOverlay: { ...StyleSheet.absoluteFillObject },
  editorOverlayAsset: { position: 'absolute', borderRadius: 16, overflow: 'hidden' },
  editorOverlayAssetImage: { width: '100%', height: '100%' },
  editorOverlaySticker: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorOverlayStickerText: { fontSize: 64, textAlign: 'center' },
  editorOverlayTextWrap: { position: 'absolute', left: 22, right: 22 },
  editorOverlayTop: { top: 74 },
  editorOverlayCenter: { top: '42%' },
  editorOverlayBottom: { bottom: 82 },
  editorOverlayText: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.36)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 18,
  },
  editorOverlayShell: {
    alignSelf: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '92%',
  },
  videoFallbackPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111B32',
    gap: 6,
  },
  videoFallbackText: {
    color: '#CBD5E1',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  mediaOverlayTop: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mediaTypeBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(8,15,28,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaTypeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
  },
  mediaTopActions: { flexDirection: 'row', gap: 10 },
  overlayIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,15,28,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaOverlayBottom: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(8,15,28,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaOverlayTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
  },
  mediaOverlayHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.74)',
    fontSize: typography.fontSize.sm,
  },
  mediaRail: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mediaRailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#09111F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mediaRailButtonText: {
    color: '#DCE7FF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  panel: {
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: '#09111F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
  },
  sectionHint: {
    color: '#7F8DA8',
    fontSize: typography.fontSize.sm,
    lineHeight: 19,
  },
  captionShell: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  captionShellError: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  captionInput: {
    minHeight: 116,
    maxHeight: 220,
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    lineHeight: 22,
  },
  counterText: {
    marginTop: 8,
    textAlign: 'right',
    color: '#7F8DA8',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
  counterTextError: { color: '#FCA5A5' },
  captionErrorText: {
    color: '#FCA5A5',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
  actionList: { gap: 10 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,124,255,0.12)',
    marginRight: 12,
  },
  actionCopy: { flex: 1, marginRight: 10 },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  actionSubtitle: {
    marginTop: 2,
    color: '#7F8DA8',
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
  },
  selectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  selectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(79,124,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(79,124,255,0.2)',
  },
  selectionChipText: {
    maxWidth: 150,
    color: '#DCE7FF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  coverCard: {
    marginTop: 4,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coverPreview: {
    width: 64,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#111B32',
  },
  coverPreviewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverMeta: { flex: 1 },
  coverTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  coverSubtitle: {
    marginTop: 4,
    color: '#7F8DA8',
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
  },
  musicCard: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  musicCardMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  musicCardTitle: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  musicCardArtist: { flexShrink: 1, color: '#7F8DA8', fontSize: typography.fontSize.xs },
  manualMusicGrid: { gap: 10 },
  inlineInput: {
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
  },
  visibilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  visibilityChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  visibilityChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  visibilityChipText: {
    color: '#DCE7FF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  visibilityChipTextActive: { color: '#FFFFFF' },
  visibilityManageButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.42)',
  },
  settingsList: { gap: 2 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 16,
  },
  settingCopy: { flex: 1 },
  settingTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  settingSubtitle: {
    marginTop: 2,
    color: '#7F8DA8',
    fontSize: typography.fontSize.xs,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,8,18,0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '78%',
    backgroundColor: '#09111F',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalSearchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalSearchInput: { flex: 1, color: '#FFFFFF', fontSize: typography.fontSize.sm },
  modalLoadingState: { paddingVertical: spacing.xl, alignItems: 'center' },
  modalList: { marginTop: spacing.md },
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalUserMeta: { flex: 1, marginLeft: 12, marginRight: 12 },
  modalUserName: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  modalUserDisplay: { marginTop: 2, color: '#7F8DA8', fontSize: typography.fontSize.xs },
  modalEmptyState: { paddingVertical: spacing.xl, alignItems: 'center' },
  modalEmptyText: { color: '#7F8DA8', fontSize: typography.fontSize.sm },
  emptyHero: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyArtwork: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,124,255,0.2)',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: typography.fontWeight.bold as any,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: spacing.sm,
    color: '#8EA0BE',
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  emptyActions: { width: '100%', gap: 12, marginTop: spacing.xl },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
  },
  secondaryButton: {
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#DCE7FF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
  previewModalContainer: { flex: 1, backgroundColor: '#040A16' },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  previewModalTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
  },
  previewEditButton: {
    minWidth: 76,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  previewEditButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold as any,
  },
  previewModalBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});











































