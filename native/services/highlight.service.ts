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
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { cacheIntegration } from './cacheIntegration.service';
import type { Story as DBStory } from '../types/database';

/** The story fields a highlight actually carries - derived from the schema. */
type Story = Pick<DBStory, 'storyId' | 'authorId' | 'mediaURL' | 'mediaType' | 'createdAt' | 'expiresAt'>;

export interface Highlight {
  highlightId: string;
  title: string;
  authorId: string;
  coverImageURL: string;
  storiesCount: number;
  createdAt: any;
  updatedAt: any;
  stories: Story[];
}

interface CreateHighlightData {
  title: string;
  authorId: string;
  stories: Story[];
  coverImageURL: string;
}

export class HighlightService {
  /**
   * Create a new highlight
   */
  async createHighlight(data: CreateHighlightData): Promise<string> {
    try {
      const highlightRef = doc(collection(db, 'highlights'));
      const highlightId = highlightRef.id;

      const highlightData: Highlight = {
        highlightId,
        title: data.title,
        authorId: data.authorId,
        coverImageURL: data.coverImageURL,
        storiesCount: data.stories.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        stories: data.stories,
      };

      await setDoc(highlightRef, highlightData);

      // Invalidate user highlights cache
      await cacheIntegration.invalidateUserHighlights(data.authorId);

      return highlightId;
    } catch (error) {
      console.error('Error creating highlight:', error);
      throw error;
    }
  }

  /**
   * Get user's highlights
   */
  async getUserHighlights(userId: string): Promise<Highlight[]> {
    try {
      // Try cache first
      const cached = await cacheIntegration.getCachedUserHighlights(userId);
      if (cached && Array.isArray(cached)) {
        return cached as Highlight[];
      }

      const highlightsRef = collection(db, 'highlights');
      const q = query(
        highlightsRef,
        where('authorId', '==', userId),
        orderBy('updatedAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const highlights = snapshot.docs.map(doc => ({
        highlightId: doc.id,
        ...doc.data(),
      })) as Highlight[];

      // Cache the highlights
      await cacheIntegration.cacheUserHighlights(userId, highlights);

      return highlights;
    } catch (error) {
      console.error('Error getting user highlights:', error);
      return [];
    }
  }

  /**
   * Get a specific highlight
   */
  async getHighlight(highlightId: string): Promise<Highlight | null> {
    try {
      // Try cache first
      const cached = await cacheIntegration.getCachedHighlight(highlightId);
      if (cached) {
        return cached as Highlight;
      }

      const highlightRef = doc(db, 'highlights', highlightId);
      const highlightSnap = await getDoc(highlightRef);

      if (!highlightSnap.exists()) {
        return null;
      }

      const highlight = {
        highlightId: highlightSnap.id,
        ...highlightSnap.data(),
      } as Highlight;

      // Cache the highlight
      await cacheIntegration.cacheHighlight(highlightId, highlight);

      return highlight;
    } catch (error) {
      console.error('Error getting highlight:', error);
      return null;
    }
  }

  /**
   * Update highlight title
   */
  async updateHighlightTitle(highlightId: string, title: string): Promise<void> {
    try {
      const highlightRef = doc(db, 'highlights', highlightId);
      await updateDoc(highlightRef, {
        title,
        updatedAt: serverTimestamp(),
      });

      // Invalidate cache
      await cacheIntegration.invalidateHighlight(highlightId);
    } catch (error) {
      console.error('Error updating highlight title:', error);
      throw error;
    }
  }

  /**
   * Update highlight cover image
   */
  async updateHighlightCover(highlightId: string, coverImageURL: string): Promise<void> {
    try {
      const highlightRef = doc(db, 'highlights', highlightId);
      await updateDoc(highlightRef, {
        coverImageURL,
        updatedAt: serverTimestamp(),
      });

      // Invalidate cache
      await cacheIntegration.invalidateHighlight(highlightId);
    } catch (error) {
      console.error('Error updating highlight cover:', error);
      throw error;
    }
  }

  /**
   * Add stories to highlight
   */
  async addStoriesToHighlight(highlightId: string, stories: Story[]): Promise<void> {
    try {
      const highlightRef = doc(db, 'highlights', highlightId);
      
      // Get current highlight to update stories array
      const highlightSnap = await getDoc(highlightRef);
      if (!highlightSnap.exists()) {
        throw new Error('Highlight not found');
      }

      const currentHighlight = highlightSnap.data() as Highlight;
      const existingStoryIds = new Set(currentHighlight.stories.map(s => s.storyId));
      
      // Filter out stories that are already in the highlight
      const newStories = stories.filter(story => !existingStoryIds.has(story.storyId));
      
      if (newStories.length === 0) {
        return; // No new stories to add
      }

      const updatedStories = [...currentHighlight.stories, ...newStories];

      await updateDoc(highlightRef, {
        stories: updatedStories,
        storiesCount: updatedStories.length,
        updatedAt: serverTimestamp(),
      });

      // Invalidate cache
      await cacheIntegration.invalidateHighlight(highlightId);
      await cacheIntegration.invalidateUserHighlights(currentHighlight.authorId);
    } catch (error) {
      console.error('Error adding stories to highlight:', error);
      throw error;
    }
  }

  /**
   * Remove story from highlight
   */
  async removeStoryFromHighlight(highlightId: string, storyId: string): Promise<void> {
    try {
      const highlightRef = doc(db, 'highlights', highlightId);
      
      // Get current highlight
      const highlightSnap = await getDoc(highlightRef);
      if (!highlightSnap.exists()) {
        throw new Error('Highlight not found');
      }

      const currentHighlight = highlightSnap.data() as Highlight;
      const updatedStories = currentHighlight.stories.filter(story => story.storyId !== storyId);

      // If no stories left, delete the highlight
      if (updatedStories.length === 0) {
        await this.deleteHighlight(highlightId);
        return;
      }

      await updateDoc(highlightRef, {
        stories: updatedStories,
        storiesCount: updatedStories.length,
        updatedAt: serverTimestamp(),
      });

      // Invalidate cache
      await cacheIntegration.invalidateHighlight(highlightId);
      await cacheIntegration.invalidateUserHighlights(currentHighlight.authorId);
    } catch (error) {
      console.error('Error removing story from highlight:', error);
      throw error;
    }
  }

  /**
   * Reorder stories in highlight
   */
  async reorderStoriesInHighlight(highlightId: string, stories: Story[]): Promise<void> {
    try {
      const highlightRef = doc(db, 'highlights', highlightId);
      await updateDoc(highlightRef, {
        stories,
        updatedAt: serverTimestamp(),
      });

      // Invalidate cache
      await cacheIntegration.invalidateHighlight(highlightId);
    } catch (error) {
      console.error('Error reordering stories in highlight:', error);
      throw error;
    }
  }

  /**
   * Delete highlight
   */
  async deleteHighlight(highlightId: string): Promise<void> {
    try {
      // Get highlight data for cache invalidation
      const highlightRef = doc(db, 'highlights', highlightId);
      const highlightSnap = await getDoc(highlightRef);
      
      if (highlightSnap.exists()) {
        const highlight = highlightSnap.data() as Highlight;
        
        // Delete the highlight
        await deleteDoc(highlightRef);
        
        // Invalidate cache
        await cacheIntegration.invalidateHighlight(highlightId);
        await cacheIntegration.invalidateUserHighlights(highlight.authorId);
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      throw error;
    }
  }

  /**
   * Search highlights by title
   */
  async searchHighlights(userId: string, searchQuery: string): Promise<Highlight[]> {
    try {
      if (!searchQuery.trim()) {
        return await this.getUserHighlights(userId);
      }

      const highlightsRef = collection(db, 'highlights');
      const searchLower = searchQuery.toLowerCase();
      
      const q = query(
        highlightsRef,
        where('authorId', '==', userId),
        where('title', '>=', searchLower),
        where('title', '<=', searchLower + '\uf8ff'),
        orderBy('title'),
        limit(20)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        highlightId: doc.id,
        ...doc.data(),
      })) as Highlight[];
    } catch (error) {
      console.error('Error searching highlights:', error);
      return [];
    }
  }

  /**
   * Get highlights for profile display (public highlights)
   */
  async getProfileHighlights(userId: string, limitCount: number = 10): Promise<Highlight[]> {
    try {
      // Try cache first
      const cacheKey = `profile_highlights_${userId}`;
      const cached = await cacheIntegration.getCachedData(cacheKey);
      if (cached && Array.isArray(cached)) {
        return cached as Highlight[];
      }

      const highlightsRef = collection(db, 'highlights');
      const q = query(
        highlightsRef,
        where('authorId', '==', userId),
        orderBy('updatedAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const highlights = snapshot.docs.map(doc => ({
        highlightId: doc.id,
        ...doc.data(),
      })) as Highlight[];

      // Cache for 5 minutes
      await cacheIntegration.cacheData(cacheKey, highlights, 5 * 60 * 1000);

      return highlights;
    } catch (error) {
      console.error('Error getting profile highlights:', error);
      return [];
    }
  }

  /**
   * Check if user has any highlights
   */
  async hasHighlights(userId: string): Promise<boolean> {
    try {
      const highlightsRef = collection(db, 'highlights');
      const q = query(
        highlightsRef,
        where('authorId', '==', userId),
        limit(1)
      );

      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking if user has highlights:', error);
      return false;
    }
  }
}

export const highlightService = new HighlightService();
