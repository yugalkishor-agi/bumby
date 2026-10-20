import { useCallback } from 'react';
import { storyService } from '../../../services/story.service';
import { useStoryViewerStore } from '../useStoryViewerStore';

export function useStoryViewerNavigation(
  currentUser: any,
  currentStoryData: any,
  userId: string,
  navigation: any,
  audioSoundRef: React.MutableRefObject<any>
) {
  const stories = useStoryViewerStore(s => s.stories);
  const currentStory = useStoryViewerStore(s => s.currentStory);
  const setCurrentStory = useStoryViewerStore(s => s.setCurrentStory);

  const resolveStoryDateMs = useCallback((value: any) => {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') {
      try { return value.toDate().getTime(); } catch { return 0; }
    }
    if (typeof value?.seconds === 'number') {
      return value.seconds * 1000;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const resolveAuthorSequence = useCallback(async (currentAuthorId?: string) => {
    const safeCurrentAuthorId = currentAuthorId || currentStoryData?.authorId || userId;
    const latestByAuthor: Record<string, number> = {};

    try {
      if (currentUser?.userId) {
        const followingStories = await storyService.getFollowingStories(currentUser.userId);
        for (const story of followingStories || []) {
          const authorId = story?.authorId;
          if (!authorId) continue;
          const createdMs = resolveStoryDateMs(story?.createdAt);
          latestByAuthor[authorId] = Math.max(latestByAuthor[authorId] || 0, createdMs);
        }
      }
    } catch {}

    if (safeCurrentAuthorId && !latestByAuthor[safeCurrentAuthorId]) {
      latestByAuthor[safeCurrentAuthorId] = resolveStoryDateMs(currentStoryData?.createdAt) || Date.now();
    }

    const ordered = Object.entries(latestByAuthor)
      .sort((a, b) => b[1] - a[1])
      .map(([authorId]) => authorId);

    if (safeCurrentAuthorId && !ordered.includes(safeCurrentAuthorId)) {
      ordered.unshift(safeCurrentAuthorId);
    }

    return ordered;
  }, [currentStoryData?.authorId, currentStoryData?.createdAt, currentUser?.userId, resolveStoryDateMs, userId]);

  const navigateToAdjacentAuthor = useCallback(async (direction: 'next' | 'prev') => {
    const currentAuthorId = currentStoryData?.authorId || userId;
    if (!currentAuthorId) {
      navigation.goBack();
      return;
    }

    const sequence = await resolveAuthorSequence(currentAuthorId);
    if (!sequence.length) {
      navigation.goBack();
      return;
    }

    const currentIdx = Math.max(0, sequence.indexOf(currentAuthorId));
    const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    const targetUserId = sequence[targetIdx];

    if (!targetUserId || targetUserId === currentAuthorId) {
      navigation.goBack();
      return;
    }

    (navigation as any).replace('StoryViewerEnhanced', {
      userId: targetUserId,
      storyIndex: 0,
      startFromEnd: direction === 'prev',
    });
  }, [currentStoryData?.authorId, navigation, resolveAuthorSequence, userId]);

  const handleNext = async () => {
    try { (async () => { try { await audioSoundRef.current?.stopAsync(); } catch { } })(); } catch { }
    if (currentStory < stories.length - 1) {
      setCurrentStory(currentStory + 1);
      return;
    }
    await navigateToAdjacentAuthor('next');
  };

  const handlePrevious = async () => {
    try { (async () => { try { await audioSoundRef.current?.stopAsync(); } catch { } })(); } catch { }
    if (currentStory > 0) {
      setCurrentStory(currentStory - 1);
      return;
    }
    await navigateToAdjacentAuthor('prev');
  };

  return {
    handleNext,
    handlePrevious
  };
}
