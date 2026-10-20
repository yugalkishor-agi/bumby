import { useCallback, useRef, useState } from 'react';
import { Video } from 'expo-av';
import { clamp } from '../../utils/glimpse/glimpseEditorCalculations';

interface UseGlimpsePlaybackProps {
  mediaType: 'image' | 'video';
  videoRef: React.RefObject<Video>;
  durationMillis: number;
  setDurationMillis: (val: number) => void;
  trimStart: number;
  trimEnd: number;
  effectiveTrimEnd: number;
  setTrimEnd: (val: number) => void;
  currentPosition: number;
  setCurrentPosition: (val: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  muted: boolean;
  setMuted: (val: boolean) => void;
  internalVolume: number;
  setInternalVolume: (val: number) => void;
  isRecording: boolean;
  setVoiceInsertAt: (val: number) => void;
  updateTimelineWindow: () => void;
  setVideoLoaded: (val: boolean) => void;
  setVideoError: (val: string | null) => void;
}

export function useGlimpsePlayback({
  mediaType,
  videoRef,
  durationMillis,
  setDurationMillis,
  trimStart,
  trimEnd,
  effectiveTrimEnd,
  setTrimEnd,
  currentPosition,
  setCurrentPosition,
  isPlaying,
  setIsPlaying,
  muted,
  setMuted,
  internalVolume,
  setInternalVolume,
  isRecording,
  setVoiceInsertAt,
  updateTimelineWindow,
  setVideoLoaded,
  setVideoError,
}: UseGlimpsePlaybackProps) {
  const playbackIntentRef = useRef(mediaType === 'video');
  const playbackToggleBusyRef = useRef(false);

  const handlePlaybackStatusUpdate = useCallback(async (status: any) => {
    if (!status?.isLoaded) {
      if (status?.error) setVideoError(String(status.error));
      return;
    }
    setVideoLoaded(true);
    setVideoError(null);
    if (status.durationMillis && status.durationMillis !== durationMillis) {
      setDurationMillis(status.durationMillis);
      // Clamp to the real duration rather than overwriting it: hydration seeds
      // trimEnd from saved meta on open, and this callback fires afterwards.
      setTrimEnd(Math.min(trimEnd || status.durationMillis, status.durationMillis));
      updateTimelineWindow();
    }
    if (typeof status.positionMillis === 'number') {
      setCurrentPosition(status.positionMillis);
      if (!isRecording) {
        setVoiceInsertAt(clamp(status.positionMillis, trimStart, effectiveTrimEnd || status.positionMillis));
      }
    }
    if (status.isPlaying && typeof status.positionMillis === 'number' && effectiveTrimEnd > 0 && status.positionMillis >= effectiveTrimEnd - 70) {
      try { await videoRef.current?.playFromPositionAsync(trimStart); } catch {}
    }
  }, [durationMillis, effectiveTrimEnd, isRecording, setCurrentPosition, setDurationMillis, setTrimEnd, setVideoError, setVideoLoaded, setVoiceInsertAt, trimEnd, trimStart, updateTimelineWindow, videoRef]);

  const togglePlayback = useCallback(async () => {
    if (playbackToggleBusyRef.current) return;
    playbackToggleBusyRef.current = true;
    try {
      if (playbackIntentRef.current) {
        playbackIntentRef.current = false;
        await videoRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }
      playbackIntentRef.current = true;
      const target = Math.max(trimStart, Math.min(effectiveTrimEnd - 60, currentPosition || trimStart));
      await videoRef.current?.playFromPositionAsync(target);
      setIsPlaying(true);
    } catch {
      playbackIntentRef.current = false;
      setIsPlaying(false);
    } finally {
      setTimeout(() => {
        playbackToggleBusyRef.current = false;
      }, 120);
    }
  }, [currentPosition, effectiveTrimEnd, setIsPlaying, trimStart, videoRef]);

  const toggleMuted = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  const handleVolumeChange = useCallback((value: number) => {
    const nextValue = clamp(value, 0, 1);
    setInternalVolume(nextValue);
    if (nextValue <= 0.01) setMuted(true);
    else if (muted) setMuted(false);
  }, [muted, setInternalVolume, setMuted]);

  return {
    playbackIntentRef,
    handlePlaybackStatusUpdate,
    togglePlayback,
    toggleMuted,
    handleVolumeChange,
  };
}
