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
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Collection, Post } from '../types/database';

/**
 * A save marker document: just the reference and when it was saved, plus an
 * optional contentType for glimpses. (The fuller `SavedPost` record in
 * types/database is the read-side projection - not this write payload.)
 */
type SaveMarker = {
  postId: string;
  savedAt: unknown;
  contentType?: string;
};

export class CollectionService {
  // ==========================================
  // COLLECTION CRUD
  // ==========================================

  /**
   * Get user's collections
   */
  async getUserCollections(userId: string): Promise<Collection[]> {
    const collectionsRef = collection(db, `users/${userId}/savedCollections`);
    const q = query(collectionsRef, orderBy('updatedAt', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Collection);
  }

  /**
   * Get collection by ID
   */
  async getCollection(
    userId: string,
    collectionId: string
  ): Promise<Collection | null> {
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );
    const collectionSnap = await getDoc(collectionRef);

    if (!collectionSnap.exists()) {
      return null;
    }

    return collectionSnap.data() as Collection;
  }

  /**
   * Create new collection
   */
  async createCollection(
    userId: string,
    name: string,
    isPrivate = false
  ): Promise<string> {
    const collectionsRef = collection(db, `users/${userId}/savedCollections`);
    const collectionRef = doc(collectionsRef);
    const collectionId = collectionRef.id;

    await setDoc(collectionRef, {
      collectionId,
      userId,
      name,
      coverImageURL: '',
      isPrivate,
      postsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Collection);

    return collectionId;
  }

  /**
   * Update collection
   */
  async updateCollection(
    userId: string,
    collectionId: string,
    updates: { name?: string; isPrivate?: boolean; coverImageURL?: string }
  ): Promise<void> {
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );

    await updateDoc(collectionRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Delete collection
   */
  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );

    // Delete all posts in collection first
    const postsRef = collection(
      db,
      `users/${userId}/savedCollections/${collectionId}/posts`
    );
    const postsSnapshot = await getDocs(postsRef);

    const batch = writeBatch(db);
    postsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete collection itself
    batch.delete(collectionRef);

    await batch.commit();
  }

  // ==========================================
  // SAVED POSTS
  // ==========================================

  /**
   * Save post to collection
   */
  async savePost(
    userId: string,
    postId: string,
    collectionId?: string,
    contentType: 'post' | 'glimpse' = 'post'
  ): Promise<void> {
    // If no collection specified, create/use default "All" collection
    if (!collectionId) {
      const collections = await this.getUserCollections(userId);
      let defaultCollection = collections.find((c) => c.name === 'All');

      if (!defaultCollection) {
        collectionId = await this.createCollection(userId, 'All', false);
      } else {
        collectionId = defaultCollection.collectionId;
      }
    }

    const savedPostRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}/posts/${postId}`
    );

    // Check if already saved
    const savedPostSnap = await getDoc(savedPostRef);
    if (savedPostSnap.exists()) {
      return; // Already saved
    }

    const batch = writeBatch(db);

    // Add to collection
    batch.set(savedPostRef, {
      postId,
      savedAt: serverTimestamp(),
      ...(contentType === 'glimpse' ? { contentType: 'glimpse' } : {}),
    } as SaveMarker);

    // Increment post count in collection
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );
    batch.update(collectionRef, {
      postsCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    // Increment saves count in post (glimpses are not posts, so no post doc to update)
    if (contentType === 'post') {
      const postRef = doc(db, 'posts', postId);
      batch.update(postRef, {
        'stats.savesCount': increment(1),
      });
    }

    await batch.commit();
  }

  /**
   * Unsave post from collection
   */
  async unsavePost(
    userId: string,
    postId: string,
    collectionId: string
  ): Promise<void> {
    const savedPostRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}/posts/${postId}`
    );

    const batch = writeBatch(db);

    // Remove from collection
    batch.delete(savedPostRef);

    // Decrement post count in collection
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );
    batch.update(collectionRef, {
      postsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });

    // Decrement saves count in post
    const postRef = doc(db, 'posts', postId);
    batch.update(postRef, {
      'stats.savesCount': increment(-1),
    });

    await batch.commit();
  }

  /**
   * Remove post from collection
   */
  async removePostFromCollection(
    userId: string,
    collectionId: string,
    postId: string
  ): Promise<void> {
    const collectionRef = doc(
      db,
      `users/${userId}/savedCollections/${collectionId}`
    );
    const collectionSnap = await getDoc(collectionRef);
    
    if (!collectionSnap.exists()) return;
    
    const currentCount = collectionSnap.data()?.postsCount || 0;
    
    // Only proceed if count > 0
    if (currentCount > 0) {
      const batch = writeBatch(db);

      // Remove post from collection
      const postRefInCollection = doc(
        db,
        `users/${userId}/savedCollections/${collectionId}/posts`,
        postId
      );
      batch.delete(postRefInCollection);

      // Decrement collection's post count
      batch.update(collectionRef, {
        postsCount: increment(-1),
        updatedAt: serverTimestamp(),
      });

      // Decrement saves count in post
      const postRef = doc(db, 'posts', postId);
      batch.update(postRef, {
        'stats.savesCount': increment(-1),
      });

      await batch.commit();
    }
  }

  /**
   * Unsave a post from all of the user's collections where it exists.
   * Returns the number of collections the post was removed from.
   */
  async unsavePostFromAllCollections(
    userId: string,
    postId: string,
    contentType: 'post' | 'glimpse' = 'post'
  ): Promise<number> {
    const collections = await this.getUserCollections(userId);
    if (collections.length === 0) return 0;

    let removedCount = 0;

    // Build a batch of deletes and collection count decrements
    const batch = writeBatch(db);

    for (const c of collections) {
      const postRefInCollection = doc(
        db,
        `users/${userId}/savedCollections/${c.collectionId}/posts/${postId}`
      );
      const snap = await getDoc(postRefInCollection);
      if (snap.exists()) {
        batch.delete(postRefInCollection);
        const collectionRef = doc(
          db,
          `users/${userId}/savedCollections/${c.collectionId}`
        );
        batch.update(collectionRef, {
          postsCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
        removedCount += 1;
      }
    }

    if (removedCount > 0) {
      await batch.commit();

      // Decrement savesCount on the post by the number of removed entries
      // (glimpses have no post doc to decrement)
      if (contentType === 'post') {
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, {
          'stats.savesCount': increment(-removedCount),
        });
      }
    }

    return removedCount;
  }

  /**
   * Get posts in collection
   */
  async getCollectionPosts(
    userId: string,
    collectionId: string,
    limitCount = 30
  ): Promise<Post[]> {
    const postsRef = collection(
      db,
      `users/${userId}/savedCollections/${collectionId}/posts`
    );
    const q = query(postsRef, orderBy('savedAt', 'desc'), limit(limitCount));

    const snapshot = await getDocs(q);
    // Fetch actual post documents and enrich with author + savedAt
    const posts: Post[] = [];
    for (const savedDoc of snapshot.docs) {
      const data = savedDoc.data() as any;
      const postId = data.postId;
      const savedAt = data.savedAt;
      const contentType = data.contentType || 'post';
      if (!postId) continue;

      // Glimpse saved in playlist
      if (contentType === 'glimpse') {
        const glimpseRef = doc(db, 'glimpses', postId);
        const glimpseSnap = await getDoc(glimpseRef);
        if (!glimpseSnap.exists()) continue;

        const glimpseData: any = glimpseSnap.data();
        const mapped: any = {
          ...glimpseData,
          postId,
          glimpseId: postId,
          storyId: postId,
          isGlimpse: true,
          mediaURL: glimpseData.mediaURL || glimpseData.mediaURLs?.[0] || '',
          mediaURLs: glimpseData.mediaURLs?.length ? glimpseData.mediaURLs : (glimpseData.mediaURL ? [glimpseData.mediaURL] : []),
          savedAt,
        };

        // Ensure author fields are present
        try {
          if (
            mapped.authorVerified === undefined ||
            !mapped.authorUsername ||
            !mapped.authorAvatarURL
          ) {
            const authorRef = doc(db, 'users', mapped.authorId);
            const authorSnap = await getDoc(authorRef);
            if (authorSnap.exists()) {
              const userData: any = authorSnap.data();
              if (mapped.authorVerified === undefined) mapped.authorVerified = !!userData.verified;
              if (!mapped.authorUsername) mapped.authorUsername = userData.username;
              if (!mapped.authorAvatarURL) mapped.authorAvatarURL = userData.avatarURL || '';
            } else if (mapped.authorVerified === undefined) {
              mapped.authorVerified = false;
            }
          }
        } catch {}

        posts.push(mapped as Post);
        continue;
      }

      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      if (!postSnap.exists()) continue;

      const postData = postSnap.data() as Post;
      (postData as any).postId = postId;
      (postData as any).savedAt = savedAt;

      // Ensure author fields are present
      try {
        if (
          postData.authorVerified === undefined ||
          !postData.authorUsername ||
          !postData.authorAvatarURL
        ) {
          const authorRef = doc(db, 'users', postData.authorId);
          const authorSnap = await getDoc(authorRef);
          if (authorSnap.exists()) {
            const userData: any = authorSnap.data();
            if (postData.authorVerified === undefined) postData.authorVerified = !!userData.verified;
            if (!postData.authorUsername) postData.authorUsername = userData.username;
            if (!postData.authorAvatarURL) postData.authorAvatarURL = userData.avatarURL || '';
          } else if (postData.authorVerified === undefined) {
            postData.authorVerified = false;
          }
        }
      } catch {}

      posts.push(postData);
    }

    return posts;
  }

  /**
   * Get all saved posts (across all collections)
   */
  async getAllSavedPosts(userId: string, limitCount = 50): Promise<Post[]> {
    try {
      const collections = await this.getUserCollections(userId);
      const allPosts: Post[] = [];
      for (const collection of collections) {
        try {
          const posts = await this.getCollectionPosts(userId, collection.collectionId);
          allPosts.push(...posts);
        } catch (error) {
          // continue
        }
      }

      // Deduplicate by postId (same post may exist in multiple collections)
      const map = new Map<string, Post>();
      for (const p of allPosts) {
        const id = (p as any).postId || (p as any).id;
        if (!id) continue;
        const existing = map.get(id);
        // Keep the most recent savedAt
        if (!existing) map.set(id, p);
        else {
          const a = (existing as any).savedAt?.toDate?.() || new Date(0);
          const b = (p as any).savedAt?.toDate?.() || new Date(0);
          if (b > a) map.set(id, p);
        }
      }

      const deduped = Array.from(map.values());
      // Sort by savedAt desc
      deduped.sort((a, b) => {
        const aTime = (a as any).savedAt?.toDate?.() || new Date(0);
        const bTime = (b as any).savedAt?.toDate?.() || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      return deduped.slice(0, limitCount);
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if post is saved
   */
  async isPostSaved(
    userId: string,
    postId: string,
    collectionId?: string
  ): Promise<boolean> {
    if (collectionId) {
      const savedPostRef = doc(
        db,
        `users/${userId}/savedCollections/${collectionId}/posts/${postId}`
      );
      const savedPostSnap = await getDoc(savedPostRef);
      return savedPostSnap.exists();
    }

    // Check all collections
    const collections = await this.getUserCollections(userId);
    for (const collection of collections) {
      const savedPostRef = doc(
        db,
        `users/${userId}/savedCollections/${collection.collectionId}/posts/${postId}`
      );
      const savedPostSnap = await getDoc(savedPostRef);
      if (savedPostSnap.exists()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Move post between collections
   */
  async movePost(
    userId: string,
    postId: string,
    fromCollectionId: string,
    toCollectionId: string
  ): Promise<void> {
    // Remove from old collection
    await this.unsavePost(userId, postId, fromCollectionId);

    // Add to new collection
    await this.savePost(userId, postId, toCollectionId);
  }
}

// Export singleton instance
export const collectionService = new CollectionService();
