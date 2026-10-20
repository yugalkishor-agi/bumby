import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { storyService } from '../../../services/story.service';
import { useStoryViewerStore } from '../useStoryViewerStore';

export function useStoryViewerWidgets(
  currentUser: any,
  currentStoryData: any,
  isOwnStory: boolean,
  canReply: boolean,
  interactingRef: React.MutableRefObject<boolean>
) {
  const currentStory = useStoryViewerStore(s => s.currentStory);
  const widgetsOverlays = useStoryViewerStore(s => s.widgetsOverlays);
  const setWidgetsOverlays = useStoryViewerStore(s => s.setWidgetsOverlays);
  const setPollResults = useStoryViewerStore(s => s.setPollResults);
  const setSliderStats = useStoryViewerStore(s => s.setSliderStats);
  const setQuestionCounts = useStoryViewerStore(s => s.setQuestionCounts);
  const setQuizResults = useStoryViewerStore(s => s.setQuizResults);
  const myPollVote = useStoryViewerStore(s => s.myPollVote);
  const setMyPollVote = useStoryViewerStore(s => s.setMyPollVote);
  const mySliderValue = useStoryViewerStore(s => s.mySliderValue);
  const setMySliderValue = useStoryViewerStore(s => s.setMySliderValue);
  const myQuizAnswer = useStoryViewerStore(s => s.myQuizAnswer);
  const setMyQuizAnswer = useStoryViewerStore(s => s.setMyQuizAnswer);
  const setQuestionModal = useStoryViewerStore(s => s.setQuestionModal);
  const setIsPaused = useStoryViewerStore(s => s.setIsPaused);
  const setQuestionReplies = useStoryViewerStore(s => s.setQuestionReplies);
  const setQuestionRepliesModal = useStoryViewerStore(s => s.setQuestionRepliesModal);
  const activeQuestion = useStoryViewerStore(s => s.activeQuestion);
  const setActiveQuestion = useStoryViewerStore(s => s.setActiveQuestion);
  const questionModal = useStoryViewerStore(s => s.questionModal);

  const widgetsUnsubRef = useRef<(() => void) | null>(null);

  // Load interactive stats
  useEffect(() => {
    const loadInteractive = async () => {
      if (!currentStoryData) return;
      try {
        const nextPoll: Record<string, { counts: number[]; total: number }> = {};
        const nextSlider: Record<string, { avg: number; count: number }> = {};
        const nextQCounts: Record<string, number> = {};
        const nextQuiz: Record<string, { counts: number[]; total: number }> = {};
        const storyIdKey = currentStoryData.storyId;
        const preferOverlay = (currentStoryData as any)?.hasWidgets && Array.isArray(widgetsOverlays[storyIdKey]);
        const stickers = preferOverlay ? (widgetsOverlays[storyIdKey] || []) : (Array.isArray(currentStoryData.stickers) ? currentStoryData.stickers : []);
        for (const st of stickers) {
          if (st.type === 'poll') {
            const optionCount = Number(st?.content?.options?.length ?? st?.options?.length ?? 2);
            const res = await storyService.getPollResultsForOptions(currentStoryData.storyId, st.id, Math.max(1, Math.min(6, optionCount)));
            nextPoll[st.id] = res;
          } else if (st.type === 'slider') {
            const stats = await storyService.getSliderStatsFast(currentStoryData.storyId, st.id);
            nextSlider[st.id] = stats;
          } else if (st.type === 'question') {
            const c = await storyService.getQuestionReplyCount(currentStoryData.storyId, st.id);
            nextQCounts[st.id] = c;
          } else if (st.type === 'quiz') {
            const optionCount = Number(st?.content?.options?.length ?? 0);
            if (optionCount > 0) {
              const qres = await storyService.getQuizResultsForOptions(currentStoryData.storyId, st.id, Math.min(optionCount, 6));
              nextQuiz[st.id] = qres;
            }
          }
        }
        setPollResults(nextPoll);
        setSliderStats(nextSlider);
        setQuestionCounts(nextQCounts);
        setQuizResults(nextQuiz);
      } catch { }
    };
    loadInteractive();
  }, [currentStory, currentStoryData, widgetsOverlays, setPollResults, setSliderStats, setQuestionCounts, setQuizResults]);

  // Subscribe to widgets
  useEffect(() => {
    const storyIdKey = currentStoryData?.storyId;
    const useSub = !!((currentStoryData as any)?.hasWidgets && storyIdKey);
    if (widgetsUnsubRef.current) {
      try { widgetsUnsubRef.current(); } catch { }
      widgetsUnsubRef.current = null;
    }
    if (!useSub) return;
    const mapWidgetToSticker = (w: any) => {
      const t = w?.transform || {};
      return {
        id: w.widgetId || w.id,
        type: w.type,
        content: w.content,
        style: w.style,
        x: typeof t.x === 'number' ? t.x : 0.5,
        y: typeof t.y === 'number' ? t.y : 0.5,
        size: (typeof t.w === 'number' || typeof t.h === 'number') ? { w: t.w, h: t.h } : undefined,
        scale: typeof t.scale === 'number' ? t.scale : 1,
        rotation: typeof t.rotation === 'number' ? t.rotation : 0,
        z_index: typeof t.z === 'number' ? t.z : undefined,
        transform: t,
      };
    };
    widgetsUnsubRef.current = storyService.subscribeWidgets(storyIdKey!, (list: any[]) => {
      try {
        const mapped = Array.isArray(list) ? list.map(mapWidgetToSticker) : [];
        setWidgetsOverlays((prev) => ({ ...prev, [storyIdKey!]: mapped }));
      } catch {
        setWidgetsOverlays((prev) => ({ ...prev, [storyIdKey!]: [] }));
      }
    });
    return () => {
      if (widgetsUnsubRef.current) {
        try { widgetsUnsubRef.current(); } catch { }
        widgetsUnsubRef.current = null;
      }
    };
  }, [currentStoryData?.storyId, (currentStoryData as any)?.hasWidgets, setWidgetsOverlays]);

  const handlePollVote = async (stickerId: string, optionIndex: number) => {
    interactingRef.current = true;
    if (!currentUser || !currentStoryData) { interactingRef.current = false; return; }
    if (isOwnStory) { interactingRef.current = false; return; }
    try {
      await storyService.submitPollVote(currentStoryData.storyId, stickerId, currentUser.userId, optionIndex);
      setMyPollVote((prev) => ({ ...prev, [stickerId]: optionIndex }));
      try {
        const stickers = Array.isArray(currentStoryData.stickers) ? currentStoryData.stickers : [];
        const st = stickers.find((s: any) => s.id === stickerId);
        const optionCount = Number(st?.content?.options?.length ?? st?.options?.length ?? 2);
        const res = await storyService.getPollResultsForOptions(currentStoryData.storyId, stickerId, Math.max(1, Math.min(6, optionCount)));
        setPollResults((prev) => ({ ...prev, [stickerId]: res }));
      } catch { }
      try {
        if (Platform.OS !== 'web') {
          const Haptics = await import('expo-haptics');
          await Haptics.selectionAsync?.();
        }
      } catch { }
    } catch { }
    setTimeout(() => { interactingRef.current = false; }, 250);
  };

  const handleSliderSet = async (stickerId: string, value: number) => {
    interactingRef.current = true;
    if (!currentUser || !currentStoryData) { interactingRef.current = false; return; }
    if (isOwnStory) { interactingRef.current = false; return; }
    try {
      await storyService.submitSliderValue(currentStoryData.storyId, stickerId, currentUser.userId, value);
      setMySliderValue((prev) => ({ ...prev, [stickerId]: value }));
      try {
        const stats = await storyService.getSliderStatsFast(currentStoryData.storyId, stickerId);
        setSliderStats((prev) => ({ ...prev, [stickerId]: stats }));
      } catch { }
    } catch { }
    setTimeout(() => { interactingRef.current = false; }, 250);
  };

  const handleQuizAnswer = async (stickerId: string, optionIndex: number) => {
    interactingRef.current = true;
    if (!currentUser || !currentStoryData) { interactingRef.current = false; return; }
    try {
      if (myQuizAnswer[stickerId] != null) return;
      if (isOwnStory) return;
      await storyService.submitQuizAnswer(currentStoryData.storyId, stickerId, currentUser.userId, optionIndex);
      setMyQuizAnswer((prev) => ({ ...prev, [stickerId]: optionIndex }));
      try {
        const stickers = Array.isArray(currentStoryData.stickers) ? currentStoryData.stickers : [];
        const st = stickers.find((s: any) => s.id === stickerId);
        const optionCount = Number(st?.content?.options?.length ?? 0);
        if (optionCount > 0) {
          const qres = await storyService.getQuizResultsForOptions(currentStoryData.storyId, stickerId, Math.min(6, optionCount));
          setQuizResults((prev) => ({ ...prev, [stickerId]: qres }));
        }
      } catch { }
    } catch { }
    setTimeout(() => { interactingRef.current = false; }, 250);
  };

  const openQuestionModal = (stickerId: string) => {
    if (isOwnStory || !canReply) return;
    setIsPaused(true);
    setQuestionModal({ visible: true, stickerId, text: '' });
  };

  const sendQuestionReply = async () => {
    if (isOwnStory || !canReply) {
      setQuestionModal({ visible: false, text: '' });
      setIsPaused(false);
      return;
    }
    if (!currentUser || !currentStoryData || !questionModal?.stickerId || !questionModal?.text?.trim()) {
      setQuestionModal({ visible: false, text: '' });
      return;
    }
    try {
      await storyService.submitQuestionReply(currentStoryData.storyId, questionModal.stickerId, currentUser.userId, questionModal.text.trim());
      setQuestionModal({ visible: false, text: '' });
      setIsPaused(false);
      Alert.alert('Sent', 'Your reply was sent');
      try {
        const c = await storyService.getQuestionReplyCount(currentStoryData.storyId, questionModal.stickerId);
        setQuestionCounts((prev) => ({ ...prev, [questionModal.stickerId!]: c }));
      } catch { }
    } catch {
      setQuestionModal({ visible: false, text: '' });
      setIsPaused(false);
    }
  };

  const openQuestionReplies = async (stickerId: string) => {
    if (!isOwnStory) return;
    if (!currentStoryData) return;
    try {
      const replies = await storyService.getQuestionReplies(currentStoryData.storyId, stickerId, 50);
      setQuestionReplies((prev) => ({ ...prev, [stickerId]: replies }));
      setQuestionRepliesModal({ visible: true, stickerId });
      setIsPaused(true);
    } catch { }
  };

  const sendInlineQuestionReply = async (stickerId: string) => {
    interactingRef.current = true;
    if (isOwnStory || !canReply) {
      setActiveQuestion({ stickerId: null, text: '' });
      setIsPaused(false);
      interactingRef.current = false;
      return;
    }
    if (!currentUser || !currentStoryData || !activeQuestion?.text?.trim()) {
      setActiveQuestion({ stickerId: null, text: '' });
      setIsPaused(false);
      return;
    }
    try {
      await storyService.submitQuestionReply(currentStoryData.storyId, stickerId, currentUser.userId, activeQuestion.text.trim());
      setActiveQuestion({ stickerId: null, text: '' });
      setIsPaused(false);
      Alert.alert('Sent', 'Your reply was sent');
      try {
        const c = await storyService.getQuestionReplyCount(currentStoryData.storyId, stickerId);
        setQuestionCounts((prev) => ({ ...prev, [stickerId]: c }));
      } catch { }
    } catch {
      setActiveQuestion({ stickerId: null, text: '' });
      setIsPaused(false);
    }
    setTimeout(() => { interactingRef.current = false; }, 250);
  };

  return {
    handlePollVote,
    handleSliderSet,
    handleQuizAnswer,
    openQuestionModal,
    sendQuestionReply,
    openQuestionReplies,
    sendInlineQuestionReply
  };
}
