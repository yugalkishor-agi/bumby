import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
  onSnapshot,
  Unsubscribe,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { supabase } from '../config/supabase';
import type { Story } from '../types/database';
import { likeService, type LikeLookupItem } from './like.service';
import { cacheIntegration } from './cacheIntegration.service';
import { imageCacheService } from './imageCache.service';
import { normalizeOverlayLayers } from '../utils/glimpseEditor';

function extractTaggedUserIds(taggedUsers?: Array<{ userId?: string; username?: string }>) {
  const ids = (taggedUsers || [])
    .map((item) => (item?.userId ? String(item.userId) : ''))
    .filter(Boolean);
  return Array.from(new Set(ids));
}
function sanitizeTaggedUsers(list?: Array<{ userId?: string; username?: string }>) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => !!item?.userId && !!item?.username)
    .map((item) => ({
      userId: String(item!.userId),
      username: String(item!.username),
    }));
}

function sanitizeVoiceSegments(segments?: Array<{ id?: string; uri?: string; startMs?: number; durationMs?: number; label?: string }>) {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((segment) => !!segment?.id && !!segment?.uri)
    .map((segment) => {
      const clean: any = {
        id: String(segment!.id),
        uri: String(segment!.uri),
        startMs: Math.max(0, Math.round(Number(segment!.startMs || 0))),
        durationMs: Math.max(0, Math.round(Number(segment!.durationMs || 0))),
      };
      if (segment?.label) clean.label = String(segment.label);
      return clean;
    });
}

function sanitizeEditorMeta(meta?: {
  styleId?: string;
  overlayText?: string;
  overlayPosition?: string;
  overlayAlign?: string;
  overlayColor?: string;
  overlayBackground?: string;
  overlayFont?: string;
  overlayEffect?: string;
  overlayAnimation?: string;
  overlayOffsetX?: number;
  overlayOffsetY?: number;
  overlayScale?: number;
  overlayRotation?: number;
  splitAt?: number;
  trimStart?: number;
  trimEnd?: number;
  videoMuted?: boolean;
  videoVolume?: number;
  voiceSegments?: Array<any>;
  overlayLayers?: Array<any>;
}) {
  if (!meta) return null;

  const clean: any = {};
  if (meta.styleId) clean.styleId = meta.styleId;
  if (typeof meta.overlayText === 'string') clean.overlayText = meta.overlayText;
  if (meta.overlayPosition) clean.overlayPosition = meta.overlayPosition;
  if (meta.overlayAlign) clean.overlayAlign = meta.overlayAlign;
  if (meta.overlayColor) clean.overlayColor = meta.overlayColor;
  if (meta.overlayBackground) clean.overlayBackground = meta.overlayBackground;
  if (meta.overlayFont) clean.overlayFont = meta.overlayFont;
  if (meta.overlayEffect) clean.overlayEffect = meta.overlayEffect;
  if (meta.overlayAnimation) clean.overlayAnimation = meta.overlayAnimation;
  if (typeof meta.overlayOffsetX === 'number') clean.overlayOffsetX = Math.round(meta.overlayOffsetX);
  if (typeof meta.overlayOffsetY === 'number') clean.overlayOffsetY = Math.round(meta.overlayOffsetY);
  if (typeof meta.overlayScale === 'number') clean.overlayScale = Number(meta.overlayScale.toFixed(2));
  if (typeof meta.overlayRotation === 'number') clean.overlayRotation = Math.round(meta.overlayRotation);
  if (typeof meta.splitAt === 'number') clean.splitAt = Math.round(meta.splitAt);
  if (typeof meta.trimStart === 'number') clean.trimStart = Math.round(meta.trimStart);
  if (typeof meta.trimEnd === 'number') clean.trimEnd = Math.round(meta.trimEnd);
  if (typeof meta.videoMuted === 'boolean') clean.videoMuted = meta.videoMuted;
  if (typeof meta.videoVolume === 'number') clean.videoVolume = Number(meta.videoVolume.toFixed(2));

  const voiceSegments = sanitizeVoiceSegments(meta.voiceSegments);
  if (voiceSegments.length) clean.voiceSegments = voiceSegments;

  const overlayLayers = normalizeOverlayLayers(meta.overlayLayers);
  if (overlayLayers.length) clean.overlayLayers = overlayLayers;

  return Object.keys(clean).length ? clean : null;
}

export class GlimpseService {
  private likeMutationLanes = new Map<string, Promise<unknown>>();

  private async warmGlimpseAssets(glimpses: Story[]) {
    const urls = (glimpses || []).flatMap((item: any) => [item?.authorAvatarURL, item?.thumbnailURL, item?.coverImageURL, item?.mediaURL]);
    await imageCacheService.prefetchBatch(urls.filter((value): value is string => typeof value === 'string' && value.length > 0), 6);
  }

  private async refreshUserGlimpsesInBackground(userId: string, limitCount = 12) {
    await cacheIntegration.scheduleBackgroundRefresh('user_glimpses:' + userId, async () => {
      await this.getUserGlimpses(userId, limitCount, true);
    }, 12000);
  }

  private enqueueLikeMutation<T>(laneKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.likeMutationLanes.get(laneKey) || Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.likeMutationLanes.set(
      laneKey,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  /**
   * Upload media to Supabase Storage
   */
  async uploadMedia(
    userId: string,
    file: any,
    type: 'image' | 'video'
  ): Promise<string> {
    const source: any = file;
    const blob: Blob = source && typeof source === 'object' && typeof source.arrayBuffer === 'function'
      ? (source as Blob)
      : await fetch(typeof source === 'string' ? source : source?.uri).then((r) => r.blob());

    const contentType = (source?.type || (blob as any).type || (type === 'video' ? 'video/mp4' : 'image/jpeg')) as string;
    const ext = contentType.includes('video') ? 'mp4' : (contentType.includes('png') ? 'png' : 'jpg');
    const fileName = `${userId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('glimpses')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Failed to upload media: ${error.message}`);
    }

    const { data: urlData } = supabase.storage.from('glimpses').getPublicUrl(fileName);
    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for uploaded media');
    }

    return urlData.publicUrl;
  }

  private normalizeAudience(audience?: string): 'public' | 'followers' | 'closeFriends' {
    if (audience === 'followers') return 'followers';
    if (audience === 'close_friends' || audience === 'closeFriends') return 'closeFriends';
    return 'public';
  }

  private async canViewerAccessAudience(
    authorId: string,
    audience: string | undefined,
    viewerId?: string,
    followingIds?: Set<string>,
    followingCache?: Map<string, boolean>,
    closeFriendCache?: Map<string, boolean>
  ): Promise<boolean> {
    const normalizedAudience = this.normalizeAudience(audience);
    if (normalizedAudience === 'public') return true;
    if (!viewerId) return false;
    if (authorId === viewerId) return true;

    if (normalizedAudience === 'followers') {
      if (followingIds) return followingIds.has(authorId);
      if (followingCache?.has(authorId)) return followingCache.get(authorId) === true;
      try {
        const followingSnap = await getDoc(doc(db, `users/${viewerId}/following/${authorId}`));
        const allowed = followingSnap.exists();
        followingCache?.set(authorId, allowed);
        return allowed;
      } catch {
        followingCache?.set(authorId, false);
        return false;
      }
    }

    if (normalizedAudience === 'closeFriends') {
      if (closeFriendCache?.has(authorId)) return closeFriendCache.get(authorId) === true;
      try {
        const closeFriendSnap = await getDoc(doc(db, `users/${authorId}/closeFriends/${viewerId}`));
        const allowed = closeFriendSnap.exists();
        closeFriendCache?.set(authorId, allowed);
        return allowed;
      } catch {
        closeFriendCache?.set(authorId, false);
        return false;
      }
    }

    return false;
  }

  private async filterVisibleGlimpsesForViewer(glimpses: Story[], viewerId?: string): Promise<Story[]> {
    if (!viewerId || glimpses.length === 0) return glimpses;

    const followingAudienceCache = new Map<string, boolean>();
    const closeFriendAudienceCache = new Map<string, boolean>();
    return (
      await Promise.all(
        glimpses.map(async (entry: any) => (
          await this.canViewerAccessAudience(entry.authorId, entry.audience, viewerId, undefined, followingAudienceCache, closeFriendAudienceCache)
            ? entry
            : null
        ))
      )
    ).filter(Boolean) as Story[];
  }

  /**
   * Create a glimpse (permanent short video/image)
   */
  async createGlimpse(
    authorId: string,
    authorUsername: string,
    authorAvatarURL: string,
    authorVerified: boolean,
    mediaFile: any,
    mediaType: 'image' | 'video',
    duration: number,
    caption?: string,
    mentions?: string[],
    tags?: string[],
    taggedUsers?: Array<{ userId: string; username: string }>,
    collaborators?: Array<{ userId: string; username: string }>,
    coverImageBlob?: Blob,
    taggedPeople?: string[],
    settings?: {
      allowComments?: boolean;
      allowDownload?: boolean;
      hideLikes?: boolean;
      showCaptions?: boolean;
      audience?: 'public' | 'followers' | 'close_friends' | 'closeFriends';
    }
  ): Promise<string> {
    const mediaURL = await this.uploadMedia(authorId, mediaFile, mediaType);
    let coverImageURL: string | undefined;
    if (coverImageBlob) {
      coverImageURL = await this.uploadMedia(authorId, coverImageBlob, 'image');
    }

    const glimpseRef = doc(collection(db, 'glimpses'));
    const glimpseId = glimpseRef.id;

    let formattedCollaborators: any[] = [];
    if (collaborators && collaborators.length > 0) {
      const collabDetailsPromises = collaborators.map(async (collab) => {
        const userRef = doc(db, 'users', collab.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          return {
            userId: collab.userId,
            username: collab.username,
            avatarURL: userData.avatarURL || '',
            status: 'pending' as const,
            addedAt: Timestamp.now(),
          };
        }
        return null;
      });
      const collabDetails = await Promise.all(collabDetailsPromises);
      formattedCollaborators = collabDetails.filter(c => c !== null);
    }

    const normalizedMentions = Array.from(
      new Set((mentions || []).map((mention) => (mention || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean))
    );
    const normalizedTags = Array.from(
      new Set((tags || []).map((tag) => (tag || '').replace(/^#/, '').trim().toLowerCase()).filter(Boolean))
    );
    const taggedUserIds = Array.from(
      new Set([...(taggedPeople || []), ...extractTaggedUserIds(taggedUsers)].filter((taggedUserId) => !!taggedUserId && taggedUserId !== authorId))
    );

    const glimpseData: any = {
      storyId: glimpseId,
      glimpseId,
      authorId,
      authorUsername,
      authorAvatarURL,
      authorVerified,
      mediaURL,
      mediaType,
      thumbnailURL: mediaURL,
      coverImageURL: mediaURL,
      duration,
      audience: this.normalizeAudience(settings?.audience),
      allowReplies: true,
      allowSharing: true,
      viewsCount: 0,
      likesCount: 0,
      repliesCount: 0,
      stats: {
        viewsCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
      },
      caption: caption || '',
      mentions: normalizedMentions,
      tags: normalizedTags,
      taggedUsers: taggedUsers || [],
      taggedPeople: taggedUserIds,
      collaborators: formattedCollaborators,
      settings: settings || {
        allowComments: true,
        allowDownload: false,
        hideLikes: false,
        showCaptions: true
      },
      createdAt: serverTimestamp(),
      isHighlighted: false,
      isGlimpse: true,
    };

    if (coverImageURL) glimpseData.coverImageURL = coverImageURL;

    await setDoc(glimpseRef, glimpseData);

    const userRef = doc(db, 'users', authorId);
    await updateDoc(userRef, {
      'stats.glimpsesCount': increment(1),
    });

    const notifiedMentionUserIds = new Set<string>();
    if (normalizedMentions.length > 0) {
      try {
        const { userService } = await import('./user.service');
        const { notificationService } = await import('./notification.service');
        await Promise.all(
          normalizedMentions.map(async (username) => {
            try {
              const mentionedUser = await userService.getUser(username);
              if (!mentionedUser || mentionedUser.userId === authorId) return;
              await notificationService.notifyMention(
                mentionedUser.userId,
                authorId,
                authorUsername,
                authorAvatarURL,
                'story',
                glimpseId,
                caption || '',
                mediaURL
              );
              notifiedMentionUserIds.add(mentionedUser.userId);
            } catch (error) {
              console.error('Glimpse mention notification failed:', username, error);
            }
          })
        );
      } catch (error) {
        console.error('Glimpse mention notifications failed:', error);
      }
    }

    if (taggedUserIds.length > 0) {
      try {
        const { notificationService } = await import('./notification.service');
        await Promise.all(
          taggedUserIds.map(async (taggedUserId) => {
            if (!taggedUserId || taggedUserId === authorId || notifiedMentionUserIds.has(taggedUserId)) return;
            try {
              const notificationId = await notificationService.createNotification(
                taggedUserId,
                'mention',
                authorId,
                authorUsername,
                authorAvatarURL,
                'story',
                glimpseId,
                'tagged you in a glimpse',
                mediaURL
              );
              await updateDoc(doc(db, 'notifications', notificationId), {
                message: 'tagged you in a glimpse',
                glimpseId,
              });
            } catch (error) {
              console.error('Glimpse tag notification failed:', taggedUserId, error);
            }
          })
        );
      } catch (error) {
        console.error('Glimpse tag notifications failed:', error);
      }
    }

    if (formattedCollaborators.length > 0) {
      await Promise.all(
        formattedCollaborators.map(async (collab) => {
          try {
            await this.requestCollaboration(
              glimpseId,
              authorId,
              authorUsername,
              authorAvatarURL,
              collab.userId,
              mediaURL,
              caption || ''
            );
            await this.sendCollaborationDM(
              glimpseId,
              authorId,
              authorUsername,
              authorAvatarURL,
              collab.userId,
              mediaURL,
              caption || '',
              false
            );
          } catch (error) {
            console.error('Glimpse collaboration setup failed:', collab.userId, error);
          }
        })
      );
    }

    return glimpseId;
  }

  async createGlimpseFromUrl(
    authorId: string,
    authorUsername: string,
    authorAvatarURL: string,
    authorVerified: boolean,
    mediaURL: string,
    mediaType: 'image' | 'video',
    duration: number,
    caption?: string,
    options?: {
      allowComments?: boolean;
      allowSharing?: boolean;
      hideLikes?: boolean;
      showCaptions?: boolean;
      audience?: 'public' | 'followers' | 'close_friends';
      mentions?: string[];
      tags?: string[];
      taggedUsers?: Array<{ userId: string; username: string }>;
      thumbnailURL?: string;
      collaborators?: Array<{ userId: string; username: string; displayName?: string; avatarURL?: string }>;
      editorMeta?: {
        styleId?: string;
        overlayText?: string;
        overlayPosition?: 'top' | 'center' | 'bottom';
        trimStart?: number;
        trimEnd?: number;
      };
    }
  ): Promise<string> {
    const glimpseRef = doc(collection(db, 'glimpses'));
    const glimpseId = glimpseRef.id;
    const sanitizedEditorMeta = sanitizeEditorMeta(options?.editorMeta);
    const sanitizedTaggedUsers = sanitizeTaggedUsers(options?.taggedUsers);

    const normalizedMentions = Array.from(
      new Set((options?.mentions || []).map((mention) => (mention || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean))
    );
    const normalizedTags = Array.from(
      new Set((options?.tags || []).map((tag) => (tag || '').replace(/^#/, '').trim().toLowerCase()).filter(Boolean))
    );
    const taggedUserIds = extractTaggedUserIds(sanitizedTaggedUsers).filter((taggedUserId) => taggedUserId !== authorId);

    let formattedCollaborators: any[] = [];
    if (options?.collaborators && options.collaborators.length > 0) {
      const collabDetailsPromises = options.collaborators
        .filter((collab) => !!collab?.userId && collab.userId !== authorId)
        .map(async (collab) => {
          const userRef = doc(db, 'users', collab.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            return {
              userId: collab.userId,
              username: collab.username || userData.username || '',
              displayName: collab.displayName || userData.displayName || '',
              avatarURL: collab.avatarURL || userData.avatarURL || '',
              status: 'pending' as const,
              addedAt: Timestamp.now(),
            };
          }
          return {
            userId: collab.userId,
            username: collab.username || '',
            displayName: collab.displayName || '',
            avatarURL: collab.avatarURL || '',
            status: 'pending' as const,
            addedAt: Timestamp.now(),
          };
        });

      const collabDetails = await Promise.all(collabDetailsPromises);
      const dedup = new Map<string, any>();
      for (const collab of collabDetails) {
        dedup.set(collab.userId, collab);
      }
      formattedCollaborators = Array.from(dedup.values());
    }

    const glimpseData: any = {
      storyId: glimpseId,
      glimpseId,
      authorId,
      authorUsername,
      authorAvatarURL,
      authorVerified,
      mediaURL,
      mediaType,
      thumbnailURL: options?.thumbnailURL || mediaURL,
      coverImageURL: options?.thumbnailURL || mediaURL,
      duration,
      audience: this.normalizeAudience(options?.audience),
      allowReplies: options?.allowComments ?? true,
      allowSharing: options?.allowSharing ?? true,
      viewsCount: 0,
      likesCount: 0,
      repliesCount: 0,
      stats: {
        viewsCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
      },
      caption: caption || '',
      ...(sanitizedEditorMeta ? { editorMeta: sanitizedEditorMeta } : {}),
      trimStart: typeof sanitizedEditorMeta?.trimStart === 'number' ? Math.max(0, Math.round(sanitizedEditorMeta.trimStart)) : null,
      trimEnd: typeof sanitizedEditorMeta?.trimEnd === 'number' ? Math.max(0, Math.round(sanitizedEditorMeta.trimEnd)) : null,
      mentions: normalizedMentions,
      tags: normalizedTags,
      taggedUsers: sanitizedTaggedUsers,
      taggedPeople: taggedUserIds,
      collaborators: formattedCollaborators,
      settings: {
        allowComments: options?.allowComments ?? true,
        allowDownload: false,
        hideLikes: options?.hideLikes ?? false,
        showCaptions: options?.showCaptions ?? true,
      },
      createdAt: serverTimestamp(),
      isHighlighted: false,
      isGlimpse: true,
    };

    await setDoc(glimpseRef, glimpseData);

    const userRef = doc(db, 'users', authorId);
    await updateDoc(userRef, {
      'stats.glimpsesCount': increment(1),
    });

    const notifiedMentionUserIds = new Set<string>();
    if (normalizedMentions.length > 0) {
      try {
        const { userService } = await import('./user.service');
        const { notificationService } = await import('./notification.service');
        await Promise.all(
          normalizedMentions.map(async (username) => {
            try {
              const mentionedUser = await userService.getUser(username);
              if (!mentionedUser || mentionedUser.userId === authorId) return;
              await notificationService.notifyMention(
                mentionedUser.userId,
                authorId,
                authorUsername,
                authorAvatarURL,
                'story',
                glimpseId,
                caption || '',
                mediaURL
              );
              notifiedMentionUserIds.add(mentionedUser.userId);
            } catch (error) {
              console.error('Glimpse mention notification failed:', username, error);
            }
          })
        );
      } catch (error) {
        console.error('Glimpse mention notifications failed:', error);
      }
    }

    if (taggedUserIds.length > 0) {
      try {
        const { notificationService } = await import('./notification.service');
        await Promise.all(
          taggedUserIds.map(async (taggedUserId) => {
            if (!taggedUserId || taggedUserId === authorId || notifiedMentionUserIds.has(taggedUserId)) return;
            try {
              const notificationId = await notificationService.createNotification(
                taggedUserId,
                'mention',
                authorId,
                authorUsername,
                authorAvatarURL,
                'story',
                glimpseId,
                'tagged you in a glimpse',
                mediaURL
              );
              await updateDoc(doc(db, 'notifications', notificationId), {
                message: 'tagged you in a glimpse',
                glimpseId,
              });
            } catch (error) {
              console.error('Glimpse tag notification failed:', taggedUserId, error);
            }
          })
        );
      } catch (error) {
        console.error('Glimpse tag notifications failed:', error);
      }
    }

    if (formattedCollaborators.length > 0) {
      await Promise.all(
        formattedCollaborators.map(async (collab) => {
          try {
            await this.requestCollaboration(
              glimpseId,
              authorId,
              authorUsername,
              authorAvatarURL,
              collab.userId,
              mediaURL,
              caption || ''
            );
            await this.sendCollaborationDM(
              glimpseId,
              authorId,
              authorUsername,
              authorAvatarURL,
              collab.userId,
              mediaURL,
              caption || '',
              false
            );
          } catch (error) {
            console.error('Glimpse collaboration setup failed:', collab.userId, error);
          }
        })
      );
    }

    return glimpseId;
  }

  async getUserGlimpses(userId: string, limitCount: number = 20, forceFresh = false, viewerId?: string): Promise<Story[]> {
    try {
      if (!forceFresh && !viewerId) {
        const cached = await cacheIntegration.getCachedUserGlimpses(userId);
        if (Array.isArray(cached) && cached.length > 0) {
          void this.refreshUserGlimpsesInBackground(userId, limitCount);
          void this.warmGlimpseAssets(cached as Story[]);
          return cached as Story[];
        }
      }

      const glimpsesRef = collection(db, 'glimpses');
      const q = query(
        glimpsesRef,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const glimpses = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          storyId: doc.id,
          glimpseId: doc.id,
          mediaURL: data.mediaURL || data.mediaURLs?.[0],
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as any as Story;
      });

      const visibleGlimpses = await this.filterVisibleGlimpsesForViewer(glimpses, viewerId);
      const hydratedGlimpses = viewerId && visibleGlimpses.length > 0
        ? await this.hydrateLikedState(visibleGlimpses, viewerId)
        : visibleGlimpses;

      if (!viewerId) {
        await cacheIntegration.cacheUserGlimpses(userId, hydratedGlimpses);
      }
      void this.warmGlimpseAssets(hydratedGlimpses);
      return hydratedGlimpses;
    } catch (error) {
      console.error('Failed to fetch user glimpses:', error);
      return [];
    }
  }
  private async hydrateLikedState(glimpses: any[], viewerId: string): Promise<any[]> {
    if (!viewerId || glimpses.length === 0) return glimpses;
    try {
      const ids = glimpses.map(g => String(g.glimpseId || g.storyId || '')).filter(Boolean);
      const likedIds = await this.getUserLikedGlimpses(viewerId, ids);
      const likedSet = new Set(likedIds);
      return glimpses.map(g => ({
        ...g,
        isLiked: likedSet.has(String(g.glimpseId || g.storyId || '')),
      }));
    } catch (e) {
      console.error('Failed to hydrate glimpse liked state:', e);
      return glimpses;
    }
  }

  async getFeedGlimpses(
    followingIds: string[],
    currentUserId: string,
    limitCount = 20
  ): Promise<Story[]> {
    try {
      const glimpsesRef = collection(db, 'glimpses');
      if (followingIds.length === 0) return [];
      
      const q = query(
        glimpsesRef,
        where('authorId', 'in', followingIds.slice(0, 10)),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const glimpses: Story[] = snapshot.docs.map((snapshotDoc) => ({
        ...(snapshotDoc.data() as Story),
        storyId: snapshotDoc.id,
        glimpseId: snapshotDoc.id,
      }));

      const followingIdSet = new Set(followingIds);
      const closeFriendAudienceCache = new Map<string, boolean>();
      const visibleGlimpses = (
        await Promise.all(
          glimpses.map(async (glimpse: any) => (
            await this.canViewerAccessAudience(glimpse.authorId, glimpse.audience, currentUserId, followingIdSet, undefined, closeFriendAudienceCache)
              ? glimpse
              : null
          ))
        )
      ).filter(Boolean) as Story[];
      
      return this.hydrateLikedState(visibleGlimpses, currentUserId);
    } catch (error) {
      console.error('Failed to fetch feed glimpses:', error);
      return [];
    }
  }
  async getGlimpse(glimpseId: string, viewerId?: string): Promise<Story | null> {
    if (!glimpseId || typeof glimpseId !== 'string' || glimpseId.trim() === '') return null;
    const cacheKey = `glimpse:${glimpseId.trim()}:${viewerId || 'guest'}`;
    try {
      const cached = await cacheIntegration.getCachedData(cacheKey);
      if (cached && typeof cached === 'object') {
        return cached as Story;
      }
    } catch {}
    try {
      const peeked = cacheIntegration.peekCachedData(cacheKey);
      if (peeked && typeof peeked === 'object') {
        void (async () => {
          try {
            const fresh = await this.getGlimpse(glimpseId, viewerId);
            if (fresh) {
              void cacheIntegration.cacheData(cacheKey, fresh, 10 * 60 * 1000);
              void imageCacheService.prefetchBatch(
                [fresh.thumbnailURL, fresh.coverImageURL, fresh.mediaURL].filter((v): v is string => typeof v === 'string' && v.length > 0),
                6
              );
            }
          } catch {}
        })();
        return peeked as Story;
      }
    } catch {}

    try {
      const glimpseRef = doc(db, 'glimpses', glimpseId.trim());
      const snapshot = await getDoc(glimpseRef);
      if (!snapshot.exists()) return null;
      
      const raw = snapshot.data() as any;
      const rawStats = raw?.stats || {};
      const normalizedViews = Number(rawStats.viewsCount ?? raw.viewsCount ?? 0) || 0;
      const normalizedLikes = Number(rawStats.likesCount ?? raw.likesCount ?? 0) || 0;
      const normalizedComments = Number(rawStats.commentsCount ?? raw.commentsCount ?? 0) || 0;
      const normalizedShares = Number(rawStats.sharesCount ?? raw.sharesCount ?? 0) || 0;

      const glimpse = {
        ...(raw as Story),
        storyId: snapshot.id,
        glimpseId: snapshot.id,
        viewsCount: normalizedViews,
        likesCount: normalizedLikes,
        commentsCount: normalizedComments,
        sharesCount: normalizedShares,
        stats: {
          ...rawStats,
          viewsCount: normalizedViews,
          likesCount: normalizedLikes,
          commentsCount: normalizedComments,
          sharesCount: normalizedShares,
        },
      } as Story;
      if (viewerId) {
        const canView = await this.canViewerAccessAudience(glimpse.authorId, glimpse.audience, viewerId);
        if (!canView) return null;
        const likedIds = await this.getUserLikedGlimpses(viewerId, [snapshot.id]);
        (glimpse as any).isLiked = likedIds.includes(snapshot.id);
      }

      try {
        await cacheIntegration.cacheData(cacheKey, glimpse, 10 * 60 * 1000);
        void imageCacheService.prefetchBatch(
          [(glimpse as any).thumbnailURL, (glimpse as any).coverImageURL, (glimpse as any).mediaURL].filter((v): v is string => typeof v === 'string' && v.length > 0),
          6
        );
      } catch {}
      return glimpse;
    } catch (error) {
      console.error('Failed to fetch glimpse:', glimpseId, error);
      return null;
    }
  }
  async getGlimpsesByTaggedUser(userId: string, viewerId?: string): Promise<Story[]> {
    const glimpsesRef = collection(db, 'glimpses');
    const q = query(
      glimpsesRef,
      where('taggedPeople', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);
    const glimpses = snapshot.docs.map((doc) => ({
      ...(doc.data() as Story),
      glimpseId: doc.id,
      storyId: doc.id,
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));

    if (!viewerId || glimpses.length === 0) {
      return glimpses;
    }

    const followingAudienceCache = new Map<string, boolean>();
    const closeFriendAudienceCache = new Map<string, boolean>();
    const visibleGlimpses = (
      await Promise.all(
        glimpses.map(async (entry: any) => (
          await this.canViewerAccessAudience(entry.authorId, entry.audience, viewerId, undefined, followingAudienceCache, closeFriendAudienceCache)
            ? entry
            : null
        ))
      )
    ).filter(Boolean) as Story[];

    const ids = visibleGlimpses.map((entry: any) => String(entry?.glimpseId || entry?.storyId || '')).filter(Boolean);
    const likedIds = await this.getUserLikedGlimpses(viewerId, ids);
    const likedSet = new Set(likedIds);

    return visibleGlimpses.map((entry: any) => ({
      ...entry,
      isLiked: likedSet.has(String(entry?.glimpseId || entry?.storyId || '')),
    }));
  }

  async getFollowingGlimpses(
    followingIds: string[],
    currentUserId: string,
    limitCount = 20
  ): Promise<Story[]> {
    const followingOnly = followingIds.filter(id => id !== currentUserId);
    if (followingOnly.length === 0) return [];
    const chunk = followingOnly.slice(0, 10);
    const glimpsesRef = collection(db, 'glimpses');
    const q = query(
      glimpsesRef,
      where('authorId', 'in', chunk),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    const glimpses = snapshot.docs.map((doc) => ({
      ...(doc.data() as Story),
      glimpseId: doc.id,
      storyId: doc.id,
    }));
    const followingIdSet = new Set(followingOnly);
    const closeFriendAudienceCache = new Map<string, boolean>();
    const visibleGlimpses = (
      await Promise.all(
        glimpses.map(async (glimpse: any) => (
          await this.canViewerAccessAudience(glimpse.authorId, glimpse.audience, currentUserId, followingIdSet, undefined, closeFriendAudienceCache)
            ? glimpse
            : null
        ))
      )
    ).filter(Boolean) as Story[];
    return this.hydrateLikedState(visibleGlimpses, currentUserId);
  }

  async getExploreGlimpses(limitCount: number = 20, viewerId?: string, forceFresh = false): Promise<Story[]> {
    const cacheKey = `explore:${viewerId || 'guest'}:${limitCount}`;
    if (!forceFresh) {
      const cached = await cacheIntegration.getCachedExploreGlimpses(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        void cacheIntegration.scheduleBackgroundRefresh('explore_glimpses:' + cacheKey, async () => {
          await this.getExploreGlimpses(limitCount, viewerId, true);
        }, 15000);
        void imageCacheService.prefetchBatch(
          (cached as any[])
            .flatMap((item: any) => [item?.thumbnailURL, item?.coverImageURL, item?.mediaURL])
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
          6
        );
        return cached as Story[];
      }
    }

    const glimpsesRef = collection(db, 'glimpses');
    const q = query(
      glimpsesRef,
      where('audience', '==', 'public'),
      orderBy('stats.likesCount', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const glimpses = snapshot.docs.map((snapshotDoc) => {
      const raw = snapshotDoc.data() as any;
      const rawStats = raw?.stats || {};
      const normalizedViews = Number(rawStats.viewsCount ?? raw.viewsCount ?? 0) || 0;
      const normalizedLikes = Number(rawStats.likesCount ?? raw.likesCount ?? 0) || 0;
      const normalizedComments = Number(rawStats.commentsCount ?? raw.commentsCount ?? 0) || 0;
      const normalizedShares = Number(rawStats.sharesCount ?? raw.sharesCount ?? 0) || 0;

      return {
        ...(raw as Story),
        storyId: snapshotDoc.id,
        glimpseId: snapshotDoc.id,
        viewsCount: normalizedViews,
        likesCount: normalizedLikes,
        commentsCount: normalizedComments,
        sharesCount: normalizedShares,
        stats: {
          ...rawStats,
          viewsCount: normalizedViews,
          likesCount: normalizedLikes,
          commentsCount: normalizedComments,
          sharesCount: normalizedShares,
        },
        createdAt: raw.createdAt?.toDate?.() || new Date(),
      } as Story;
    });

    let result = glimpses;
    if (viewerId && glimpses.length > 0) {
      result = await this.hydrateLikedState(glimpses, viewerId);
    }
    await cacheIntegration.cacheExploreGlimpses(cacheKey, result);
    void imageCacheService.prefetchBatch(
      (result as any[])
        .flatMap((item: any) => [item?.thumbnailURL, item?.coverImageURL, item?.mediaURL])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
      6
    );
    return result;
  }

  async getAllGlimpses(limitCount: number = 20, lastDoc?: DocumentSnapshot, viewerId?: string): Promise<{
    glimpses: Story[];
    lastDoc: DocumentSnapshot | null;
  }> {
    const cacheKey = `all_glimpses:${viewerId || 'guest'}:${limitCount}:${lastDoc ? (lastDoc as any)?.id || 'p' : 'first'}`;
    if (!lastDoc) {
      try {
        const cached = await cacheIntegration.getCachedData(cacheKey);
        if (cached && Array.isArray((cached as any)?.glimpses)) {
          return cached as any;
        }
      } catch {}
      try {
        const peeked = cacheIntegration.peekCachedData(cacheKey);
        if (peeked && Array.isArray((peeked as any)?.glimpses)) {
          void this.getAllGlimpses(limitCount, undefined, viewerId).then((fresh) => {
            try { void cacheIntegration.cacheData(cacheKey, fresh, 5 * 60 * 1000); } catch {}
          });
          return peeked as any;
        }
      } catch {}
    }

    const glimpsesRef = collection(db, 'glimpses');
    let q = query(glimpsesRef, orderBy('createdAt', 'desc'), limit(limitCount));
    if (lastDoc) q = query(q, startAfter(lastDoc));

    const snapshot = await getDocs(q);
    const glimpses = snapshot.docs.map((snapshotDoc) => {
      const raw = snapshotDoc.data() as any;
      const rawStats = raw?.stats || {};
      const normalizedViews = Number(rawStats.viewsCount ?? raw.viewsCount ?? 0) || 0;
      const normalizedLikes = Number(rawStats.likesCount ?? raw.likesCount ?? 0) || 0;
      const normalizedComments = Number(rawStats.commentsCount ?? raw.commentsCount ?? 0) || 0;
      const normalizedShares = Number(rawStats.sharesCount ?? raw.sharesCount ?? 0) || 0;

      return {
        ...(raw as Story),
        storyId: snapshotDoc.id,
        glimpseId: snapshotDoc.id,
        viewsCount: normalizedViews,
        likesCount: normalizedLikes,
        commentsCount: normalizedComments,
        sharesCount: normalizedShares,
        stats: {
          ...rawStats,
          viewsCount: normalizedViews,
          likesCount: normalizedLikes,
          commentsCount: normalizedComments,
          sharesCount: normalizedShares,
        },
      } as Story;
    });

    const followingAudienceCache = new Map<string, boolean>();
    const closeFriendAudienceCache = new Map<string, boolean>();
    const visibleGlimpses = (
      await Promise.all(
        glimpses.map(async (glimpse: any) => (
          await this.canViewerAccessAudience(glimpse.authorId, glimpse.audience, viewerId, undefined, followingAudienceCache, closeFriendAudienceCache)
            ? glimpse
            : null
        ))
      )
    ).filter(Boolean) as Story[];

    const visibleIds = visibleGlimpses.map((glimpse: any) => String(glimpse?.glimpseId || glimpse?.storyId || '')).filter(Boolean);
    const likedIds = viewerId && visibleIds.length > 0 ? await this.getUserLikedGlimpses(viewerId, visibleIds) : [];
    const likedIdSet = new Set(likedIds);
    const hydratedVisibleGlimpses = visibleGlimpses.map((glimpse: any) => ({
      ...glimpse,
      isLiked: likedIdSet.has(String(glimpse?.glimpseId || glimpse?.storyId || '')),
    }));

    const result = { glimpses: hydratedVisibleGlimpses, lastDoc: snapshot.docs[snapshot.docs.length - 1] || null };
    if (!lastDoc) {
      try {
        await cacheIntegration.cacheData(cacheKey, result, 5 * 60 * 1000);
        void imageCacheService.prefetchBatch(
          hydratedVisibleGlimpses.flatMap((item: any) => [item?.thumbnailURL, item?.coverImageURL, item?.mediaURL]).filter((v): v is string => typeof v === 'string' && v.length > 0),
          8
        );
      } catch {}
    }
    return result;
  }

  async getUserLikedGlimpses(userId: string, glimpseIds: string[]): Promise<string[]> {
    if (glimpseIds.length === 0 || !userId) return [];
    const lookupItems: LikeLookupItem[] = glimpseIds.map((glimpseId) => ({ type: 'glimpse', id: glimpseId }));
    const likedMap = await likeService.getLikedMap(userId, lookupItems);
    return glimpseIds.filter((glimpseId) => !!likedMap[likeService.toLookupKey('glimpse', glimpseId)]);
  }

  async getGlimpseLikes(glimpseId: string, limitCount = 50): Promise<any[]> {
    const likesRef = collection(db, 'glimpses/' + glimpseId + '/likes');
    const q = query(likesRef, orderBy('likedAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    const userIds = snapshot.docs.map((docItem) => docItem.id);
    if (userIds.length === 0) return [];

    const users = await Promise.all(
      userIds.map(async (userId) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return null;
        const userData = userSnap.data();
        return {
          userId,
          username: userData.username,
          displayName: userData.displayName,
          avatarURL: userData.avatarURL || '',
        };
      })
    );
    return users.filter((entry) => entry !== null);
  }

  async setGlimpseLiked(glimpseId: string, userId: string, desiredLiked: boolean): Promise<{ liked: boolean; changed: boolean }> {
    const laneKey = `glimpse:${glimpseId}:${userId}`;
    return this.enqueueLikeMutation(laneKey, async () => {
      let resolvedLiked = desiredLiked;
      let changed = false;
      await runTransaction(db, async (tx) => {
        const likeRef = doc(db, 'glimpses', glimpseId, 'likes', userId);
        const likeIndexRef = doc(db, 'users', userId, 'likedContent', likeService.getIndexDocId('glimpse', glimpseId));
        const glimpseRef = doc(db, 'glimpses', glimpseId);
        const [likeSnap, glimpseSnap] = await Promise.all([tx.get(likeRef), tx.get(glimpseRef)]);

        if (!glimpseSnap.exists()) {
          resolvedLiked = likeSnap.exists();
          changed = false;
          return;
        }

        const currentlyLiked = likeSnap.exists();
        if (currentlyLiked === desiredLiked) {
          resolvedLiked = currentlyLiked;
          changed = false;
          return;
        }

        const glimpseData = glimpseSnap.data() as any;
        const delta = desiredLiked ? 1 : -1;
        const currentStatsLikes = Number(glimpseData?.stats?.likesCount || 0);
        const nextLikes = Math.max(0, currentStatsLikes + delta);

        if (desiredLiked) {
          tx.set(likeRef, { userId, likedAt: serverTimestamp() });
          tx.set(likeIndexRef, {
            contentType: 'glimpse',
            contentId: glimpseId,
            likedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.delete(likeRef);
          tx.delete(likeIndexRef);
        }

        tx.update(glimpseRef, {
          'stats.likesCount': nextLikes,
          likesCount: Math.max(0, Number(glimpseData?.likesCount || 0) + delta),
          updatedAt: serverTimestamp(),
        });
        resolvedLiked = desiredLiked;
        changed = true;
      });
      return { liked: resolvedLiked, changed };
    });
  }

  async likeGlimpse(glimpseId: string, userId: string): Promise<void> {
    const result = await this.setGlimpseLiked(glimpseId, userId, true);
    if (!result.changed || !result.liked) return;
    try {
      const glimpseRef = doc(db, 'glimpses', glimpseId);
      const snap = await getDoc(glimpseRef);
      if (snap.exists()) {
        const data: any = snap.data();
        const ownerId = data.authorId;
        const { userService } = await import('./user.service');
        const liker = await userService.getUser(userId);
        if (liker && ownerId && ownerId !== userId) {
          const { notificationService } = await import('./notification.service');
          await notificationService.notifyGlimpseLike(ownerId, userId, liker.username, liker.avatarURL || '', glimpseId, data.coverImageURL || data.mediaURL);
        }
      }
    } catch {}
  }

  async unlikeGlimpse(glimpseId: string, userId: string): Promise<void> {
    await this.setGlimpseLiked(glimpseId, userId, false);
  }

  async incrementViewCount(glimpseId: string, viewerId: string): Promise<boolean> {
    if (!glimpseId || !viewerId) return false;
    const glimpseRef = doc(db, 'glimpses', glimpseId);
    const viewRef = doc(db, 'glimpses', glimpseId, 'views', viewerId);

    try {
      const glimpseSnap = await getDoc(glimpseRef);
      if (!glimpseSnap.exists() || String(glimpseSnap.data()?.authorId || '') === viewerId) return false;

      const viewSnap = await getDoc(viewRef);
      if (viewSnap.exists()) return false;

      const now = Timestamp.now();
      await setDoc(viewRef, { viewerId, viewedAt: now }, { merge: true });
      await updateDoc(glimpseRef, {
        viewsCount: increment(1),
        'stats.viewsCount': increment(1),
        updatedAt: now,
      });
      return true;
    } catch (error) {
      console.error('Failed to increment glimpse view count:', glimpseId, error);
      return false;
    }
  }

  async checkUserLiked(glimpseId: string, userId: string): Promise<boolean> {
    return this.isGlimpseLiked(glimpseId, userId);
  }

  async updateGlimpse(glimpseId: string, updates: Partial<any>): Promise<void> {
    await updateDoc(doc(db, 'glimpses', glimpseId), { ...updates, updatedAt: serverTimestamp() });
  }

  async sendCollaborationDM(
    glimpseId: string,
    fromUserId: string,
    fromUsername: string,
    fromAvatarURL: string,
    toUserId: string,
    glimpseMediaURL: string,
    glimpseCaption: string,
    createNotification = true
  ): Promise<void> {
    const conversationId = [fromUserId, toUserId].sort().join('_');
    const conversationRef = doc(db, 'conversations', conversationId);
    const convSnap = await getDoc(conversationRef);
    if (!convSnap.exists()) {
      await setDoc(conversationRef, {
        conversationId,
        type: 'direct',
        participantIds: [fromUserId, toUserId],
        participantCount: 2,
        lastMessage: { text: 'Collaboration request', senderId: fromUserId, timestamp: serverTimestamp() },
        unreadCounts: { [toUserId]: 1, [fromUserId]: 0 },
        mutedBy: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
      });
    }
    const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
    await setDoc(messageRef, {
      messageId: messageRef.id,
      senderId: fromUserId,
      senderUsername: fromUsername,
      senderAvatarURL: fromAvatarURL,
      type: 'glimpse_collab_request',
      text: 'wants to collaborate with you on a glimpse',
      glimpseId,
      glimpseMediaURL,
      glimpseCaption,
      status: 'pending',
      createdAt: serverTimestamp(),
      isRead: false,
    });
    await updateDoc(conversationRef, {
      lastMessage: { text: 'Collaboration request', senderId: fromUserId, timestamp: serverTimestamp() },
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (createNotification) {
      const notificationRef = doc(collection(db, 'notifications'));
      await setDoc(notificationRef, {
        notificationId: notificationRef.id,
        userId: toUserId,
        type: 'collaboration_request',
        actorId: fromUserId,
        actorUsername: fromUsername,
        actorAvatarURL: fromAvatarURL,
        glimpseId,
        glimpseCoverURL: glimpseMediaURL,
        message: 'wants to collaborate with you on a glimpse',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }
  }

  async requestCollaboration(
    glimpseId: string,
    fromUserId: string,
    fromUsername: string,
    fromAvatarURL: string,
    toUserId: string,
    glimpseCoverURL: string,
    glimpseCaption?: string
  ): Promise<void> {
    const requestRef = doc(collection(db, 'collaborationRequests'));
    const requestId = requestRef.id;
    await setDoc(requestRef, {
      requestId,
      type: 'glimpse_collaboration',
      glimpseId,
      fromUserId,
      fromUsername,
      fromAvatarURL,
      toUserId,
      glimpseCoverURL,
      glimpseCaption,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    const notificationRef = doc(collection(db, 'notifications'));
    await setDoc(notificationRef, {
      notificationId: notificationRef.id,
      userId: toUserId,
      type: 'collaboration_request',
      actorId: fromUserId,
      actorUsername: fromUsername,
      actorAvatarURL: fromAvatarURL,
      glimpseId,
      glimpseCoverURL,
      requestId,
      message: `wants to collaborate on a glimpse`,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  }

  async acceptCollaboration(requestId: string, glimpseId: string, userId: string): Promise<void> {
    await updateDoc(doc(db, 'collaborationRequests', requestId), { status: 'accepted', acceptedAt: serverTimestamp() });
    const glimpseRef = doc(db, 'glimpses', glimpseId);
    const glimpseSnap = await getDoc(glimpseRef);
    if (glimpseSnap.exists()) {
      const glimpseData = glimpseSnap.data();
      const updatedCollaborators = (glimpseData.collaborators || []).map((collab: any) =>
        collab.userId === userId && collab.status === 'pending' ? { ...collab, status: 'accepted', acceptedAt: Timestamp.now() } : collab
      );
      await updateDoc(glimpseRef, { collaborators: updatedCollaborators });
      const conversationId = [glimpseData.authorId, userId].sort().join('_');
      const messagesQuery = query(collection(db, 'conversations', conversationId, 'messages'), where('glimpseId', '==', glimpseId), where('type', '==', 'glimpse_collab_request'));
      const messagesSnap = await getDocs(messagesQuery);
      for (const msgDoc of messagesSnap.docs) await updateDoc(msgDoc.ref, { status: 'accepted', acceptedAt: serverTimestamp() });
    }
  }

  async rejectCollaboration(requestId: string, glimpseId: string, userId: string): Promise<void> {
    await updateDoc(doc(db, 'collaborationRequests', requestId), { status: 'rejected', rejectedAt: serverTimestamp() });
    const glimpseRef = doc(db, 'glimpses', glimpseId);
    const glimpseSnap = await getDoc(glimpseRef);
    if (glimpseSnap.exists()) {
      const glimpseData = glimpseSnap.data();
      const updatedCollaborators = (glimpseData.collaborators || []).filter((collab: any) => !(collab.userId === userId && collab.status === 'pending'));
      await updateDoc(glimpseRef, { collaborators: updatedCollaborators });
      const conversationId = [glimpseData.authorId, userId].sort().join('_');
      const messagesQuery = query(collection(db, 'conversations', conversationId, 'messages'), where('glimpseId', '==', glimpseId), where('type', '==', 'glimpse_collab_request'));
      const messagesSnap = await getDocs(messagesQuery);
      for (const msgDoc of messagesSnap.docs) await updateDoc(msgDoc.ref, { status: 'rejected', rejectedAt: serverTimestamp() });
    }
  }

  async getCollaboratedGlimpses(userId: string, limitCount: number = 20): Promise<Story[]> {
    const snapshots = await getDocs(query(collection(db, 'glimpses'), where('collaborators', 'array-contains', { userId }), orderBy('createdAt', 'desc'), limit(limitCount)));
    return snapshots.docs.map(doc => doc.data() as Story);
  }

  async deleteGlimpse(glimpseId: string, authorId: string): Promise<void> {
    const glimpseRef = doc(db, 'glimpses', glimpseId);
    const glimpse = await getDoc(glimpseRef);
    if (!glimpse.exists() || glimpse.data().authorId !== authorId) throw new Error('Unauthorized or not found');
    const data = glimpse.data();
    if (data.mediaURL) {
      try {
        const filePath = data.mediaURL.split('/storage/v1/object/public/glimpses/')[1];
        if (filePath) await supabase.storage.from('glimpses').remove([filePath]);
      } catch {}
    }
    await deleteDoc(glimpseRef);
    await updateDoc(doc(db, 'users', authorId), { 'stats.glimpsesCount': increment(-1) });
  }

  async isGlimpseLiked(glimpseId: string, userId: string): Promise<boolean> {
    try {
      const likedMap = await likeService.getLikedMap(userId, [{ type: 'glimpse', id: glimpseId }]);
      if (likedMap[likeService.toLookupKey('glimpse', glimpseId)]) return true;
      const likeSnap = await getDoc(doc(db, 'glimpses', glimpseId, 'likes', userId));
      return likeSnap.exists();
    } catch { return false; }
  }

  async isGlimpseSaved(glimpseId: string, userId: string): Promise<boolean> {
    try {
      const saveSnap = await getDoc(doc(db, 'users', userId, 'saved', glimpseId));
      return saveSnap.exists();
    } catch { return false; }
  }

  listenUserLike(glimpseId: string, userId: string, onChange: (liked: boolean) => void): Unsubscribe {
    return onSnapshot(doc(db, 'glimpses', glimpseId, 'likes', userId), (snap) => onChange(snap.exists()));
  }

  async saveGlimpse(glimpseId: string, userId: string): Promise<void> {
    await setDoc(doc(db, 'users', userId, 'saved', glimpseId), { glimpseId, savedAt: serverTimestamp() });
  }

  async unsaveGlimpse(glimpseId: string, userId: string): Promise<void> {
    await deleteDoc(doc(db, 'users', userId, 'saved', glimpseId));
  }

  async getSavedGlimpses(userId: string, limitCount = 60): Promise<any[]> {
    const snapshot = await getDocs(query(collection(db, 'users', userId, 'saved'), orderBy('savedAt', 'desc'), limit(limitCount)));
    const ids = snapshot.docs.map(d => (d.data() as any).glimpseId || d.id);
    const results: any[] = [];
    for (const id of ids) {
      const gSnap = await getDoc(doc(db, 'glimpses', id));
      if (gSnap.exists()) {
        const data: any = gSnap.data();
        results.push({ ...data, glimpseId: id, storyId: id, mediaURL: data.mediaURL || (data.mediaURLs?.[0] || '') });
      }
    }
    return results;
  }
}

export const glimpseService = new GlimpseService();








