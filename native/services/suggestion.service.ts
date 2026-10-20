import { 
  collection, 
  query, 
  where, 
  getDocs, 
  limit as firestoreLimit,
  orderBy 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { userService } from './user.service';
import { postService } from './post.service';
import { glimpseService } from './glimpse.service';
import type { User as DBUser } from '../types/database';

/**
 * The user fields the suggestion query reads. Derived from the schema; the
 * follower counters are flattened here by the query rather than read out of
 * `stats`, and the index signature keeps the scoring pass free to stash
 * working values on a candidate.
 */
type User = Pick<
  DBUser,
  'userId' | 'username' | 'displayName' | 'email' | 'avatarURL' | 'bio' | 'createdAt'
> & {
  followersCount?: number;
  followingCount?: number;
  [key: string]: any;
};

export interface SuggestedUser extends User {
  score: number;
  reason: string;
  matchedInterests?: string[];
  activityLabel?: string;
  ctaLabel?: 'Follow' | 'Connect' | 'Request';
}

const INTEREST_CATEGORY_MAP: Record<string, string[]> = {
  gaming: ['gaming', 'gamer', 'games', 'esports', 'pubg', 'bgmi', 'valorant', 'codm', 'callofduty', 'xbox', 'playstation'],
  memes: ['meme', 'memes', 'funny', 'humor', 'shitpost', 'jokes', 'comedy'],
  tech: ['tech', 'technology', 'coding', 'developer', 'programming', 'software', 'ai', 'gadgets', 'startup'],
  music: ['music', 'songs', 'rapper', 'dj', 'beats', 'singer', 'playlist'],
  photography: ['photo', 'photos', 'photography', 'photographer', 'camera', 'cinematic'],
  fashion: ['fashion', 'style', 'outfit', 'streetwear', 'designer'],
  fitness: ['fitness', 'gym', 'workout', 'health', 'bodybuilding', 'running'],
  sports: ['sports', 'football', 'cricket', 'basketball', 'soccer', 'tennis'],
  travel: ['travel', 'travelling', 'traveler', 'adventure', 'trip', 'wander'],
  food: ['food', 'foodie', 'cooking', 'chef', 'recipe', 'cafe'],
  anime: ['anime', 'manga', 'otaku'],
  movies: ['movie', 'movies', 'cinema', 'film', 'series', 'shows'],
  art: ['art', 'artist', 'design', 'illustration', 'painting', 'creative'],
};

type InterestProfile = Record<string, number>;

/**
 * People Suggestion Service
 * Algorithm based on 5 conditions (Location pending):
 * 1. Mutual Followers (40 points)
 * 2. Similar Interests (25 points)
 * 3. Popular Users (15 points)
 * 4. New Users (10 points)
 * 5. Activity Pattern (10 points)
 */
class SuggestionService {
  
  private suggestionCache: Map<string, { 
    suggestions: SuggestedUser[], 
    timestamp: number,
    ttl: number,
  }> = new Map();
  
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly PEOPLE_LIKE_YOU_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Get personalized suggestions for user
   * Uses 5 conditions with weighted scoring
   */
  async getSuggestionsForUser(
    userId: string, 
    limit: number = 7,
    offset: number = 0
  ): Promise<SuggestedUser[]> {
    
    try {
      console.log('🔍 Getting suggestions for user:', userId, { limit, offset });
      
      // Check cache first (if offset is 0)
      if (offset === 0) {
        const cached = this.getCachedSuggestions(userId);
        if (cached) {
          console.log('✅ Returning cached suggestions');
          return cached.slice(0, limit);
        }
      }
      
      // Get current user data
      const currentUser = await userService.getUser(userId);
      if (!currentUser) {
        console.error('❌ Current user not found');
        return [];
      }
      
      // Get user's following list
      const following = await userService.getFollowing(userId);
      console.log('📊 User follows:', following.length, 'users');
      
      // Get all potential suggestions
      const allUsers = await this.getAllPotentialSuggestions(userId);
      console.log('📊 Total potential suggestions:', allUsers.length);
      
      // Filter out already following, blocked, self, and private accounts
      const filtered = await this.filterUsers(userId, allUsers, following);
      console.log('📊 After filtering:', filtered.length, 'users');
      
      // Calculate score for each user
      const scored = await Promise.all(
        filtered.map(async (user) => {
          const score = await this.calculateScore(currentUser, user, following);
          const reason = await this.getSuggestionReason(currentUser, user);
          
          return {
            ...user,
            score,
            reason
          } as SuggestedUser;
        })
      );
      
      // Sort by score (highest first)
      scored.sort((a, b) => b.score - a.score);
      
      console.log('✅ Top 5 suggestions:', scored.slice(0, 5).map(u => ({
        username: u.username,
        score: u.score,
        reason: u.reason
      })));
      
      // Cache results (store top 20)
      if (offset === 0) {
        this.cacheSuggestions(userId, scored.slice(0, 20));
      }
      
      // Apply pagination
      return scored.slice(offset, offset + limit);
      
    } catch (error) {
      console.error('❌ Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * Get all potential users to suggest
   * Optimized query to get active users
   */
  private async getAllPotentialSuggestions(userId: string): Promise<User[]> {
    try {
      // Get all users except current user
      const usersRef = collection(db, 'users');
      const q = query(usersRef, firestoreLimit(200)); // Limit for performance
      
      const snapshot = await getDocs(q);
      const users = snapshot.docs
        .map(doc => ({ userId: doc.id, ...doc.data() } as User))
        .filter(u => u.userId !== userId);
      
      return users;
    } catch (error) {
      console.error('Error getting potential suggestions:', error);
      return [];
    }
  }

  /**
   * Filter users based on following, blocking, privacy
   */
  private async filterUsers(
    userId: string,
    users: User[],
    following: string[]
  ): Promise<User[]> {
    
    try {
      // Get followers list to exclude them too
      const followers = await userService.getFollowers(userId);
      
      return users.filter(user => {
        // Don't suggest self
        if (user.userId === userId) return false;
        
        // Skip if already following
        if (following.includes(user.userId)) return false;
        
        // Skip if already a follower (they already know each other)
        if (followers.includes(user.userId)) return false;
        
        // Skip if no avatar (incomplete profile)
        if (!user.avatarURL) return false;
        
        return true;
      });
      
    } catch (error) {
      console.error('Error filtering users:', error);
      return users;
    }
  }

  /**
   * Calculate weighted score based on 5 conditions
   * Total possible: 100 points
   */
  private async calculateScore(
    currentUser: User, 
    suggestedUser: User,
    currentUserFollowing: string[]
  ): Promise<number> {
    
    let score = 0;
    
    // 1. Mutual Followers (40 points max)
    const mutualFollowers = await this.getMutualFollowers(
      currentUser.userId, 
      suggestedUser.userId,
      currentUserFollowing
    );
    const mutualScore = Math.min(mutualFollowers.length * 8, 40);
    score += mutualScore;
    
    // 1.5. Liked Posts Interaction (20 points max)
    const likedPostsScore = await this.getLikedPostsScore(
      currentUser.userId,
      suggestedUser.userId
    );
    score += likedPostsScore;
    
    // 2. Similar Interests (25 points max)
    // Extract from bio keywords or tags
    const commonInterests = await this.getCommonInterests(
      currentUser, 
      suggestedUser
    );
    const interestScore = Math.min(commonInterests.length * 5, 25);
    score += interestScore;
    
    // 3. Popular User (15 points max)
    const followersCount = suggestedUser.followersCount || 0;
    let popularScore = 0;
    if (followersCount > 1000) popularScore = 15;
    else if (followersCount > 500) popularScore = 10;
    else if (followersCount > 100) popularScore = 5;
    score += popularScore;
    
    // 4. New User (10 points)
    const daysSinceJoined = this.getDaysSince(suggestedUser.createdAt);
    if (daysSinceJoined < 30) {
      score += 10;
    }
    
    // 5. Activity Pattern (10 points)
    // Check if user is active (posted recently)
    const daysSinceLastPost = await this.getDaysSinceLastPost(suggestedUser.userId);
    if (daysSinceLastPost < 7) {
      score += 10;
    } else if (daysSinceLastPost < 30) {
      score += 5;
    }
    
    // Bonus: Complete profile (5 points)
    if (suggestedUser.bio && suggestedUser.avatarURL && suggestedUser.displayName) {
      score += 5;
    }
    
    return score;
  }

  /**
   * Get human-readable reason for suggestion
   */
  private async getSuggestionReason(
    currentUser: User,
    suggestedUser: User
  ): Promise<string> {
    
    try {
      // Check mutual followers first (highest priority)
      const mutualFollowers = await this.getMutualFollowers(
        currentUser.userId,
        suggestedUser.userId
      );
      
      if (mutualFollowers.length > 0) {
        const firstFollower = await userService.getUser(mutualFollowers[0]);
        if (firstFollower) {
          // Clean username - remove @ prefix if exists
          const cleanUsername = firstFollower.username.replace(/^@+/, '');
          if (mutualFollowers.length === 1) {
            return `Followed by @${cleanUsername}`;
          } else {
            return `Followed by @${cleanUsername} + ${mutualFollowers.length - 1} others`;
          }
        }
      }
      
      // Check similar interests
      const commonInterests = await this.getCommonInterests(currentUser, suggestedUser);
      if (commonInterests.length > 0) {
        const topInterests = commonInterests.slice(0, 2).join(', ');
        return `Similar interests: ${topInterests}`;
      }
      
      // Check if new user
      const daysSinceJoined = this.getDaysSince(suggestedUser.createdAt);
      if (daysSinceJoined < 7) {
        return 'New to Iris';
      }
      
      // Check if popular
      if ((suggestedUser.followersCount || 0) > 1000) {
        return 'Popular on Iris';
      }
      
      // Default
      return 'Suggested for you';
      
    } catch (error) {
      console.error('Error getting suggestion reason:', error);
      return 'Suggested for you';
    }
  }

  /**
   * Get mutual followers between two users
   */
  private async getMutualFollowers(
    userId1: string,
    userId2: string,
    user1Following?: string[]
  ): Promise<string[]> {
    
    try {
      // Get user1's following list (use cached if provided)
      const following1 = user1Following || await userService.getFollowing(userId1);
      
      // Get user2's followers list
      const followers2 = await userService.getFollowers(userId2);
      
      // Find intersection
      return following1.filter(id => followers2.includes(id));
      
    } catch (error) {
      console.error('Error getting mutual followers:', error);
      return [];
    }
  }

  /**
   * Get common interests between users
   * Extract from bio, username, or posts
   */
  private async getCommonInterests(
    user1: User,
    user2: User
  ): Promise<string[]> {
    
    try {
      // Extract keywords from bios
      const interests1 = this.extractInterests(user1.bio || '');
      const interests2 = this.extractInterests(user2.bio || '');
      
      // Find common interests
      return interests1.filter(interest => interests2.includes(interest));
      
    } catch (error) {
      console.error('Error getting common interests:', error);
      return [];
    }
  }

  /**
   * Extract interests from bio text
   * Simple keyword matching
   */
  private extractInterests(bio: string): string[] {
    const keywords = [
      'fitness', 'gym', 'workout', 'health',
      'coding', 'developer', 'programming', 'tech',
      'travel', 'traveller', 'adventure', 'explore',
      'food', 'foodie', 'cooking', 'chef',
      'music', 'musician', 'singer', 'artist',
      'photography', 'photographer', 'photo',
      'fashion', 'style', 'designer',
      'sports', 'football', 'cricket', 'basketball',
      'gaming', 'gamer', 'esports',
      'book', 'reading', 'writer', 'author'
    ];
    
    const lowerBio = bio.toLowerCase();
    return keywords.filter(keyword => lowerBio.includes(keyword));
  }

  /**
   * Get days since a timestamp
   */
  private getDaysSince(timestamp: any): number {
    if (!timestamp) return 999;
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days since user's last post
   */
  private async getDaysSinceLastPost(userId: string): Promise<number> {
    try {
      // Check posts collection
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return 999; // No posts
      }
      
      const lastPost = snapshot.docs[0].data();
      return this.getDaysSince(lastPost.createdAt);
      
    } catch (error) {
      console.error('Error getting last post date:', error);
      return 999;
    }
  }

  /**
   * Get suggestions specifically for Following/Followers list
   * Shows only mutual connections
   */
  async getMutualSuggestions(
    userId: string,
    contextUserId: string, // The user whose followers/following we're viewing
    limit: number = 7
  ): Promise<SuggestedUser[]> {
    
    try {
      console.log('🔍 Getting mutual suggestions:', { userId, contextUserId, limit });
      
      const currentUser = await userService.getUser(userId);
      if (!currentUser) return [];
      
      // Get context user for username (not userId)
      const contextUser = await userService.getUser(contextUserId);
      // Clean username - remove @ prefix if exists
      const contextUsername = (contextUser?.username || 'user').replace(/^@+/, '');
      
      const currentUserFollowing = await userService.getFollowing(userId);
      const contextUserFollowing = await userService.getFollowing(contextUserId);
      const contextUserFollowers = await userService.getFollowers(contextUserId);
      
      // Find people in context user's network but not followed by current user
      const potentialSuggestions = new Set([
        ...contextUserFollowing,
        ...contextUserFollowers
      ]);
      
      // Convert Set to Array and deduplicate first
      const uniquePotentialIds = Array.from(potentialSuggestions).filter(
        id => id !== userId && !currentUserFollowing.includes(id)
      );
      
      const suggestions: SuggestedUser[] = [];
      const seenUserIds = new Set<string>(); // Prevent duplicates
      
      for (const suggestedId of uniquePotentialIds) {
        // Skip if already added (double-check)
        if (seenUserIds.has(suggestedId)) {
          continue;
        }
        
        const user = await userService.getUser(suggestedId);
        if (!user || !user.avatarURL) continue;
        
        // Mark as seen to prevent duplicates
        seenUserIds.add(suggestedId);
        
        // Calculate mutual count
        const mutualFollowers = await this.getMutualFollowers(userId, suggestedId);
        
        // Clean username - remove @ prefix if exists
        const cleanContextUsername = contextUsername.replace(/^@+/, '');
        
        suggestions.push({
          ...user,
          score: mutualFollowers.length * 10,
          reason: mutualFollowers.length > 0 
            ? `Followed by @${cleanContextUsername} + ${mutualFollowers.length} others`
            : `Followed by @${cleanContextUsername}`
        });
        
        // Limit results
        if (suggestions.length >= limit * 2) break;
      }
      
      // Sort by score and return top results (ensure uniqueness)
      const uniqueSuggestions = suggestions
        .sort((a, b) => b.score - a.score)
        .filter((user, index, self) => 
          index === self.findIndex(u => u.userId === user.userId)
        )
        .slice(0, limit);
      
      return uniqueSuggestions;
      
    } catch (error) {
      console.error('Error getting mutual suggestions:', error);
      return [];
    }
  }

  /**
   * Calculate score based on liked posts interaction
   */
  private async getLikedPostsScore(
    currentUserId: string,
    suggestedUserId: string
  ): Promise<number> {
    
    try {
      // Check if current user has liked suggested user's posts
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('authorId', '==', suggestedUserId),
        firestoreLimit(10) // Check last 10 posts
      );
      
      const snapshot = await getDocs(q);
      let likedCount = 0;
      
      for (const doc of snapshot.docs) {
        const likesRef = collection(db, 'posts', doc.id, 'likes');
        const likeQuery = query(likesRef, where('userId', '==', currentUserId));
        const likeSnapshot = await getDocs(likeQuery);
        
        if (!likeSnapshot.empty) {
          likedCount++;
        }
      }
      
      // Score based on interaction: 4 points per liked post (max 20)
      return Math.min(likedCount * 4, 20);
      
    } catch (error) {
      console.error('Error calculating liked posts score:', error);
      return 0;
    }
  }

  /**
   * Enhanced suggestion reason with interaction context
   */
  private async getEnhancedSuggestionReason(
    currentUser: User,
    suggestedUser: User
  ): Promise<string> {
    
    try {
      // Check mutual followers first (highest priority)
      const mutualFollowers = await this.getMutualFollowers(
        currentUser.userId,
        suggestedUser.userId
      );
      
      if (mutualFollowers.length > 0) {
        const firstFollower = await userService.getUser(mutualFollowers[0]);
        if (firstFollower) {
          const cleanUsername = firstFollower.username.replace(/^@+/, '');
          if (mutualFollowers.length === 1) {
            return `Followed by @${cleanUsername}`;
          } else {
            return `Followed by @${cleanUsername} + ${mutualFollowers.length - 1} others`;
          }
        }
      }
      
      // Check liked posts interaction
      const likedScore = await this.getLikedPostsScore(
        currentUser.userId,
        suggestedUser.userId
      );
      
      if (likedScore > 0) {
        const likedCount = Math.floor(likedScore / 4);
        return `You liked ${likedCount} of their posts`;
      }
      
      // Fallback reasons
      if (suggestedUser.followersCount && suggestedUser.followersCount > 1000) {
        return `Popular in your network`;
      }
      
      return `Suggested for you`;
      
    } catch (error) {
      console.error('Error getting enhanced suggestion reason:', error);
      return `Suggested for you`;
    }
  }

  /**
   * Get suggestions specifically for Following/Followers list
   * Shows only mutual connections
   */
  async getEnhancedSuggestions(
    userId: string,
    contextUserId: string, // The user whose followers/following we're viewing
    limit: number = 7
  ): Promise<SuggestedUser[]> {
    
    try {
      console.log('🔍 Getting enhanced suggestions:', { userId, contextUserId, limit });
      
      const currentUser = await userService.getUser(userId);
      if (!currentUser) return [];
      
      // Get context user for username (not userId)
      const contextUser = await userService.getUser(contextUserId);
      // Clean username - remove @ prefix if exists
      const contextUsername = (contextUser?.username || 'user').replace(/^@+/, '');
      
      const currentUserFollowing = await userService.getFollowing(userId);
      const contextUserFollowing = await userService.getFollowing(contextUserId);
      const contextUserFollowers = await userService.getFollowers(contextUserId);
      
      // Find people in context user's network but not followed by current user
      const potentialSuggestions = new Set([
        ...contextUserFollowing,
        ...contextUserFollowers
      ]);
      
      // Convert Set to Array and deduplicate first
      const uniquePotentialIds = Array.from(potentialSuggestions).filter(
        id => id !== userId && !currentUserFollowing.includes(id)
      );
      
      const suggestions: SuggestedUser[] = [];
      const seenUserIds = new Set<string>(); // Prevent duplicates
      
      for (const suggestedId of uniquePotentialIds) {
        // Skip if already added (double-check)
        if (seenUserIds.has(suggestedId)) {
          continue;
        }
        
        const user = await userService.getUser(suggestedId);
        if (!user || !user.avatarURL) continue;
        
        // Mark as seen to prevent duplicates
        seenUserIds.add(suggestedId);
        
        // Calculate mutual count
        const mutualFollowers = await this.getMutualFollowers(userId, suggestedId);
        
        // Calculate liked posts score
        const likedScore = await this.getLikedPostsScore(userId, suggestedId);
        
        // Calculate score
        const score = mutualFollowers.length * 10 + likedScore;
        
        // Get enhanced suggestion reason
        const reason = await this.getEnhancedSuggestionReason(currentUser, user);
        
        suggestions.push({
          ...user,
          score,
          reason
        });
        
        // Limit results
        if (suggestions.length >= limit * 2) break;
      }
      
      // Sort by score and return top results (ensure uniqueness)
      const uniqueSuggestions = suggestions
        .sort((a, b) => b.score - a.score)
        .filter((user, index, self) => 
          index === self.findIndex(u => u.userId === user.userId)
        )
        .slice(0, limit);
      
      return uniqueSuggestions;
      
    } catch (error) {
      console.error('Error getting enhanced suggestions:', error);
      return [];
    }
  }

  private normalizeInterestToken(rawValue: string): string | null {
    const normalized = rawValue.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
    if (!normalized) return null;

    for (const [category, keywords] of Object.entries(INTEREST_CATEGORY_MAP)) {
      if (keywords.some((keyword) => normalized.includes(keyword.replace(/[^a-z0-9]+/g, '')) || keyword.replace(/[^a-z0-9]+/g, '').includes(normalized))) {
        return category;
      }
    }

    return normalized.length >= 3 ? normalized : null;
  }

  private addInterestWeight(profile: InterestProfile, rawValues: Array<string | undefined | null>, weight: number) {
    rawValues.forEach((value) => {
      if (!value) return;
      value
        .split(/[\s,#|/]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const token = this.normalizeInterestToken(part);
          if (!token) return;
          profile[token] = Number(((profile[token] || 0) + weight).toFixed(3));
        });
    });
  }

  private extractTopInterests(profile: InterestProfile, limitCount = 3): string[] {
    return Object.entries(profile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limitCount)
      .map(([key]) => key);
  }

  private mergeProfiles(...profiles: InterestProfile[]): InterestProfile {
    const merged: InterestProfile = {};
    profiles.forEach((profile) => {
      Object.entries(profile).forEach(([key, value]) => {
        merged[key] = Number(((merged[key] || 0) + value).toFixed(3));
      });
    });
    return merged;
  }

  private buildSeedProfileFromUser(user: User | null): InterestProfile {
    const profile: InterestProfile = {};
    if (!user) return profile;

    this.addInterestWeight(profile, Array.isArray((user as any)?.preferences?.interests) ? (user as any).preferences.interests : [], 4.2);
    this.addInterestWeight(profile, [user.bio, user.displayName, user.username], 1.6);
    return profile;
  }

  private async buildCurrentUserInterestProfile(userId: string, currentUser: User): Promise<InterestProfile> {
    const baseProfile = this.buildSeedProfileFromUser(currentUser);

    try {
      const [recentPostsSnap, recentGlimpsesSnap, ownPostsSnap, ownGlimpsesSnap] = await Promise.all([
        getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), firestoreLimit(60))),
        getDocs(query(collection(db, 'glimpses'), orderBy('createdAt', 'desc'), firestoreLimit(40))),
        getDocs(query(collection(db, 'posts'), where('authorId', '==', userId), firestoreLimit(8))),
        getDocs(query(collection(db, 'glimpses'), where('authorId', '==', userId), firestoreLimit(8))),
      ]);

      const recentPosts = recentPostsSnap.docs.map((docSnap) => ({ postId: docSnap.id, ...(docSnap.data() as any) }));
      const recentGlimpses = recentGlimpsesSnap.docs.map((docSnap) => ({ glimpseId: docSnap.id, ...(docSnap.data() as any) }));
      const likedPostIds = await postService.getUserLikedPosts(userId, recentPosts.map((item) => item.postId));
      const likedGlimpseIds = await glimpseService.getUserLikedGlimpses(userId, recentGlimpses.map((item) => item.glimpseId));

      const likedPostsProfile: InterestProfile = {};
      recentPosts
        .filter((item) => likedPostIds.includes(item.postId))
        .forEach((item) => this.addInterestWeight(likedPostsProfile, [item.caption, ...(Array.isArray(item.tags) ? item.tags : [])], 2.8));

      const likedGlimpsesProfile: InterestProfile = {};
      recentGlimpses
        .filter((item) => likedGlimpseIds.includes(item.glimpseId))
        .forEach((item) => this.addInterestWeight(likedGlimpsesProfile, [item.caption, ...(Array.isArray(item.tags) ? item.tags : [])], 3.1));

      const ownContentProfile: InterestProfile = {};
      ownPostsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        this.addInterestWeight(ownContentProfile, [data.caption, ...(Array.isArray(data.tags) ? data.tags : [])], 1.5);
      });
      ownGlimpsesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        this.addInterestWeight(ownContentProfile, [data.caption, ...(Array.isArray(data.tags) ? data.tags : [])], 1.7);
      });

      return this.mergeProfiles(baseProfile, likedPostsProfile, likedGlimpsesProfile, ownContentProfile);
    } catch (error) {
      console.error('Error building current user interest profile:', error);
      return baseProfile;
    }
  }

  private async buildCandidateContentProfiles(candidateIds: string[]): Promise<Map<string, InterestProfile>> {
    const profiles = new Map<string, InterestProfile>();

    for (let index = 0; index < candidateIds.length; index += 10) {
      const chunk = candidateIds.slice(index, index + 10);
      if (chunk.length === 0) continue;

      try {
        const [postsSnap, glimpsesSnap] = await Promise.all([
          getDocs(query(collection(db, 'posts'), where('authorId', 'in', chunk), firestoreLimit(40))),
          getDocs(query(collection(db, 'glimpses'), where('authorId', 'in', chunk), firestoreLimit(30))),
        ]);

        postsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const authorId = data.authorId;
          if (!authorId) return;
          const profile = profiles.get(authorId) || {};
          this.addInterestWeight(profile, [data.caption, ...(Array.isArray(data.tags) ? data.tags : [])], 1.4);
          profiles.set(authorId, profile);
        });

        glimpsesSnap.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const authorId = data.authorId;
          if (!authorId) return;
          const profile = profiles.get(authorId) || {};
          this.addInterestWeight(profile, [data.caption, ...(Array.isArray(data.tags) ? data.tags : [])], 1.6);
          profiles.set(authorId, profile);
        });
      } catch (error) {
        console.error('Error building candidate content profiles:', error);
      }
    }

    return profiles;
  }

  private getInterestMatch(currentProfile: InterestProfile, candidateProfile: InterestProfile) {
    const shared = Object.keys(currentProfile)
      .filter((key) => candidateProfile[key])
      .map((key) => ({
        key,
        score: Math.min(currentProfile[key] || 0, candidateProfile[key] || 0),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      matchedInterests: shared.slice(0, 3).map((entry) => entry.key),
      score: shared.slice(0, 3).reduce((sum, entry) => sum + entry.score, 0),
    };
  }

  private getActivityScore(candidate: User): { score: number; label: string } {
    const lastSeenValue = (candidate as any)?.lastSeen;
    if (!lastSeenValue) return { score: 0, label: 'Active on Iris' };

    const lastSeen = lastSeenValue?.toDate ? lastSeenValue.toDate() : (lastSeenValue instanceof Date ? lastSeenValue : new Date(lastSeenValue));
    const diffMinutes = (Date.now() - lastSeen.getTime()) / (1000 * 60);

    if (diffMinutes <= 10) return { score: 12, label: 'Active now' };
    if (diffMinutes <= 60) return { score: 9, label: 'Recently active' };
    if (diffMinutes <= 360) return { score: 6.5, label: 'Active today' };
    if (diffMinutes <= 1440) return { score: 4.5, label: 'Around today' };
    return { score: 1.75, label: 'Active on Iris' };
  }

  async getPeopleLikeYouSuggestions(userId: string, limit: number = 8): Promise<SuggestedUser[]> {
    const cacheKey = `${userId}:people_like_you`;
    const cached = this.getCachedSuggestions(cacheKey);
    if (cached) {
      return cached.slice(0, limit);
    }

    try {
      const currentUser = await userService.getUser(userId);
      if (!currentUser) return [];

      const [following, followers, activeUsers, recentUsers, allUsers, currentInterestProfile] = await Promise.all([
        userService.getFollowing(userId, 80),
        userService.getFollowers(userId, 80),
        userService.getActiveUsers(userId, 16),
        userService.getRecentlyActiveUsers(userId, 18),
        this.getAllPotentialSuggestions(userId),
        this.buildCurrentUserInterestProfile(userId, currentUser),
      ]);

      const blockedIds = new Set<string>([userId, ...(following || []), ...(followers || [])]);
      const candidateMap = new Map<string, User>();
      [...activeUsers, ...recentUsers, ...allUsers].forEach((candidate: any) => {
        if (!candidate?.userId || blockedIds.has(candidate.userId) || !candidate.avatarURL) return;
        if (!candidateMap.has(candidate.userId)) {
          candidateMap.set(candidate.userId, candidate);
        }
      });

      const candidates = Array.from(candidateMap.values()).slice(0, 48);
      if (candidates.length === 0) return [];

      const candidateProfiles = await this.buildCandidateContentProfiles(candidates.map((candidate) => candidate.userId));
      const seedTopInterests = this.extractTopInterests(currentInterestProfile, 4);
      const scored = candidates.map((candidate) => {
        const candidateProfile = this.mergeProfiles(
          this.buildSeedProfileFromUser(candidate),
          candidateProfiles.get(candidate.userId) || {}
        );
        const match = this.getInterestMatch(currentInterestProfile, candidateProfile);
        const activity = this.getActivityScore(candidate);
        const followersCount = Number(candidate?.stats?.followersCount || candidate.followersCount || 0);
        const postsCount = Number(candidate?.stats?.postsCount || 0);
        const completeness = candidate.bio && candidate.displayName ? 2.5 : 0.8;
        const qualityScore = Math.min(followersCount / 220, 4.5);
        const topInterestBoost = seedTopInterests.some((interest) => match.matchedInterests.includes(interest)) ? 4.5 : 0;
        const multiInterestBoost = match.matchedInterests.length >= 2 ? 5.5 : match.matchedInterests.length === 1 ? 2.25 : 0;
        const activeCreatorBoost = postsCount > 0 ? Math.min(postsCount / 6, 3) : 0;
        const newCreatorBoost = followersCount <= 180 ? 6.25 : followersCount <= 500 ? 3.5 : 0;
        const explorationBoost = followersCount <= 1200 && match.matchedInterests.length > 0 ? 2.25 : 0;
        const oversizedCreatorPenalty = followersCount > 15000 ? 2.5 : followersCount > 6000 ? 1.15 : 0;
        const score =
          match.score * 9.25 +
          activity.score * 1.4 +
          completeness +
          qualityScore +
          topInterestBoost +
          multiInterestBoost +
          activeCreatorBoost +
          newCreatorBoost +
          explorationBoost -
          oversizedCreatorPenalty;
        const ctaLabel: SuggestedUser['ctaLabel'] =
          candidate.isPrivate ? 'Request' : match.matchedInterests.length >= 2 ? 'Connect' : 'Follow';

        return {
          ...candidate,
          score,
          matchedInterests: match.matchedInterests,
          activityLabel: activity.label,
          ctaLabel,
          reason: match.matchedInterests.length > 0
            ? ('Into ' + match.matchedInterests.slice(0, 2).map((interest) => interest.charAt(0).toUpperCase() + interest.slice(1)).join(', '))
            : 'Suggested based on your activity',
        } as SuggestedUser;
      })
      .filter((candidate) => candidate.matchedInterests?.length || candidate.score >= 24)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

      this.cacheSuggestions(cacheKey, scored, this.PEOPLE_LIKE_YOU_CACHE_DURATION);
      return scored;
    } catch (error) {
      console.error('Error getting people like you suggestions:', error);
      return this.getSuggestionsForUser(userId, limit, 0);
    }
  }

  /**
   * Cache suggestions for faster subsequent loads
   */
  private cacheSuggestions(userId: string, suggestions: SuggestedUser[], ttl: number = this.CACHE_DURATION): void {
    this.suggestionCache.set(userId, {
      suggestions,
      timestamp: Date.now(),
      ttl,
    });
    
    console.log('💾 Cached', suggestions.length, 'suggestions for user:', userId);
  }

  /**
   * Get cached suggestions if still valid
   */
  private getCachedSuggestions(userId: string): SuggestedUser[] | null {
    const cached = this.suggestionCache.get(userId);
    
    if (!cached) return null;
    
    // Check if cache expired
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      this.suggestionCache.delete(userId);
      return null;
    }
    
    return cached.suggestions;
  }

  /**
   * Get suggested users (alias for getSuggestionsForUser)
   */
  async getSuggestedUsers(
    userId: string,
    limit: number = 7,
    offset: number = 0
  ): Promise<SuggestedUser[]> {
    return this.getSuggestionsForUser(userId, limit, offset);
  }

  /**
   * Get user suggestions (alias for getSuggestionsForUser)
   */
  async getUserSuggestions(
    userId: string,
    limit: number = 7,
    offset: number = 0
  ): Promise<SuggestedUser[]> {
    return this.getSuggestionsForUser(userId, limit, offset);
  }

  /**
   * Clear cache for a user (call after following someone)
   */
  clearCache(userId: string): void {
    Array.from(this.suggestionCache.keys()).forEach((key) => {
      if (key === userId || key.startsWith(`${userId}:`)) {
        this.suggestionCache.delete(key);
      }
    });
    console.log('🗑️ Cleared suggestion cache for user:', userId);
  }
}

export const suggestionService = new SuggestionService();






