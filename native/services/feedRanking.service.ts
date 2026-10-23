import { storageService } from './storage.service';

const FEED_BEHAVIOR_KEY = 'iris_feed_behavior_';
const FEED_BEHAVIOR_TTL_MINUTES = 24 * 14 * 60;
const MAX_RECENT_POST_IDS = 24;
const MAX_RECENT_AUTHOR_IDS = 18;
const MAX_RECENT_SHOWN_ITEM_IDS = 18;
const MAX_RECENT_SHOWN_AUTHOR_IDS = 12;
const EXPLORATION_AFFINITY_THRESHOLD = 1.4;
const LOW_FOLLOWER_THRESHOLD = 250;
const DISCOVERY_FOLLOWER_THRESHOLD = 500;

type RankingSurface = 'home' | 'glimpses' | 'search_glimpses';

type RankedFeedItem = {
  postId?: string;
  glimpseId?: string;
  storyId?: string;
  userId?: string;
  authorId?: string;
  mediaType?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  viewsCount?: number;
  isLiked?: boolean;
  createdAt?: any;
  followersCount?: number;
  authorFollowersCount?: number;
  stats?: {
    likesCount?: number;
    commentsCount?: number;
    sharesCount?: number;
    viewsCount?: number;
  };
};

type FeedBehaviorProfile = {
  authorAffinity: Record<string, number>;
  mediaAffinity: Record<string, number>;
  openedPostIds: string[];
  openedAuthorIds: string[];
  recentShownItemIds: string[];
  recentShownAuthorIds: string[];
  lastRankedAt: number;
};

type SurfaceWeights = {
  freshnessBase: number;
  freshnessDecay: number;
  authorAffinity: number;
  mediaAffinity: number;
  noveltySeenPenalty: number;
  noveltyFreshBoost: number;
  diversityPenalty: number;
  likedPenalty: number;
  recentShownItemPenalty: number;
  recentShownAuthorPenalty: number;
  consecutiveAuthorPenalty: number;
  explorationWindow: number;
  minExplorationCount: number;
  poolSize: number;
  topWindowSize: number;
  maxAuthorOccurrencesInWindow: number;
  unseenAuthorBoost: number;
  lowFollowerBoost: number;
};

type ScoredEntry<T extends RankedFeedItem> = {
  item: T;
  itemId: string;
  authorId: string;
  createdMs: number;
  rankScore: number;
  ageHours: number;
  followerCount: number;
  isExplorationCandidate: boolean;
  isNewCreatorCandidate: boolean;
};

const DEFAULT_PROFILE: FeedBehaviorProfile = {
  authorAffinity: {},
  mediaAffinity: {},
  openedPostIds: [],
  openedAuthorIds: [],
  recentShownItemIds: [],
  recentShownAuthorIds: [],
  lastRankedAt: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toMillis(value: any) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getItemId(item: RankedFeedItem) {
  return String(item.postId || item.glimpseId || item.storyId || '');
}

function getAuthorId(item: RankedFeedItem) {
  return String(item.userId || item.authorId || '');
}

function getFollowersCount(item: RankedFeedItem) {
  return Number(item.authorFollowersCount || item.followersCount || 0);
}

function uniqueRecent(values: string[], max: number) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, max);
}

function normalizeAffinityMap(source: Record<string, number> | undefined) {
  const normalized: Record<string, number> = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    const safeValue = Number(value);
    if (!key || !Number.isFinite(safeValue) || safeValue <= 0.02) return;
    normalized[key] = clamp(safeValue, 0, 8);
  });
  return normalized;
}

function applyAffinityDecay(map: Record<string, number>, factor: number) {
  const decayed: Record<string, number> = {};
  Object.entries(map).forEach(([key, value]) => {
    const nextValue = value * factor;
    if (nextValue <= 0.02) return;
    decayed[key] = Number(nextValue.toFixed(4));
  });
  return decayed;
}

function normalizeProfile(profile: FeedBehaviorProfile | null): FeedBehaviorProfile {
  if (!profile) return { ...DEFAULT_PROFILE };
  return {
    authorAffinity: normalizeAffinityMap(profile.authorAffinity),
    mediaAffinity: normalizeAffinityMap(profile.mediaAffinity),
    openedPostIds: Array.isArray(profile.openedPostIds) ? uniqueRecent(profile.openedPostIds, MAX_RECENT_POST_IDS) : [],
    openedAuthorIds: Array.isArray(profile.openedAuthorIds) ? uniqueRecent(profile.openedAuthorIds, MAX_RECENT_AUTHOR_IDS) : [],
    recentShownItemIds: Array.isArray(profile.recentShownItemIds) ? uniqueRecent(profile.recentShownItemIds, MAX_RECENT_SHOWN_ITEM_IDS) : [],
    recentShownAuthorIds: Array.isArray(profile.recentShownAuthorIds) ? uniqueRecent(profile.recentShownAuthorIds, MAX_RECENT_SHOWN_AUTHOR_IDS) : [],
    lastRankedAt: typeof profile.lastRankedAt === 'number' ? profile.lastRankedAt : 0,
  };
}

function getMediaKey(item: RankedFeedItem) {
  return item.mediaType || 'photo';
}

function getEngagementScore(item: RankedFeedItem) {
  const likes = Number(item.likesCount ?? item.stats?.likesCount ?? 0);
  const comments = Number(item.commentsCount ?? item.stats?.commentsCount ?? 0);
  const shares = Number(item.sharesCount ?? item.stats?.sharesCount ?? 0);
  const views = Number(item.viewsCount ?? item.stats?.viewsCount ?? 0);

  return clamp(
    Math.log1p(likes) * 2.2 +
      Math.log1p(comments) * 3.2 +
      Math.log1p(shares) * 3.8 +
      Math.log1p(views) * 1.25,
    0,
    22,
  );
}

function getNewCreatorBoost(item: RankedFeedItem, surface: RankingSurface, ageHours: number) {
  const followers = getFollowersCount(item);
  const creatorIsNew = followers > 0 ? followers <= LOW_FOLLOWER_THRESHOLD : true;
  if (!creatorIsNew) return 0;

  const freshnessMultiplier = ageHours <= 72 ? 1 : ageHours <= 168 ? 0.6 : 0.25;
  if (surface === 'home') return 3.4 * freshnessMultiplier;
  if (surface === 'glimpses') return 9.4 * freshnessMultiplier;
  return 11.6 * freshnessMultiplier;
}

function getSurfaceWeights(surface: RankingSurface): SurfaceWeights {
  switch (surface) {
    case 'glimpses':
      return {
        freshnessBase: 48,
        freshnessDecay: 1.45,
        authorAffinity: 4.8,
        mediaAffinity: 5.1,
        noveltySeenPenalty: -6,
        noveltyFreshBoost: 8,
        diversityPenalty: 13,
        likedPenalty: -3,
        recentShownItemPenalty: 5.5,
        recentShownAuthorPenalty: 5,
        consecutiveAuthorPenalty: 11,
        explorationWindow: 8,
        minExplorationCount: 2,
        poolSize: 7,
        topWindowSize: 8,
        maxAuthorOccurrencesInWindow: 2,
        unseenAuthorBoost: 5.2,
        lowFollowerBoost: 4.2,
      };
    case 'search_glimpses':
      return {
        freshnessBase: 44,
        freshnessDecay: 1.2,
        authorAffinity: 2.6,
        mediaAffinity: 4.8,
        noveltySeenPenalty: -4,
        noveltyFreshBoost: 9.2,
        diversityPenalty: 9,
        likedPenalty: -2,
        recentShownItemPenalty: 4.2,
        recentShownAuthorPenalty: 4,
        consecutiveAuthorPenalty: 9,
        explorationWindow: 9,
        minExplorationCount: 3,
        poolSize: 8,
        topWindowSize: 9,
        maxAuthorOccurrencesInWindow: 2,
        unseenAuthorBoost: 6.3,
        lowFollowerBoost: 5.2,
      };
    case 'home':
    default:
      return {
        freshnessBase: 60,
        freshnessDecay: 2.8,
        authorAffinity: 6.4,
        mediaAffinity: 4.1,
        noveltySeenPenalty: -8,
        noveltyFreshBoost: 7,
        diversityPenalty: 17,
        likedPenalty: -6,
        recentShownItemPenalty: 6.5,
        recentShownAuthorPenalty: 6,
        consecutiveAuthorPenalty: 14,
        explorationWindow: 7,
        minExplorationCount: 2,
        poolSize: 6,
        topWindowSize: 7,
        maxAuthorOccurrencesInWindow: 2,
        unseenAuthorBoost: 2.6,
        lowFollowerBoost: 2.1,
      };
  }
}

function surfaceSlotTargets(windowEnd: number, minExplorationCount: number) {
  if (minExplorationCount <= 1) return [Math.min(1, windowEnd - 1)];
  if (windowEnd <= 4) return [1, Math.min(windowEnd - 1, 2)];
  return [1, Math.min(4, windowEnd - 1), Math.min(7, windowEnd - 1)].slice(0, minExplorationCount);
}

class FeedRankingService {
  private getProfile(userId: string): FeedBehaviorProfile {
    const profile = normalizeProfile(storageService.getCachedData<FeedBehaviorProfile>(FEED_BEHAVIOR_KEY, userId));
    const now = Date.now();
    if (!profile.lastRankedAt) return profile;

    const hoursSinceLastRank = Math.max(0, (now - profile.lastRankedAt) / (1000 * 60 * 60));
    if (hoursSinceLastRank < 6) return profile;

    const decayFactor = Math.pow(0.92, Math.min(hoursSinceLastRank / 24, 14));
    return {
      ...profile,
      authorAffinity: applyAffinityDecay(profile.authorAffinity, decayFactor),
      mediaAffinity: applyAffinityDecay(profile.mediaAffinity, decayFactor),
    };
  }

  private setProfile(userId: string, profile: FeedBehaviorProfile) {
    storageService.setCachedData(FEED_BEHAVIOR_KEY, userId, profile, FEED_BEHAVIOR_TTL_MINUTES);
  }

  private updateRecentList(list: string[], value: string, max: number) {
    if (!value) return list;
    return [value, ...list.filter((entry) => entry !== value)].slice(0, max);
  }

  private isExplorationCandidate(item: RankedFeedItem, profile: FeedBehaviorProfile, ageHours: number) {
    const authorId = getAuthorId(item);
    if (!authorId) return false;
    const authorAffinity = profile.authorAffinity[authorId] || 0;
    const followers = getFollowersCount(item);
    const lowExposureAuthor = !profile.openedAuthorIds.includes(authorId);
    return authorAffinity <= EXPLORATION_AFFINITY_THRESHOLD && (lowExposureAuthor || followers <= DISCOVERY_FOLLOWER_THRESHOLD || ageHours <= 72);
  }

  private isNewCreatorCandidate(item: RankedFeedItem, profile: FeedBehaviorProfile, ageHours: number) {
    const authorId = getAuthorId(item);
    if (!authorId) return false;
    const followers = getFollowersCount(item);
    const authorAffinity = profile.authorAffinity[authorId] || 0;
    return followers <= LOW_FOLLOWER_THRESHOLD && authorAffinity <= 2.2 && ageHours <= 168;
  }

  private scoreItem<T extends RankedFeedItem>(
    item: T,
    index: number,
    profile: FeedBehaviorProfile,
    surface: RankingSurface,
    weights: SurfaceWeights,
    now: number,
  ): ScoredEntry<T> {
    const ageHours = Math.max(0, (now - toMillis(item.createdAt)) / (1000 * 60 * 60));
    const itemId = getItemId(item);
    const authorId = getAuthorId(item);
    const followerCount = getFollowersCount(item);
    const mediaKey = getMediaKey(item);
    const freshnessScore = clamp(weights.freshnessBase - ageHours * weights.freshnessDecay, -20, weights.freshnessBase);
    const authorScore = clamp((profile.authorAffinity[authorId] || 0) * weights.authorAffinity, 0, surface === 'home' ? 24 : 18);
    const mediaScore = clamp((profile.mediaAffinity[mediaKey] || 0) * weights.mediaAffinity, 0, 15);
    const engagementScore = getEngagementScore(item);
    const newCreatorBoost = getNewCreatorBoost(item, surface, ageHours);
    const noveltyBoost = itemId && profile.openedPostIds.includes(itemId) ? weights.noveltySeenPenalty : weights.noveltyFreshBoost;
    const authorNoveltyBoost = authorId && profile.openedAuthorIds.includes(authorId) ? 0 : weights.unseenAuthorBoost;
    const likedPenalty = item.isLiked ? weights.likedPenalty : 0;
    const recentShownItemPenalty = itemId && profile.recentShownItemIds.includes(itemId) ? weights.recentShownItemPenalty : 0;
    const recentShownAuthorPenalty = authorId && profile.recentShownAuthorIds.includes(authorId) ? weights.recentShownAuthorPenalty : 0;
    const explorationCandidate = this.isExplorationCandidate(item, profile, ageHours);
    const newCreatorCandidate = this.isNewCreatorCandidate(item, profile, ageHours);
    const explorationBoost = explorationCandidate ? (surface === 'home' ? 1.6 : 3.3) : 0;
    const lowFollowerBoost = followerCount <= DISCOVERY_FOLLOWER_THRESHOLD ? weights.lowFollowerBoost : 0;
    const rankScore = freshnessScore + authorScore + mediaScore + engagementScore + newCreatorBoost + noveltyBoost + authorNoveltyBoost + explorationBoost + lowFollowerBoost + likedPenalty - recentShownItemPenalty - recentShownAuthorPenalty - index * 0.25;

    return {
      item,
      itemId,
      authorId,
      createdMs: toMillis(item.createdAt),
      rankScore,
      ageHours,
      followerCount,
      isExplorationCandidate: explorationCandidate,
      isNewCreatorCandidate: newCreatorCandidate,
    };
  }

  private buildRankedOrder<T extends RankedFeedItem>(scored: ScoredEntry<T>[], weights: SurfaceWeights): ScoredEntry<T>[] {
    const remaining = [...scored].sort((a, b) => {
      if (Math.abs(b.rankScore - a.rankScore) > 1.15) return b.rankScore - a.rankScore;
      return b.createdMs - a.createdMs;
    });
    const ordered: ScoredEntry<T>[] = [];
    const usedAuthors: string[] = [];

    while (remaining.length > 0) {
      const position = ordered.length;
      const pool = remaining.slice(0, Math.min(weights.poolSize + position, remaining.length));
      let bestCandidate = pool[0];
      let bestScore = Number.NEGATIVE_INFINITY;

      pool.forEach((candidate) => {
        const sameAuthorCount = candidate.authorId ? usedAuthors.filter((authorId) => authorId === candidate.authorId).length : 0;
        const repeatedAuthorPenalty = sameAuthorCount > 0 ? weights.diversityPenalty * sameAuthorCount * (position < weights.topWindowSize ? 1 : 0.7) : 0;
        const consecutiveAuthorPenalty = usedAuthors[0] && candidate.authorId && usedAuthors[0] === candidate.authorId ? weights.consecutiveAuthorPenalty : 0;
        const topWindowAuthorCount = position < weights.topWindowSize && candidate.authorId
          ? ordered.slice(0, weights.topWindowSize).filter((entry) => entry.authorId === candidate.authorId).length
          : 0;
        const hardCapPenalty = topWindowAuthorCount >= weights.maxAuthorOccurrencesInWindow ? 22 : 0;
        const fairnessBoost = candidate.isNewCreatorCandidate && position < weights.topWindowSize ? 2.4 : 0;
        const dynamicScore = candidate.rankScore + fairnessBoost - repeatedAuthorPenalty - consecutiveAuthorPenalty - hardCapPenalty;

        if (dynamicScore > bestScore) {
          bestCandidate = candidate;
          bestScore = dynamicScore;
        }
      });

      ordered.push(bestCandidate);
      if (bestCandidate.authorId) {
        usedAuthors.unshift(bestCandidate.authorId);
        if (usedAuthors.length > 4) usedAuthors.pop();
      }
      const removeIndex = remaining.findIndex((entry) => entry.itemId === bestCandidate.itemId && entry.authorId === bestCandidate.authorId);
      if (removeIndex >= 0) {
        remaining.splice(removeIndex, 1);
      } else {
        remaining.shift();
      }
    }

    return ordered;
  }

  private injectExploration<T extends RankedFeedItem>(ordered: ScoredEntry<T>[], weights: SurfaceWeights): ScoredEntry<T>[] {
    if (ordered.length <= weights.minExplorationCount + 1) return ordered;

    const nextOrdered = [...ordered];
    const windowEnd = Math.min(weights.explorationWindow, nextOrdered.length);
    const targetSlots = surfaceSlotTargets(windowEnd, weights.minExplorationCount);
    let explorationCount = nextOrdered.slice(0, windowEnd).filter((entry) => entry.isExplorationCandidate).length;

    for (const slot of targetSlots) {
      if (explorationCount >= weights.minExplorationCount) break;
      if (slot >= nextOrdered.length) break;
      if (nextOrdered[slot]?.isExplorationCandidate) {
        explorationCount += 1;
        continue;
      }

      const replacementIndex = nextOrdered.findIndex((entry, index) => index > slot && index < Math.min(nextOrdered.length, weights.explorationWindow + 6) && entry.isExplorationCandidate);
      if (replacementIndex === -1) continue;

      const [replacement] = nextOrdered.splice(replacementIndex, 1);
      nextOrdered.splice(slot, 0, replacement);
      explorationCount += 1;
    }

    return nextOrdered;
  }

  private rebalanceForNewCreators<T extends RankedFeedItem>(ordered: ScoredEntry<T>[], weights: SurfaceWeights): ScoredEntry<T>[] {
    if (ordered.length <= 2) return ordered;

    const nextOrdered = [...ordered];
    const windowEnd = Math.min(weights.topWindowSize, nextOrdered.length);
    const alreadyPresent = nextOrdered.slice(0, windowEnd).some((entry) => entry.isNewCreatorCandidate);
    if (alreadyPresent) return nextOrdered;

    const replacementIndex = nextOrdered.findIndex((entry, index) => index >= 2 && index < Math.min(nextOrdered.length, weights.topWindowSize + 6) && entry.isNewCreatorCandidate);
    if (replacementIndex === -1) return nextOrdered;

    const targetSlot = Math.min(Math.max(2, weights.minExplorationCount), windowEnd - 1);
    const [replacement] = nextOrdered.splice(replacementIndex, 1);
    nextOrdered.splice(targetSlot, 0, replacement);
    return nextOrdered;
  }

  rankContent<T extends RankedFeedItem>(userId: string, items: T[], surface: RankingSurface): T[] {
    if (!userId || items.length <= 1) return items;

    const profile = this.getProfile(userId);
    const now = Date.now();
    const weights = getSurfaceWeights(surface);
    const scored = items.map((item, index) => this.scoreItem(item, index, profile, surface, weights, now));
    const ordered = this.rebalanceForNewCreators(this.injectExploration(this.buildRankedOrder(scored, weights), weights), weights);

    profile.lastRankedAt = now;
    profile.recentShownItemIds = uniqueRecent([
      ...ordered.slice(0, MAX_RECENT_SHOWN_ITEM_IDS).map((entry) => entry.itemId).filter(Boolean),
      ...profile.recentShownItemIds,
    ], MAX_RECENT_SHOWN_ITEM_IDS);
    profile.recentShownAuthorIds = uniqueRecent([
      ...ordered.slice(0, MAX_RECENT_SHOWN_AUTHOR_IDS).map((entry) => entry.authorId).filter(Boolean),
      ...profile.recentShownAuthorIds,
    ], MAX_RECENT_SHOWN_AUTHOR_IDS);
    this.setProfile(userId, profile);

    return ordered.map((entry) => entry.item);
  }

  rankFeed<T extends RankedFeedItem>(userId: string, items: T[]): T[] {
    return this.rankContent(userId, items, 'home');
  }

  rankGlimpses<T extends RankedFeedItem>(userId: string, items: T[]): T[] {
    return this.rankContent(userId, items, 'glimpses');
  }

  rankSearchGlimpses<T extends RankedFeedItem>(userId: string, items: T[]): T[] {
    return this.rankContent(userId, items, 'search_glimpses');
  }

  recordOpen(userId: string, item: RankedFeedItem) {
    const profile = this.getProfile(userId);
    const itemId = getItemId(item);
    const authorId = getAuthorId(item);
    if (!authorId) return;

    profile.authorAffinity[authorId] = clamp((profile.authorAffinity[authorId] || 0) + 1.15, 0, 6);
    const mediaKey = getMediaKey(item);
    profile.mediaAffinity[mediaKey] = clamp((profile.mediaAffinity[mediaKey] || 0) + 0.5, 0, 5);
    if (itemId) {
      profile.openedPostIds = this.updateRecentList(profile.openedPostIds, itemId, MAX_RECENT_POST_IDS);
      profile.recentShownItemIds = this.updateRecentList(profile.recentShownItemIds, itemId, MAX_RECENT_SHOWN_ITEM_IDS);
    }
    profile.openedAuthorIds = this.updateRecentList(profile.openedAuthorIds, authorId, MAX_RECENT_AUTHOR_IDS);
    profile.recentShownAuthorIds = this.updateRecentList(profile.recentShownAuthorIds, authorId, MAX_RECENT_SHOWN_AUTHOR_IDS);
    profile.lastRankedAt = Date.now();
    this.setProfile(userId, profile);
  }

  recordLike(userId: string, item: RankedFeedItem) {
    const profile = this.getProfile(userId);
    const itemId = getItemId(item);
    const authorId = getAuthorId(item);
    if (!authorId) return;

    profile.authorAffinity[authorId] = clamp((profile.authorAffinity[authorId] || 0) + 1.8, 0, 8);
    const mediaKey = getMediaKey(item);
    profile.mediaAffinity[mediaKey] = clamp((profile.mediaAffinity[mediaKey] || 0) + 0.9, 0, 6);
    profile.openedAuthorIds = this.updateRecentList(profile.openedAuthorIds, authorId, MAX_RECENT_AUTHOR_IDS);
    profile.recentShownAuthorIds = this.updateRecentList(profile.recentShownAuthorIds, authorId, MAX_RECENT_SHOWN_AUTHOR_IDS);
    if (itemId) {
      profile.openedPostIds = this.updateRecentList(profile.openedPostIds, itemId, MAX_RECENT_POST_IDS);
    }
    profile.lastRankedAt = Date.now();
    this.setProfile(userId, profile);
  }
}

export const feedRankingService = new FeedRankingService();
