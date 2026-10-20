import { useState, useEffect, useRef } from 'react';
import { postService } from '../services/post.service';
import { collectionService } from '../services/collection.service';
import { cacheService } from '../services/cache.service';
import { cacheIntegration } from '../services/cacheIntegration.service';
import type { Post } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

export const usePost = (postId: string) => {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      try {
        setLoading(true);
        const data = await cacheService.getPost(
          postId,
          () => postService.getPost(postId)
        );
        setPost(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [postId]);

  return { post, loading, error };
};

export const useFeed = (page: number = 1) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const userId = user?.userId;

  useEffect(() => {
    if (!userId) return;

    const loadFeed = async () => {
      try {
        // Only show loading on initial load (page 1)
        if (page === 1) {
          setLoading(true);
        }
        
        // Get following list
        const { userService } = await import('../services/user.service');
        const { glimpseService } = await import('../services/glimpse.service');
        const followingIds = await cacheService.getFollowingList(
          userId,
          () => userService.getFollowing(userId)
        );
        
        console.log('📊 Feed Debug:', {
          userId,
          followingCount: followingIds.length,
          followingIds: followingIds.slice(0, 5),
        });
        
        // Get feed posts (excluding own posts)
        const feedData = await cacheService.getFeedPosts(
          userId,
          page,
          async () => {
            const result = await postService.getFeedPosts(followingIds, userId, 20);
            return result;
          }
        );

        const feedPosts = (feedData as any).posts || [];
        
        // Get glimpses from following users (excluding own glimpses)
        const glimpses = await glimpseService.getFollowingGlimpses(followingIds, userId, 20);
        
        console.log('📊 Feed Content:', {
          posts: feedPosts.length,
          glimpses: glimpses.length,
          total: feedPosts.length + glimpses.length
        });
        
        // Convert glimpses to post-like format for unified display
        // Filter out glimpses with invalid media URLs
        const glimpsesAsPosts = glimpses
          .filter((glimpse: any) => {
            // Only include glimpses with valid media URLs
            return glimpse.mediaURL && glimpse.mediaURL.trim() !== '';
          })
          .map((glimpse: any) => ({
            ...glimpse,
            postId: glimpse.glimpseId,
            postType: 'glimpse', // Mark as glimpse for special rendering
            mediaURLs: [glimpse.mediaURL], // Ensure media URL is array
          mediaType: glimpse.mediaType, // Pass video/image type
          caption: glimpse.caption,
          createdAt: glimpse.createdAt,
          authorId: glimpse.authorId,
          authorUsername: glimpse.authorUsername,
          authorAvatarURL: glimpse.authorAvatarURL, // Use correct field
          authorVerified: glimpse.authorVerified,
          backgroundMusic: glimpse.backgroundMusic, // Pass audio data
          stats: glimpse.stats || {
            likesCount: 0,
            commentsCount: 0,
            savesCount: 0,
            sharesCount: 0,
            viewsCount: 0,
          }
        }));
        
        // Mix posts and glimpses together, sort by createdAt
        const mixedContent = [...feedPosts, ...glimpsesAsPosts].sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
        });
        
        // Append content instead of replacing (only if page > 1)
        if (page === 1) {
          setPosts(mixedContent);
        } else {
          setPosts(prev => {
            // Deduplicate by postId
            const existingIds = new Set(prev.map(p => p.postId));
            const uniqueNew = mixedContent.filter((p: Post) => !existingIds.has(p.postId));
            return [...prev, ...uniqueNew];
          });
        }
        
        setHasMore(!!(feedData as any).lastDoc || glimpses.length >= 20);
      } catch (err: any) {
        console.error('Failed to load feed:', err);
        setError(err.message);
      } finally {
        if (page === 1) {
          setLoading(false);
        }
      }
    };

    loadFeed();
  }, [userId, page]);

  return { posts, loading, error, hasMore };
};

export const usePostActions = () => {
  const { user } = useAuth();
  const [liking, setLiking] = useState(false);
  const [commenting, setCommenting] = useState(false);

  const likePost = async (postId: string) => {
    if (!user) throw new Error('Not authenticated');
    
    setLiking(true);
    try {
      await postService.likePost(postId, user.userId);
    } catch (error) {
      throw error;
    } finally {
      setLiking(false);
    }
  };

  const unlikePost = async (postId: string) => {
    if (!user) throw new Error('Not authenticated');
    
    setLiking(true);
    try {
      await postService.unlikePost(postId, user.userId);
    } catch (error) {
      console.error('Failed to unlike post:', error);
      throw error;
    } finally {
      setLiking(false);
    }
  };

  const addComment = async (postId: string, text: string) => {
    if (!user) throw new Error('Not authenticated');
    
    setCommenting(true);
    try {
      await postService.addComment(
        postId,
        user.userId,
        user.username,
        user.avatarURL || '',
        text
      );
      cacheService.invalidatePost(postId);
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    } finally {
      setCommenting(false);
    }
  };
  const savePost = async (postId: string) => {
    if (!user) throw new Error('Not authenticated');
    await collectionService.savePost(user.userId, postId);
  };
  const unsavePost = async (postId: string) => {
    if (!user) throw new Error('Not authenticated');
    await collectionService.unsavePostFromAllCollections(user.userId, postId);
  };

  return {
    likePost,
    unlikePost,
    addComment,
    savePost,
    unsavePost,
    liking,
    commenting,
  };
};

export const useComments = (postId: string, collectionType: 'posts' | 'glimpses' = 'posts') => {
  const { user } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const commentsRef = useRef<any[]>([]);
  const commentsCacheKey = postId ? 'comments_v3:' + collectionType + ':' + postId : '';

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);
  const writeCommentsCache = (items: any[]) => {
    if (!commentsCacheKey) return;
    void cacheIntegration.cacheData(commentsCacheKey, items, 5 * 60 * 1000);
  };
  const updateComments = (updater: any[] | ((prev: any[]) => any[])) => {
    setComments((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeCommentsCache(next);
      return next;
    });
  };
  useEffect(() => {
    if (!postId) return;
    let active = true;
    const loadComments = async () => {
      try {
        if (commentsRef.current.length === 0) {
          setLoading(true);
        }
        if (commentsRef.current.length === 0 && commentsCacheKey) {
          const cached = await cacheIntegration.getCachedData(commentsCacheKey);
          if (active && Array.isArray(cached) && cached.length > 0) {
            setComments(cached);
            setLoading(false);
          }
        }
        const {
          collection: firestoreCollection,
          query,
          orderBy: firestoreOrderBy,
          getDocs,
          doc: firestoreDoc,
          getDoc,
        } = await import('firebase/firestore');
        const { db } = await import('../config/firebase');
        const commentsColRef = firestoreCollection(db, collectionType, postId, 'comments');
        const q = query(commentsColRef, firestoreOrderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const rawComments = snapshot.docs.map((docSnap) => ({
          commentId: docSnap.id,
          ...docSnap.data(),
        }));
        const authorIds = Array.from(new Set(rawComments.map((item: any) => item.authorId).filter(Boolean)));
        const authorVerification = new Map<string, boolean>();
        await Promise.all(authorIds.map(async (authorId) => {
          try {
            const userRef = firestoreDoc(db, 'users', authorId);
            const userSnap = await getDoc(userRef);
            authorVerification.set(authorId, !!userSnap.data()?.isVerified);
          } catch {
            authorVerification.set(authorId, false);
          }
        }));
        const commentsData = rawComments.map((item: any) => ({
          ...item,
          isLiked: false,
          isVerified: !!authorVerification.get(item.authorId),
        }));
        if (!active) return;
        setComments(commentsData);
        writeCommentsCache(commentsData);
        setLoading(false);
        if (user?.userId && snapshot.docs.length > 0) {
          void (async () => {
            try {
              const checks = await Promise.all(
                snapshot.docs.map(async (docSnap) => {
                  const likeRef = firestoreDoc(db, collectionType, postId, 'comments', docSnap.id, 'likes', user.userId);
                  const likeSnap = await getDoc(likeRef);
                  return { commentId: docSnap.id, liked: likeSnap.exists() };
                })
              );
              if (!active) return;
              const likedMap = new Map(checks.map((item) => [item.commentId, item.liked]));
              updateComments((prev) => prev.map((comment) => ({
                ...comment,
                isLiked: !!likedMap.get(comment.commentId),
              })));
            } catch (error) {
              console.error('Failed to hydrate liked comment state:', error);
            }
          })();
        }
      } catch (error) {
        console.error('Failed to load comments:', error);
        if (active && commentsRef.current.length === 0) {
          setComments([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadComments();
    return () => {
      active = false;
    };
  }, [collectionType, commentsCacheKey, postId, user?.userId]);
  const addComment = async (text: string, parentCommentId?: string) => {
    if (!user) throw new Error('Not authenticated');
    const pendingId = `pending-${Date.now()}`;
    const optimisticComment: any = {
      commentId: pendingId,
      authorId: user.userId,
      authorUsername: user.username,
      authorAvatarURL: user.avatarURL || '',
      text,
      createdAt: new Date(),
      likesCount: 0,
      isLiked: false,
      isVerified: !!(user as any)?.isVerified,
      ...(parentCommentId ? { parentCommentId } : {}),
    };
    updateComments((prev) => [optimisticComment, ...prev]);
    try {
      const commentId = await postService.addComment(
        postId,
        user.userId,
        user.username,
        user.avatarURL || '',
        text,
        parentCommentId,
        [],
        collectionType
      );
      updateComments((prev) => prev.map((comment) =>
        comment.commentId === pendingId ? { ...comment, commentId } : comment
      ));
    } catch (error) {
      updateComments((prev) => prev.filter((comment) => comment.commentId !== pendingId));
      throw error;
    }
  };
  const likeComment = async (commentId: string, glimpseAuthorId?: string) => {
    if (!user) throw new Error('Not authenticated');
    const {
      doc: firestoreDoc,
      setDoc,
      serverTimestamp,
      increment: firestoreIncrement,
      writeBatch,
    } = await import('firebase/firestore');
    const { db } = await import('../config/firebase');
    const isCreatorLike = glimpseAuthorId && user.userId === glimpseAuthorId;
    updateComments((prev) => prev.map((comment) =>
      comment.commentId === commentId
        ? {
            ...comment,
            likesCount: Math.max(0, Number(comment.likesCount || 0) + 1),
            isLiked: true,
            likedByCreator: isCreatorLike ? true : comment.likedByCreator,
          }
        : comment
    ));
    try {
      const batch = writeBatch(db);
      const likeRef = firestoreDoc(db, collectionType, postId, 'comments', commentId, 'likes', user.userId);
      batch.set(likeRef, {
        userId: user.userId,
        likedAt: serverTimestamp(),
      });
      const commentRef = firestoreDoc(db, collectionType, postId, 'comments', commentId);
      const updateData: any = {
        likesCount: firestoreIncrement(1),
        updatedAt: serverTimestamp(),
      };
      if (isCreatorLike) updateData.likedByCreator = true;
      batch.update(commentRef, updateData);
      await batch.commit();
    } catch (error) {
      updateComments((prev) => prev.map((comment) =>
        comment.commentId === commentId
          ? {
              ...comment,
              likesCount: Math.max(0, Number(comment.likesCount || 1) - 1),
              isLiked: false,
            }
          : comment
      ));
      throw error;
    }
  };
  const unlikeComment = async (commentId: string, _glimpseAuthorId?: string) => {
    if (!user) throw new Error('Not authenticated');
    const {
      doc: firestoreDoc,
      writeBatch,
      serverTimestamp,
      increment: firestoreIncrement,
    } = await import('firebase/firestore');
    const { db } = await import('../config/firebase');
    updateComments((prev) => prev.map((comment) =>
      comment.commentId === commentId
        ? {
            ...comment,
            likesCount: Math.max(0, Number(comment.likesCount || 0) - 1),
            isLiked: false,
          }
        : comment
    ));
    try {
      const batch = writeBatch(db);
      const likeRef = firestoreDoc(db, collectionType, postId, 'comments', commentId, 'likes', user.userId);
      batch.delete(likeRef);
      const commentRef = firestoreDoc(db, collectionType, postId, 'comments', commentId);
      batch.update(commentRef, {
        likesCount: firestoreIncrement(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      updateComments((prev) => prev.map((comment) =>
        comment.commentId === commentId
          ? {
              ...comment,
              likesCount: Math.max(0, Number(comment.likesCount || 0) + 1),
              isLiked: true,
            }
          : comment
      ));
      throw error;
    }
  };
  const deleteComment = async (commentId: string) => {
    if (!user) throw new Error('Not authenticated');
    const {
      doc: firestoreDoc,
      deleteDoc,
      updateDoc,
      increment: firestoreIncrement,
    } = await import('firebase/firestore');
    const { db } = await import('../config/firebase');
    const snapshot = comments;
    updateComments((prev) => prev.filter((comment) => comment.commentId !== commentId));
    try {
      const commentRef = firestoreDoc(db, collectionType, postId, 'comments', commentId);
      await deleteDoc(commentRef);
      const parentRef = firestoreDoc(db, collectionType, postId);
      const updates: any = { 'stats.commentsCount': firestoreIncrement(-1) };
      if (collectionType === 'glimpses') {
        updates.repliesCount = firestoreIncrement(-1);
      }
      await updateDoc(parentRef, updates);
    } catch (error) {
      updateComments(snapshot);
      throw error;
    }
  };
  return {
    comments,
    loading,
    addComment,
    likeComment,
    unlikeComment,
    deleteComment,
  };
};


