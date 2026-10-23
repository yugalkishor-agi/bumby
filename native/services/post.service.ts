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
  writeBatch,
  runTransaction,
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Post, CreatePostData, Comment, Like, Story } from '../types/database';
import { storageService, STORAGE_KEYS } from './storage.service';
import { collectionService } from './collection.service';
import { cacheIntegration } from './cacheIntegration.service';
import { imageCacheService } from './imageCache.service';
import { likeService, type LikeLookupItem } from './like.service';

export class PostService {

  private async warmPostAssets(posts: Post[]) {
    const urls = posts.flatMap((post) => [post.authorAvatarURL, ...(Array.isArray(post.mediaURLs) ? post.mediaURLs.slice(0, 3) : [])]);
    await imageCacheService.prefetchBatch(urls.filter((value): value is string => typeof value === 'string' && value.length > 0), 6);
  }

  private async applyLikedStateToPosts(posts: Post[], userId: string): Promise<Post[]> {
    if (!userId || !Array.isArray(posts) || posts.length === 0) return posts;

    const postIds = posts
      .map((post) => String((post as any)?.postId || ''))
      .filter((postId) => postId.length > 0);

    if (postIds.length === 0) return posts;

    try {
      const lookupItems: LikeLookupItem[] = postIds.map((postId) => ({ type: 'post', id: postId }));
      const likedMap = await likeService.getLikedMap(userId, lookupItems);
      return posts.map((post) => {
        const postId = String((post as any)?.postId || '');
        if (!postId) return post;
        return {
          ...post,
          isLiked: !!likedMap[likeService.toLookupKey('post', postId)],
        };
      });
    } catch (error) {
      console.error('Failed to hydrate feed liked state:', error);
      return posts;
    }
  }

  private async refreshPostInBackground(postId: string) {
    await cacheIntegration.scheduleBackgroundRefresh(`post:${postId}`, async () => {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (!postSnap.exists()) return;
      const postData = ({ ...postSnap.data(), postId }) as Post;
      await cacheIntegration.cachePost(postId, postData);
      await this.warmPostAssets([postData]);
    }, 10000);
  }

  private async refreshUserPostsInBackground(userId: string, limitCount = 12) {
    await cacheIntegration.scheduleBackgroundRefresh(`user_posts:${userId}`, async () => {
      await this.getUserPosts(userId, limitCount, undefined, true);
    }, 12000);
  }

  private async refreshFeedCacheInBackground(followingIds: string[], currentUserId: string, limitCount: number) {
    await cacheIntegration.scheduleBackgroundRefresh(`feed:${currentUserId}`, async () => {
      await this.refreshFeedInBackground(followingIds, currentUserId, limitCount);
    }, 12000);
  }
  // ==========================================
  // POST CRUD OPERATIONS
  // ==========================================

  /**
   * Generate Firestore post ID before upload operations
   */
  generatePostId(): string {
    return doc(collection(db, 'posts')).id;
  }

  private normalizeAudience(audience?: string): Post['audience'] {
    if (audience === 'followers') return 'followers';
    if (audience === 'close_friends' || audience === 'closeFriends') return 'closeFriends';
    return 'public';
  }

  private stripUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.stripUndefined(item))
        .filter((item) => item !== undefined) as T;
    }

    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const cleaned: Record<string, any> = {};
      Object.entries(value as Record<string, any>).forEach(([key, nestedValue]) => {
        const normalized = this.stripUndefined(nestedValue);
        if (normalized !== undefined) {
          cleaned[key] = normalized;
        }
      });
      return cleaned as T;
    }

    return value;
  }

  private async canViewerAccessAudience(
    authorId: string,
    audience: string | undefined,
    followingIds: Set<string>,
    viewerId: string,
    closeFriendCache: Map<string, boolean>
  ): Promise<boolean> {
    if (!viewerId || authorId === viewerId) return true;

    const normalizedAudience = this.normalizeAudience(audience);
    if (normalizedAudience === 'public') return true;
    if (normalizedAudience === 'followers') return followingIds.has(authorId);
    if (normalizedAudience !== 'closeFriends') return false;

    if (closeFriendCache.has(authorId)) {
      return closeFriendCache.get(authorId) === true;
    }

    try {
      const closeFriendSnap = await getDoc(doc(db, `users/${authorId}/closeFriends/${viewerId}`));
      const allowed = closeFriendSnap.exists();
      closeFriendCache.set(authorId, allowed);
      return allowed;
    } catch {
      closeFriendCache.set(authorId, false);
      return false;
    }
  }

  private async canViewerAccessPost(postData: Post, viewerId?: string): Promise<boolean> {
    if (!viewerId) return true;
    if (!postData?.authorId) return false;

    let followingIdSet = new Set<string>();
    if (viewerId !== postData.authorId) {
      try {
        const { userService } = await import('./user.service');
        followingIdSet = new Set(await userService.getFollowing(viewerId, 500));
      } catch {
        followingIdSet = new Set<string>();
      }
    }

    return this.canViewerAccessAudience(
      postData.authorId,
      postData.audience as any,
      followingIdSet,
      viewerId,
      new Map<string, boolean>()
    );
  }

  private extractTaggedUserIds(
    taggedUsers?: Array<{ userId?: string } | string | null | undefined>
  ): string[] {
    const ids = (taggedUsers || [])
      .map((tag) => (typeof tag === 'string' ? tag : tag?.userId))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
    return Array.from(new Set(ids));
  }

  private isUserTaggedInPost(post: any, userId: string): boolean {
    if (!post || !userId) return false;

    const taggedPeople = Array.isArray(post.taggedPeople)
      ? post.taggedPeople.filter((id: any) => typeof id === 'string')
      : [];
    if (taggedPeople.includes(userId)) return true;

    const taggedUsers = Array.isArray(post.taggedUsers) ? post.taggedUsers : [];
    return taggedUsers.some((tag: any) => {
      if (!tag) return false;
      if (typeof tag === 'string') return tag === userId;
      return tag.userId === userId;
    });
  }

  private async getOrCreateDirectConversationForCollaboration(userId1: string, userId2: string): Promise<string> {
    const sortedIds = [userId1, userId2].sort();
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('type', '==', 'direct'),
      where('participantIds', 'array-contains', userId1)
    );

    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find((docSnap) => {
      const data = docSnap.data() as any;
      const participants = Array.isArray(data?.participantIds) ? [...data.participantIds].sort() : [];
      return participants.length === 2 && participants[0] === sortedIds[0] && participants[1] === sortedIds[1];
    });

    if (existing) return existing.id;

    const conversationRef = doc(collection(db, 'conversations'));
    await setDoc(conversationRef, {
      conversationId: conversationRef.id,
      type: 'direct',
      participantIds: sortedIds,
      participantCount: 2,
      createdBy: userId1,
      unreadCounts: {
        [sortedIds[0]]: 0,
        [sortedIds[1]]: 0,
      },
      pinnedBy: [],
      mutedBy: [],
      deletedBy: [],
      restrictedBy: [],
      lastMessage: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: Date.now(),
    });

    return conversationRef.id;
  }

  private async sendPostCollaborationDM(
    postId: string,
    requestId: string,
    fromUserId: string,
    fromUsername: string,
    fromAvatarURL: string,
    toUserId: string,
    postMediaURL: string,
    postCaption?: string,
    fromUserVerified = false
  ): Promise<string> {
    const conversationId = await this.getOrCreateDirectConversationForCollaboration(fromUserId, toUserId);
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    const conversationData = conversationSnap.exists() ? (conversationSnap.data() as any) : {};
    const unreadCounts = { ...(conversationData?.unreadCounts || {}) };
    unreadCounts[fromUserId] = 0;
    unreadCounts[toUserId] = (unreadCounts[toUserId] || 0) + 1;
    const clearForUsers = new Set([fromUserId, toUserId]);

    const deletedByRaw = conversationData?.deletedBy;
    const normalizedDeletedBy = Array.isArray(deletedByRaw)
      ? deletedByRaw.filter((id: string) => !clearForUsers.has(id))
      : deletedByRaw && typeof deletedByRaw === 'object'
      ? Object.fromEntries(
          Object.entries(deletedByRaw as Record<string, any>).filter(([uid]) => !clearForUsers.has(uid))
        )
      : [];

    const restrictedByRaw = conversationData?.restrictedBy;
    const normalizedRestrictedBy = Array.isArray(restrictedByRaw)
      ? restrictedByRaw.filter((id: string) => !clearForUsers.has(id))
      : [];

    const archivedByRaw = conversationData?.archivedBy;
    const normalizedArchivedBy = Array.isArray(archivedByRaw)
      ? archivedByRaw.filter((id: string) => !clearForUsers.has(id))
      : [];

    const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
    await setDoc(messageRef, {
      messageId: messageRef.id,
      conversationId,
      senderId: fromUserId,
      senderUsername: fromUsername,
      senderAvatarURL: fromAvatarURL || '',
      type: 'shared_post',
      text: 'sent you a post collaboration request',
      sharedContent: {
        type: 'post',
        contentId: postId,
        id: postId,
        authorId: fromUserId,
        authorUsername: fromUsername,
        username: fromUsername,
        authorAvatarURL: fromAvatarURL || '',
        verified: !!fromUserVerified,
        coverImage: postMediaURL || '',
        coverImageURL: postMediaURL || '',
        caption: postCaption || '',
        mediaType: 'image',
      },
      collaborationRequest: {
        requestId,
        postId,
        fromUserId,
        toUserId,
        status: 'pending',
      },
      collaborationRequestId: requestId,
      collaborationStatus: 'pending',
      status: 'sent',
      readBy: [fromUserId],
      isRead: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(conversationRef, {
      lastMessage: {
        text: 'Post collaboration request',
        senderId: fromUserId,
        type: 'shared_post',
        timestamp: serverTimestamp(),
      },
      unreadCounts,
      deletedBy: normalizedDeletedBy,
      restrictedBy: normalizedRestrictedBy,
      archivedBy: normalizedArchivedBy,
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: Date.now(),
    });

    return conversationId;
  }

  private async setPostCollaborationMessageStatus(
    conversationId: string | undefined,
    requestId: string,
    status: 'accepted' | 'rejected'
  ): Promise<void> {
    if (!conversationId || !requestId) return;

    try {
      const messagesRef = collection(db, 'conversations', conversationId, 'messages');
      const q = query(messagesRef, where('collaborationRequestId', '==', requestId));
      const snapshot = await getDocs(q);

      await Promise.all(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return updateDoc(docSnap.ref, {
            collaborationStatus: status,
            collaborationRequest: {
              ...(data?.collaborationRequest || {}),
              status,
            },
            updatedAt: serverTimestamp(),
          });
        })
      );
    } catch (error) {
      console.error('Failed to sync post collaboration DM status:', error);
    }
  }

  /**
   * Create a new post
   */
  async createPost(postData: CreatePostData): Promise<string> {
    const postId = this.generatePostId();
    return this.createPostWithId(postId, postData);
  }

  /**
   * Create a new post with a pre-generated ID
   */
  async createPostWithId(postId: string, postData: CreatePostData): Promise<string> {
    const postRef = doc(db, 'posts', postId);

    const normalizedTags = Array.from(
      new Set(
        (postData.tags || [])
          .map((tag) => (tag || '').replace(/^#/, '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const normalizedMentions = Array.from(
      new Set(
        (postData.mentions || [])
          .map((mention) => (mention || '').replace(/^@/, '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    let formattedCollaborators: Array<{
      userId: string;
      username: string;
      displayName?: string;
      avatarURL?: string;
      status: 'pending' | 'accepted' | 'declined';
      addedAt: any;
    }> = [];

    if (postData.collaborators && postData.collaborators.length > 0) {
      const dedup = new Map<string, { userId: string; username: string; displayName?: string; avatarURL?: string }>();
      for (const c of postData.collaborators) {
        if (!c?.userId || c.userId === postData.authorId) continue;
        dedup.set(c.userId, {
          userId: c.userId,
          username: c.username,
          displayName: c.displayName,
          avatarURL: c.avatarURL,
        });
      }

      const collaborators = Array.from(dedup.values());
      const collaboratorDetails = await Promise.all(
        collaborators.map(async (collaborator) => {
          try {
            const userRef = doc(db, 'users', collaborator.userId);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.exists() ? userSnap.data() : null;
            return {
              userId: collaborator.userId,
              username: collaborator.username || userData?.username || '',
              displayName: collaborator.displayName || userData?.displayName || '',
              avatarURL: collaborator.avatarURL || userData?.avatarURL || '',
              status: 'pending' as const,
              addedAt: Timestamp.now(),
            };
          } catch {
            return {
              userId: collaborator.userId,
              username: collaborator.username || '',
              displayName: collaborator.displayName || '',
              avatarURL: collaborator.avatarURL || '',
              status: 'pending' as const,
              addedAt: Timestamp.now(),
            };
          }
        })
      );

      formattedCollaborators = collaboratorDetails.filter((c) => !!c.userId);
    }

    const normalizedAudience = this.normalizeAudience(postData.audience);
    const sanitizedPostData = this.stripUndefined(postData);
    const taggedUserIds = this.extractTaggedUserIds(postData.taggedUsers).filter((taggedUserId) => taggedUserId !== postData.authorId);

    await setDoc(postRef, {
      postId,
      ...sanitizedPostData,
      tags: normalizedTags,
      mentions: normalizedMentions,
      taggedUsers: postData.taggedUsers || [],
      taggedPeople: taggedUserIds,
      collaborators: formattedCollaborators,
      altText: postData.altText || '',
      stats: {
        likesCount: 0,
        commentsCount: 0,
        savesCount: 0,
        sharesCount: 0,
        viewsCount: 0,
      },
      commentsEnabled: postData.commentsEnabled ?? true,
      hideLikesCount: postData.hideLikesCount ?? false,
      hideSharesCount: postData.hideSharesCount ?? false,
      allowSharing: postData.allowSharing ?? true,
      audience: normalizedAudience,
      pinnedAt: postData.pinnedAt ?? null,
      engagement: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastEngagementAt: serverTimestamp(),
    });

    // Update user's post count
    const userRef = doc(db, 'users', postData.authorId);
    await updateDoc(userRef, {
      'stats.postsCount': increment(1),
    });

    // Mention notifications
    const notifiedMentionUserIds = new Set<string>();
    if (normalizedMentions.length > 0) {
      try {
        const { userService } = await import('./user.service');
        const { notificationService } = await import('./notification.service');

        await Promise.all(
          normalizedMentions.map(async (username) => {
            try {
              const mentionedUser = await userService.getUser(username);
              if (!mentionedUser || mentionedUser.userId === postData.authorId) return;

              await notificationService.notifyMention(
                mentionedUser.userId,
                postData.authorId,
                postData.authorUsername,
                postData.authorAvatarURL,
                'post',
                postId,
                postData.caption || '',
                postData.mediaURLs?.[0]
              );
              notifiedMentionUserIds.add(mentionedUser.userId);
            } catch (error) {
              console.error('Post mention notification failed for username:', username, error);
            }
          })
        );
      } catch (error) {
        console.error('Post mention notifications failed:', error);
      }
    }

    // Tagged-user notifications + tagged list visibility
    if (taggedUserIds.length > 0) {
      try {
        const { notificationService } = await import('./notification.service');
        await Promise.all(
          taggedUserIds.map(async (taggedUserId) => {
            if (!taggedUserId || taggedUserId === postData.authorId || notifiedMentionUserIds.has(taggedUserId)) {
              return;
            }

            try {
              const notificationId = await notificationService.createNotification(
                taggedUserId,
                'mention',
                postData.authorId,
                postData.authorUsername,
                postData.authorAvatarURL,
                'post',
                postId,
                'tagged you in a post',
                postData.mediaURLs?.[0]
              );

              await updateDoc(doc(db, 'notifications', notificationId), {
                message: 'tagged you in a post',
                postId,
              });
            } catch (error) {
              console.error('Post tag notification failed for user:', taggedUserId, error);
            }
          })
        );
      } catch (error) {
        console.error('Post tag notifications failed:', error);
      }
    }

    // Collaboration requests + notifications
    if (formattedCollaborators.length > 0) {
      await Promise.all(
        formattedCollaborators.map(async (collaborator) => {
          try {
            await this.requestCollaboration(
              postId,
              postData.authorId,
              postData.authorUsername,
              postData.authorAvatarURL,
              collaborator.userId,
              undefined,
              {
                toUsername: collaborator.username,
                toAvatarURL: collaborator.avatarURL,
                postMediaURL: postData.thumbnailURL || postData.mediaURLs?.[0] || '',
                postCaption: postData.caption || '',
                fromUserVerified: false,
              }
            );
          } catch (error) {
            console.error('Post collaboration setup failed:', collaborator.userId, error);
          }
        })
      );
    }

    return postId;
  }

  /**
   * Get post by ID
   */
  async getPost(postId: string, viewerId?: string): Promise<Post | null> {
    const cached = await cacheIntegration.getCachedPost(postId);
    if (cached) {
      const cachedPost = cached as Post;
      const canViewCached = await this.canViewerAccessPost(cachedPost, viewerId);
      if (!canViewCached) return null;
      const hydratedCached = viewerId ? ((await this.applyLikedStateToPosts([cachedPost], viewerId))[0] || cachedPost) : cachedPost;
      void this.refreshPostInBackground(postId);
      void this.warmPostAssets([hydratedCached as Post]);
      return hydratedCached as Post;
    }

    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      return null;
    }

    const postData = ({ ...postSnap.data(), postId }) as Post;
    const canView = await this.canViewerAccessPost(postData, viewerId);
    if (!canView) {
      return null;
    }
    if (postData.authorVerified === undefined) {
      try {
        const authorRef = doc(db, 'users', postData.authorId);
        const authorSnap = await getDoc(authorRef);
        if (authorSnap.exists()) {
          postData.authorVerified = authorSnap.data().verified || false;
        }
      } catch {
        postData.authorVerified = false;
      }
    }

    await cacheIntegration.cachePost(postId, postData);
    await this.warmPostAssets([postData]);
    if (viewerId) {
      return ((await this.applyLikedStateToPosts([postData], viewerId))[0] || postData) as Post;
    }
    return postData;
  }
  /**
   * Update post
   */
  async updatePost(postId: string, updates: Partial<Post>): Promise<void> {
    const postRef = doc(db, 'posts', postId);

    await updateDoc(postRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await cacheIntegration.invalidatePost(postId);
  }

  /**
   * Delete post
   */
  async deletePost(postId: string, authorId: string): Promise<void> {
    // Get post data first to access media URLs
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const postData = postSnap.data() as Post;

    // Delete media from Supabase if exists
    if (postData.mediaURLs && postData.mediaURLs.length > 0) {
      const { supabase } = await import('../config/supabase');
      
      for (const mediaURL of postData.mediaURLs) {
        try {
          // Extract file path from URL
          const urlParts = mediaURL.split('/storage/v1/object/public/posts/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            await supabase.storage.from('posts').remove([filePath]);
          }
        } catch (error) {
          console.error('Failed to delete media from Supabase:', error);
          // Continue with Firestore deletion even if storage deletion fails
        }
      }
    }

    const batch = writeBatch(db);

    // Delete post document
    batch.delete(postRef);

    // Update user's post count
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, {
      'stats.postsCount': increment(-1),
    });

    await batch.commit();
    await cacheIntegration.invalidatePost(postId);
  }

  /**
   * Get user's posts (paginated)
   */
  async getUserPosts(
    userId: string,
    limitCount = 12,
    lastDoc?: DocumentSnapshot,
    forceFresh = false,
    viewerId?: string
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    const shouldCache = !lastDoc;
    if (shouldCache && !forceFresh && !viewerId) {
      const cached = await cacheIntegration.getCachedUserPosts(userId);
      if (Array.isArray(cached) && cached.length > 0) {
        void this.refreshUserPostsInBackground(userId, limitCount);
        void this.warmPostAssets(cached as Post[]);
        return { posts: cached as Post[], lastDoc: null };
      }
    }
    const postsRef = collection(db, 'posts');
    const hasAcceptedCollab = (postData: any) => {
      const collaborators = Array.isArray(postData?.collaborators) ? postData.collaborators : [];
      return collaborators.some((collab: any) => {
        if (!collab) return false;
        if (typeof collab === 'string') return false;
        return collab.userId === userId && collab.status === 'accepted';
      });
    };
    const enrichAuthorVerified = async (postData: Post): Promise<Post> => {
      if (postData.authorVerified !== undefined) return postData;

      try {
        const authorRef = doc(db, 'users', postData.authorId);
        const authorSnap = await getDoc(authorRef);
        postData.authorVerified = authorSnap.exists() ? (authorSnap.data().verified || false) : false;
      } catch {
        postData.authorVerified = false;
      }
      return postData;
    };

    let q = query(
      postsRef,
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);

    let posts = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const raw = docSnap.data() as any;
        const postData = ({ ...raw, postId: raw?.postId || docSnap.id }) as Post;
        return enrichAuthorVerified(postData);
      })
    );

    // For first page only: include recent accepted collaboration posts on this profile.
    if (!lastDoc) {
      try {
        const recentSnapshot = await getDocs(
          query(postsRef, orderBy('createdAt', 'desc'), limit(Math.max(limitCount * 8, 120)))
        );
        const collabPosts = await Promise.all(
          recentSnapshot.docs
            .map((docSnap) => {
              const raw = docSnap.data() as any;
              return { ...raw, postId: raw?.postId || docSnap.id };
            })
            .filter((postData: any) => postData?.authorId !== userId && hasAcceptedCollab(postData))
            .map((postData: any) => enrichAuthorVerified(postData as Post))
        );

        const merged = new Map<string, Post>();
        [...posts, ...collabPosts].forEach((entry) => {
          if (!entry?.postId) return;
          merged.set(entry.postId, entry);
        });

        posts = Array.from(merged.values())
          .sort((a: any, b: any) => {
            const aMs = a?.createdAt?.toMillis?.() || a?.createdAt?.seconds * 1000 || 0;
            const bMs = b?.createdAt?.toMillis?.() || b?.createdAt?.seconds * 1000 || 0;
            return bMs - aMs;
          })
          .slice(0, limitCount);
      } catch (error) {
        console.error('Failed to merge collaboration posts in profile feed:', error);
      }
    }

    let visiblePosts = posts;
    if (viewerId) {
      let followingIdSet = new Set<string>();
      if (viewerId !== userId) {
        try {
          const { userService } = await import('./user.service');
          followingIdSet = new Set(await userService.getFollowing(viewerId, 500));
        } catch {
          followingIdSet = new Set<string>();
        }
      }
      const closeFriendAudienceCache = new Map<string, boolean>();
      visiblePosts = (
        await Promise.all(
          posts.map(async (postData) => (
            await this.canViewerAccessAudience(
              postData.authorId,
              postData.audience as any,
              followingIdSet,
              viewerId,
              closeFriendAudienceCache
            )
              ? postData
              : null
          ))
        )
      ).filter(Boolean) as Post[];
    }

    const hydratedPosts = viewerId ? await this.applyLikedStateToPosts(visiblePosts, viewerId) : visiblePosts;

    if (shouldCache && !viewerId) {
      await cacheIntegration.cacheUserPosts(userId, hydratedPosts);
      void this.warmPostAssets(hydratedPosts);
    }

    return {
      posts: hydratedPosts,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    };
  }
  /**
   * Get posts by hashtag
   */
  async getPostsByHashtag(
    tag: string,
    limitCount = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    const postsRef = collection(db, 'posts');
    const cleanHashtag = tag.replace(/^#/, '');

    let q = query(
      postsRef,
      where('tags', 'array-contains', cleanHashtag),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);

    // Enrich posts with author verified status
    const posts = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const postData = docSnap.data() as Post;
        
        if (postData.authorVerified === undefined) {
          try {
            const authorRef = doc(db, 'users', postData.authorId);
            const authorSnap = await getDoc(authorRef);
            if (authorSnap.exists()) {
              postData.authorVerified = authorSnap.data().verified || false;
            }
          } catch (error) {
            postData.authorVerified = false;
          }
        }
        
        return postData;
      })
    );


    return {
      posts,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    };
  }

  /**
   * Get feed posts (from following list, excluding current user)
   * With smart caching for fast load
   */
  async getFeedPosts(
    followingIds: string[],
    currentUserId: string,
    limitCount = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    // Only cache first page (no lastDoc)
    const shouldCache = !lastDoc;
    
    // Try cache first (only for first page)
    if (shouldCache) {
      const cached = storageService.getCachedData<Post[]>(
        STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
        currentUserId
      );
      
      if (cached && cached.length > 0) {
        console.log('âš¡ Feed loaded from cache:', cached.length, 'posts');
        
        const hydratedCached = await this.applyLikedStateToPosts(cached, currentUserId);

        // Return cached immediately
        const result = { posts: hydratedCached, lastDoc: null };
        
        // Background refresh
        void this.refreshFeedCacheInBackground(followingIds, currentUserId, limitCount);
        void cacheIntegration.cacheFeedPosts(currentUserId, hydratedCached);
        void this.warmPostAssets(hydratedCached);
        
        return result;
      }
    }
    
    // Filter out current user from following list
    const followingOnly = (followingIds || []).filter(id => id !== currentUserId);
    
    // Firestore 'in' operator supports max 10 values
    const chunk = followingOnly.slice(0, 10);

    if (chunk.length === 0) {
      const explorePosts = await this.getExplorePosts(Math.max(limitCount * 2, 40), currentUserId);
      const randomPosts = explorePosts
        .filter((post) => post.authorId !== currentUserId)
        .sort(() => Math.random() - 0.5)
        .slice(0, limitCount);
      if (shouldCache && randomPosts.length > 0) {
        storageService.setCachedData(
          STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
          currentUserId,
          randomPosts,
          30 * 60 * 1000
        );
        await cacheIntegration.cacheFeedPosts(currentUserId, randomPosts);
        void this.warmPostAssets(randomPosts);
      }
      return { posts: randomPosts, lastDoc: null };
    }

    const postsRef = collection(db, 'posts');
    let q = query(
      postsRef,
      where('authorId', 'in', chunk),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);

    // Enrich posts with author verified status
    const posts = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const postData = docSnap.data() as Post;
        
        // Fetch author's verified status if not already in post
        if (postData.authorVerified === undefined) {
          try {
            const authorRef = doc(db, 'users', postData.authorId);
            const authorSnap = await getDoc(authorRef);
            if (authorSnap.exists()) {
              postData.authorVerified = authorSnap.data().verified || false;
            }
          } catch (error) {
            console.error('Failed to fetch author verified status:', error);
            postData.authorVerified = false;
          }
        }
        
        return postData;
      })
    );

    const followingIdSet = new Set(followingOnly);
    const closeFriendAudienceCache = new Map<string, boolean>();
    const visiblePosts = (
      await Promise.all(
        posts.map(async (postData) => (
          await this.canViewerAccessAudience(
            postData.authorId,
            postData.audience as any,
            followingIdSet,
            currentUserId,
            closeFriendAudienceCache
          )
            ? postData
            : null
        ))
      )
    ).filter(Boolean) as Post[];

    const hydratedVisiblePosts = await this.applyLikedStateToPosts(visiblePosts, currentUserId);

    if (shouldCache && hydratedVisiblePosts.length > 0) {
      storageService.setCachedData(
        STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
        currentUserId,
        hydratedVisiblePosts,
        30 * 60 * 1000
      );
      await cacheIntegration.cacheFeedPosts(currentUserId, hydratedVisiblePosts);
      void this.warmPostAssets(hydratedVisiblePosts);
    }

    if (hydratedVisiblePosts.length > 0) {
      return {
        posts: hydratedVisiblePosts,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      };
    }

    const explorePosts = await this.getExplorePosts(Math.max(limitCount * 2, 40), currentUserId);
    const randomPosts = explorePosts
      .filter((post) => post.authorId !== currentUserId)
      .sort(() => Math.random() - 0.5)
      .slice(0, limitCount);

    if (shouldCache && randomPosts.length > 0) {
      storageService.setCachedData(
        STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
        currentUserId,
        randomPosts,
        30 * 60 * 1000
      );
      await cacheIntegration.cacheFeedPosts(currentUserId, randomPosts);
      void this.warmPostAssets(randomPosts);
    }

    return {
      posts: randomPosts,
      lastDoc: null,
    };
  }

  /**
   * Background refresh feed (don't wait for it)
   */
  private async refreshFeedInBackground(
    followingIds: string[],
    currentUserId: string,
    limitCount: number
  ): Promise<void> {
    try {
      console.log('ðŸ”„ Background refresh started...');
      
      // Fetch fresh data (without using cache)
      const followingOnly = followingIds.filter(id => id !== currentUserId);
      const chunk = followingOnly.slice(0, 10);

      if (chunk.length === 0) return;

      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('authorId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      
      const posts = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const postData = docSnap.data() as Post;
          
          if (postData.authorVerified === undefined) {
            try {
              const authorRef = doc(db, 'users', postData.authorId);
              const authorSnap = await getDoc(authorRef);
              if (authorSnap.exists()) {
                postData.authorVerified = authorSnap.data().verified || false;
              }
            } catch (error) {
              postData.authorVerified = false;
            }
          }
          
          return postData;
        })
      );

      const followingIdSet = new Set(followingOnly);
      const closeFriendAudienceCache = new Map<string, boolean>();
      const visiblePosts = (
        await Promise.all(
          posts.map(async (postData) => (
            await this.canViewerAccessAudience(
              postData.authorId,
              postData.audience as any,
              followingIdSet,
              currentUserId,
              closeFriendAudienceCache
            )
              ? postData
              : null
          ))
        )
      ).filter(Boolean) as Post[];

      // Update cache with fresh data
      if (visiblePosts.length > 0) {
        storageService.setCachedData(
          STORAGE_KEYS.USER_SPECIFIC.CACHED_FEED,
          currentUserId,
          visiblePosts,
          30
        );
        console.log('??????? Background refresh complete:', visiblePosts.length, 'posts');
      }
    } catch (error) {
      console.error('âš ï¸ Background refresh failed:', error);
    }
  }

  /**
   * Get posts where user is mentioned/tagged
   */
  async getPostsByMention(
    username: string,
    limitCount = 12,
    lastDoc?: DocumentSnapshot
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    if (!username) {
      return { posts: [], lastDoc: null };
    }

    const postsRef = collection(db, 'posts');
    let q = query(
      postsRef,
      where('mentions', 'array-contains', username),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);

    return {
      posts: snapshot.docs.map((doc) => doc.data() as Post),
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    };
  }

  /**
   * Increment post view count
   */
  async incrementViewCount(postId: string): Promise<void> {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      'stats.viewsCount': increment(1),
      engagement: increment(1),
      lastEngagementAt: serverTimestamp(),
    });
  }

  // ==========================================
  // LIKE OPERATIONS
  // ==========================================

  /**
   * Set post liked state deterministically.
   */
  async setPostLiked(postId: string, userId: string, desiredLiked: boolean): Promise<{ liked: boolean; changed: boolean }> {
    const cachedPost = await cacheIntegration.getCachedPost(postId);
    const authorId = (cachedPost as any)?.authorId;

    let resolvedLiked = desiredLiked;
    let changed = false;

    await cacheIntegration.runOptimisticPostMutation({
      postId,
      viewerId: userId,
      authorId,
      patch: {
        liked: desiredLiked,
      },
      throttleMs: 90,
      retries: 2,
      execute: async () => {
        await runTransaction(db, async (tx) => {
          const likeRef = doc(db, `posts/${postId}/likes/${userId}`);
          const likeIndexRef = doc(db, 'users', userId, 'likedContent', likeService.getIndexDocId('post', postId));
          const postRef = doc(db, 'posts', postId);
          const [likeSnap, postSnap] = await Promise.all([tx.get(likeRef), tx.get(postRef)]);

          if (!postSnap.exists()) {
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

          const postData = postSnap.data() as any;
          const currentLikes = Number(postData?.stats?.likesCount || 0);
          const currentEngagement = Number(postData?.engagement || 0);
          const delta = desiredLiked ? 1 : -1;

          if (desiredLiked) {
            tx.set(likeRef, {
              userId,
              likedAt: serverTimestamp(),
            } as Like);
            tx.set(likeIndexRef, {
              contentType: 'post',
              contentId: postId,
              likedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.delete(likeRef);
            tx.delete(likeIndexRef);
          }

          tx.update(postRef, {
            'stats.likesCount': Math.max(0, currentLikes + delta),
            engagement: Math.max(0, currentEngagement + delta),
            lastEngagementAt: serverTimestamp(),
          });

          resolvedLiked = desiredLiked;
          changed = true;
        });
      },
      revalidate: async () => {
        await this.refreshPostInBackground(postId);
        if (authorId) {
          await this.refreshUserPostsInBackground(authorId);
        }
      },
    });

    return { liked: resolvedLiked, changed };
  }

  /**
   * Like a post
   */
  async likePost(postId: string, userId: string): Promise<void> {
    const result = await this.setPostLiked(postId, userId, true);
    if (result.changed && result.liked) {
      this.notifyPostLike(postId, userId);
    }
  }

  /**
   * Unlike a post
   */
  async unlikePost(postId: string, userId: string): Promise<void> {
    await this.setPostLiked(postId, userId, false);
  }

  /**
   * Check if user liked post
   */
  async hasLiked(postId: string, userId: string): Promise<boolean> {
    return this.isPostLiked(postId, userId);
  }
  /**
   * Get list of post IDs that user has liked from given array
   */
  async getUserLikedPosts(userId: string, postIds: string[]): Promise<string[]> {
    if (!postIds.length || !userId) return [];

    const lookupItems: LikeLookupItem[] = postIds.map((postId) => ({ type: 'post', id: postId }));
    const likedMap = await likeService.getLikedMap(userId, lookupItems);
    return postIds.filter((postId) => !!likedMap[likeService.toLookupKey('post', postId)]);
  }
  // ==========================================
  // COMMENT OPERATIONS
  // ==========================================

  /**
   * Add comment to post
   */
  async addComment(
    postId: string,
    authorId: string,
    authorUsername: string,
    authorAvatarURL: string,
    text: string,
    parentCommentId?: string,
    mentions: string[] = [],
    collectionType: 'posts' | 'glimpses' = 'posts'
  ): Promise<string> {
    const batch = writeBatch(db);

    // Create comment
    const commentRef = doc(collection(db, `${collectionType}/${postId}/comments`));
    const commentId = commentRef.id;

    batch.set(commentRef, {
      commentId,
      postId,
      authorId,
      authorUsername,
      authorAvatarURL,
      text,
      parentCommentId: parentCommentId || null,
      mentions,
      likesCount: 0,
      repliesCount: 0,
      isPinned: false,
      isEdited: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Comment);

    // If this is a reply, increment parent comment's repliesCount
    if (parentCommentId) {
      const parentCommentRef = doc(db, `${collectionType}/${postId}/comments/${parentCommentId}`);
      batch.update(parentCommentRef, {
        repliesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    // Update parent stats
    const postRef = doc(db, collectionType, postId);
    const statsUpdate: Record<string, any> = {
      'stats.commentsCount': increment(1),
      engagement: increment(1),
      lastEngagementAt: serverTimestamp(),
    };
    if (collectionType === 'glimpses') {
      statsUpdate.repliesCount = increment(1);
    }
    batch.update(postRef, statsUpdate);

    await batch.commit();

    // Send notification to post owner / replied commenter (fire and forget)
    if (collectionType === 'posts') {
      this.notifyPostComment(postId, authorId, authorUsername, authorAvatarURL, text, commentId, parentCommentId || undefined);
    }

    return commentId;
  }

  /**
   * Get post comments (paginated)
   */
  async getComments(
    postId: string,
    limitCount = 50,
    lastDoc?: DocumentSnapshot
  ): Promise<{ comments: Comment[]; lastDoc: DocumentSnapshot | null }> {
    const commentsRef = collection(db, `posts/${postId}/comments`);
    let q = query(
      commentsRef,
      where('parentCommentId', '==', null),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const comments = snapshot.docs.map((doc) => doc.data() as Comment);

    // Sort by creation date
    const sortedComments = comments.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime; // Most recent first
    });

    return {
      comments: sortedComments,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    };
  }

  /**
   * Delete comment
   */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    const batch = writeBatch(db);

    // Delete comment
    const commentRef = doc(db, `posts/${postId}/comments/${commentId}`);
    batch.delete(commentRef);

    // Update post stats
    const postRef = doc(db, 'posts', postId);
    batch.update(postRef, {
      'stats.commentsCount': increment(-1),
      engagement: increment(-1),
    });

    await batch.commit();
    await cacheIntegration.invalidatePost(postId);
  }

  /**
   * Like a comment
   */
  async likeComment(postId: string, commentId: string, userId: string): Promise<void> {
    const batch = writeBatch(db);

    // Add like
    const likeRef = doc(db, `posts/${postId}/comments/${commentId}/likes/${userId}`);
    batch.set(likeRef, {
      userId,
      likedAt: serverTimestamp(),
    });

    // Update comment likes count
    const commentRef = doc(db, `posts/${postId}/comments/${commentId}`);
    batch.update(commentRef, {
      likesCount: increment(1),
    });

    await batch.commit();
    await cacheIntegration.invalidatePost(postId);
  }

  /**
   * Unlike a comment
   */
  async unlikeComment(postId: string, commentId: string, userId: string): Promise<void> {
    const batch = writeBatch(db);

    // Remove like
    const likeRef = doc(db, `posts/${postId}/comments/${commentId}/likes/${userId}`);
    batch.delete(likeRef);

    // Update comment likes count
    const commentRef = doc(db, `posts/${postId}/comments/${commentId}`);
    batch.update(commentRef, {
      likesCount: increment(-1),
    });

    await batch.commit();
    await cacheIntegration.invalidatePost(postId);
  }

  // ==========================================
  // SEARCH & DISCOVER
  // ==========================================

  /**
   * Search posts by hashtag
   */
  async searchByHashtag(
    tag: string,
    limitCount = 20
  ): Promise<Post[]> {
    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef,
      where('tags', 'array-contains', tag),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Post);
  }

  // ==========================================
  // NOTIFICATION HELPERS (Private)
  // ==========================================

  /**
   * Send like notification (async, non-blocking)
   */
  private async notifyPostLike(postId: string, userId: string): Promise<void> {
    try {
      const post = await this.getPost(postId);
      if (!post || post.authorId === userId) return;

      const { userService } = await import('./user.service');
      const liker = await userService.getUser(userId);
      if (!liker) return;

      const { notificationService } = await import('./notification.service');
      await notificationService.notifyLike(
        post.authorId,
        userId,
        liker.username,
        liker.avatarURL || '',
        postId,
        post.mediaURLs[0]
      );
    } catch (error) {
      console.error('Like notification failed:', error);
    }
  }

  /**
   * Send comment notification (async, non-blocking)
   */
  private async notifyPostComment(
    postId: string,
    authorId: string,
    authorUsername: string,
    authorAvatarURL: string,
    text: string,
    commentId: string,
    parentCommentId?: string
  ): Promise<void> {
    try {
      const post = await this.getPost(postId);
      if (!post) return;

      const { notificationService } = await import('./notification.service');
      const baseExtra = {
        postId,
        commentId,
        parentCommentId: parentCommentId || undefined,
        targetCommentId: parentCommentId || commentId,
      };

      if (post.authorId !== authorId) {
        await notificationService.notifyComment(
          post.authorId,
          authorId,
          authorUsername,
          authorAvatarURL,
          postId,
          text,
          post.mediaURLs[0],
          {
            ...baseExtra,
            message: parentCommentId ? `replied to your comment: ${text}` : undefined,
          }
        );
      }

      if (!parentCommentId) return;

      const parentCommentRef = doc(db, `posts/${postId}/comments/${parentCommentId}`);
      const parentCommentSnap = await getDoc(parentCommentRef).catch(() => null as any);
      const parentCommentData: any = parentCommentSnap?.exists() ? parentCommentSnap.data() : null;
      const parentRecipientId = parentCommentData?.authorId;

      if (!parentRecipientId || parentRecipientId === authorId || parentRecipientId === post.authorId) return;

      await notificationService.notifyComment(
        parentRecipientId,
        authorId,
        authorUsername,
        authorAvatarURL,
        postId,
        text,
        post.mediaURLs[0],
        {
          ...baseExtra,
          message: `replied to your comment: ${text}`,
        }
      );
    } catch (error) {
      console.error('Comment notification failed:', error);
    }
  }

  /**
   * Get trending posts (by engagement)
   */
  async getTrendingPosts(limitCount = 20, viewerId?: string): Promise<Post[]> {
    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef,
      orderBy('engagement', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    
    // Enrich posts with author verified status
    const posts = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const postData = docSnap.data() as Post;
        
        if (postData.authorVerified === undefined) {
          try {
            const authorRef = doc(db, 'users', postData.authorId);
            const authorSnap = await getDoc(authorRef);
            if (authorSnap.exists()) {
              postData.authorVerified = authorSnap.data().verified || false;
            }
          } catch (error) {
            postData.authorVerified = false;
          }
        }
        
        return postData;
      })
    );
    
    if (viewerId) {
      return this.applyLikedStateToPosts(posts, viewerId);
    }
    return posts;
  }

  // ==========================================
  // COLLABORATION OPERATIONS
  // ==========================================

    /**
   * Request collaboration on a post
   */
  async requestCollaboration(
    postId: string,
    fromUserId: string,
    fromUsername: string,
    fromAvatarURL: string,
    toUserId: string,
    message?: string,
    options?: {
      toUsername?: string;
      toAvatarURL?: string;
      postMediaURL?: string;
      postCaption?: string;
      fromUserVerified?: boolean;
      createNotification?: boolean;
      createDM?: boolean;
    }
  ): Promise<string> {
    const collabId = toUserId;
    const collabRef = doc(db, `posts/${postId}/collaborationRequests/${collabId}`);
    const requestMessage = message || 'wants to collaborate on your post';

    let fromUserVerified = !!options?.fromUserVerified;
    if (!fromUserVerified) {
      try {
        const fromUserSnap = await getDoc(doc(db, 'users', fromUserId));
        const fromUserData = fromUserSnap.exists() ? (fromUserSnap.data() as any) : {};
        fromUserVerified = !!fromUserData?.verified;
      } catch {}
    }

    let toUsername = options?.toUsername || '';
    let toAvatarURL = options?.toAvatarURL || '';
    if (!toUsername || !toAvatarURL) {
      try {
        const toUserSnap = await getDoc(doc(db, 'users', toUserId));
        const toUserData = toUserSnap.exists() ? (toUserSnap.data() as any) : {};
        if (!toUsername) toUsername = toUserData?.username || '';
        if (!toAvatarURL) toAvatarURL = toUserData?.avatarURL || '';
      } catch {}
    }

    let postMediaURL = options?.postMediaURL || '';
    let postCaption = options?.postCaption || '';
    if (!postMediaURL || !postCaption) {
      try {
        const postSnap = await getDoc(doc(db, 'posts', postId));
        const postData = postSnap.exists() ? (postSnap.data() as any) : {};
        if (!postMediaURL) {
          postMediaURL = postData?.thumbnailURL || postData?.mediaURLs?.[0] || '';
        }
        if (!postCaption) {
          postCaption = postData?.caption || '';
        }
      } catch {}
    }

    let requestStored = true;
    try {
      await setDoc(collabRef, {
        requestId: collabId,
        postId,
        fromUserId,
        fromUsername,
        fromAvatarURL,
        toUserId,
        toUsername,
        toAvatarURL,
        message: requestMessage,
        status: 'pending',
        conversationId: '',
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      requestStored = false;
      console.error('Post collaboration request doc create failed; continuing with DM+notification:', error);
    }

    if (options?.createDM !== false) {
      try {
        const conversationId = await this.sendPostCollaborationDM(
          postId,
          collabId,
          fromUserId,
          fromUsername,
          fromAvatarURL,
          toUserId,
          postMediaURL,
          postCaption,
          fromUserVerified
        );

        if (requestStored) {
          await updateDoc(collabRef, {
            conversationId,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error('Failed to send post collaboration DM:', error);
      }
    }
    if (options?.createNotification !== false) {
      try {
        const { notificationService } = await import('./notification.service');
        const notificationId = await notificationService.createNotification(
          toUserId,
          'collaboration_request',
          fromUserId,
          fromUsername,
          fromAvatarURL,
          'post',
          postId,
          requestMessage,
          postMediaURL
        );

        await updateDoc(doc(db, 'notifications', notificationId), {
          postId,
          requestId: collabId,
          message: requestMessage,
          refMediaURL: postMediaURL,
        });
      } catch (error) {
        console.error('Failed to send post collaboration notification:', error);
      }
    }

    return collabId;
  }

  /**
   * Accept collaboration request
   */
  async acceptCollaboration(postId: string, requestId: string, collaboratorId: string): Promise<void> {
    const batch = writeBatch(db);

    const requestRef = doc(db, `posts/${postId}/collaborationRequests/${requestId}`);
    const requestSnap = await getDoc(requestRef).catch(() => null as any);
    const requestData: any = requestSnap?.exists() ? requestSnap.data() : {};

    if (requestSnap?.exists()) {
      batch.update(requestRef, {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
      });
    }

    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    const post = (postSnap.data() || {}) as any;

    const collaborators = Array.isArray(post.collaborators) ? post.collaborators : [];
    let found = false;

    const updatedCollaborators = collaborators.map((collab: any) => {
      if (typeof collab === 'string') {
        if (collab === collaboratorId) {
          found = true;
          return {
            userId: collaboratorId,
            username: requestData?.toUsername || requestData?.username || '',
            avatarURL: requestData?.toAvatarURL || requestData?.avatarURL || '',
            status: 'accepted',
            addedAt: requestData?.createdAt || Timestamp.now(),
            acceptedAt: Timestamp.now(),
          };
        }
        return collab;
      }

      if (collab?.userId === collaboratorId) {
        found = true;
        return {
          ...collab,
          status: 'accepted',
          acceptedAt: Timestamp.now(),
        };
      }

      return collab;
    });

    if (!found) {
      updatedCollaborators.push({
        userId: collaboratorId,
        username: requestData?.toUsername || requestData?.username || '',
        avatarURL: requestData?.toAvatarURL || requestData?.avatarURL || '',
        status: 'accepted',
        addedAt: requestData?.createdAt || Timestamp.now(),
        acceptedAt: Timestamp.now(),
      });
    }

    batch.update(postRef, {
      collaborators: updatedCollaborators,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    await this.setPostCollaborationMessageStatus(requestData?.conversationId, requestId, 'accepted');
  }

  /**
   * Reject collaboration request
   */
  async rejectCollaboration(postId: string, requestId: string, collaboratorId?: string): Promise<void> {
    const requestRef = doc(db, `posts/${postId}/collaborationRequests/${requestId}`);
    const requestSnap = await getDoc(requestRef).catch(() => null as any);
    const requestData: any = requestSnap?.exists() ? requestSnap.data() : {};

    if (requestSnap?.exists()) {
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectedAt: Timestamp.now(),
      });
    }

    const effectiveCollaboratorId = requestData?.toUserId || collaboratorId;

    // Mark pending collaborator as declined on post document when possible.
    if (effectiveCollaboratorId) {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const post = postSnap.data() as any;
        const collaborators = Array.isArray(post.collaborators) ? post.collaborators : [];
        const updatedCollaborators = collaborators.map((collab: any) => {
          if (collab?.userId === effectiveCollaboratorId && collab?.status === 'pending') {
            return { ...collab, status: 'declined', rejectedAt: Timestamp.now() };
          }
          return collab;
        });

        await updateDoc(postRef, {
          collaborators: updatedCollaborators,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await this.setPostCollaborationMessageStatus(requestData?.conversationId, requestId, 'rejected');
  }

  /**
   * Get collaboration requests for a post
   */
  async getCollaborationRequests(postId: string): Promise<any[]> {
    const requestsRef = collection(db, `posts/${postId}/collaborationRequests`);
    const q = query(requestsRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  }

  /**
   * Remove collaborator from post
   */
  async removeCollaborator(postId: string, collaboratorId: string): Promise<void> {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);
    const post = postSnap.data() as any;
    const collaborators = Array.isArray(post?.collaborators) ? post.collaborators : [];

    await updateDoc(postRef, {
      collaborators: collaborators.filter((collab: any) => (typeof collab === 'string' ? collab !== collaboratorId : collab?.userId !== collaboratorId)),
      updatedAt: serverTimestamp(),
    });
  }

  // ==========================================
  // COMMENT MANAGEMENT
  // ==========================================

  /**
   * Pin a comment (only post owner can pin)
   */
  async pinComment(postId: string, commentId: string): Promise<void> {
    const commentRef = doc(db, `posts/${postId}/comments/${commentId}`);
    await updateDoc(commentRef, {
      isPinned: true,
      pinnedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Unpin a comment
   */
  async unpinComment(postId: string, commentId: string): Promise<void> {
    const commentRef = doc(db, `posts/${postId}/comments/${commentId}`);
    await updateDoc(commentRef, {
      isPinned: false,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Report a comment
   */
  async reportComment(
    postId: string,
    commentId: string,
    reporterId: string,
    reason: string
  ): Promise<void> {
    const reportRef = doc(collection(db, 'reports'));
    await setDoc(reportRef, {
      reportId: reportRef.id,
      reporterId,
      targetType: 'comment',
      targetId: commentId,
      postId,
      reason,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  /**
   * Report a post
   */
  async reportPost(
    postId: string,
    reporterId: string,
    reason: string
  ): Promise<void> {
    const reportRef = doc(collection(db, 'reports'));
    await setDoc(reportRef, {
      reportId: reportRef.id,
      reporterId,
      targetType: 'post',
      targetId: postId,
      reason,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  // ==========================================
  // LIKES MANAGEMENT
  // ==========================================

  /**
   * Get users who liked a post
   */
  async getPostLikes(postId: string, limitCount = 50): Promise<any[]> {
    const likesRef = collection(db, `posts/${postId}/likes`);
    const q = query(likesRef, orderBy('likedAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);

    const userIds = snapshot.docs.map(doc => doc.id);
    if (userIds.length === 0) return [];

    // Get user details for each like
    const users = await Promise.all(
      userIds.map(async (userId) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          return {
            userId,
            username: userData.username,
            displayName: userData.displayName,
            avatarURL: userData.avatarURL || '',
          };
        }
        return null;
      })
    );

    return users.filter(u => u !== null);
  }

  /**
   * Get users who liked a comment
   */
  async getCommentLikes(postId: string, commentId: string): Promise<any[]> {
    const likesRef = collection(db, `posts/${postId}/comments/${commentId}/likes`);
    const snapshot = await getDocs(likesRef);

    const userIds = snapshot.docs.map(doc => doc.id);
    if (userIds.length === 0) return [];

    // Get user details
    const users = await Promise.all(
      userIds.map(async (userId) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          return {
            userId,
            username: userData.username,
            displayName: userData.displayName,
            avatarURL: userData.avatarURL || '',
          };
        }
        return null;
      })
    );

    return users.filter(u => u !== null);
  }

  /**
   * Get posts where a user is tagged
   */
  async getPostsByTaggedUser(
    userId: string,
    limitCount = 20,
    lastDoc?: DocumentSnapshot,
    viewerId?: string
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    const postsRef = collection(db, 'posts');
    let primaryQuery = query(
      postsRef,
      where('taggedPeople', 'array-contains', userId),
      limit(Math.max(limitCount * 3, 40))
    );

    if (lastDoc) {
      primaryQuery = query(primaryQuery, startAfter(lastDoc));
    }

    const primarySnapshot = await getDocs(primaryQuery).catch(() => ({ docs: [] as any[] }));
    const merged = new Map<string, Post>();

    primarySnapshot.docs.forEach((docSnap: any) => {
      const data = docSnap.data() as any;
      if (!this.isUserTaggedInPost(data, userId)) return;
      merged.set(docSnap.id, { ...data, postId: data.postId || docSnap.id } as Post);
    });

    if (merged.size < limitCount) {
      const fallbackSnapshot = await getDocs(
        query(postsRef, orderBy('createdAt', 'desc'), limit(Math.max(limitCount * 6, 120)))
      );

      fallbackSnapshot.docs.forEach((docSnap) => {
        if (merged.has(docSnap.id)) return;
        const data = docSnap.data() as any;
        if (!this.isUserTaggedInPost(data, userId)) return;
        merged.set(docSnap.id, { ...data, postId: data.postId || docSnap.id } as Post);
      });
    }

    const posts = Array.from(merged.values())
      .sort((a: any, b: any) => {
        const aMs = a?.createdAt?.toMillis?.() || a?.createdAt?.seconds * 1000 || 0;
        const bMs = b?.createdAt?.toMillis?.() || b?.createdAt?.seconds * 1000 || 0;
        return bMs - aMs;
      })
      .slice(0, limitCount);

    let visiblePosts = posts;
    if (viewerId) {
      let followingIdSet = new Set<string>();
      try {
        const { userService } = await import('./user.service');
        followingIdSet = new Set(await userService.getFollowing(viewerId, 500));
      } catch {
        followingIdSet = new Set<string>();
      }
      const closeFriendAudienceCache = new Map<string, boolean>();
      visiblePosts = (
        await Promise.all(
          posts.map(async (postData) => (
            await this.canViewerAccessAudience(
              postData.authorId,
              postData.audience as any,
              followingIdSet,
              viewerId,
              closeFriendAudienceCache
            )
              ? postData
              : null
          ))
        )
      ).filter(Boolean) as Post[];
    }

    const hydratedPosts = viewerId ? await this.applyLikedStateToPosts(visiblePosts, viewerId) : visiblePosts;

    return {
      posts: hydratedPosts,
      lastDoc: primarySnapshot.docs?.[primarySnapshot.docs.length - 1] || null,
    };
  }

  /**
   * Get saved posts for a user
   */
  async getSavedPosts(userId: string, limitCount = 20): Promise<Post[]> {
    try {
      // Use collections-based storage which is permitted by rules
      return await collectionService.getAllSavedPosts(userId, limitCount);
    } catch (error) {
      console.error('Error getting saved posts:', error);
      return [];
    }
  }

  /**
   * Get archived posts for a user
   */
  async getArchivedPosts(userId: string, limitCount = 20): Promise<Post[]> {
    try {
      const archivedRef = collection(db, `users/${userId}/archivedPosts`);
      const q = query(archivedRef, orderBy('archivedAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      
      const postIds = snapshot.docs.map(doc => doc.data().postId);
      if (postIds.length === 0) return [];
      
      // Fetch actual posts
      const posts = await Promise.all(
        postIds.map(postId => this.getPost(postId))
      );
      
      return posts.filter(post => post !== null) as Post[];
    } catch (error) {
      console.error('Error getting archived posts:', error);
      return [];
    }
  }

  /**
   * Get explore/discovery posts (trending and popular)
   */
  async getExplorePosts(limitCount = 20, viewerId?: string): Promise<Post[]> {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        orderBy('engagement', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const posts = snapshot.docs
        .map(doc => ({
          ...doc.data(),
          postId: doc.id,
        }) as Post)
        .filter((post) => this.normalizeAudience(post.audience) === 'public');

      if (viewerId) {
        return this.applyLikedStateToPosts(posts, viewerId);
      }
      return posts;
    } catch (error) {
      console.error('Error getting explore posts:', error);
      return [];
    }
  }

  /**
   * Get user's glimpses
   */
  async getUserGlimpses(userId: string, limitCount: number = 10): Promise<Story[]> {
    try {
      const glimpsesRef = collection(db, 'glimpses');
      const q = query(
        glimpsesRef,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        storyId: doc.id,
        glimpseId: doc.id,
        ...doc.data()
      })) as any as Story[];
    } catch (error) {
      console.error('Error getting user glimpses:', error);
      return [];
    }
  }

  



    /**
   * Check if user has liked a post
   */
  async isPostLiked(postId: string, userId: string): Promise<boolean> {
    try {
      const likedMap = await likeService.getLikedMap(userId, [{ type: 'post', id: postId }]);
      if (likedMap[likeService.toLookupKey('post', postId)]) {
        return true;
      }
      const likeRef = doc(db, 'posts', postId, 'likes', userId);
      const likeSnap = await getDoc(likeRef);
      return likeSnap.exists();
    } catch (error) {
      console.error('Error checking post like status:', error);
      return false;
    }
  }
/**
   * Check if user has saved a post
   */
  async isPostSaved(postId: string, userId: string): Promise<boolean> {
    try {
      const saveRef = doc(db, 'users', userId, 'saved', postId);
      const saveSnap = await getDoc(saveRef);
      return saveSnap.exists();
    } catch (error) {
      console.error('Error checking post save status:', error);
      return false;
    }
  }

  /**
   * Get posts by location
   * Recovered symbol (was removed during refactor) — used by LocationScreen.
   */
  async getPostsByLocation(
    location: string,
    limitCount = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null }> {
    try {
      const postsRef = collection(db, 'posts');
      let q = query(
        postsRef,
        where('location', '==', location),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map(doc => ({
        ...doc.data(),
        postId: doc.id,
      })) as Post[];

      return {
        posts,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      };
    } catch (error) {
      console.error('Error getting posts by location:', error);
      return { posts: [], lastDoc: null };
    }
  }

  /**
   * Get the current user's draft posts.
   * Drafts are stored in a per-user `drafts` subcollection.
   */
  async getDrafts(userId: string): Promise<any[]> {
    try {
      const draftsRef = collection(db, 'users', userId, 'drafts');
      const q = query(draftsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(docSnap => ({
        draftId: docSnap.id,
        ...docSnap.data(),
      }));
    } catch (error) {
      console.error('Error getting drafts:', error);
      return [];
    }
  }

  /**
   * Delete a draft post.
   */
  async deleteDraft(userId: string, draftId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', userId, 'drafts', draftId));
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const postService = new PostService();















































