import { useState, useEffect, useCallback } from 'react';
import { userService } from '../../services/user.service';
import { suggestionService } from '../../services/suggestion.service';

export function useProfileRelationships(
  currentUser: any,
  displayUserId: string,
  isOwnProfile: boolean,
  isPrivateRestricted: boolean,
  profileUser: any,
  isFollowing: boolean,
  setIsFollowing: (val: boolean) => void,
  followersCount: number,
  setFollowersCount: (val: number | ((prev: number) => number)) => void,
  hasPendingFollowRequest: boolean,
  setHasPendingFollowRequest: (val: boolean) => void,
  profilePrivacy: any,
  setIsPrivateRestricted: (val: boolean) => void
) {
  const [actionLoading, setActionLoading] = useState(false);
  const [privateSuggestions, setPrivateSuggestions] = useState<any[]>([]);
  const [loadingPrivateSuggestions, setLoadingPrivateSuggestions] = useState(false);
  const [suggestionActionLoading, setSuggestionActionLoading] = useState<Record<string, boolean>>({});
  const [hidePrivateSuggestions, setHidePrivateSuggestions] = useState(false);

  useEffect(() => {
    let active = true;
    if (!currentUser?.userId || isOwnProfile || !isPrivateRestricted) {
      setPrivateSuggestions([]);
      setLoadingPrivateSuggestions(false);
      return () => { active = false; };
    }

    setLoadingPrivateSuggestions(true);
    suggestionService
      .getSuggestionsForUser(currentUser.userId, 6)
      .then((items) => {
        if (!active) return;
        const suggestions = (items || []).filter((entry: any) => entry?.userId && entry.userId !== displayUserId);
        setPrivateSuggestions(suggestions.slice(0, 6));
      })
      .catch(() => { if (active) setPrivateSuggestions([]); })
      .finally(() => { if (active) setLoadingPrivateSuggestions(false); });

    return () => { active = false; };
  }, [currentUser?.userId, displayUserId, isOwnProfile, isPrivateRestricted]);

  const handleFollow = async () => {
    if (!currentUser || !profileUser || actionLoading) return;

    const previous = {
      isFollowing,
      followersCount,
      hasPendingFollowRequest,
      isPrivateRestricted,
    };

    try {
      setActionLoading(true);

      if (isFollowing) {
        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, typeof prev === 'number' ? prev - 1 : prev));
        setHasPendingFollowRequest(false);
        setIsPrivateRestricted(
          typeof profilePrivacy?.isPrivate === 'boolean'
            ? !!profilePrivacy.isPrivate
            : !!profileUser?.isPrivate
        );
        await userService.unfollowUser(currentUser.userId, profileUser.userId);
        return;
      }

      if (
        typeof profilePrivacy?.isPrivate === 'boolean'
          ? !!profilePrivacy.isPrivate
          : !!profileUser?.isPrivate
      ) {
        if (hasPendingFollowRequest) {
          setHasPendingFollowRequest(false);
          await userService.cancelFollowRequest(currentUser.userId, profileUser.userId);
        } else {
          setHasPendingFollowRequest(true);
          await userService.sendFollowRequest(currentUser.userId, profileUser.userId);
        }
        return;
      }

      setIsFollowing(true);
      setFollowersCount((prev) => (typeof prev === 'number' ? prev + 1 : prev));
      setHasPendingFollowRequest(false);
      setIsPrivateRestricted(false);
      await userService.followUser(currentUser.userId, profileUser.userId);
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
      setIsFollowing(previous.isFollowing);
      setFollowersCount(previous.followersCount);
      setHasPendingFollowRequest(previous.hasPendingFollowRequest);
      setIsPrivateRestricted(previous.isPrivateRestricted);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuggestedFollow = useCallback(async (targetUser: any) => {
    if (!currentUser?.userId || !targetUser?.userId) return;

    let shouldProceed = true;
    setSuggestionActionLoading((prev) => {
      if (prev[targetUser.userId]) {
        shouldProceed = false;
        return prev;
      }
      shouldProceed = true;
      return { ...prev, [targetUser.userId]: true };
    });
    if (!shouldProceed) return;

    try {
      if (targetUser?.isPrivate) {
        await userService.sendFollowRequest(currentUser.userId, targetUser.userId);
      } else {
        await userService.followUser(currentUser.userId, targetUser.userId);
      }
      setPrivateSuggestions((prev) => prev.filter((entry) => entry.userId !== targetUser.userId));
    } catch (error) {
      console.error('Failed to follow suggested user:', error);
    } finally {
      setSuggestionActionLoading((prev) => ({ ...prev, [targetUser.userId]: false }));
    }
  }, [currentUser?.userId]);

  const dismissPrivateSuggestion = useCallback((userId: string) => {
    setPrivateSuggestions((current) => current.filter((item) => item.userId !== userId));
  }, []);

  return {
    actionLoading,
    privateSuggestions,
    loadingPrivateSuggestions,
    suggestionActionLoading,
    hidePrivateSuggestions,
    setHidePrivateSuggestions,
    handleFollow,
    handleSuggestedFollow,
    dismissPrivateSuggestion
  };
}
