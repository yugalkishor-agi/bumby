import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, RefreshControl, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { messageService } from '../services/message.service';
import { OtherUserProfileHeader } from '../components/profile/OtherUserProfileHeader';
import { OwnProfileHeader } from '../components/profile/OwnProfileHeader';
import { ProfileHighlightRing } from '../components/profile/ProfileHighlightRing';
import { LoadingSkeleton, GridSkeleton } from '../components/ui/LoadingSkeleton';
import { colors, spacing, typography, borderRadius } from '../styles/theme';

import { useProfileData } from '../hooks/profile/useProfileData';
import { useProfileRelationships } from '../hooks/profile/useProfileRelationships';
import { useProfileGrid } from '../hooks/profile/useProfileGrid';
import { useProfileActions } from '../hooks/profile/useProfileActions';

import { ProfileGrid } from '../components/profile/ProfileGrid';
import { ProfileTabs } from '../components/profile/ProfileTabs';
import { PrivateProfilePlaceholder } from '../components/profile/PrivateProfilePlaceholder';
import { AboutAccountModal } from '../components/profile/AboutAccountModal';
import { TilePreviewModal } from '../components/profile/TilePreviewModal';

export default function ProfileScreenEnhanced({ navigation, route }: any) {
  const { user: currentUser } = useAuth();
  const routeParams = route?.params || {};
  const routeUserId = routeParams.userId || routeParams.uid || routeParams.id || routeParams.targetUserId || routeParams.otherUserId || routeParams.user?.userId || routeParams.user?.uid || routeParams.initialUser?.userId || null;
  const routeUsername = routeParams.username || routeParams.user?.username || routeParams.initialUser?.username || routeParams.handle || null;
  const initialRouteUser = routeParams.initialUser || routeParams.user || null;

  const {
    displayUserId,
    isOwnProfile,
    profileUser,
    loading,
    refreshing,
    userPosts,
    userGlimpses,
    taggedPosts,
    highlights,
    mutualFollowers,
    followersCount,
    setFollowersCount,
    followingCount,
    isFollowing,
    setIsFollowing,
    profilePrivacy,
    hasPendingFollowRequest,
    setHasPendingFollowRequest,
    isBlockedView,
    isPrivateRestricted,
    setIsPrivateRestricted,
    fadeAnim,
    loadProfileRef,
    onRefresh
  } = useProfileData(currentUser, routeUserId, routeUsername, initialRouteUser);

  const {
    actionLoading,
    privateSuggestions,
    loadingPrivateSuggestions,
    suggestionActionLoading,
    hidePrivateSuggestions,
    setHidePrivateSuggestions,
    handleFollow,
    handleSuggestedFollow,
    dismissPrivateSuggestion
  } = useProfileRelationships(
    currentUser,
    displayUserId,
    isOwnProfile,
    isPrivateRestricted,
    profileUser,
    isFollowing,
    setIsFollowing,
    followersCount,
    setFollowersCount,
    hasPendingFollowRequest,
    setHasPendingFollowRequest,
    profilePrivacy,
    setIsPrivateRestricted
  );

  const {
    activeTab,
    setActiveTab,
    currentData,
    tilePreview,
    clearTilePreview,
    handleTileLongPress,
    openTileViewer,
    formatCompactCount
  } = useProfileGrid(
    userPosts,
    userGlimpses,
    taggedPosts,
    profileUser,
    displayUserId,
    navigation
  );

  const {
    uploadingAvatar,
    handleShareProfile,
    handleAvatarUpload,
    showAboutAccountModal,
    openAboutAccount,
    closeAboutAccount
  } = useProfileActions(
    currentUser,
    profileUser,
    (force?: boolean) => loadProfileRef.current(force)
  );

  const isProfileVerified = !!(profileUser?.verified || profileUser?.isVerified);
  const showHighlights = highlights.length > 0 || isOwnProfile;
  const privatePostsCount = Number(profileUser?.stats?.postsCount || 0);
  const privateAccountEnabled =
    typeof profilePrivacy?.isPrivate === 'boolean'
      ? !!profilePrivacy.isPrivate
      : !!profileUser?.isPrivate;
  const followCtaLabel = hasPendingFollowRequest ? 'Requested' : isFollowing ? 'Following' : privateAccountEnabled ? 'Request' : 'Follow';
  const canOpenMessageFromProfile = !isBlockedView && !isPrivateRestricted && (profilePrivacy?.whoCanMessage !== 'followers' || isFollowing);
  const showProfileContent = !isBlockedView && !isPrivateRestricted;
  
  const isBlockingProfileLoad = loading && (!profileUser || profileUser.userId !== displayUserId);

  const openHighlight = (highlight: any) => {
    const stories = Array.isArray(highlight?.stories) ? highlight.stories : [];
    const firstStoryId = stories?.[0]?.storyId;
    if (firstStoryId) {
      (navigation as any).navigate('StoryViewerEnhanced', {
        storyId: firstStoryId,
        userId: displayUserId,
        highlightId: highlight?.highlightId,
      });
      return;
    }
    (navigation as any).navigate('Highlights', {
      userId: displayUserId,
    });
  };

  if (isBlockingProfileLoad) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: spacing.lg }}>
            <LoadingSkeleton width={28} height={28} borderRadius={14} />
            <LoadingSkeleton width={120} height={24} borderRadius={12} />
            <LoadingSkeleton width={28} height={28} borderRadius={14} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl }}>
            <LoadingSkeleton width={96} height={96} borderRadius={48} />
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <LoadingSkeleton width="48%" height={18} borderRadius={999} />
              <LoadingSkeleton width="72%" height={14} borderRadius={999} style={{ marginTop: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginTop: 18 }}>
                <LoadingSkeleton width={56} height={40} borderRadius={16} />
                <LoadingSkeleton width={56} height={40} borderRadius={16} />
                <LoadingSkeleton width={56} height={40} borderRadius={16} />
              </View>
            </View>
          </View>
          <LoadingSkeleton width="100%" height={44} borderRadius={16} />
          <LoadingSkeleton width="70%" height={14} borderRadius={999} style={{ marginTop: 18 }} />
          <LoadingSkeleton width="42%" height={14} borderRadius={999} style={{ marginTop: 10, marginBottom: 18 }} />
          <GridSkeleton rows={2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSideButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.75} onPress={openAboutAccount} style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {profileUser.username}
          </Text>
        </TouchableOpacity>
        {isOwnProfile ? (
          <TouchableOpacity
            style={styles.headerSideButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSideButton} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.pageScrollContent as any}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!isOwnProfile && !isBlockedView && !isPrivateRestricted ? (
          <OtherUserProfileHeader
            profileUser={profileUser}
            followersCount={followersCount}
            followingCount={followingCount}
            userPosts={userPosts}
            userGlimpses={userGlimpses}
            isFollowing={isFollowing}
            followLabel={followCtaLabel}
            disableMessage={!canOpenMessageFromProfile}
            showOnlineIndicator={(typeof profilePrivacy?.showActivityStatus === 'boolean' || typeof profilePrivacy?.hideOnlineStatus === 'boolean') ? (profilePrivacy?.showActivityStatus !== false && profilePrivacy?.hideOnlineStatus !== true) : profileUser?.settings?.showOnlineStatus !== false}
            actionLoading={actionLoading}
            mutualFollowers={mutualFollowers}
            onFollow={handleFollow}
            onMessage={() => {
              const conversationId = currentUser ? messageService.getDirectConversationId(currentUser.userId, displayUserId) : undefined;
              navigation.navigate('Chat', { userId: displayUserId, ...(conversationId ? { conversationId } : {}) });
            }}
            onShare={handleShareProfile}
            navigation={navigation}
            displayUserId={displayUserId}
            onOpenAboutAccount={openAboutAccount}
          />
        ) : isOwnProfile ? (
          <OwnProfileHeader
            profileUser={profileUser}
            followersCount={followersCount}
            followingCount={followingCount}
            userPosts={userPosts}
            userGlimpses={userGlimpses}
            uploadingAvatar={uploadingAvatar}
            onAvatarUpload={handleAvatarUpload}
            navigation={navigation}
            displayUserId={displayUserId}
            onShare={handleShareProfile}
            onOpenAboutAccount={openAboutAccount}
          />
        ) : null}

        {!isOwnProfile && isBlockedView ? (
          <View style={styles.privacyGateCard}>
            <View style={styles.privacyGateIconWrap}>
              <Ionicons name="ban-outline" size={30} color={colors.text.primary} />
            </View>
            <Text style={styles.privacyGateTitle}>Profile unavailable</Text>
            <Text style={styles.privacyGateText}>
              This profile is unavailable because you blocked this account.
            </Text>
          </View>
        ) : null}

        {!isOwnProfile && isPrivateRestricted ? (
          <PrivateProfilePlaceholder
            profileUser={profileUser}
            followersCount={followersCount}
            followingCount={followingCount}
            isFollowing={isFollowing}
            hasPendingFollowRequest={hasPendingFollowRequest}
            mutualFollowers={mutualFollowers}
            isProfileVerified={isProfileVerified}
            followCtaLabel={followCtaLabel}
            actionLoading={actionLoading}
            handleFollow={handleFollow}
            privateSuggestions={privateSuggestions}
            loadingPrivateSuggestions={loadingPrivateSuggestions}
            suggestionActionLoading={suggestionActionLoading}
            hidePrivateSuggestions={hidePrivateSuggestions}
            setHidePrivateSuggestions={setHidePrivateSuggestions}
            dismissPrivateSuggestion={dismissPrivateSuggestion}
            handleSuggestedFollow={handleSuggestedFollow}
            navigation={navigation}
            privatePostsCount={privatePostsCount}
          />
        ) : null}

        {showProfileContent && (
          <Animated.View style={{ opacity: fadeAnim }}>
            {showHighlights && (
              <View style={styles.highlightsSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsList as any}>
                  {highlights.map((highlight) => (
                    <TouchableOpacity
                      key={highlight.highlightId}
                      style={styles.highlightItem}
                      onPress={() => openHighlight(highlight)}
                    >
                      <ProfileHighlightRing image={highlight.coverImageURL} fallbackText={highlight.title || 'H'} />
                      <Text style={styles.highlightName} numberOfLines={1}>{highlight.title}</Text>
                    </TouchableOpacity>
                  ))}
                  {isOwnProfile && (
                    <TouchableOpacity
                      style={styles.highlightItem}
                      onPress={() => (navigation as any).navigate('Highlights', { userId: displayUserId })}
                    >
                      <ProfileHighlightRing variant="add" />
                      <Text style={styles.highlightName}>New</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>
            )}

            <ProfileTabs activeTab={activeTab} setActiveTab={setActiveTab} />
            <ProfileGrid
              currentData={currentData}
              activeTab={activeTab}
              isOwnProfile={isOwnProfile}
              profileUser={profileUser}
              openTileViewer={openTileViewer}
              handleTileLongPress={handleTileLongPress}
              clearTilePreview={clearTilePreview}
              formatCompactCount={formatCompactCount}
            />
          </Animated.View>
        )}
      </ScrollView>

      <TilePreviewModal
        tilePreview={tilePreview}
        clearTilePreview={clearTilePreview}
        profileUser={profileUser}
      />
      <AboutAccountModal
        visible={showAboutAccountModal}
        onClose={closeAboutAccount}
        profileUser={profileUser}
        isProfileVerified={isProfileVerified}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerSideButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.text.primary,
  },
  pageScrollContent: {
    paddingBottom: 100,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
  },
  privacyGateCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    alignItems: 'center',
  },
  privacyGateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  privacyGateTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.primary,
    marginBottom: 8,
  },
  privacyGateText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  highlightsSection: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  highlightsList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  highlightItem: {
    alignItems: 'center',
    width: 72,
  },
  highlightName: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.primary,
    textAlign: 'center',
  },
});
