// glimpseEditorTypes.ts
// Purpose: Type definitions for Glimpse editor
// Extracted from: NativeGlimpseEditor.tsx + glimpseEditor.ts

import type { GlimpseOverlayLayer } from '../glimpseEditor';

export type EditorTool = 'text' | 'effects' | 'voice' | 'clips' | 'overlay' | 'music' | 'download';
export type TextComposerTool = 'font' | 'color' | 'animation' | 'effect' | 'background';

export type GlimpseOverlayAlign = 'left' | 'center' | 'right';
export type GlimpseOverlayAnimation = 'none' | 'fadeScale' | 'slideUp' | 'typewriter' | 'bounce';
export type GlimpseOverlayEffect = 'clean' | 'outline' | 'shadow' | 'glow';
export type GlimpseOverlayBackground = 'none' | 'black' | 'white' | 'glass';

export interface GlimpseVoiceSegment {
  id: string;
  uri: string;
  startMs: number;
  durationMs: number;
  label?: string;
}

export interface EditorHistorySnapshot {
  styleId: string;
  overlayText: string;
  overlayAlign: GlimpseOverlayAlign;
  overlayColor: string;
  overlayBackground: GlimpseOverlayBackground;
  overlayFont: string;
  overlayEffect: GlimpseOverlayEffect;
  overlayAnimation: GlimpseOverlayAnimation;
  trimStart: number;
  trimEnd: number;
  splitAt: number;
  muted: boolean;
  internalVolume: number;
  voiceSegments: GlimpseVoiceSegment[];
  overlayLayers: GlimpseOverlayLayer[];
  textOffset: { x: number; y: number };
  textScale: number;
  textRotation: number;
}

export type { GlimpseStylePreset } from '../glimpseEditor';
export type { GlimpseOverlayLayer };
