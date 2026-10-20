import React, { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Animated, Modal, SafeAreaView, KeyboardAvoidingView, Platform, Keyboard, PanResponder } from 'react-native';
import { useGlimpseEditorState } from '../../hooks/glimpse/useGlimpseEditorState';
import { useGlimpseHistory } from '../../hooks/glimpse/useGlimpseHistory';
import { useGlimpseTimeline } from '../../hooks/glimpse/useGlimpseTimeline';
import { useGlimpseVoice } from '../../hooks/glimpse/useGlimpseVoice';
import { useGlimpseMusic } from '../../hooks/glimpse/useGlimpseMusic';
import { useGlimpseLayers } from '../../hooks/glimpse/useGlimpseLayers';
import { useGlimpseText } from '../../hooks/glimpse/useGlimpseText';
import { useGlimpsePlayback } from '../../hooks/glimpse/useGlimpsePlayback';
import { useGlimpseTools } from '../../hooks/glimpse/useGlimpseTools';
import { GlimpseEditorToolbar } from '../glimpse/GlimpseEditorToolbar';
import { GlimpseEditorCanvas } from '../glimpse/GlimpseEditorCanvas';
import { GlimpseEditorToolDock } from '../glimpse/GlimpseEditorToolDock';
import { GlimpseEffectsPanel } from '../glimpse/GlimpseEffectsPanel';
import { GlimpseVoicePanel } from '../glimpse/GlimpseVoicePanel';
import { GlimpseClipsPanel } from '../glimpse/GlimpseClipsPanel';
import { GlimpseOverlayPanel } from '../glimpse/GlimpseOverlayPanel';
import { GlimpseMusicPanel } from '../glimpse/GlimpseMusicPanel';
import { GlimpseTextComposer } from '../glimpse/GlimpseTextComposer';
import { GLIMPSE_STYLE_PRESETS, cycleAlign, clamp } from '../../utils/glimpse/glimpseEditorCalculations';
import { TOOLS } from '../../utils/glimpse/glimpseEditorConstants';
import type { GlimpseEditorMeta } from '../../utils/glimpseEditor';

interface CurrentSong {
  title: string;
  artist?: string;
  duration?: number;
  clipStart?: number;
  clipEnd?: number;
  streamUrl?: string;
}

export interface NativeGlimpseEditorProps {
  visible: boolean;
  mediaUri: string;
  mediaType: 'image' | 'video';
  /** Saved edits for the current item; applied every time the editor opens. */
  initialMeta?: GlimpseEditorMeta | null;
  currentSong?: CurrentSong | null;
  onClose: () => void;
  onSave: (data: any) => void;
  onRequestMusic?: () => void;
  onRequestReplace?: () => void;
  onRequestAddClip?: () => void;
  onMusicRangeChange?: (selection: { clipStart: number; clipEnd: number }) => void;
}

export function NativeGlimpseEditor({
  visible,
  mediaUri,
  mediaType,
  initialMeta,
  currentSong,
  onClose,
  onSave,
  onRequestMusic,
  onRequestReplace,
  onRequestAddClip,
  onMusicRangeChange,
}: NativeGlimpseEditorProps) {
  const state = useGlimpseEditorState(mediaType);

  const {
    refs: { videoRef, inputRef, canvasRef, timelineTrackRef, panelTranslateY },
    ui: { activeTool, setActiveTool, composerVisible, setComposerVisible, composerTool, setComposerTool, keyboardVisible, setKeyboardVisible, keyboardHeight, setKeyboardHeight },
    text: { overlayText, setOverlayText, overlayAlign, setOverlayAlign, overlayColor, setOverlayColor, overlayBackground, setOverlayBackground, overlayFont, setOverlayFont, overlayEffect, setOverlayEffect, overlayAnimation, setOverlayAnimation, textOffset, setTextOffset, textScale, setTextScale, textRotation, setTextRotation },
    video: { trimStart, setTrimStart, trimEnd, setTrimEnd, splitAt, setSplitAt, durationMillis, setDurationMillis, currentPosition, setCurrentPosition, isPlaying, setIsPlaying, muted, setMuted, videoLoaded, setVideoLoaded, videoError, setVideoError, internalVolume, setInternalVolume },
    style: { styleId, setStyleId },
    voice: { voiceSegments, setVoiceSegments, voiceInsertAt, setVoiceInsertAt, isRecording, recordingMs },
    layers: { overlayLayers, setOverlayLayers, selectedOverlayId, setSelectedOverlayId, selectedCanvasLayer, setSelectedCanvasLayer },
    canvas: { canvasFrame, setStageWindowOffset, stageWindowOffset, animationTick, setAnimationTick },
    music: { musicPreviewing, musicPreviewLoading, musicClipStart, setMusicClipStart, musicClipEnd, setMusicClipEnd },
    hydrateFromMeta,
  } = state;

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [setKeyboardHeight, setKeyboardVisible]);

  useEffect(() => {
    let af: number;
    const loop = () => {
      setAnimationTick((prev) => prev + 1);
      af = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(af);
  }, [setAnimationTick]);

  // The editor stays mounted between opens, so restore the saved edits on
  // every open instead of relying on initial state. Without this, opening an
  // already-edited item started blank and the next save wiped the preview.
  useEffect(() => {
    if (!visible) return;
    hydrateFromMeta(initialMeta);
  }, [visible, initialMeta, hydrateFromMeta]);

  const effectiveTrimEnd = mediaType === 'image' ? 0 : Math.min(trimEnd, durationMillis);

  const { canUndo, canRedo, undo: handleUndo, redo: handleRedo, commitSnapshot: commitHistorySnapshot } = useGlimpseHistory({
    visible,
    createSnapshot: () => ({} as any),
    onApplySnapshot: () => {},
  });

  const { handlePlaybackStatusUpdate, togglePlayback, toggleMuted, handleVolumeChange } = useGlimpsePlayback({
    mediaType, videoRef, durationMillis, setDurationMillis, trimStart, trimEnd, effectiveTrimEnd, setTrimEnd, currentPosition, setCurrentPosition, isPlaying, setIsPlaying, muted, setMuted, internalVolume, setInternalVolume, isRecording, setVoiceInsertAt, updateTimelineWindow: () => {}, setVideoLoaded, setVideoError,
  });

  const { seekPreviewPosition, updateTimelineWindow, scrubResponder, trimStartResponder, trimEndResponder, splitResponder, voiceResponder, handleDeleteLeftSplit, handleDeleteRightSplit } = useGlimpseTimeline({
    mediaType, videoRef, fullDurationMs: durationMillis, currentPosition, setCurrentPosition, trimStart, setTrimStart, effectiveTrimEnd, setTrimEnd, splitAt, setSplitAt, setVoiceInsertAt, commitHistorySnapshot,
  });

  const { startVoiceRecording, stopVoiceRecording, playVoiceSegment, removeVoiceSegment } = useGlimpseVoice({
    mediaType, voiceSegments, setVoiceSegments, voiceInsertAt, trimStart, effectiveTrimEnd, isPlaying, currentPosition,
  });

  const { toggleMusicPreview, handleMusicClipStartChange, selectedSongDuration, maxMusicClipStart } = useGlimpseMusic({
    currentSong, mediaType, isPlaying, setIsPlaying, videoRef, musicClipStart, setMusicClipStart, musicClipEnd, setMusicClipEnd, onRequestMusic, onMusicRangeChange,
  });

  const { pickOverlayLayer, addStickerLayer, resizeSelectedOverlay, removeSelectedOverlay, removeSelectedCanvasItem, clearCanvasSelection, handleSelectOverlayLayer, handleUpdateOverlayLayer } = useGlimpseLayers({
    overlayLayers, setOverlayLayers, selectedOverlayId, setSelectedOverlayId, selectedCanvasLayer, setSelectedCanvasLayer, setOverlayText, setTextOffset, setTextScale, setTextRotation, composerVisible,
  });

  const { openComposer, closeComposer, handleSelectTextLayer, handleTextPositionChange, handleTextScaleChange, handleTextRotationChange, textShadowStyle, textBackgroundStyle } = useGlimpseText({
    setActiveTool, setComposerVisible, setComposerTool, setSelectedCanvasLayer, setSelectedOverlayId, setTextOffset, setTextScale, setTextRotation, overlayEffect, textColor: overlayColor, overlayBackground,
  });

  const { downloading, handleToolPress, handleDownload } = useGlimpseTools({
    mediaUri, setActiveTool, setComposerVisible, openComposer,
  });

  const handleSaveAction = useCallback(() => {
    onSave({
      styleId, overlayText: overlayText.trim(), overlayPosition: initialMeta?.overlayPosition ?? 'center', overlayAlign, overlayColor, overlayBackground, overlayFont, overlayEffect, overlayAnimation,
      splitAt: mediaType === 'video' ? Math.round(splitAt) : undefined,
      overlayOffsetX: Math.round(textOffset.x), overlayOffsetY: Math.round(textOffset.y), overlayScale: Number(textScale.toFixed(2)), overlayRotation: Math.round(textRotation),
      trimStart: mediaType === 'video' ? Math.round(trimStart) : undefined,
      trimEnd: mediaType === 'video' ? Math.round(effectiveTrimEnd) : undefined,
      videoMuted: muted, videoVolume: Number(internalVolume.toFixed(2)),
      voiceSegments: voiceSegments.length ? voiceSegments : undefined,
      overlayLayers: overlayLayers.length ? overlayLayers : undefined,
    });
  }, [effectiveTrimEnd, initialMeta, internalVolume, mediaType, muted, onSave, overlayAlign, overlayAnimation, overlayBackground, overlayColor, overlayEffect, overlayFont, overlayLayers, overlayText, splitAt, styleId, textOffset.x, textOffset.y, textRotation, textScale, trimStart, voiceSegments]);

  const panelResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) panelTranslateY.setValue(gestureState.dy);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 120 || gestureState.vy > 0.8) {
        Animated.timing(panelTranslateY, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
          setActiveTool(null);
          panelTranslateY.setValue(0);
        });
      } else {
        Animated.spring(panelTranslateY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  }), [panelTranslateY, setActiveTool]);

  const syncStageWindowOffset = useCallback(() => {
    canvasRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setStageWindowOffset({ x: pageX, y: pageY });
    });
  }, [canvasRef, setStageWindowOffset]);

  const selectedStyle = GLIMPSE_STYLE_PRESETS.find((s) => s.id === styleId) || GLIMPSE_STYLE_PRESETS[0];

  const animatedTextWrapStyle = useMemo(() => {
    if (overlayAnimation === 'bounce') return { transform: [{ translateY: Math.sin(animationTick / 10) * 8 }] };
    if (overlayAnimation === 'slideUp') return { transform: [{ translateY: (animationTick % 120) > 60 ? (120 - (animationTick % 120)) * -0.5 : (animationTick % 120) * -0.5 }] };
    if (overlayAnimation === 'fadeScale') return { transform: [{ scale: 1 + Math.sin(animationTick / 15) * 0.05 }], opacity: 0.8 + Math.cos(animationTick / 15) * 0.2 };
    return null;
  }, [overlayAnimation, animationTick]);

  if (!visible) return null;

  const renderPanel = () => {
    if (keyboardVisible || composerVisible) return null;
    if (activeTool === 'effects') return <GlimpseEffectsPanel styleId={styleId} setStyleId={setStyleId} />;
    if (activeTool === 'clips' && mediaType === 'video') return <GlimpseClipsPanel mediaType={mediaType} durationMillis={durationMillis} trimStart={trimStart} setTrimStart={setTrimStart} effectiveTrimEnd={effectiveTrimEnd} setTrimEnd={setTrimEnd} splitAt={splitAt} setSplitAt={setSplitAt} muted={muted} internalVolume={internalVolume} handleVolumeChange={handleVolumeChange} currentPosition={currentPosition} handleDeleteLeftSplit={handleDeleteLeftSplit} handleDeleteRightSplit={handleDeleteRightSplit} onRequestReplace={onRequestReplace} onRequestAddClip={onRequestAddClip} fullDurationMs={durationMillis} trimStartPercent={(trimStart / durationMillis) * 100 || 0} trimEndPercent={(effectiveTrimEnd / durationMillis) * 100 || 100} timelinePlayheadPercent={(currentPosition / durationMillis) * 100 || 0} splitPercent={(splitAt / durationMillis) * 100 || 0} timelineTrackRef={timelineTrackRef} updateTimelineWindow={updateTimelineWindow} scrubResponder={scrubResponder} trimStartResponder={trimStartResponder} trimEndResponder={trimEndResponder} splitResponder={splitResponder} voiceResponder={voiceResponder} />;
    if (activeTool === 'voice' && mediaType === 'video') return <View style={{gap:16}}><GlimpseVoicePanel voiceInsertAt={voiceInsertAt} setVoiceInsertAt={setVoiceInsertAt} trimStart={trimStart} effectiveTrimEnd={effectiveTrimEnd} isRecording={isRecording} recordingMs={recordingMs} startVoiceRecording={startVoiceRecording} stopVoiceRecording={stopVoiceRecording} voiceSegments={voiceSegments} playVoiceSegment={playVoiceSegment} removeVoiceSegment={removeVoiceSegment} setActiveTool={setActiveTool} /></View>;
    if (activeTool === 'music') return <GlimpseMusicPanel currentSong={currentSong} selectedSongDuration={selectedSongDuration} musicClipStart={musicClipStart} musicClipEnd={musicClipEnd} maxMusicClipStart={maxMusicClipStart} handleMusicClipStartChange={handleMusicClipStartChange} musicPreviewing={musicPreviewing} musicPreviewLoading={musicPreviewLoading} toggleMusicPreview={toggleMusicPreview} onRequestMusic={onRequestMusic} />;
    if (activeTool === 'overlay') return <GlimpseOverlayPanel overlayLayers={overlayLayers} selectedOverlayId={selectedOverlayId} setSelectedOverlayId={setSelectedOverlayId} setSelectedCanvasLayer={setSelectedCanvasLayer} pickOverlayLayer={pickOverlayLayer} addStickerLayer={addStickerLayer} resizeSelectedOverlay={resizeSelectedOverlay} removeSelectedOverlay={removeSelectedOverlay} />;
    return null;
  };

  const panelContent = renderPanel();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          
          <GlimpseEditorToolbar composerVisible={composerVisible} onClose={onClose} canUndo={canUndo} canRedo={canRedo} handleUndo={handleUndo} handleRedo={handleRedo} downloading={downloading} handleSave={handleSaveAction} />
          
          <View style={styles.editorStage}>
            <View style={styles.stageWrap} onLayout={syncStageWindowOffset}>
              <GlimpseEditorCanvas
                mediaType={mediaType} mediaUri={mediaUri} videoRef={videoRef} canvasRef={canvasRef} inputRef={inputRef} muted={muted} internalVolume={internalVolume} selectedStyle={selectedStyle} overlayLayers={overlayLayers} selectedCanvasLayer={selectedCanvasLayer} canvasFrame={canvasFrame} stageWindowOffset={stageWindowOffset} handleSelectOverlayLayer={handleSelectOverlayLayer} handleUpdateOverlayLayer={handleUpdateOverlayLayer} currentPosition={currentPosition} effectiveTrimEnd={effectiveTrimEnd} isPlaying={isPlaying} togglePlayback={togglePlayback} toggleMuted={toggleMuted} setVideoLoaded={setVideoLoaded} setVideoError={setVideoError} handlePlaybackStatusUpdate={handlePlaybackStatusUpdate} videoError={videoError} videoLoaded={videoLoaded} clearCanvasSelection={clearCanvasSelection}
                displayedOverlayText={overlayText} composerVisible={composerVisible} textOffset={textOffset} textScale={textScale} textRotation={textRotation} getTextBackground={() => textBackgroundStyle} handleSelectTextLayer={handleSelectTextLayer} handleTextPositionChange={handleTextPositionChange} handleTextScaleChange={handleTextScaleChange} handleTextRotationChange={handleTextRotationChange} animatedTextWrapStyle={animatedTextWrapStyle} textColor={overlayColor} overlayFont={overlayFont} fontSize={28 * textScale} overlayAlign={overlayAlign} getTextShadow={() => textShadowStyle} overlayText={overlayText} setOverlayText={setOverlayText} overlayColor={overlayColor}
              />
            </View>

            {panelContent ? (
              <Animated.View style={[styles.panelSheetWrap, { transform: [{ translateY: panelTranslateY }] }]} {...panelResponder.panHandlers}>
                <View style={styles.panelDragHandle} />
                {panelContent}
              </Animated.View>
            ) : null}

            <GlimpseEditorToolDock composerVisible={composerVisible} activeTool={activeTool} tools={TOOLS as any} handleToolPress={handleToolPress} selectedCanvasLayer={selectedCanvasLayer} removeSelectedCanvasItem={removeSelectedCanvasItem} setSelectedCanvasLayer={setSelectedCanvasLayer} setSelectedOverlayId={setSelectedOverlayId} />
          </View>

          <GlimpseTextComposer composerVisible={composerVisible} composerTool={composerTool} setComposerTool={setComposerTool as any} overlayFont={overlayFont} setOverlayFont={setOverlayFont} overlayColor={overlayColor} setOverlayColor={setOverlayColor} overlayAnimation={overlayAnimation} setOverlayAnimation={setOverlayAnimation as any} overlayEffect={overlayEffect} setOverlayEffect={setOverlayEffect as any} overlayBackground={overlayBackground} setOverlayBackground={setOverlayBackground as any} overlayAlign={overlayAlign} setOverlayAlign={setOverlayAlign} cycleAlign={cycleAlign as any} closeComposer={closeComposer} keyboardVisible={keyboardVisible} keyboardHeight={keyboardHeight} />
          
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04070F' },
  editorStage: { flex: 1, position: 'relative' },
  stageWrap: { flex: 1 },
  panelSheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#04070F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  panelDragHandle: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
});
