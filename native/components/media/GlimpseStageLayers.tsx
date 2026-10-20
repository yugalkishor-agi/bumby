import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle} from 'react-native';
import { spacing } from '../../styles/theme';
import type { GlimpseOverlayLayer } from '../../utils/glimpseEditor';
import { Image } from 'expo-image';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTouchDistance(touches: readonly any[]) {
  if (!touches || touches.length < 2) return 0;
  const [first, second] = touches;
  const dx = Number(second.pageX || 0) - Number(first.pageX || 0);
  const dy = Number(second.pageY || 0) - Number(first.pageY || 0);
  return Math.hypot(dx, dy);
}

interface GlimpseStageTextLayerProps {
  text: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  selected: boolean;
  editable: boolean;
  canvasWidth: number;
  canvasHeight: number;
  stageWindowOffset: { x: number; y: number };
  shellStyle?: StyleProp<ViewStyle>;
  input: React.ReactNode;
  output: React.ReactNode;
  onSelect: () => void;
  onChangePosition: (x: number, y: number) => void;
  onChangeScale: (scale: number) => void;
  onChangeRotation: (rotation: number) => void;
  onTextLayout?: (size: { width: number; height: number }) => void;
}

export function GlimpseStageTextLayer({
  text,
  x,
  y,
  scale,
  rotation,
  selected,
  editable,
  canvasWidth,
  canvasHeight,
  stageWindowOffset: _stageWindowOffset,
  shellStyle,
  input,
  output,
  onSelect,
  onChangePosition,
  onChangeScale,
  onChangeRotation,
  onTextLayout,
}: GlimpseStageTextLayerProps) {
  const dragStartRef = useRef({ x: 0, y: 0 });
  const scaleStartRef = useRef(scale || 1);
  const pinchStartDistanceRef = useRef(0);
  const layoutRef = useRef({ width: 180, height: 72 });
  const interactionModeRef = useRef<'drag' | 'pinch' | null>(null);
  const [draft, setDraft] = useState({ x, y, scale: scale || 1, rotation: rotation || 0 });
  const draftRef = useRef(draft);

  const syncDraft = (updates: Partial<typeof draft>) => {
    const next = { ...draftRef.current, ...updates };
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (interactionModeRef.current) return;
    const next = { x, y, scale: scale || 1, rotation: rotation || 0 };
    draftRef.current = next;
    setDraft(next);
  }, [rotation, scale, x, y]);

  const syncTextPositionFromGesture = (gestureState: PanResponderGestureState) => {
    const halfWidth = (layoutRef.current.width * draftRef.current.scale) / 2;
    const halfHeight = (layoutRef.current.height * draftRef.current.scale) / 2;
    const maxX = Math.max(0, canvasWidth / 2 - halfWidth - 20);
    const maxY = Math.max(0, canvasHeight / 2 - halfHeight - 20);
    syncDraft({
      x: clamp(dragStartRef.current.x + gestureState.dx, -maxX, maxX),
      y: clamp(dragStartRef.current.y + gestureState.dy, -maxY, maxY),
    });
  };

  const commitDraft = () => {
    interactionModeRef.current = null;
    onChangePosition(draftRef.current.x, draftRef.current.y);
    onChangeScale(draftRef.current.scale);
    onChangeRotation(draftRef.current.rotation);
  };

  const surfaceResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !editable,
    onStartShouldSetPanResponderCapture: () => !editable,
    onMoveShouldSetPanResponder: (_, gestureState) => !editable && (gestureState.numberActiveTouches > 1 || Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
    onMoveShouldSetPanResponderCapture: (_, gestureState) => !editable && (gestureState.numberActiveTouches > 1 || Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
    onPanResponderGrant: (event) => {
      dragStartRef.current = { x: draftRef.current.x ?? 0, y: draftRef.current.y ?? 0 };
      scaleStartRef.current = draftRef.current.scale;
      const grantTouches = event?.nativeEvent?.touches ?? [];
      pinchStartDistanceRef.current = getTouchDistance(grantTouches);
      interactionModeRef.current = grantTouches.length >= 2 ? 'pinch' : 'drag';
      onSelect();
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const pinchDistance = getTouchDistance(touches);
        if (interactionModeRef.current !== 'pinch') {
          scaleStartRef.current = draftRef.current.scale;
          pinchStartDistanceRef.current = pinchDistance;
          interactionModeRef.current = 'pinch';
        }
        if (pinchStartDistanceRef.current > 0 && pinchDistance > 0) {
          const nextScale = clamp(scaleStartRef.current * (pinchDistance / pinchStartDistanceRef.current), 0.55, 2.4);
          syncDraft({ scale: nextScale });
        }
        return;
      }

      if (interactionModeRef.current !== 'drag') {
        dragStartRef.current = { x: draftRef.current.x, y: draftRef.current.y };
        interactionModeRef.current = 'drag';
      }
      syncTextPositionFromGesture(gestureState);
    },
    onPanResponderRelease: commitDraft,
    onPanResponderTerminate: commitDraft,
    onPanResponderTerminationRequest: () => false,
  }), [canvasHeight, canvasWidth, editable, onChangePosition, onChangeRotation, onChangeScale, onSelect]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = { width, height };
    onTextLayout?.({ width, height });
  };

  if (!text.trim() && !editable) return null;

  return (
    <View style={styles.textCenter} pointerEvents="box-none">
      <View style={{ transform: [{ translateX: draft.x }, { translateY: draft.y }, { scale: draft.scale }, { rotate: `${draft.rotation}deg` }] }} pointerEvents="box-none">
        <View onLayout={handleLayout} {...surfaceResponder.panHandlers} style={[styles.textShell, shellStyle, selected && !editable && styles.layerSelected]}>
          {editable ? input : output}
        </View>
        {selected && !editable ? <View pointerEvents="none" style={styles.selectionOutline} /> : null}
      </View>
    </View>
  );
}

interface GlimpseStageAssetLayerProps {
  layer: GlimpseOverlayLayer;
  selected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  stageWindowOffset: { x: number; y: number };
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GlimpseOverlayLayer>) => void;
}

export function GlimpseStageAssetLayer({
  layer,
  selected,
  canvasWidth,
  canvasHeight,
  stageWindowOffset: _stageWindowOffset,
  onSelect,
  onUpdate,
}: GlimpseStageAssetLayerProps) {
  const interactionModeRef = useRef<'drag' | 'pinch' | null>(null);
  const dragStartRef = useRef({ x: layer.x ?? 18, y: layer.y ?? 18 });
  const resizeStartRef = useRef({ width: layer.width ?? 120, height: layer.height ?? 120 });
  const pinchStartDistanceRef = useRef(0);
  const [draft, setDraft] = useState({ x: layer.x ?? 18, y: layer.y ?? 18, width: layer.width ?? 120, height: layer.height ?? 120, rotation: layer.rotation || 0 });
  const draftRef = useRef(draft);

  const syncDraft = (updates: Partial<typeof draft>) => {
    const next = { ...draftRef.current, ...updates };
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (interactionModeRef.current) return;
    const next = { x: layer.x ?? 18, y: layer.y ?? 18, width: layer.width ?? 120, height: layer.height ?? 120, rotation: layer.rotation || 0 };
    draftRef.current = next;
    setDraft(next);
  }, [layer.height, layer.rotation, layer.width, layer.x, layer.y]);

  const syncAssetPositionFromGesture = (gestureState: PanResponderGestureState) => {
    const maxX = Math.max(18, canvasWidth - draftRef.current.width - 18);
    const maxY = Math.max(18, canvasHeight - draftRef.current.height - 18);
    syncDraft({
      x: clamp(dragStartRef.current.x + gestureState.dx, 18, maxX),
      y: clamp(dragStartRef.current.y + gestureState.dy, 18, maxY),
    });
  };

  const commitAssetDraft = () => {
    interactionModeRef.current = null;
    onUpdate(layer.id, {
      x: draftRef.current.x,
      y: draftRef.current.y,
      width: draftRef.current.width,
      height: draftRef.current.height,
      rotation: draftRef.current.rotation,
    });
  };

  const surfaceResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => gestureState.numberActiveTouches > 1 || Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
    onMoveShouldSetPanResponderCapture: (_, gestureState) => gestureState.numberActiveTouches > 1 || Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
    onPanResponderGrant: (event) => {
      dragStartRef.current = { x: draftRef.current.x ?? 18, y: draftRef.current.y ?? 18 };
      resizeStartRef.current = { width: draftRef.current.width ?? 120, height: draftRef.current.height ?? 120 };
      const grantTouches = event?.nativeEvent?.touches ?? [];
      pinchStartDistanceRef.current = getTouchDistance(grantTouches);
      interactionModeRef.current = grantTouches.length >= 2 ? 'pinch' : 'drag';
      onSelect(layer.id);
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const pinchDistance = getTouchDistance(touches);
        if (interactionModeRef.current !== 'pinch') {
          resizeStartRef.current = { width: draftRef.current.width, height: draftRef.current.height };
          pinchStartDistanceRef.current = pinchDistance;
          interactionModeRef.current = 'pinch';
        }
        if (pinchStartDistanceRef.current > 0 && pinchDistance > 0) {
          const aspectRatio = Math.max(0.25, resizeStartRef.current.width / Math.max(1, resizeStartRef.current.height));
          const maxWidthByCanvas = Math.max(96, canvasWidth - 36);
          const maxWidthByHeight = Math.max(96, (canvasHeight - 36) * aspectRatio);
          const maxWidth = Math.min(maxWidthByCanvas, maxWidthByHeight);
          const scaleFactor = pinchDistance / pinchStartDistanceRef.current;
          const nextWidth = clamp(resizeStartRef.current.width * scaleFactor, 72, maxWidth);
          const nextHeight = nextWidth / aspectRatio;
          const maxX = Math.max(18, canvasWidth - nextWidth - 18);
          const maxY = Math.max(18, canvasHeight - nextHeight - 18);
          syncDraft({
            width: nextWidth,
            height: nextHeight,
            x: clamp(draftRef.current.x, 18, maxX),
            y: clamp(draftRef.current.y, 18, maxY),
          });
        }
        return;
      }

      if (interactionModeRef.current !== 'drag') {
        dragStartRef.current = { x: draftRef.current.x, y: draftRef.current.y };
        interactionModeRef.current = 'drag';
      }
      syncAssetPositionFromGesture(gestureState);
    },
    onPanResponderRelease: commitAssetDraft,
    onPanResponderTerminate: commitAssetDraft,
    onPanResponderTerminationRequest: () => false,
  }), [canvasHeight, canvasWidth, layer.id, onSelect, onUpdate]);

  return (
    <View
      style={[
        styles.assetWrap,
        {
          left: draft.x,
          top: draft.y,
          width: draft.width,
          height: draft.height,
          transform: [{ rotate: `${draft.rotation}deg` }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View {...surfaceResponder.panHandlers} style={[styles.assetSurface, selected && styles.layerSelected]}>
        {layer.assetUri ? (
          <Image source={{ uri: layer.assetUri }} style={styles.assetImage} contentFit="cover" />
        ) : layer.content ? (
          <View style={styles.stickerSurface}>
            <Text style={styles.stickerText}>{layer.content}</Text>
          </View>
        ) : null}
      </View>
      {selected ? <View pointerEvents="none" style={styles.selectionOutline} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  textCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  textShell: { minWidth: 96, maxWidth: '92%', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  assetWrap: { position: 'absolute' },
  assetSurface: { width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden' },
  assetImage: { width: '100%', height: '100%' },
  stickerSurface: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerText: {
    fontSize: 48,
    textAlign: 'center',
  },
  layerSelected: { borderWidth: 2, borderColor: '#FFFFFF' },
  selectionOutline: { ...StyleSheet.absoluteFillObject, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)', borderRadius: 18 },
});
