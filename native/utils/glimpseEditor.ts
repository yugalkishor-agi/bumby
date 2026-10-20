export type GlimpseOverlayPosition = 'top' | 'center' | 'bottom';
export type GlimpseOverlayAlign = 'left' | 'center' | 'right';
export type GlimpseOverlayBackground = 'none' | 'black' | 'white' | 'glass';
export type GlimpseOverlayEffect = 'clean' | 'outline' | 'shadow' | 'glow';
export type GlimpseOverlayAnimation = 'none' | 'fadeScale' | 'slideUp' | 'typewriter' | 'bounce';

export interface GlimpseVoiceSegment {
  id: string;
  uri: string;
  startMs: number;
  durationMs: number;
  label?: string;
}

/**
 * The one overlay-layer shape, shared by the editor and by persisted
 * GlimpseEditorMeta. `useGlimpseLayers` is the only writer, so its fields
 * (type/content/assetUri) are the canonical ones — the older kind/uri/sticker
 * shape only ever survives in already-written documents and is folded back in
 * by `normalizeOverlayLayers`.
 */
export interface GlimpseOverlayLayer {
  id: string;
  type: 'text' | 'sticker' | 'asset';
  /** Emoji/text for sticker and text layers. */
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  color?: string;
  font?: string;
  /** Image source for asset layers. */
  assetUri?: string;
}

export interface GlimpseEditorMeta {
  styleId?: string;
  overlayText?: string;
  overlayPosition?: GlimpseOverlayPosition;
  overlayAlign?: GlimpseOverlayAlign;
  overlayColor?: string;
  overlayBackground?: GlimpseOverlayBackground;
  overlayFont?: string;
  overlayEffect?: GlimpseOverlayEffect;
  overlayAnimation?: GlimpseOverlayAnimation;
  overlayOffsetX?: number;
  overlayOffsetY?: number;
  overlayScale?: number;
  overlayRotation?: number;
  splitAt?: number;
  trimStart?: number;
  trimEnd?: number;
  videoMuted?: boolean;
  videoVolume?: number;
  voiceSegments?: GlimpseVoiceSegment[];
  overlayLayers?: GlimpseOverlayLayer[];
}

export interface GlimpseStylePreset {
  id: string;
  label: string;
  gradient: [string, string, string];
  overlayOpacity: number;
  textColor: string;
  tintColor?: string;
  tintOpacity?: number;
  shadowColor?: string;
  shadowOpacity?: number;
}

export const GLIMPSE_STYLE_PRESETS: GlimpseStylePreset[] = [
  {
    id: 'carbon',
    label: 'Carbon',
    gradient: ['rgba(0,0,0,0.04)', 'rgba(7,12,24,0.18)', 'rgba(2,6,16,0.52)'],
    overlayOpacity: 0.42,
    textColor: '#FFFFFF',
    tintColor: '#0F172A',
    tintOpacity: 0.14,
    shadowColor: '#020617',
    shadowOpacity: 0.2,
  },
  {
    id: 'nightshift',
    label: 'Night Shift',
    gradient: ['rgba(6,20,40,0.08)', 'rgba(18,54,110,0.2)', 'rgba(1,8,24,0.58)'],
    overlayOpacity: 0.54,
    textColor: '#F8FBFF',
    tintColor: '#1D4ED8',
    tintOpacity: 0.12,
    shadowColor: '#020617',
    shadowOpacity: 0.24,
  },
  {
    id: 'tealcut',
    label: 'Teal Cut',
    gradient: ['rgba(2,24,34,0.06)', 'rgba(5,92,122,0.22)', 'rgba(2,12,22,0.5)'],
    overlayOpacity: 0.52,
    textColor: '#F2FDFF',
    tintColor: '#0891B2',
    tintOpacity: 0.11,
    shadowColor: '#042F2E',
    shadowOpacity: 0.18,
  },
  {
    id: 'whitecrush',
    label: 'White Crush',
    gradient: ['rgba(255,255,255,0.02)', 'rgba(196,212,255,0.12)', 'rgba(8,15,28,0.38)'],
    overlayOpacity: 0.34,
    textColor: '#FFFFFF',
    tintColor: '#E2E8F0',
    tintOpacity: 0.08,
    shadowColor: '#020617',
    shadowOpacity: 0.12,
  },
  {
    id: 'ember',
    label: 'Ember',
    gradient: ['rgba(32,10,6,0.06)', 'rgba(148,56,24,0.22)', 'rgba(14,8,18,0.52)'],
    overlayOpacity: 0.56,
    textColor: '#FFF8F1',
    tintColor: '#EA580C',
    tintOpacity: 0.11,
    shadowColor: '#431407',
    shadowOpacity: 0.18,
  },
  {
    id: 'violethaze',
    label: 'Violet Haze',
    gradient: ['rgba(18,10,36,0.06)', 'rgba(92,54,168,0.2)', 'rgba(7,10,22,0.48)'],
    overlayOpacity: 0.46,
    textColor: '#FAF5FF',
    tintColor: '#8B5CF6',
    tintOpacity: 0.12,
    shadowColor: '#1E1B4B',
    shadowOpacity: 0.18,
  },
  {
    id: 'noir',
    label: 'Noir',
    gradient: ['rgba(8,8,8,0.16)', 'rgba(16,16,16,0.28)', 'rgba(0,0,0,0.68)'],
    overlayOpacity: 0.62,
    textColor: '#FFFFFF',
    tintColor: '#000000',
    tintOpacity: 0.18,
    shadowColor: '#000000',
    shadowOpacity: 0.26,
  },
  {
    id: 'frostbite',
    label: 'Frost Bite',
    gradient: ['rgba(8,20,36,0.04)', 'rgba(78,142,178,0.14)', 'rgba(4,10,22,0.44)'],
    overlayOpacity: 0.38,
    textColor: '#F4FAFF',
    tintColor: '#7DD3FC',
    tintOpacity: 0.08,
    shadowColor: '#082F49',
    shadowOpacity: 0.12,
  },
];

export function getGlimpseStylePreset(styleId?: string): GlimpseStylePreset {
  return GLIMPSE_STYLE_PRESETS.find((preset) => preset.id === styleId) || GLIMPSE_STYLE_PRESETS[0];
}


