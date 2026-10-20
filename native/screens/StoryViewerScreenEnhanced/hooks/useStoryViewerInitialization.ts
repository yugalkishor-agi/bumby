import { useEffect } from 'react';
import { Alert } from 'react-native';
import { storyService } from '../../../services/story.service';
import { userService } from '../../../services/user.service';
import { useStoryViewerStore } from '../useStoryViewerStore';

export function useStoryViewerInitialization(userId: string, storyId: string, storyIndex: number, startFromEnd: boolean, currentUser: any, navigation: any) {
  const setStories = useStoryViewerStore(s => s.setStories);
  const setCurrentStory = useStoryViewerStore(s => s.setCurrentStory);
  const setLoading = useStoryViewerStore(s => s.setLoading);
  const setStoryUser = useStoryViewerStore(s => s.setStoryUser);

  useEffect(() => {
    const filterVisibleStoriesForViewer = async (items: any[]) => {
      if (!currentUser) return items;
      const viewerId = currentUser.userId;
      const visible = await Promise.all(items.map(async (story) => {
        if (!story) return null;
        if (story.authorId === viewerId) return story;

        const hiddenFrom = Array.isArray(story.hiddenFrom) ? story.hiddenFrom : [];
        if (hiddenFrom.includes(viewerId)) return null;

        if (story.audience === 'closeFriends') {
          const inlineList = Array.isArray(story.closeFriends) ? story.closeFriends : [];
          if (inlineList.includes(viewerId)) return story;
          try {
            const closeFriends = await userService.getCloseFriends(story.authorId);
            if (!closeFriends.includes(viewerId)) return null;
          } catch {
            return null;
          }
        }
        return story;
      }));
      return visible.filter(Boolean);
    };

    const loadStories = async () => {
      try {
        setLoading(true);
        if (storyId) {
          const s = await storyService.getStory(storyId);
          const list = s ? [s as any] : [];
          const filtered = await filterVisibleStoriesForViewer(list);
          if (!filtered.length) {
            Alert.alert('Unavailable', 'This story is not available for you.');
            navigation.goBack();
            return;
          }
          setStories(filtered as any[]);
          setCurrentStory(0);
          if (s) {
            if ((s as any).authorUsername || (s as any).authorAvatarURL) {
              setStoryUser({ username: (s as any).authorUsername, avatarURL: (s as any).authorAvatarURL, verified: !!(s as any).authorVerified });
            } else if ((s as any).authorId) {
              const u = await userService.getUser((s as any).authorId);
              if (u) setStoryUser({ username: u.username, avatarURL: u.avatarURL, verified: !!(u as any).verified });
            }
          }
        } else {
          const userStories = await storyService.getUserActiveStories(userId);
          const filtered = await filterVisibleStoriesForViewer(userStories as any[]);
          if (!filtered.length) {
            Alert.alert('Unavailable', 'No visible stories found.');
            navigation.goBack();
            return;
          }
          setStories(filtered as any[]);
          const maxIndex = Math.max(0, filtered.length - 1);
          const requestedIndex = Number.isFinite(Number(storyIndex)) ? Number(storyIndex) : 0;
          const initialIndex = startFromEnd ? maxIndex : Math.min(Math.max(0, requestedIndex), maxIndex);
          setCurrentStory(initialIndex);
          if (filtered.length > 0) {
            const s: any = filtered[0];
            if (s?.authorUsername || s?.authorAvatarURL) {
              setStoryUser({ username: s.authorUsername, avatarURL: s.authorAvatarURL, verified: !!s.authorVerified });
            } else if (s?.authorId) {
              const u = await userService.getUser(s.authorId);
              if (u) setStoryUser({ username: u.username, avatarURL: u.avatarURL, verified: !!(u as any).verified });
            }
          }
        }
      } catch (error) {
        console.error('Failed to load stories:', error);
        Alert.alert('Error', 'Failed to load stories');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadStories();
  }, [userId, storyId, storyIndex, startFromEnd, currentUser?.userId, navigation, setCurrentStory, setLoading, setStories, setStoryUser]);
}
