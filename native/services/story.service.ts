import {
  collection,
  collectionGroup,
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
  runTransaction,
  Timestamp,
  increment,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { storyCache, CACHE_TTL } from './cacheSystem.service';
import { cacheIntegration } from './cacheIntegration.service';

function stripUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)])
    );
  }
  return value;
}

function normalizeTimestamp(value: any): Timestamp {
  if (value instanceof Timestamp) return value;
  if (typeof value?.toDate === 'function') return value as Timestamp;
  if (typeof value?.seconds === 'number') {
    return new Timestamp(value.seconds, value.nanoseconds || 0);
  }
  if (value instanceof Date) {
    return Timestamp.fromMillis(value.getTime());
  }
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isFinite(parsed)) {
    return Timestamp.fromMillis(parsed);
  }
  return Timestamp.now();
}

function normalizeStory(story: Story): Story {
  return {
    ...story,
    createdAt: normalizeTimestamp((story as any)?.createdAt),
    expiresAt: normalizeTimestamp((story as any)?.expiresAt),
  };
}

function normalizeStories(stories: Story[]): Story[] {
  return Array.isArray(stories) ? stories.map((story) => normalizeStory(story)) : [];
}

function buildViewedStoriesCacheKey(viewerId: string, storyIds: string[]): string {
  return `${viewerId}:${storyIds.slice().sort().join('|')}`;
}
export interface WidgetTransform {
  x: number;
  y: number;
  w?: number;
  h?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  z?: number;
  positionSpace?: 'screen' | 'media';
}

export interface StoryWidgetDoc {
  widgetId: string;
  storyId: string;
  ownerId: string;
  type: string;
  content: any;
  style?: {
    theme?: 'light' | 'dark' | 'glass' | 'gradient';
    stylePreset?: 'neon' | 'pastel' | 'dark' | 'minimal';
    opacity?: number;
    isAnonymous?: boolean;
    hideBadge?: boolean;
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: number;
  };
  transform: WidgetTransform;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  disabled?: boolean;
}

export interface Story {
  storyId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarURL?: string;
  authorDisplayName?: string;
  mediaURL: string;
  thumbnailURL?: string;
  mediaType: 'image' | 'video';
  caption?: string;
  audience: 'public' | 'followers' | 'closeFriends';
  allowReplies?: boolean;
  allowSharing?: boolean;
  hiddenFrom?: string[];
  closeFriends?: string[];
  createdAt: Timestamp;
  expiresAt: Timestamp;
  stats: {
    viewsCount: number;
    likesCount: number;
    repliesCount: number;
  };
  isActive: boolean;
  isLiked?: boolean;
}

export interface StoryView {
  viewId: string;
  storyId: string;
  viewerId: string;
  viewedAt: Timestamp;
}

export interface StoryReply {
  replyId: string;
  storyId: string;
  senderId: string;
  message: string;
  createdAt: Timestamp;
}

export interface StoryRuntimeEvent {
  type: 'viewed';
  viewerId: string;
  storyId: string;
  authorId?: string;
}

class StoryService {
  private runtimeListeners = new Set<(event: StoryRuntimeEvent) => void>();
  private optimisticViewedByViewer = new Map<string, Set<string>>();

  private addOptimisticViewedStory(viewerId: string, storyId: string) {
    const existing = this.optimisticViewedByViewer.get(viewerId) || new Set<string>();
    existing.add(storyId);
    this.optimisticViewedByViewer.set(viewerId, existing);
  }

  private removeOptimisticViewedStory(viewerId: string, storyId: string) {
    const existing = this.optimisticViewedByViewer.get(viewerId);
    if (!existing) return;
    existing.delete(storyId);
    if (existing.size === 0) {
      this.optimisticViewedByViewer.delete(viewerId);
      return;
    }
    this.optimisticViewedByViewer.set(viewerId, existing);
  }

  private getOptimisticViewedStories(viewerId: string): Set<string> {
    return this.optimisticViewedByViewer.get(viewerId) || new Set<string>();
  }

  subscribeRuntime(listener: (event: StoryRuntimeEvent) => void): () => void {
    this.runtimeListeners.add(listener);
    return () => {
      this.runtimeListeners.delete(listener);
    };
  }

  private emitRuntime(event: StoryRuntimeEvent) {
    this.runtimeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('Story runtime listener failed:', error);
      }
    });
  }
  /**
   * Create a new story
   */
  async createStory(storyData: Omit<Story, 'storyId' | 'createdAt' | 'expiresAt' | 'stats' | 'isActive'>): Promise<string> {
    try {
      const storyRef = doc(collection(db, 'stories'));
      const storyId = storyRef.id;

      const now = Timestamp.now();
      const expiresAt = new Timestamp(now.seconds + 24 * 60 * 60, now.nanoseconds); // 24 hours

      // Filter out undefined values deeply to prevent Firebase errors
      const cleanStoryData = stripUndefinedDeep(storyData);

      const story: Story = {
        ...cleanStoryData,
        storyId,
        createdAt: now,
        expiresAt,
        stats: {
          viewsCount: 0,
          likesCount: 0,
          repliesCount: 0,
        },
        isActive: true,
      } as Story;

      await setDoc(storyRef, story);

      // Clear cache for user's stories
      await storyCache.invalidatePattern(`user_stories:${storyData.authorId}`);
      await storyCache.invalidatePattern(`following_stories:`);

      return storyId;
    } catch (error) {
      console.error('Failed to create story:', error);
      throw error;
    }

  }

  /**
   * Create widget documents under stories/{storyId}/widgets
   */
  async createWidgets(
    storyId: string,
    ownerId: string,
    widgets: Array<{
      id?: string;
      type: string;
      content: any;
      transform?: Partial<WidgetTransform>;
      x?: number;
      y?: number;
      size?: { w?: number; h?: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
      z_index?: number;
    }>
  ): Promise<void> {
    try {
      if (!Array.isArray(widgets) || widgets.length === 0) return;
      const batch = writeBatch(db);
      const widgetsCol = collection(db, 'stories', storyId, 'widgets');
      for (const w of widgets) {
        const tr = (w.transform || {}) as Partial<WidgetTransform>;
        const t: WidgetTransform = {
          x: typeof tr.x === 'number' ? tr.x : (typeof w.x === 'number' ? w.x : 0.5),
          y: typeof tr.y === 'number' ? tr.y : (typeof w.y === 'number' ? w.y : 0.5),
          w: typeof tr.w === 'number' ? tr.w : (typeof w.size?.w === 'number' ? w.size!.w : undefined),
          h: typeof tr.h === 'number' ? tr.h : (typeof w.size?.h === 'number' ? w.size!.h : undefined),
          scale: typeof tr.scale === 'number' ? tr.scale : (typeof w.scale === 'number' ? w.scale : 1),
          rotation: typeof tr.rotation === 'number' ? tr.rotation : (typeof w.rotation === 'number' ? w.rotation : 0),
          opacity: typeof tr.opacity === 'number' ? tr.opacity : (typeof w.opacity === 'number' ? w.opacity : undefined),
          z: typeof tr.z === 'number' ? tr.z : (typeof w.z_index === 'number' ? w.z_index : undefined),
          positionSpace: (tr.positionSpace as any) || undefined,
        };
        const ref = w.id ? doc(widgetsCol, String(w.id)) : doc(widgetsCol);
        const tClean = stripUndefinedDeep(t);
        // Extract style from widget or content (supports both patterns)
        const widgetStyle = (w as any).style || (w.content as any)?.style;
        batch.set(ref, stripUndefinedDeep({
          widgetId: ref.id,
          storyId,
          ownerId,
          type: w.type,
          content: w.content,
          style: widgetStyle, // Preserve style for theming
          transform: tClean,
          createdAt: serverTimestamp(),
        } as any));
      }
      await batch.commit();
    } catch (error) {
      console.error('Failed to create widgets:', error);
      throw error;
    }
  }

  /**
   * Subscribe to widgets subcollection for a story
   */
  subscribeWidgets(
    storyId: string,
    onChange: (widgets: StoryWidgetDoc[]) => void
  ): Unsubscribe {
    const widgetsCol = collection(db, 'stories', storyId, 'widgets');
    return onSnapshot(widgetsCol, (snap) => {
      try {
        const list: StoryWidgetDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            widgetId: d.id,
            storyId,
            ownerId: data.ownerId,
            type: data.type,
            content: data.content,
            style: data.style, // Include style for theme customization
            transform: data.transform || { x: 0.5, y: 0.5 },
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            disabled: data.disabled,
          } as StoryWidgetDoc;
        });
        onChange(list);
      } catch (e) {
        onChange([]);
      }
    });
  }



  /**
   * Get user's archived (expired or inactive) stories
   */
  async getArchivedStories(userId: string): Promise<Story[]> {
    try {
      const storiesRef = collection(db, 'stories');
      const now = Timestamp.now();
      // Query recent stories by author and filter client-side for archived
      const q = query(
        storiesRef,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const nowMs = now.toMillis();
      return snapshot.docs
        .map(doc => doc.data() as Story)
        .filter(story => !story.isActive || (story.expiresAt?.toMillis?.() ?? 0) <= nowMs);
    } catch (error) {
      console.error('Failed to get archived stories:', error);
      return [];
    }
  }

  async getQuizResultsForOptions(
    storyId: string,
    stickerId: string,
    optionCount: number
  ): Promise<{ counts: number[]; total: number }> {
    try {
      // Skip aggregation - directly scan documents to avoid 400 errors
      const answersRef = collection(db, 'stories', storyId, 'quizAnswers');
      const qAns = query(answersRef, where('stickerId', '==', stickerId));
      const snapshot = await getDocs(qAns);
      const counts = Array.from({ length: Math.max(2, optionCount) }, () => 0);
      snapshot.forEach((d) => {
        const idx = (d.data() as any).optionIndex as number;
        if (idx >= 0 && idx < counts.length) counts[idx] += 1;
      });
      return { counts, total: snapshot.size };
    } catch {
      return { counts: [], total: 0 };
    }
  }

  /**
   * Submit a quiz answer
   */
  async submitQuizAnswer(
    storyId: string,
    stickerId: string,
    userId: string,
    optionIndex: number
  ): Promise<void> {
    try {
      const ansId = `${stickerId}_${userId}`;
      const ansRef = doc(db, 'stories', storyId, 'quizAnswers', ansId);
      await setDoc(ansRef, {
        id: ansId,
        storyId,
        stickerId,
        userId,
        optionIndex,
        answeredAt: serverTimestamp(),
      });
      // Mirror to widget responses
      try {
        const respRef = doc(db, 'stories', storyId, 'widgets', stickerId, 'responses', userId);
        await setDoc(respRef, {
          type: 'quiz',
          userId,
          value: optionIndex,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch { }
    } catch (error) {
      console.error('Failed to submit quiz answer:', error);
      throw error;
    }
  }

  /**
   * Listen to current user's like state for a story (real-time)
   */
  listenUserLike(storyId: string, userId: string, onChange: (liked: boolean) => void): Unsubscribe {
    const likeRef = doc(db, 'stories', storyId, 'likes', userId);
    return onSnapshot(likeRef, (snap) => {
      onChange(snap.exists());
    });
  }

  async submitPollVote(
    storyId: string,
    stickerId: string,
    voterId: string,
    optionIndex: number
  ): Promise<void> {
    try {
      const voteId = `${stickerId}_${voterId}`;
      const voteRef = doc(db, 'stories', storyId, 'pollVotes', voteId);
      await setDoc(voteRef, {
        voteId,
        storyId,
        stickerId,
        voterId,
        optionIndex,
        votedAt: serverTimestamp(),
      });
      // Mirror to widget responses subcollection for unified per-widget responses
      try {
        const respRef = doc(db, 'stories', storyId, 'widgets', stickerId, 'responses', voterId);
        await setDoc(respRef, {
          type: 'poll',
          userId: voterId,
          value: optionIndex,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch { }
    } catch (error) {
      console.error('Failed to submit poll vote:', error);
      throw error;
    }
  }

  async getPollResults(
    storyId: string,
    stickerId: string
  ): Promise<{ counts: number[]; total: number }> {
    try {
      // Prefer aggregated counts on the story doc
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      const agg = (storySnap.exists() ? (storySnap.data() as any)?.stickerAggregates : null) || {};
      const poll = agg?.[stickerId]?.poll || null;
      if (poll && typeof poll === 'object') {
        const entries = Object.entries(poll).map(([k, v]) => [Number(k), Number(v || 0)]) as Array<[number, number]>;
        entries.sort((a, b) => a[0] - b[0]);
        const counts = entries.map(([, v]) => v);
        const total = counts.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
        return { counts, total };
      }

      // Fallback: scan subcollection (legacy path)
      const votesRef = collection(db, 'stories', storyId, 'pollVotes');
      const qVotes = query(votesRef, where('stickerId', '==', stickerId));
      const snapshot = await getDocs(qVotes);
      let maxIndex = -1;
      const indices: number[] = [];
      snapshot.forEach((d) => {
        const idx = (d.data() as any).optionIndex as number;
        indices.push(idx);
        if (idx > maxIndex) maxIndex = idx;
      });
      const counts = Array.from({ length: Math.max(0, maxIndex + 1) }, () => 0);
      indices.forEach((i) => {
        if (i >= 0 && i < counts.length) counts[i] += 1;
      });
      return { counts, total: snapshot.size };
    } catch (error) {
      console.error('Failed to get poll results:', error);
      return { counts: [], total: 0 };
    }
  }

  async submitSliderValue(
    storyId: string,
    stickerId: string,
    userId: string,
    value: number
  ): Promise<void> {
    try {
      const clamped = Math.max(0, Math.min(1, value));
      const docId = `${stickerId}_${userId}`;
      const valRef = doc(db, 'stories', storyId, 'sliderValues', docId);
      await setDoc(valRef, {
        id: docId,
        storyId,
        stickerId,
        userId,
        value: clamped,
        updatedAt: serverTimestamp(),
      });
      // Mirror to widget responses
      try {
        const respRef = doc(db, 'stories', storyId, 'widgets', stickerId, 'responses', userId);
        await setDoc(respRef, {
          type: 'slider',
          userId,
          value: clamped,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch { }
    } catch (error) {
      console.error('Failed to submit slider value:', error);
      throw error;
    }
  }

  async getSliderStats(
    storyId: string,
    stickerId: string
  ): Promise<{ avg: number; count: number }> {
    try {
      // Skip aggregation - it often fails with 400 due to security rules
      // First try to get from cached aggregates on the story doc
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      const agg = (storySnap.exists() ? (storySnap.data() as any)?.stickerAggregates : null) || {};
      const slider = agg?.[stickerId]?.slider || null;
      if (slider && typeof slider === 'object') {
        const countN = Number(slider.count || 0);
        const sumN = Number(slider.sum || 0);
        const avg = countN > 0 ? sumN / countN : 0;
        return { avg, count: countN };
      }
      // Fallback: scan subcollection
      const valsRef = collection(db, 'stories', storyId, 'sliderValues');
      const qVals = query(valsRef, where('stickerId', '==', stickerId));
      const snapshot = await getDocs(qVals);
      let totalSum = 0;
      snapshot.forEach((d) => {
        totalSum += ((d.data() as any).value as number) || 0;
      });
      const cnt = snapshot.size;
      const avg = cnt > 0 ? totalSum / cnt : 0;
      return { avg, count: cnt };
    } catch {
      // Silently return default on any error
      return { avg: 0, count: 0 };
    }
  }

  async getPollResultsForOptions(
    storyId: string,
    stickerId: string,
    optionCount: number
  ): Promise<{ counts: number[]; total: number }> {
    // Skip aggregation queries - they cause 400 errors with current security rules
    // Just use the regular method which scans documents
    return this.getPollResults(storyId, stickerId);
  }

  async getSliderStatsFast(
    storyId: string,
    stickerId: string
  ): Promise<{ avg: number; count: number }> {
    // Skip aggregation queries - they cause 400 errors with current security rules
    // Just use the regular method which uses document reads
    return this.getSliderStats(storyId, stickerId);
  }

  /**
   * Get all sticker aggregates for a story in one read
   */
  async getStickerAggregates(storyId: string): Promise<Record<string, any>> {
    try {
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      if (!storySnap.exists()) return {};
      const data: any = storySnap.data();
      return (data?.stickerAggregates as any) || {};
    } catch {
      return {};
    }
  }

  async submitQuestionReply(
    storyId: string,
    stickerId: string,
    senderId: string,
    message: string
  ): Promise<string> {
    try {
      const replyRef = doc(collection(db, 'stories', storyId, 'questionReplies'));
      const replyId = replyRef.id;
      await setDoc(replyRef, {
        replyId,
        storyId,
        stickerId,
        senderId,
        message,
        createdAt: serverTimestamp(),
      });
      // Mirror to widget responses
      try {
        const respRef = doc(db, 'stories', storyId, 'widgets', stickerId, 'responses', senderId);
        await setDoc(respRef, {
          type: 'question',
          userId: senderId,
          value: message,
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch { }
      return replyId;
    } catch (error) {
      console.error('Failed to submit question reply:', error);
      throw error;
    }
  }

  async getQuestionReplies(
    storyId: string,
    stickerId: string,
    limitCount: number = 50
  ): Promise<Array<{ replyId: string; senderId: string; message: string; createdAt: Timestamp }>> {
    try {
      const repliesRef = collection(db, 'stories', storyId, 'questionReplies');
      const qReplies = query(
        repliesRef,
        where('stickerId', '==', stickerId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(qReplies);
      return snapshot.docs.map((d) => d.data() as any);
    } catch (error) {
      console.error('Failed to get question replies:', error);
      return [];
    }
  }

  async getQuestionReplyCount(storyId: string, stickerId: string): Promise<number> {
    try {
      // Skip aggregation - directly count documents
      const q = query(collection(db, 'stories', storyId, 'questionReplies'), where('stickerId', '==', stickerId));
      const snap = await getDocs(q);
      return snap.size;
    } catch {
      return 0;
    }
  }

  /**
   * Get story by ID
   */
  async getStory(storyId: string): Promise<Story | null> {
    try {
      const story = await storyCache.getOrSet(
        'stories',
        storyId,
        async () => {
          const storyRef = doc(db, 'stories', storyId);
          const storySnap = await getDoc(storyRef);

          if (storySnap.exists()) {
            return storySnap.data() as Story;
          }
          return null;
        },
        CACHE_TTL.STORIES
      );
      return story ? normalizeStory(story as Story) : null;
    } catch (error) {
      console.error('Failed to get story:', error);
      return null;
    }
  }

  private async hydrateLikedState(stories: Story[], viewerId: string): Promise<Story[]> {
    if (!viewerId || stories.length === 0) return stories;
    try {
      const storyIds = stories.map(s => s.storyId);
      const likedIds = await this.getUserLikedStories(viewerId, storyIds);
      const likedSet = new Set(likedIds);
      return stories.map(s => ({
        ...s,
        isLiked: likedSet.has(s.storyId),
      }));
    } catch (e) {
      console.error('Failed to hydrate story liked state:', e);
      return stories;
    }
  }

  async getUserLikedStories(userId: string, storyIds: string[]): Promise<string[]> {
    if (storyIds.length === 0 || !userId) return [];
    try {
      const results = await Promise.all(storyIds.map(async (id) => {
        const likeRef = doc(db, 'stories', id, 'likes', userId);
        const likeSnap = await getDoc(likeRef);
        return likeSnap.exists() ? id : null;
      }));
      return results.filter((id): id is string => id !== null);
    } catch (e) {
      console.error('Failed to get user liked stories:', e);
      return [];
    }
  }

  /**
   * Get user's active stories
   */
  async getUserActiveStories(userId: string, viewerId?: string): Promise<Story[]> {
    try {
      const stories = await storyCache.getOrSet(
        'user_stories',
        userId,
        async () => {
          const storiesRef = collection(db, 'stories');
          const now = Timestamp.now();

          try {
            const q = query(
              storiesRef,
              where('authorId', '==', userId),
              where('isActive', '==', true),
              where('expiresAt', '>', now),
              orderBy('expiresAt', 'asc'),
              orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data() as Story);
          } catch (e) {
            const q2 = query(
              storiesRef,
              where('authorId', '==', userId),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            const snapshot2 = await getDocs(q2);
            const nowMs = now.toMillis();
            return snapshot2.docs
              .map(d => d.data() as Story)
              .filter(st => st.isActive && normalizeTimestamp((st as any)?.expiresAt).toMillis() > nowMs);
          }
        },
        CACHE_TTL.STORIES
      );
      const normalized = normalizeStories(stories as Story[]);
      if (viewerId) {
        return this.hydrateLikedState(normalized, viewerId);
      }
      return normalized;
    } catch (error) {
      console.error('Failed to get user stories:', error);
      return [];
    }
  }

  private async isUserInCloseFriends(authorId: string, viewerId: string): Promise<boolean> {
    try {
      const closeFriendRef = doc(db, `users/${authorId}/closeFriends/${viewerId}`);
      const closeFriendSnap = await getDoc(closeFriendRef);
      return closeFriendSnap.exists();
    } catch {
      return false;
    }
  }

  private async canViewerSeeStory(story: Story, viewerId: string): Promise<boolean> {
    if (!story?.isActive) return false;
    if (story.authorId === viewerId) return true;

    const hiddenFrom = Array.isArray((story as any).hiddenFrom) ? (story as any).hiddenFrom : [];
    if (hiddenFrom.includes(viewerId)) return false;

    if (story.audience === 'closeFriends') {
      const inlineCloseFriends = Array.isArray((story as any).closeFriends) ? (story as any).closeFriends : [];
      if (inlineCloseFriends.includes(viewerId)) return true;
      return this.isUserInCloseFriends(story.authorId, viewerId);
    }

    return true;
  }
  async getFollowingStories(userId: string, viewerId?: string): Promise<Story[]> {
    try {
      const stories = await storyCache.getOrSet(
        'following_stories',
        userId,
        async () => {
          const { userService } = await import('./user.service');
          const following = await userService.getFollowing(userId);

          if (following.length === 0) return [];

          const storiesRef = collection(db, 'stories');
          const now = Timestamp.now();

          try {
            const q = query(
              storiesRef,
              where('authorId', 'in', following.slice(0, 10)),
              where('expiresAt', '>', now),
              orderBy('expiresAt', 'asc'),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            const snapshot = await getDocs(q);
            const rawStories = snapshot.docs
              .map(doc => doc.data() as Story)
              .filter(story => story.isActive);
            const visible = await Promise.all(rawStories.map(async (story) => {
              const canSee = await this.canViewerSeeStory(story, userId);
              return canSee ? story : null;
            }));
            return visible.filter((story): story is Story => story !== null);
          } catch (e) {
            const q2 = query(
              storiesRef,
              where('authorId', 'in', following.slice(0, 10)),
              orderBy('createdAt', 'desc'),
              limit(100)
            );
            const snapshot2 = await getDocs(q2);
            const nowMs = now.toMillis();
            const rawStories = snapshot2.docs
              .map(doc => doc.data() as Story)
              .filter(story => story.isActive && normalizeTimestamp((story as any)?.expiresAt).toMillis() > nowMs);
            const visible = await Promise.all(rawStories.map(async (story) => {
              const canSee = await this.canViewerSeeStory(story, userId);
              return canSee ? story : null;
            }));
            return visible.filter((story): story is Story => story !== null);
          }
        },
        CACHE_TTL.STORIES
      );
      const normalized = normalizeStories(stories as Story[]);
      const targetViewerId = viewerId || userId;
      if (targetViewerId) {
        return this.hydrateLikedState(normalized, targetViewerId);
      }
      return normalized;
    } catch (error) {
      console.error('Failed to get following stories:', error);
      return [];
    }
  }

  /**
   * View a story
   */
  async viewStory(storyId: string, viewerId: string): Promise<void> {
    let authorId: string | undefined;
    this.addOptimisticViewedStory(viewerId, storyId);

    try {
      await cacheIntegration.runOptimisticStoryMutation({
        storyId,
        viewerId,
        patch: {
          viewed: true,
        },
        throttleMs: 120,
        retries: 2,
        execute: async () => {
          await runTransaction(db, async (tx) => {
            const viewRef = doc(db, 'stories', storyId, 'views', viewerId);
            const existingView = await tx.get(viewRef);
            if (existingView.exists()) {
              return;
            }

            const storyRef = doc(db, 'stories', storyId);
            const storySnap = await tx.get(storyRef);
            if (!storySnap.exists()) return;

            authorId = (storySnap.data() as any).authorId;
            tx.set(viewRef, {
              viewId: viewRef.id,
              storyId,
              viewerId,
              viewedAt: serverTimestamp(),
            });

            if (authorId !== viewerId) {
              tx.update(storyRef, {
                'stats.viewsCount': increment(1),
              });
            }
          });
        },
        revalidate: async () => {
          await storyCache.delete('stories', storyId);
          await storyCache.invalidatePattern(`story_views:${storyId}`);
          await storyCache.invalidatePattern(`viewed_story_ids:.*${viewerId}`);
        },
      });

      this.emitRuntime({ type: 'viewed', viewerId, storyId, authorId });
    } catch (error) {
      this.removeOptimisticViewedStory(viewerId, storyId);
      console.error('Failed to view story:', error);
      throw error;
    }
  }

  /**
   * Get story views
   */
  async getStoryViews(storyId: string): Promise<string[]> {
    try {
      return await storyCache.getOrSet(
        'story_views',
        storyId,
        async () => {
          const viewsRef = collection(db, 'stories', storyId, 'views');
          const q = query(viewsRef, orderBy('viewedAt', 'desc'));

          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => doc.id);
        },
        CACHE_TTL.STORIES
      );
    } catch (error) {
      console.error('Failed to get story views:', error);
      return [];
    }
  }

  /**
   * Like a story
   */
  async likeStory(storyId: string, userId: string): Promise<void> {
    try {
      const cachedStory = await cacheIntegration.getCachedStory(storyId);
      const authorId = (cachedStory as any)?.authorId;

      await cacheIntegration.runOptimisticStoryMutation({
        storyId,
        authorId,
        patch: {
          liked: true,
          likesDelta: 1,
        },
        throttleMs: 160,
        retries: 2,
        execute: async () => {
          await runTransaction(db, async (tx) => {
            const likeRef = doc(db, 'stories', storyId, 'likes', userId);
            const storyRef = doc(db, 'stories', storyId);
            const [likeSnap, storySnap] = await Promise.all([tx.get(likeRef), tx.get(storyRef)]);
            if (!storySnap.exists() || likeSnap.exists()) return;

            tx.set(likeRef, {
              storyId,
              userId,
              likedAt: serverTimestamp(),
            });
            tx.update(storyRef, {
              'stats.likesCount': increment(1),
            });
          });
        },
        revalidate: async () => {
          await storyCache.delete('stories', storyId);
          await storyCache.invalidatePattern(`story_likes:${storyId}`);
        },
      });
    } catch (error) {
      console.error('Failed to like story:', error);
      throw error;
    }
  }

  /**
   * Unlike a story
   */
  async unlikeStory(storyId: string, userId: string): Promise<void> {
    try {
      const cachedStory = await cacheIntegration.getCachedStory(storyId);
      const authorId = (cachedStory as any)?.authorId;

      await cacheIntegration.runOptimisticStoryMutation({
        storyId,
        authorId,
        patch: {
          liked: false,
          likesDelta: -1,
        },
        throttleMs: 160,
        retries: 2,
        execute: async () => {
          await runTransaction(db, async (tx) => {
            const likeRef = doc(db, 'stories', storyId, 'likes', userId);
            const storyRef = doc(db, 'stories', storyId);
            const [likeSnap, storySnap] = await Promise.all([tx.get(likeRef), tx.get(storyRef)]);
            if (!storySnap.exists() || !likeSnap.exists()) return;
            const currentLikes = Number(storySnap.data()?.stats?.likesCount || 0);

            tx.delete(likeRef);
            tx.update(storyRef, {
              'stats.likesCount': increment(currentLikes > 0 ? -1 : 0),
            });
          });
        },
        revalidate: async () => {
          await storyCache.delete('stories', storyId);
          await storyCache.invalidatePattern(`story_likes:${storyId}`);
        },
      });
    } catch (error) {
      console.error('Failed to unlike story:', error);
      throw error;
    }
  }
  /**
   * Get story likes
   */
  async getStoryLikes(storyId: string): Promise<string[]> {
    try {
      return await storyCache.getOrSet(
        'story_likes',
        storyId,
        async () => {
          const likesRef = collection(db, 'stories', storyId, 'likes');
          const q = query(likesRef, orderBy('likedAt', 'desc'));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => doc.id);
        },
        CACHE_TTL.STORIES
      );
    } catch (error) {
      console.error('Failed to get story likes:', error);
      return [];
    }
  }

  /**
   * Reply to a story
   */
  async replyToStory(storyId: string, senderId: string, message: string): Promise<string> {
    try {
      const replyRef = doc(collection(db, 'stories', storyId, 'replies'));
      const replyId = replyRef.id;

      const reply: StoryReply = {
        replyId,
        storyId,
        senderId,
        message,
        createdAt: serverTimestamp() as Timestamp,
      };

      const batch = writeBatch(db);

      // Add reply
      batch.set(replyRef, reply);

      // Update story stats
      const storyRef = doc(db, 'stories', storyId);
      batch.update(storyRef, {
        'stats.repliesCount': increment(1),
      });

      await batch.commit();

      // Invalidate cache
      await storyCache.delete('stories', storyId);

      return replyId;
    } catch (error) {
      console.error('Failed to reply to story:', error);
      throw error;
    }
  }

  async updateStorySettings(
    storyId: string,
    authorId: string,
    updates: Partial<Pick<Story, 'allowReplies' | 'allowSharing' | 'audience' | 'hiddenFrom' | 'closeFriends'>>
  ): Promise<void> {
    try {
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      if (!storySnap.exists()) {
        throw new Error('Story not found');
      }

      const story = storySnap.data() as Story;
      if (story.authorId !== authorId) {
        throw new Error('Not authorized to update this story');
      }

      const payload = stripUndefinedDeep({
        allowReplies: updates.allowReplies,
        allowSharing: updates.allowSharing,
        audience: updates.audience,
        hiddenFrom: Array.isArray(updates.hiddenFrom)
          ? Array.from(new Set(updates.hiddenFrom.filter((id) => typeof id === 'string' && id.trim().length > 0)))
          : undefined,
        closeFriends: Array.isArray(updates.closeFriends)
          ? Array.from(new Set(updates.closeFriends.filter((id) => typeof id === 'string' && id.trim().length > 0)))
          : undefined,
      });

      await updateDoc(storyRef, payload);
      await storyCache.delete('stories', storyId);
      await storyCache.invalidatePattern(`user_stories:${authorId}`);
      await storyCache.invalidatePattern(`following_stories:`);
    } catch (error) {
      console.error('Failed to update story settings:', error);
      throw error;
    }
  }

  /**
   * Delete a story
   */
  async deleteStory(storyId: string, authorId: string): Promise<void> {
    try {
      const storyRef = doc(db, 'stories', storyId);

      await updateDoc(storyRef, {
        isActive: false,
      });

      await storyCache.delete('stories', storyId);
      await storyCache.invalidatePattern(`user_stories:${authorId}`);
      await storyCache.invalidatePattern(`following_stories:`);
    } catch (error) {
      console.error('Failed to delete story:', error);
      throw error;
    }
  }

  async getViewedStoryIds(storyIds: string[], viewerId: string): Promise<Set<string>> {
    try {
      const validStoryIds = Array.from(new Set(storyIds.filter(Boolean)));
      if (validStoryIds.length === 0) {
        return new Set<string>();
      }

      const cacheKey = buildViewedStoriesCacheKey(viewerId, validStoryIds);
      const optimisticViewed = this.getOptimisticViewedStories(viewerId);
      const cached = await storyCache.get<string[]>('viewed_story_ids', cacheKey);
      if (cached) {
        return new Set([...cached, ...Array.from(optimisticViewed)]);
      }

      const viewedStoryIds = new Set<string>();
      for (let index = 0; index < validStoryIds.length; index += 10) {
        const chunk = validStoryIds.slice(index, index + 10);
        try {
          const q = query(
            collectionGroup(db, 'views'),
            where('viewerId', '==', viewerId),
            where('storyId', 'in', chunk)
          );
          const snapshot = await getDocs(q);
          snapshot.docs.forEach((viewDoc) => {
            const storyId = (viewDoc.data() as any)?.storyId;
            if (storyId) {
              viewedStoryIds.add(storyId);
            }
          });
        } catch {
          const checks = await Promise.all(
            chunk.map(async (storyId) => {
              const viewRef = doc(db, 'stories', storyId, 'views', viewerId);
              const viewSnap = await getDoc(viewRef);
              return viewSnap.exists() ? storyId : null;
            })
          );
          checks.forEach((storyId) => {
            if (storyId) {
              viewedStoryIds.add(storyId);
            }
          });
        }
      }

      const mergedViewedStoryIds = new Set([...Array.from(viewedStoryIds), ...Array.from(this.getOptimisticViewedStories(viewerId))]);
      await storyCache.set('viewed_story_ids', cacheKey, Array.from(mergedViewedStoryIds), CACHE_TTL.STORIES);
      return mergedViewedStoryIds;
    } catch (error) {
      console.error('Failed to get viewed story ids:', error);
      return new Set<string>();
    }
  }

  /**
   * Check if user has viewed all stories from another user
   */
  async hasViewedAllStoriesFrom(authorId: string, viewerId: string): Promise<boolean> {
    try {
      const stories = await this.getUserActiveStories(authorId);
      if (stories.length === 0) return true;
      const viewedStoryIds = await this.getViewedStoryIds(stories.map((story) => story.storyId), viewerId);
      return stories.every((story) => viewedStoryIds.has(story.storyId));
    } catch (error) {
      console.error('Failed to check viewed stories:', error);
      return false;
    }
  }

  /**
   * Clean up expired stories
   */
  async cleanupExpiredStories(): Promise<void> {
    try {
      const storiesRef = collection(db, 'stories');
      const q = query(
        storiesRef,
        where('expiresAt', '<=', Timestamp.now()),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isActive: false });
      });

      await batch.commit();

      await storyCache.clearNamespace('stories');
      await storyCache.clearNamespace('user_stories');
      await storyCache.clearNamespace('following_stories');
    } catch (error) {
      console.error('Failed to cleanup expired stories:', error);
    }
  }
}

export const storyService = new StoryService();








