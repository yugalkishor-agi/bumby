import { InlineLoadingSkeleton, ButtonLoadingSkeleton } from '../components/ui/LoadingSkeleton';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Switch} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import { Avatar } from '../components/ui/Avatar';
import { MentionAutocomplete } from '../components/ui/MentionAutocomplete';
import { HashtagAutocomplete } from '../components/ui/HashtagAutocomplete';
import { NativePostImageEditor } from '../components/media/NativePostImageEditor';
import { PostMediaPreviewModal } from '../components/media/PostMediaPreviewModal';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { postService } from '../services/post.service';
import { mediaService } from '../services/media.service.native';
import { userService } from '../services/user.service';
import { draftService } from '../services/draft.service';
import { useAuth } from '../contexts/AuthContext';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');

export default function NewPostScreenEnhanced() {
  const route = useRoute<any>();
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<any[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [showUserTagging, setShowUserTagging] = useState(false);
  const [showCollaboratorTagging, setShowCollaboratorTagging] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [collaboratorSearchQuery, setCollaboratorSearchQuery] = useState('');
  const [collaboratorSearchResults, setCollaboratorSearchResults] = useState<any[]>([]);
  const [searchingCollaborators, setSearchingCollaborators] = useState(false);
  const [captionSelection, setCaptionSelection] = useState({ start: 0, end: 0 });
  const [activeMentionQuery, setActiveMentionQuery] = useState('');
  const [activeHashtagQuery, setActiveHashtagQuery] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [allowSharing, setAllowSharing] = useState(true);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(route.params?.draftId || null);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'close_friends'>('public');
  const [locationDraft, setLocationDraft] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);

  const normalizeVisibility = (value?: string): 'public' | 'followers' | 'close_friends' => {
    if (value === 'followers' || value === 'close_friends' || value === 'public') {
      return value;
    }
    if (value === 'closeFriends') {
      return 'close_friends';
    }
    return 'public';
  };
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const captionInputRef = useRef<TextInput>(null);

  const openCloseFriendsManager = () => {
    navigation.navigate('CloseFriends');
  };

  useEffect(() => {
    if (!user || !route.params?.draftId) return;
    const draft = draftService.getPostDraft(user.userId, route.params.draftId);
    if (!draft) return;

    setCaption(draft.caption || '');
    setLocation(draft.location || '');
    setAllowComments(draft.commentsEnabled ?? true);
    setHideLikeCount(draft.hideLikesCount ?? false);
    setAllowSharing((draft as any).allowSharing ?? true);
    setVisibility(normalizeVisibility((draft as any).audience));

    const draftMediaItems = Array.isArray((draft as any).mediaItems)
      ? (draft as any).mediaItems.filter((item: any) => !!item?.uri)
      : [];

    if (draftMediaItems.length > 0) {
      setSelectedMedia(draftMediaItems);
    } else if (draft.mediaURL) {
      setSelectedMedia([
        {
          uri: draft.mediaURL,
          thumbnail: draft.mediaURL,
          type: draft.mediaType || 'image',
          width: 1,
          height: 1,
        },
      ]);
    }
  }, [route.params, user]);

  const generateVideoThumbnail = async (videoUri: string): Promise<string> => {
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 1000,
        quality: 0.6,
      });
      return uri;
    } catch (error) {
      console.warn('Video thumbnail generation failed, using source URI', error);
      return videoUri;
    }
  };

  const pickMedia = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to select media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets) {
        const mediaItems = await Promise.all(
          result.assets.map(async (asset) => {
            let thumbnail = asset.uri;
            if (asset.type === 'video') {
              thumbnail = await generateVideoThumbnail(asset.uri);
            }

            return {
              uri: asset.uri,
              type: asset.type || 'image',
              width: asset.width,
              height: asset.height,
              duration: asset.duration,
              thumbnail,
            };
          })
        );

        setSelectedMedia((prev) => {
          if (!prev.length) return mediaItems;
          return [...prev, ...mediaItems];
        });
      }
    } catch (error) {
      console.error('Error picking media:', error);
      Alert.alert('Error', 'Failed to select media');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        let thumbnail = asset.uri;
        if (asset.type === 'video') {
          thumbnail = await generateVideoThumbnail(asset.uri);
        }

        setSelectedMedia((prev) => [
          ...prev,
          {
            uri: asset.uri,
            type: asset.type || 'image',
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
            thumbnail,
          },
        ]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

    const detectActiveCaptionToken = (text: string, cursor: number) => {
    const safeCursor = Math.max(0, Math.min(cursor, text.length));
    const beforeCursor = text.slice(0, safeCursor);
    const match = beforeCursor.match(/(^|\s)([@#][a-zA-Z0-9_]*)$/);

    if (!match) {
      return null;
    }

    const token = match[2] || '';
    const start = safeCursor - token.length;
    const type = token.startsWith('@') ? 'mention' : token.startsWith('#') ? 'hashtag' : null;

    if (!type) return null;

    return {
      type,
      token,
      start,
      end: safeCursor,
      query: token.slice(1),
    };
  };

  const syncCaptionAutocomplete = (nextText: string, cursor: number) => {
    const tokenData = detectActiveCaptionToken(nextText, cursor);

    if (!tokenData) {
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
    if (!tokenData) return;

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
    setResults: (results: any[]) => void
  ) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const results = await userService.searchUsers(query, 20);
      const filtered = results.filter((u: any) => {
        if (!u?.userId || u.userId === user?.userId) return false;
        return !excludedUserIds.includes(u.userId);
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
    await searchUsersForPicker(
      query,
      taggedUsers.map((u) => u.userId),
      setSearchingUsers,
      setUserSearchResults
    );
  };

  const searchCollaborators = async (query: string) => {
    await searchUsersForPicker(
      query,
      collaborators.map((u) => u.userId),
      setSearchingCollaborators,
      setCollaboratorSearchResults
    );
  };

  const handleUserTag = (userData: any) => {
    setTaggedUsers((prev) => [...prev, userData]);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setShowUserTagging(false);
  };

  const handleCollaboratorTag = (userData: any) => {
    setCollaborators((prev) => [...prev, userData]);
    setCollaboratorSearchQuery('');
    setCollaboratorSearchResults([]);
    setShowCollaboratorTagging(false);
  };

  const removeUserTag = (userId: string) => {
    setTaggedUsers((prev) => prev.filter((taggedUser) => taggedUser.userId !== userId));
  };

  const removeCollaborator = (userId: string) => {
    setCollaborators((prev) => prev.filter((collaborator) => collaborator.userId !== userId));
  };

  const extractHashtags = (text: string): string[] => {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const tags = new Set<string>();
    let match: RegExpExecArray | null = null;

    while ((match = hashtagRegex.exec(text)) !== null) {
      if (match[1]) {
        tags.add(match[1].toLowerCase());
      }
    }

    return Array.from(tags);
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const mentions = new Set<string>();
    let match: RegExpExecArray | null = null;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match[1]) {
        mentions.add(match[1].toLowerCase());
      }
    }

    return Array.from(mentions);
  };

  const handleShare = async () => {
    if (!user || selectedMedia.length === 0 || !caption.trim()) {
      Alert.alert('Missing information', 'Please add media and a caption');
      return;
    }

    setIsPosting(true);
    let uploadedMediaURLs: string[] = [];

    try {
      const postId = postService.generatePostId();

      // Upload media using picker assets directly (native-safe)
      const { mediaURLs, thumbnailURL } = await mediaService.uploadPostMedia(user.userId, postId, selectedMedia);
      uploadedMediaURLs = mediaURLs;

      // Extract hashtags and mentions
      const hashtags = extractHashtags(caption);
      const mentions = extractMentions(caption);

      // Create post
      await postService.createPostWithId(postId, {
        authorId: user.userId,
        authorUsername: user.username,
        authorAvatarURL: user.avatarURL || '',
        caption: caption.trim(),
        mediaURLs,
        mediaType: selectedMedia[0].type === 'video' ? 'video' : 'image',
        thumbnailURL,
        postType:
          selectedMedia.length > 1
            ? 'carousel'
            : selectedMedia[0].type === 'video'
              ? 'video'
              : 'image',
        aspectRatio: selectedMedia[0].width / selectedMedia[0].height,
        location: location.trim() || undefined,
        tags: hashtags,
        mentions,
        taggedUsers:
          taggedUsers.length > 0
            ? taggedUsers.map((taggedUser) => ({
                userId: taggedUser.userId,
                username: taggedUser.username,
                x: 0.5,
                y: 0.5,
              }))
            : undefined,
        collaborators:
          collaborators.length > 0
            ? collaborators.map((collaborator) => ({
                userId: collaborator.userId,
                username: collaborator.username,
                displayName: collaborator.displayName,
                avatarURL: collaborator.avatarURL,
              }))
            : undefined,
        commentsEnabled: allowComments,
        hideLikesCount: hideLikeCount,
        allowSharing,
        audience: visibility,
      });

      if (activeDraftId) {
        draftService.deletePostDraft(user.userId, activeDraftId);
        setActiveDraftId(null);
      }

      Alert.alert('Success', 'Your post has been shared!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Failed to create post:', error);
      if (uploadedMediaURLs.length > 0) {
        await mediaService.deletePostMedia(uploadedMediaURLs);
      }
      Alert.alert('Error', error?.message || 'Failed to create post');
    } finally {
      setIsPosting(false);
    }
  };

  const handleSaveDraft = () => {
    if (!user) return;
    const hasData = selectedMedia.length > 0 || !!caption.trim();
    if (!hasData) {
      Alert.alert('Nothing to save', 'Add media or caption before saving draft.');
      return;
    }

    const payload = {
      caption: caption.trim(),
      mediaURL: selectedMedia[0]?.uri,
      mediaType: selectedMedia[0]?.type === 'video' ? 'video' : 'image',
      mediaItems: selectedMedia.map((media) => ({
        uri: media.uri,
        thumbnail: media.thumbnail,
        type: media.type,
        width: media.width,
        height: media.height,
        duration: media.duration,
        editedAt: media.editedAt,
      })),
      location: location.trim() || undefined,
      commentsEnabled: allowComments,
      hideLikesCount: hideLikeCount,
      allowSharing,
      audience: visibility,
    };

    if (activeDraftId) {
      draftService.updatePostDraft(user.userId, activeDraftId, payload as any);
      Alert.alert('Saved', 'Draft updated successfully.');
      return;
    }

    const saved = draftService.savePostDraft(user.userId, payload as any);
    setActiveDraftId(saved.id);
    Alert.alert('Saved', 'Draft saved successfully.');
  };
  const showMediaPicker = () => {
    Alert.alert(
      'Select Media',
      'Choose how you want to add media',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Gallery', onPress: pickMedia },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };
  const openMediaPreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewVisible(true);
  };
  const openMediaEditor = (index: number) => {
    setPreviewVisible(false);
    const targetMedia = selectedMedia[index];
    if (!targetMedia) return;
    if (targetMedia.type === 'video') {
      Alert.alert('Not available', 'Video editor is not enabled in this post flow yet.');
      return;
    }
    setEditorIndex(index);
    setEditorVisible(true);
  };
  const handleEditorSave = async (editedImageUri: string) => {
    if (editorIndex === null) {
      setEditorVisible(false);
      return;
    }
    try {
      setSelectedMedia((prev) =>
        prev.map((media, index) =>
          index === editorIndex
            ? {
                ...media,
                uri: editedImageUri,
                thumbnail: editedImageUri,
                editedAt: Date.now(),
              }
            : media
        )
      );
      setPreviewIndex(editorIndex);
    } catch (error) {
      console.error('Native post editor save failed:', error);
      Alert.alert('Error', 'Failed to save your edit. Please try again.');
    } finally {
      setEditorVisible(false);
      setEditorIndex(null);
    }
  };
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Post</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleSaveDraft}
              style={styles.saveDraftButton}
            >
              <Text style={styles.saveDraftButtonText}>Draft</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              disabled={isPosting || selectedMedia.length === 0 || !caption.trim()}
              style={[
                styles.shareButton,
                (isPosting || selectedMedia.length === 0 || !caption.trim()) && styles.shareButtonDisabled
              ]}
            >
              {isPosting ? (
                <InlineLoadingSkeleton />
              ) : (
                <Text style={styles.shareButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* User Info */}
          <View style={styles.userSection}>
            <Avatar source={user?.avatarURL} size={48} />
            <View style={styles.userInfo}>
              <Text style={styles.username}>{user?.username}</Text>
              <Text style={styles.displayName}>{user?.displayName}</Text>
            </View>
          </View>

          {/* Media Section */}
          {selectedMedia.length > 0 ? (
            <View style={styles.mediaSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRail as any}>
                {selectedMedia.map((media, index) => (
                  <View key={index} style={styles.mediaItem}>
                    <TouchableOpacity activeOpacity={0.92} onPress={() => openMediaPreview(index)}>
                      <Image source={{ uri: media.thumbnail || media.uri }} style={styles.mediaImage} />
                      {media.editedAt ? (
                        <View style={styles.mediaEditedBadge}>
                          <Ionicons name="sparkles" size={12} color="#0B1020" />
                          <Text style={styles.mediaEditedBadgeText}>Edited</Text>
                        </View>
                      ) : null}
                      {media.type === 'video' && (
                        <View style={styles.videoOverlay}>
                          <Ionicons name="play" size={24} color="white" />
                          {media.duration && (
                            <Text style={styles.videoDuration}>
                              {Math.floor(media.duration / 1000)}s
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                    {media.type !== 'video' ? (
                      <TouchableOpacity
                        style={styles.editMediaButton}
                        onPress={() => openMediaEditor(index)}
                      >
                        <Ionicons name="create-outline" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => setSelectedMedia(prev => prev.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addMediaButton} onPress={showMediaPicker}>
                  <Ionicons name="add" size={24} color={colors.text.secondary} />
                  <Text style={styles.addMediaLabel}>Add more</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : (
            <TouchableOpacity style={styles.mediaPlaceholder} onPress={showMediaPicker}>
              <Ionicons name="camera" size={48} color={colors.text.secondary} />
              <Text style={styles.mediaPlaceholderText}>Add photos or videos</Text>
              <Text style={styles.mediaPlaceholderSubtext}>Tap to select from gallery or take a photo</Text>
            </TouchableOpacity>
          )}

          {/* Caption */}
          <View style={styles.captionSection}>
            <TextInput
              ref={captionInputRef}
              style={styles.captionInput}
              placeholder="Write a caption... Use @mention and #hashtags"
              placeholderTextColor={colors.text.secondary}
              value={caption}
              onChangeText={(text) => {
                setCaption(text);
                syncCaptionAutocomplete(text, captionSelection.start);
              }}
              onSelectionChange={(event) => {
                const nextSelection = event.nativeEvent.selection;
                setCaptionSelection(nextSelection);
                syncCaptionAutocomplete(caption, nextSelection.start);
              }}
              multiline
              maxLength={2200}
              textAlignVertical="top"
            />

            <MentionAutocomplete
              query={activeMentionQuery}
              visible={activeMentionQuery.length > 0}
              onSelect={(mentionedUser) => {
                replaceActiveCaptionToken('@', mentionedUser.username);
              }}
              maxResults={6}
            />
            <HashtagAutocomplete
              query={activeHashtagQuery}
              visible={activeHashtagQuery.length > 0}
              onSelect={(hashtag) => {
                replaceActiveCaptionToken('#', hashtag);
              }}
              maxResults={6}
            />

            <Text style={styles.characterCount}>{caption.length}/2200</Text>
          </View>

          {/* Location */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => {
              setLocationDraft(location);
              setShowLocationSearch(true);
            }}
          >
            <Ionicons name="location-outline" size={24} color={colors.text.secondary} />
            <Text style={styles.optionText}>
              {location || 'Add location'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Tag People */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => setShowUserTagging(true)}
          >
            <Ionicons name="person-outline" size={24} color={colors.text.secondary} />
            <Text style={styles.optionText}>
              {taggedUsers.length > 0
                ? `Tagged ${taggedUsers.length} people`
                : 'Tag people'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Collaborators */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => setShowCollaboratorTagging(true)}
          >
            <Ionicons name="people-outline" size={24} color={colors.text.secondary} />
            <Text style={styles.optionText}>
              {collaborators.length > 0
                ? `Collaborators ${collaborators.length}`
                : 'Add collaborators'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Tagged Users */}
          {taggedUsers.length > 0 && (
            <View style={styles.taggedUsersSection}>
              <Text style={styles.taggedUsersTitle}>Tagged people:</Text>
              {taggedUsers.map((taggedUser) => (
                <View key={taggedUser.userId} style={styles.taggedUser}>
                  <Avatar source={taggedUser.avatarURL} size={32} />
                  <Text style={styles.taggedUserName}>{taggedUser.username}</Text>
                  <TouchableOpacity onPress={() => removeUserTag(taggedUser.userId)}>
                    <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Collaborators preview */}
          {collaborators.length > 0 && (
            <View style={styles.taggedUsersSection}>
              <Text style={styles.taggedUsersTitle}>Collaboration requests:</Text>
              {collaborators.map((collaborator) => (
                <View key={collaborator.userId} style={styles.taggedUser}>
                  <Avatar source={collaborator.avatarURL} size={32} />
                  <Text style={styles.taggedUserName}>{collaborator.username}</Text>
                  <TouchableOpacity onPress={() => removeCollaborator(collaborator.userId)}>
                    <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Advanced Options */}
          <View style={styles.advancedSection}>
            <Text style={styles.sectionTitle}>Advanced settings</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="earth-outline" size={20} color={colors.text.secondary} />
                <Text style={styles.settingText}>Who can see this post</Text>
              </View>
            </View>
            <View style={styles.visibilityRow}>
              <TouchableOpacity
                style={[styles.visibilityChip, visibility === 'public' && styles.visibilityChipActive]}
                onPress={() => setVisibility('public')}
              >
                <Text style={[styles.visibilityChipText, visibility === 'public' && styles.visibilityChipTextActive]}>
                  Public
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityChip, visibility === 'followers' && styles.visibilityChipActive]}
                onPress={() => setVisibility('followers')}
              >
                <Text style={[styles.visibilityChipText, visibility === 'followers' && styles.visibilityChipTextActive]}>
                  Followers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visibilityChip, visibility === 'close_friends' && styles.visibilityChipActive]}
                onPress={() => setVisibility('close_friends')}
              >
                <Text style={[styles.visibilityChipText, visibility === 'close_friends' && styles.visibilityChipTextActive]}>
                  Close Friends
                </Text>
              </TouchableOpacity>
              {visibility === 'close_friends' ? (
                <TouchableOpacity
                  style={styles.visibilityManageButton}
                  onPress={openCloseFriendsManager}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Manage close friends"
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="chatbubbles-outline" size={20} color={colors.text.secondary} />
                <Text style={styles.settingText}>Allow comments</Text>
              </View>
              <Switch value={allowComments} onValueChange={setAllowComments} />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="heart-dislike-outline" size={20} color={colors.text.secondary} />
                <Text style={styles.settingText}>Hide like count</Text>
              </View>
              <Switch value={hideLikeCount} onValueChange={setHideLikeCount} />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="paper-plane-outline" size={20} color={colors.text.secondary} />
                <Text style={styles.settingText}>Allow resharing</Text>
              </View>
              <Switch value={allowSharing} onValueChange={setAllowSharing} />
            </View>
          </View>
        </ScrollView>
        <PostMediaPreviewModal
          visible={previewVisible}
          mediaItems={selectedMedia}
          initialIndex={previewIndex}
          onClose={() => setPreviewVisible(false)}
          onEdit={openMediaEditor}
          onIndexChange={setPreviewIndex}
        />
        {editorVisible && editorIndex !== null && selectedMedia[editorIndex] ? (
          <NativePostImageEditor
            visible={editorVisible}
            imageUri={selectedMedia[editorIndex].uri}
            onClose={() => {
              setEditorVisible(false);
              setEditorIndex(null);
            }}
            onSave={handleEditorSave}
          />
        ) : null}

        {/* Location Modal */}
        {showLocationSearch && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add location</Text>
                <TouchableOpacity onPress={() => setShowLocationSearch(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalSearchContainer}>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Type location..."
                  placeholderTextColor={colors.text.secondary}
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  autoFocus
                />
                <View style={styles.locationActions}>
                  <TouchableOpacity
                    style={[styles.locationActionBtn, styles.locationActionGhost]}
                    onPress={() => {
                      setLocation('');
                      setShowLocationSearch(false);
                    }}
                  >
                    <Text style={styles.locationActionGhostText}>Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.locationActionBtn}
                    onPress={() => {
                      setLocation(locationDraft.trim());
                      setShowLocationSearch(false);
                    }}
                  >
                    <Text style={styles.locationActionPrimaryText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

                {/* User Tagging Modal */}
        {showUserTagging && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tag People</Text>
                <TouchableOpacity onPress={() => setShowUserTagging(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalSearchContainer}>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search people..."
                  placeholderTextColor={colors.text.secondary}
                  value={userSearchQuery}
                  onChangeText={(text) => {
                    setUserSearchQuery(text);
                    searchUsers(text);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              {searchingUsers ? (
                <View style={styles.modalLoadingContainer}>
                  <InlineLoadingSkeleton />
                </View>
              ) : (
                <ScrollView style={styles.userSearchList}>
                  {userSearchResults.map((userData) => (
                    <TouchableOpacity
                      key={userData.userId}
                      style={styles.userSearchResult}
                      onPress={() => handleUserTag(userData)}
                    >
                      <Avatar source={userData.avatarURL} size={48} />
                      <View style={styles.userSearchInfo}>
                        <Text style={styles.userSearchName}>{userData.username}</Text>
                        <Text style={styles.userSearchDisplayName}>{userData.displayName}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* Collaborator Modal */}
        {showCollaboratorTagging && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Collaborator</Text>
                <TouchableOpacity onPress={() => setShowCollaboratorTagging(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalSearchContainer}>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search collaborators..."
                  placeholderTextColor={colors.text.secondary}
                  value={collaboratorSearchQuery}
                  onChangeText={(text) => {
                    setCollaboratorSearchQuery(text);
                    searchCollaborators(text);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              {searchingCollaborators ? (
                <View style={styles.modalLoadingContainer}>
                  <InlineLoadingSkeleton />
                </View>
              ) : (
                <ScrollView style={styles.userSearchList}>
                  {collaboratorSearchResults.map((userData) => (
                    <TouchableOpacity
                      key={userData.userId}
                      style={styles.userSearchResult}
                      onPress={() => handleCollaboratorTag(userData)}
                    >
                      <Avatar source={userData.avatarURL} size={48} />
                      <View style={styles.userSearchInfo}>
                        <Text style={styles.userSearchName}>{userData.username}</Text>
                        <Text style={styles.userSearchDisplayName}>{userData.displayName}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  shareButton: {
    backgroundColor: '#2F80FF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 68,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  shareButtonDisabled: {
    backgroundColor: 'rgba(47,128,255,0.28)',
    borderColor: 'transparent',
  },
  shareButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.inverse,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saveDraftButton: {
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  saveDraftButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  content: {
    flex: 1,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  displayName: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  mediaSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  mediaRail: {
    paddingRight: spacing.lg,
  },
  mediaItem: {
    position: 'relative',
    marginRight: spacing.md,
  },
  mediaImage: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
  },
  mediaPreviewShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 46,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    backgroundColor: 'rgba(7, 10, 18, 0.52)',
  },
  mediaPreviewPill: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaPreviewPillText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
  },
  mediaEditedBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: '#FDE68A',
  },
  mediaEditedBadgeText: {
    color: '#0B1020',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold as any,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    color: 'white',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
  },
  editMediaButton: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(12,16,28,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  previewModal: {
    flex: 1,
    backgroundColor: '#050816',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.xl : spacing.lg,
    paddingBottom: spacing.md,
  },
  previewHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  previewHeaderButtonSpacer: {
    width: 40,
    height: 40,
  },
  previewHeaderTitle: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
  previewCarousel: {
    flex: 1,
  },
  previewSlide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  previewImage: {
    width: width - spacing.xl,
    height: height * 0.66,
    borderRadius: borderRadius.xl,
    backgroundColor: '#0E1327',
  },
  previewVideoBadge: {
    position: 'absolute',
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(7,10,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  previewVideoBadgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  previewFooter: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  previewThumbRail: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  previewThumb: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  previewThumbActive: {
    borderColor: colors.interactive.primary,
  },
  previewThumbImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background.secondary,
  },
  removeMediaButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: borderRadius.full,
  },
  addMediaButton: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  addMediaLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium as any,
  },
  mediaPlaceholder: {
    margin: spacing.lg,
    padding: spacing.xxl,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlaceholderText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginTop: spacing.md,
  },
  mediaPlaceholderSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  captionSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  captionInput: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
    paddingVertical: spacing.md,
  },
  characterCount: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  optionText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  taggedUsersSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  taggedUsersTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  taggedUser: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  taggedUserName: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  advancedSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.secondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  visibilityChip: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background.secondary,
  },
  visibilityChipActive: {
    backgroundColor: colors.interactive.primary,
    borderColor: colors.interactive.primary,
  },
  visibilityChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium as any,
  },
  visibilityChipTextActive: {
    color: colors.text.inverse,
  },
  visibilityManageButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(59,130,246,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.46)',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  modalSearchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalSearchInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  locationActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  locationActionBtn: {
    backgroundColor: colors.interactive.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  locationActionPrimaryText: {
    color: colors.text.inverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },
  locationActionGhost: {
    backgroundColor: colors.background.secondary,
  },
  locationActionGhostText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
  },
  modalLoadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  userSearchList: {
    flex: 1,
  },
  userSearchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  userSearchInfo: {
    flex: 1,
  },
  userSearchName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
  },
  userSearchDisplayName: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
});









































