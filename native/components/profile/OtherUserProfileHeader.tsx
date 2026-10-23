import { InlineLoadingSkeleton } from '../ui/LoadingSkeleton';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../ui/Avatar';
import { VerifiedBadge } from '../ui/VerifiedBadge';
import { ProfileBio, getProfilePostCount } from './ProfileBio';
import { ProfileWebsiteLink } from './ProfileWebsiteLink';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';

interface OtherUserProfileHeaderProps {
  profileUser: any;
  followersCount: number;
  followingCount: number;
  userPosts: any[];
  userGlimpses: any[];
  isFollowing: boolean;
  followLabel?: string;
  disableMessage?: boolean;
  showOnlineIndicator?: boolean;
  actionLoading: boolean;
  mutualFollowers: any[];
  onFollow: () => void;
  onMessage: () => void;
  onShare: () => void;
  navigation: any;
  displayUserId: string;
  onOpenAboutAccount?: () => void;
}

export function OtherUserProfileHeader({
  profileUser,
  followersCount,
  followingCount,
  userPosts,
  userGlimpses,
  isFollowing,
  followLabel,
  disableMessage = false,
  showOnlineIndicator = true,
  actionLoading,
  mutualFollowers,
  onFollow,
  onMessage,
  onShare,
  navigation,
  displayUserId,
  onOpenAboutAccount,
}: OtherUserProfileHeaderProps) {
  const totalPosts = getProfilePostCount(profileUser, userPosts.length, userGlimpses.length);
  const isVerified = !!(profileUser?.verified || profileUser?.isVerified);
  
  return (
    <View style={styles.container}>
      {/* Cover/Background Section */}
      <View style={styles.coverSection}>
        <LinearGradient
          colors={[
            isVerified ? '#667eea' : '#764ba2',
            isVerified ? '#764ba2' : '#667eea',
            '#f093fb'
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverGradient}
        >
          {/* Floating Stats Cards */}
          <View style={styles.floatingStats}>
            <View style={styles.statCard}>
              <Text style={styles.statCardNumber}>{totalPosts}</Text>
              <Text style={styles.statCardLabel}>Posts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statCardNumber}>{followersCount}</Text>
              <Text style={styles.statCardLabel}>Followers</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statCardNumber}>{followingCount}</Text>
              <Text style={styles.statCardLabel}>Following</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Profile Avatar - Overlapping */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={isFollowing ? ['#4facfe', '#00f2fe'] : ['#fa709a', '#fee140']}
            style={styles.avatarGradientRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.avatarInnerRing}>
              <Avatar
                source={profileUser.avatarURL}
                size={120}
                style={styles.profileAvatar}
              />
            </View>
          </LinearGradient>
          
          {/* Online Status Indicator */}
          {showOnlineIndicator && profileUser.isOnline && (
            <View style={styles.onlineIndicator}>
              <View style={styles.onlineDot} />
            </View>
          )}
        </View>
      </View>

      {/* Profile Info Section */}
      <View style={styles.profileInfo}>
        <View style={styles.nameSection}>
          <Text style={styles.displayName}>{profileUser.displayName}</Text>
        </View>

        <TouchableOpacity style={styles.usernameRow} activeOpacity={0.75} onPress={onOpenAboutAccount} disabled={!onOpenAboutAccount}>
          <Text style={styles.username}>@{profileUser.username}</Text>
          {isVerified ? (
            <VerifiedBadge size={20} style={styles.verifiedBadge} />
          ) : null}
        </TouchableOpacity>
        
        <ProfileBio bio={profileUser.bio} />
        
        <ProfileWebsiteLink website={profileUser.website} variant="plain" />

        {/* Mutual Followers with Enhanced Design */}
        {mutualFollowers.length > 0 && (
          <View style={styles.mutualFollowersSection}>
            <View style={styles.mutualAvatars}>
              {mutualFollowers.slice(0, 3).map((follower, index) => (
                <View 
                  key={follower.userId} 
                  style={[
                    styles.mutualAvatarContainer, 
                    { zIndex: 3 - index },
                    index === 0 && { marginLeft: 0 }
                  ]}
                >
                  <Avatar
                    source={follower.avatarURL}
                    size={32}
                    style={styles.mutualAvatar}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.mutualText}>
              Followed by {mutualFollowers[0].username}
              {mutualFollowers.length > 1 && ` and ${mutualFollowers.length - 1} other${mutualFollowers.length > 2 ? 's' : ''}`}
            </Text>
          </View>
        )}
      </View>

      {/* Action Buttons with Enhanced Design */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={onFollow}
          disabled={actionLoading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isFollowing ? ['#667eea', '#764ba2'] : ['#4facfe', '#00f2fe']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {actionLoading ? (
              <InlineLoadingSkeleton />
            ) : (
              <>
                <Ionicons 
                  name={isFollowing ? "checkmark" : "person-add"} 
                  size={18} 
                  color="#fff" 
                />
                <Text style={styles.followButtonText}>
                  {followLabel || (isFollowing ? 'Following' : 'Follow')}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.messageButton}
          onPress={onMessage}
          activeOpacity={0.8}
          disabled={disableMessage}
        >
          <Ionicons name="chatbubble" size={18} color={disableMessage ? colors.text.secondary : colors.accent.primary} />
          <Text style={[styles.messageButtonText, disableMessage && styles.messageButtonTextDisabled]}>Message</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={onShare}
          activeOpacity={0.8}
        >
          <Ionicons name="share-social" size={18} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Interactive Stats Bar */}
      <View style={styles.interactiveStats}>
        <TouchableOpacity
          style={styles.interactiveStatItem}
          onPress={() => navigation.navigate('FollowersList', { userId: displayUserId })}
        >
          <View style={styles.statIconContainer}>
            <Ionicons name="people" size={20} color={colors.accent.primary} />
          </View>
          <View>
            <Text style={styles.interactiveStatNumber}>{followersCount}</Text>
            <Text style={styles.interactiveStatLabel}>Followers</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.statDivider} />

        <TouchableOpacity
          style={styles.interactiveStatItem}
          onPress={() => navigation.navigate('Following', { userId: displayUserId })}
        >
          <View style={styles.statIconContainer}>
            <Ionicons name="person-add" size={20} color={colors.accent.primary} />
          </View>
          <View>
            <Text style={styles.interactiveStatNumber}>{followingCount}</Text>
            <Text style={styles.interactiveStatLabel}>Following</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.statDivider} />

        <View style={styles.interactiveStatItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="grid" size={20} color={colors.accent.primary} />
          </View>
          <View>
            <Text style={styles.interactiveStatNumber}>{totalPosts}</Text>
            <Text style={styles.interactiveStatLabel}>Posts</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.primary,
  },
  coverSection: {
    height: 208,
    width: '100%',
  },
  coverGradient: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  floatingStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  statCardNumber: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: '#fff',
  },
  statCardLabel: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarGradientRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInnerRing: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatar: {
    borderWidth: 0,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4ade80',
  },
  profileInfo: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  nameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  displayName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    marginBottom: spacing.sm,
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: spacing.xs,
  },
  username: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  mutualFollowersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  mutualAvatars: {
    flexDirection: 'row',
    marginRight: spacing.sm,
  },
  mutualAvatarContainer: {
    borderWidth: 2,
    borderColor: colors.background.primary,
    borderRadius: 16,
    marginLeft: -8,
  },
  mutualAvatar: {
    borderWidth: 0,
  },
  mutualText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
  },
  actionSection: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  followButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  followingButton: {
    // Styles handled by gradient
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  followButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: '#fff',
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  messageButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.accent.primary,
  },
  messageButtonTextDisabled: {
    color: colors.text.secondary,
  },
  shareButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
  },
  interactiveStats: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  interactiveStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  interactiveStatNumber: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  interactiveStatLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border.subtle,
  },
});










