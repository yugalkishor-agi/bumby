// useGlimpseEditorState.ts
// Purpose: Consolidated state management for glimpse editor (replaces 44 useState hooks)
// Extracted from: NativeGlimpseEditor.tsx — Session 001

import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { Audio, Video } from 'expo-av';
import type { View, TextInput } from 'react-native';
import type {
  EditorTool,
  TextComposerTool,
  GlimpseOverlayAlign,
  GlimpseOverlayBackground,
  GlimpseOverlayEffect,
  GlimpseOverlayAnimation,
  GlimpseVoiceSegment,
  GlimpseOverlayLayer,
} from '../../utils/glimpse/glimpseEditorTypes';
import { FONT_OPTIONS, TEXT_COLORS, OVERLAY_STAGE_WIDTH, OVERLAY_STAGE_HEIGHT } from '../../utils/glimpse/glimpseEditorConstants';
import { GLIMPSE_STYLE_PRESETS, type GlimpseEditorMeta } from '../../utils/glimpseEditor';
import { normalizeOverlayLayers } from '../../utils/glimpse/glimpseEditorUtils';

export function useGlimpseEditorState(mediaType: 'image' | 'video') {
  // Refs
  const videoRef = useRef<Video | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicePreviewRef = useRef<Audio.Sound | null>(null);
  const musicPreviewRef = useRef<Audio.Sound | null>(null);
  const musicPreviewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTimelineVoiceRefs = useRef<Map<string, Audio.Sound>>(new Map());
  const pendingTimelineVoiceRefs = useRef<Set<string>>(new Set());
  const canvasRef = useRef<View | null>(null);
  const timelineTrackRef = useRef<View | null>(null);
  const timelineWindowRef = useRef({ x: 0, width: 1 });
  const seekThrottleRef = useRef(0);
  const playbackIntentRef = useRef(mediaType === 'video');
  const playbackToggleBusyRef = useRef(false);
  const panelTranslateY = useRef(new Animated.Value(0)).current;

  // UI Tool State
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerTool, setComposerTool] = useState<TextComposerTool>('font');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Text Overlay State
  const [overlayText, setOverlayText] = useState('');
  const [overlayAlign, setOverlayAlign] = useState<GlimpseOverlayAlign>('center');
  const [overlayColor, setOverlayColor] = useState(TEXT_COLORS[0]);
  const [overlayBackground, setOverlayBackground] = useState<GlimpseOverlayBackground>('none');
  const [overlayFont, setOverlayFont] = useState(FONT_OPTIONS[0].value);
  const [overlayEffect, setOverlayEffect] = useState<GlimpseOverlayEffect>('clean');
  const [overlayAnimation, setOverlayAnimation] = useState<GlimpseOverlayAnimation>('none');
  const [textOffset, setTextOffset] = useState({ x: 0, y: 0 });
  const [textScale, setTextScale] = useState(1);
  const [textRotation, setTextRotation] = useState(0);

  // Video/Timeline State
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15000);
  const [splitAt, setSplitAt] = useState(0);
  const [durationMillis, setDurationMillis] = useState(15000);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [internalVolume, setInternalVolume] = useState(1);

  // Style/Effects State
  const [styleId, setStyleId] = useState(GLIMPSE_STYLE_PRESETS[0].id);

  // Voice Recording State
  const [voiceSegments, setVoiceSegments] = useState<GlimpseVoiceSegment[]>([]);
  const [voiceInsertAt, setVoiceInsertAt] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);

  // Layer Management State
  const [overlayLayers, setOverlayLayers] = useState<GlimpseOverlayLayer[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedCanvasLayer, setSelectedCanvasLayer] = useState<string | null>(null);

  // Canvas/Stage State
  const [canvasFrame, setCanvasFrame] = useState({ width: OVERLAY_STAGE_WIDTH, height: OVERLAY_STAGE_HEIGHT });
  const [stageWindowOffset, setStageWindowOffset] = useState({ x: 0, y: 0 });
  const [animationTick, setAnimationTick] = useState(0);

  // Music State
  const [musicPreviewing, setMusicPreviewing] = useState(false);
  const [musicPreviewLoading, setMusicPreviewLoading] = useState(false);
  const [musicClipStart, setMusicClipStart] = useState(0);
  const [musicClipEnd, setMusicClipEnd] = useState(20);

  // Download State
  const [downloading, setDownloading] = useState(false);

  /**
   * Seed every meta-backed field from a saved GlimpseEditorMeta.
   *
   * This must be called when the editor OPENS, not from a useState
   * initialiser: NativeGlimpseEditor stays mounted between opens (it returns
   * null while hidden), so initialisers would only ever see whatever was
   * selected the first time the screen mounted.
   */
  const hydrateFromMeta = useCallback((meta?: GlimpseEditorMeta | null) => {
    const source = meta ?? {};

    // Text overlay
    setOverlayText(source.overlayText ?? '');
    setOverlayAlign(source.overlayAlign ?? 'center');
    setOverlayColor(source.overlayColor ?? TEXT_COLORS[0]);
    setOverlayBackground(source.overlayBackground ?? 'none');
    setOverlayFont(source.overlayFont ?? FONT_OPTIONS[0].value);
    setOverlayEffect(source.overlayEffect ?? 'clean');
    setOverlayAnimation(source.overlayAnimation ?? 'none');
    setTextOffset({ x: source.overlayOffsetX ?? 0, y: source.overlayOffsetY ?? 0 });
    setTextScale(source.overlayScale ?? 1);
    setTextRotation(source.overlayRotation ?? 0);

    // Style preset
    setStyleId(source.styleId ?? GLIMPSE_STYLE_PRESETS[0].id);

    // Video timeline
    setTrimStart(source.trimStart ?? 0);
    setTrimEnd(source.trimEnd ?? 15000);
    setSplitAt(source.splitAt ?? 0);

    // Voice + overlay layers
    setVoiceSegments(source.voiceSegments ?? []);
    setOverlayLayers(normalizeOverlayLayers(source.overlayLayers));

    // Audio
    setInternalVolume(source.videoVolume ?? 1);
    setMuted(source.videoMuted ?? true);

    // Session-only UI state must never leak from the previous open.
    setActiveTool(null);
    setComposerVisible(false);
    setSelectedOverlayId(null);
    setSelectedCanvasLayer(null);
  }, []);

  return {
    // Refs
    refs: {
      videoRef,
      inputRef,
      recordingRef,
      recordingTimerRef,
      voicePreviewRef,
      musicPreviewRef,
      musicPreviewStopTimerRef,
      activeTimelineVoiceRefs,
      pendingTimelineVoiceRefs,
      canvasRef,
      timelineTrackRef,
      timelineWindowRef,
      seekThrottleRef,
      playbackIntentRef,
      playbackToggleBusyRef,
      panelTranslateY,
    },
    // UI Tool State
    ui: {
      activeTool, setActiveTool,
      composerVisible, setComposerVisible,
      composerTool, setComposerTool,
      keyboardVisible, setKeyboardVisible,
      keyboardHeight, setKeyboardHeight,
    },
    // Text State
    text: {
      overlayText, setOverlayText,
      overlayAlign, setOverlayAlign,
      overlayColor, setOverlayColor,
      overlayBackground, setOverlayBackground,
      overlayFont, setOverlayFont,
      overlayEffect, setOverlayEffect,
      overlayAnimation, setOverlayAnimation,
      textOffset, setTextOffset,
      textScale, setTextScale,
      textRotation, setTextRotation,
    },
    // Video State
    video: {
      trimStart, setTrimStart,
      trimEnd, setTrimEnd,
      splitAt, setSplitAt,
      durationMillis, setDurationMillis,
      currentPosition, setCurrentPosition,
      isPlaying, setIsPlaying,
      muted, setMuted,
      videoLoaded, setVideoLoaded,
      videoError, setVideoError,
      internalVolume, setInternalVolume,
    },
    // Style State
    style: { styleId, setStyleId },
    // Voice State
    voice: {
      voiceSegments, setVoiceSegments,
      voiceInsertAt, setVoiceInsertAt,
      isRecording, setIsRecording,
      recordingMs, setRecordingMs,
    },
    // Layers State
    layers: {
      overlayLayers, setOverlayLayers,
      selectedOverlayId, setSelectedOverlayId,
      selectedCanvasLayer, setSelectedCanvasLayer,
    },
    // Canvas State
    canvas: {
      canvasFrame, setCanvasFrame,
      stageWindowOffset, setStageWindowOffset,
      animationTick, setAnimationTick,
    },
    // Music State
    music: {
      musicPreviewing, setMusicPreviewing,
      musicPreviewLoading, setMusicPreviewLoading,
      musicClipStart, setMusicClipStart,
      musicClipEnd, setMusicClipEnd,
    },
    // Download State
    download: { downloading, setDownloading },
    /** Re-seed the editor from saved meta — see the comment above the callback. */
    hydrateFromMeta,
  };
}
