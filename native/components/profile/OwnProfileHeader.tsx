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
import { ProfileBannerEditor } from './ProfileBannerEditor';
import { ProfileBio, getProfilePostCount } from './ProfileBio';
import { ProfileWebsiteLink } from './ProfileWebsiteLink';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';

interface OwnProfileHeaderProps {
  profileUser: any;
  followersCount: number;
  followingCount: number;
  userPosts: any[];
  userGlimpses: any[];
  uploadingAvatar: boolean;
  onAvatarUpload: () => void;
  navigation: any;
  displayUserId: string;
  onShare: () => void;
  onOpenAboutAccount?: () => void;
}

export function OwnProfileHeader({
  profileUser,
  followersCount,
  followingCount,
  userPosts,
  userGlimpses,
  uploadingAvatar,
  onAvatarUpload,
  navigation,
  displayUserId,
  onShare,
  onOpenAboutAccount,
}: OwnProfileHeaderProps) {
  const totalPosts = getProfilePostCount(profileUser, userPosts.length, userGlimpses.length);
  const isVerified = !!(profileUser?.verified || profileUser?.isVerified);

  // If profileUser is not available, show loading
  if (!profileUser) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Banner Section with Editor */}
      <ProfileBannerEditor
        profileUser={profileUser}
        isOwnProfile={true}
        onBannerUpdate={() => {
          // Banner update is handled inside ProfileBannerEditor.
        }}
      >
        {/* Clean Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalPosts}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{followersCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>
      </ProfileBannerEditor>

      {/* Profile Avatar Section */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          onPress={onAvatarUpload}
          style={styles.avatarContainer}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4facfe', '#00f2fe']}
            style={styles.avatarGradientRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.avatarInnerRing}>
              {uploadingAvatar ? (
                <View style={styles.avatarPlaceholder}>
                  <ActivityIndicator size="large" color={colors.accent.primary} />
                </View>
              ) : (
                <Avatar
                  source={profileUser?.avatarURL}
                  size={110}
                  style={styles.profileAvatar}
                />
              )}
            </View>
          </LinearGradient>
          
          {/* Edit Indicator */}
          <View style={styles.editIndicator}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
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
        
        <ProfileWebsiteLink website={profileUser.website} />
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={styles.editProfileButton}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={onShare}
          activeOpacity={0.8}
        >
          <Ionicons name="share-social" size={18} color={colors.accent.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.suggestionsButton}
          onPress={() => navigation.navigate('Suggestions')}
          activeOpacity={0.8}
        >
          <Ionicons name="people" size={18} color={colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Quick Stats Bar */}
      <View style={styles.quickStatsBar}>
        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('FollowersList', { userId: displayUserId })}
        >
          <View style={styles.quickStatIcon}>
            <Ionicons name="people" size={18} color={colors.accent.primary} />
          </View>
          <Text style={styles.quickStatText}>Followers</Text>
        </TouchableOpacity>

        <View style={styles.statDivider} />

        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('Following', { userId: displayUserId })}
        >
          <View style={styles.quickStatIcon}>
            <Ionicons name="person-add" size={18} color={colors.accent.primary} />
          </View>
          <Text style={styles.quickStatText}>Following</Text>
        </TouchableOpacity>

        <View style={styles.statDivider} />

        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('SavedPosts')}
        >
          <View style={styles.quickStatIcon}>
            <Ionicons name="bookmark" size={18} color={colors.accent.primary} />
          </View>
          <Text style={styles.quickStatText}>Saved</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.primary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    minWidth: 70,
  },
  statNumber: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: '#fff',
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -55,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarGradientRing: {
    width: 122,
    height: 122,
    borderRadius: 61,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInnerRing: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
  },
  profileAvatar: {
    borderWidth: 0,
  },
  editIndicator: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background.primary,
  },
  profileInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  nameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  displayName: {
    fontSize: typography.fontSize.xxl,
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
  actionSection: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  editProfileButton: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  editButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: '#fff',
  },
  shareButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  suggestionsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  highlightsSection: {
    marginBottom: spacing.lg,
  },
  highlightsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  highlightsList: {
    paddingHorizontal: spacing.lg,
  },
  highlightItem: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 80,
  },
  highlightRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  highlightImageContainer: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightImage: {
    borderWidth: 0,
  },
  highlightName: {
    fontSize: typography.fontSize.xs,
    color: colors.text.primary,
    textAlign: 'center',
  },
  addHighlightItem: {
    alignItems: 'center',
    width: 80,
  },
  addHighlightCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background.secondary,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addHighlightText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  quickStatsBar: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  quickStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStatText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium as any,
    color: colors.text.primary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border.subtle,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
});













