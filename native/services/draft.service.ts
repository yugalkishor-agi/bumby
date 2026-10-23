/**
 * Draft Service - Per-Account Draft Management
 * Save posts and glimpses as drafts
 */

import { storageService, STORAGE_KEYS } from './storage.service';

export interface PostDraft {
  id: string;
  caption?: string;
  mediaURL?: string;
  mediaType?: 'image' | 'video';
  mediaItems?: Array<{
    uri: string;
    thumbnail?: string;
    type?: 'image' | 'video' | string;
    width?: number;
    height?: number;
    duration?: number;
    editedAt?: number;
  }>;
  allowSharing?: boolean;
  audience?: 'public' | 'followers' | 'close_friends' | 'closeFriends';
  tags?: string[];
  mentions?: string[];
  taggedUsers?: string[];
  location?: string;
  altText?: string;
  commentsEnabled?: boolean;
  hideLikesCount?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GlimpseDraft {
  id: string;
  caption?: string;
  mediaURL?: string;
  thumbnailURL?: string;
  tags?: string[];
  taggedPeople?: string[];
  settings?: {
    allowComments?: boolean;
    allowDownload?: boolean;
    hideLikes?: boolean;
    showCaptions?: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export class DraftService {
  // ==========================================
  // POST DRAFTS
  // ==========================================

  /**
   * Save post draft
   */
  savePostDraft(userId: string, draft: Omit<PostDraft, 'id' | 'createdAt' | 'updatedAt'>): PostDraft {
    const drafts = this.getPostDrafts(userId);
    
    // Create new draft with timestamps
    const newDraft: PostDraft = {
      ...draft,
      id: `draft_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Add to list
    drafts.push(newDraft);
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
      userId,
      drafts
    );
    
    console.log('💾 Post draft saved:', newDraft.id);
    return newDraft;
  }

  /**
   * Update existing post draft
   */
  updatePostDraft(
    userId: string,
    draftId: string,
    updates: Partial<PostDraft>
  ): PostDraft | null {
    const drafts = this.getPostDrafts(userId);
    const index = drafts.findIndex(d => d.id === draftId);
    
    if (index === -1) return null;
    
    // Update draft
    drafts[index] = {
      ...drafts[index],
      ...updates,
      updatedAt: Date.now(),
    };
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
      userId,
      drafts
    );
    
    console.log('✏️ Post draft updated:', draftId);
    return drafts[index];
  }

  /**
   * Get all post drafts
   */
  getPostDrafts(userId: string): PostDraft[] {
    const drafts = storageService.getUserData<PostDraft[]>(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
      userId
    );
    
    return drafts || [];
  }

  /**
   * Get single post draft
   */
  getPostDraft(userId: string, draftId: string): PostDraft | null {
    const drafts = this.getPostDrafts(userId);
    return drafts.find(d => d.id === draftId) || null;
  }

  /**
   * Delete post draft
   */
  deletePostDraft(userId: string, draftId: string): boolean {
    const drafts = this.getPostDrafts(userId);
    const filtered = drafts.filter(d => d.id !== draftId);
    
    if (filtered.length === drafts.length) {
      return false; // Draft not found
    }
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
      userId,
      filtered
    );
    
    console.log('🗑️ Post draft deleted:', draftId);
    return true;
  }

  /**
   * Clear all post drafts
   */
  clearPostDrafts(userId: string): void {
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
      userId,
      []
    );
    
    console.log('🧹 All post drafts cleared');
  }

  // ==========================================
  // GLIMPSE DRAFTS
  // ==========================================

  /**
   * Save glimpse draft
   */
  saveGlimpseDraft(userId: string, draft: Omit<GlimpseDraft, 'id' | 'createdAt' | 'updatedAt'>): GlimpseDraft {
    const drafts = this.getGlimpseDrafts(userId);
    
    // Create new draft with timestamps
    const newDraft: GlimpseDraft = {
      ...draft,
      id: `draft_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Add to list
    drafts.push(newDraft);
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
      userId,
      drafts
    );
    
    console.log('💾 Glimpse draft saved:', newDraft.id);
    return newDraft;
  }

  /**
   * Update existing glimpse draft
   */
  updateGlimpseDraft(
    userId: string,
    draftId: string,
    updates: Partial<GlimpseDraft>
  ): GlimpseDraft | null {
    const drafts = this.getGlimpseDrafts(userId);
    const index = drafts.findIndex(d => d.id === draftId);
    
    if (index === -1) return null;
    
    // Update draft
    drafts[index] = {
      ...drafts[index],
      ...updates,
      updatedAt: Date.now(),
    };
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
      userId,
      drafts
    );
    
    console.log('✏️ Glimpse draft updated:', draftId);
    return drafts[index];
  }

  /**
   * Get all glimpse drafts
   */
  getGlimpseDrafts(userId: string): GlimpseDraft[] {
    const drafts = storageService.getUserData<GlimpseDraft[]>(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
      userId
    );
    
    return drafts || [];
  }

  /**
   * Get single glimpse draft
   */
  getGlimpseDraft(userId: string, draftId: string): GlimpseDraft | null {
    const drafts = this.getGlimpseDrafts(userId);
    return drafts.find(d => d.id === draftId) || null;
  }

  /**
   * Delete glimpse draft
   */
  deleteGlimpseDraft(userId: string, draftId: string): boolean {
    const drafts = this.getGlimpseDrafts(userId);
    const filtered = drafts.filter(d => d.id !== draftId);
    
    if (filtered.length === drafts.length) {
      return false; // Draft not found
    }
    
    // Save
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
      userId,
      filtered
    );
    
    console.log('🗑️ Glimpse draft deleted:', draftId);
    return true;
  }

  /**
   * Clear all glimpse drafts
   */
  clearGlimpseDrafts(userId: string): void {
    storageService.setUserData(
      STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
      userId,
      []
    );
    
    console.log('🧹 All glimpse drafts cleared');
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get draft count
   */
  getDraftCount(userId: string): { posts: number; glimpses: number; total: number } {
    const posts = this.getPostDrafts(userId).length;
    const glimpses = this.getGlimpseDrafts(userId).length;
    
    return {
      posts,
      glimpses,
      total: posts + glimpses,
    };
  }

  /**
   * Clear all drafts (both posts and glimpses)
   */
  clearAllDrafts(userId: string): void {
    this.clearPostDrafts(userId);
    this.clearGlimpseDrafts(userId);
    console.log('🧹 All drafts cleared');
  }

  /**
   * Auto-cleanup old drafts (> 30 days)
   */
  cleanupOldDrafts(userId: string): void {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    // Clean post drafts
    const postDrafts = this.getPostDrafts(userId);
    const freshPostDrafts = postDrafts.filter(d => d.createdAt > thirtyDaysAgo);
    if (freshPostDrafts.length < postDrafts.length) {
      storageService.setUserData(
        STORAGE_KEYS.USER_SPECIFIC.DRAFT_POST,
        userId,
        freshPostDrafts
      );
      console.log(`🧹 Cleaned ${postDrafts.length - freshPostDrafts.length} old post drafts`);
    }
    
    // Clean glimpse drafts
    const glimpseDrafts = this.getGlimpseDrafts(userId);
    const freshGlimpseDrafts = glimpseDrafts.filter(d => d.createdAt > thirtyDaysAgo);
    if (freshGlimpseDrafts.length < glimpseDrafts.length) {
      storageService.setUserData(
        STORAGE_KEYS.USER_SPECIFIC.DRAFT_GLIMPSE,
        userId,
        freshGlimpseDrafts
      );
      console.log(`🧹 Cleaned ${glimpseDrafts.length - freshGlimpseDrafts.length} old glimpse drafts`);
    }
  }
}

// Export singleton instance
export const draftService = new DraftService();


