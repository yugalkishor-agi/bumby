import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { Avatar } from '../ui/Avatar';
import { CachedImage } from '../ui/CachedImage';

interface SharedContentMessageProps {
  sharedContent: {
    type: 'post' | 'glimpse' | 'story';
    contentId?: string;
    id?: string;
    authorId?: string;
    username?: string;
    authorUsername?: string;
    authorAvatarURL?: string;
    coverImage?: string;
    coverImageURL?: string;
    caption?: string;
    mediaType?: 'image' | 'video';
    verified?: boolean;
    authorVerified?: boolean;
    isVerified?: boolean;
  };
  message?: string;
  contextLabel?: string;
  collaboration?: {
    status?: 'pending' | 'accepted' | 'rejected';
    canRespond?: boolean;
  };
  onAccept?: () => void;
  onDecline?: () => void;
}

export function SharedContentMessage({ sharedContent, message, contextLabel, collaboration, onAccept, onDecline }: SharedContentMessageProps) {
  const navigation = useNavigation();
  const content = sharedContent as any;

  const contentId = content.contentId || content.id || content.postId || content.glimpseId || content.storyId || '';
  const authorUsername = content.username || content.authorUsername || content.author?.username || 'user';
  const coverImage =
    content.coverImage ||
    content.coverImageURL ||
    content.thumbnailURL ||
    content.thumbnail ||
    content.posterURL ||
    content.posterUrl ||
    content.mediaURL ||
    content.mediaUrl ||
    content.imageURL ||
    content.imageUrl ||
    content.previewImage ||
    content.previewImageURL ||
    content.media?.url ||
    content.cover?.url ||
    content.asset?.url ||
    (Array.isArray(content.mediaURLs) ? content.mediaURLs[0] : '') ||
    (Array.isArray(content.assets) ? content.assets[0]?.url : '') ||
    '';
  const isVerified = Boolean(content.verified ?? content.authorVerified ?? content.isVerified);
  const isPlayable = content.mediaType === 'video' || content.type === 'glimpse';
  const isPost = content.type === 'post';
  const collaborationStatus = collaboration?.status || 'pending';
  const showCollabActions = collaboration?.canRespond && collaborationStatus === 'pending';
  const collabStatusLabel = collaborationStatus === 'accepted'
    ? 'Collaboration accepted'
    : collaborationStatus === 'rejected'
      ? 'Collaboration declined'
      : 'Collaboration request';
  const trimmedMessage = (message || '').trim();
  const trimmedContextLabel = (contextLabel || '').trim();
  const hideSystemMessage = /^sent you a post collaboration request$/i.test(trimmedMessage);
  const captionText = (content.caption || '').trim();

  const handleAuthorPress = (event?: any) => {
    event?.stopPropagation?.();
    if (!content.authorId && !authorUsername) return;
    (navigation as any).navigate('UserProfile', {
      userId: content.authorId,
      username: authorUsername,
    });
  };

  const handlePress = () => {
    if (content.type === 'post') {
      (navigation as any).navigate('PostView', { postId: contentId });
      return;
    }
    if (content.type === 'glimpse') {
      (navigation as any).navigate('GlimpseViewer', { glimpseId: contentId, id: contentId });
      return;
    }
    if (content.type === 'story') {
      (navigation as any).navigate('StoryViewerEnhanced', { userId: content.authorId });
    }
  };

  return (
    <View style={[styles.container, isPost && styles.postContainer]}>
      {!!trimmedContextLabel ? <Text style={styles.contextText}>{trimmedContextLabel}</Text> : null}
      {!!trimmedMessage && !hideSystemMessage ? <Text style={styles.messageText}>{trimmedMessage}</Text> : null}

      <TouchableOpacity onPress={handlePress} style={[styles.card, isPost && styles.postCard]} activeOpacity={0.92}>
        <View style={styles.headerRow}>
          <View style={styles.headerAuthorWrap}>
            <TouchableOpacity style={styles.authorPressArea} onPress={handleAuthorPress} activeOpacity={0.8}>
              <Avatar source={content.authorAvatarURL} size={30} style={styles.authorAvatar} />
              <View style={styles.authorMeta}>
                <View style={styles.authorRow}>
                  <Text style={styles.authorName} numberOfLines={1}>{authorUsername}</Text>
                  {isVerified ? <VerifiedBadge size={12} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.typeBadge}>
            <Ionicons
              name={isPost ? 'copy-outline' : isPlayable ? 'play-circle-outline' : 'albums-outline'}
              size={16}
              color="#dbe7ff"
            />
          </View>
        </View>

        <View style={[styles.previewWrap, isPost && styles.postPreviewWrap]}>
          {coverImage ? (
            <CachedImage uri={coverImage} style={styles.posterImage} resizeMode="cover" />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name={isPlayable ? 'play' : 'image-outline'} size={26} color="#ffffff" />
            </View>
          )}
          {isPlayable ? (
            <View style={styles.playBadge} pointerEvents="none">
              <Ionicons name="play" size={12} color="#111827" />
            </View>
          ) : null}
        </View>

        <View style={styles.captionWrap}>
          <Text style={styles.captionText} numberOfLines={2}>
            <Text style={styles.captionUser}>{authorUsername} </Text>
            {captionText.length > 0 ? captionText : 'shared a post'}
          </Text>
        </View>
      </TouchableOpacity>

      {showCollabActions ? (
        <View style={styles.collabActions}>
          <TouchableOpacity style={[styles.collabButton, styles.collabDecline]} onPress={onDecline} activeOpacity={0.85}>
            <Text style={styles.collabDeclineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.collabButton, styles.collabAccept]} onPress={onAccept} activeOpacity={0.85}>
            <Text style={styles.collabAcceptText}>Accept</Text>
          </TouchableOpacity>
        </View>
      ) : collaboration ? (
        <View style={styles.collabStatusRow}>
          <Ionicons
            name={collaborationStatus === 'accepted' ? 'checkmark-circle' : collaborationStatus === 'rejected' ? 'close-circle' : 'time-outline'}
            size={14}
            color={collaborationStatus === 'accepted' ? '#34D399' : collaborationStatus === 'rejected' ? '#F87171' : '#C0D8FF'}
          />
          <Text style={styles.collabStatusText}>{collabStatusLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 238,
    maxWidth: 238,
  },
  postContainer: {
    width: 254,
    maxWidth: 254,
  },
  contextText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#cddcff',
    marginBottom: 4,
    paddingHorizontal: 2,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 17,
    color: '#e5edf8',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  postCard: {
    borderRadius: 20,
  },
  headerRow: {
    minHeight: 40,
    backgroundColor: 'rgba(8, 15, 30, 0.28)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAuthorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  authorPressArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  previewWrap: {
    width: '100%',
    aspectRatio: 4 / 4.6,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  postPreviewWrap: {
    aspectRatio: 4 / 4.85,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatar: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#182236',
  },
  authorMeta: {
    marginLeft: 8,
    flexShrink: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    color: '#f8fbff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  playBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  captionWrap: {
    backgroundColor: 'rgba(8, 15, 30, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  captionText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#e5edf8',
  },
  captionUser: {
    fontWeight: '700',
    color: '#ffffff',
  },
  collabActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  collabButton: {
    flex: 1,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collabAccept: {
    backgroundColor: '#2F6BFF',
  },
  collabDecline: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(8,16,34,0.45)',
  },
  collabAcceptText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  collabDeclineText: {
    color: '#dbe7ff',
    fontSize: 12,
    fontWeight: '700',
  },
  collabStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  collabStatusText: {
    fontSize: 12,
    color: '#dbe7ff',
  },
});





