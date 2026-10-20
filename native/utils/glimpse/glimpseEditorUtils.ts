// glimpseEditorUtils.ts
// Purpose: Pure utility functions for Glimpse editor
// Extracted from: NativeGlimpseEditor.tsx — Session 001

import type {
  GlimpseVoiceSegment,
  GlimpseOverlayLayer,
  EditorHistorySnapshot,
  GlimpseOverlayAlign,
  GlimpseOverlayBackground,
} from './glimpseEditorTypes';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getContrastText(hexColor: string): string {
  const safe = hexColor.replace('#', '');
  const normalized = safe.length === 3 ? safe.split('').map((char) => char + char).join('') : safe;
  const intValue = Number.parseInt(normalized, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.7 ? '#09111F' : '#FFFFFF';
}

export function normalizeTextColor(color: string, background: GlimpseOverlayBackground): string {
  const contrast = getContrastText(color);
  if (background === 'white' && contrast === '#FFFFFF') return '#09111F';
  if (background === 'black' && contrast === '#09111F') return '#FFFFFF';
  return color;
}

export function computeFontSize(text: string): number {
  const length = Math.max(1, text.trim().length);
  if (length <= 8) return 58;
  if (length <= 14) return 50;
  if (length <= 22) return 42;
  if (length <= 34) return 34;
  if (length <= 46) return 30;
  return 26;
}

export function estimateTextUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    if (char === ' ') units += 0.34;
    else if (/[A-Z0-9]/.test(char)) units += 0.76;
    else if (/[il\.,'!]/.test(char)) units += 0.32;
    else units += 0.58;
  }
  return units;
}

export function fitFontSizeToWidth(text: string, baseFontSize: number, maxWidth: number): number {
  const safeText = text.trim();
  if (!safeText) return baseFontSize;
  const estimatedWidth = estimateTextUnits(safeText) * baseFontSize;
  if (estimatedWidth <= maxWidth) return baseFontSize;
  return Math.max(18, Math.floor(baseFontSize * (maxWidth / Math.max(estimatedWidth, 1))));
}

export function cycleAlign(align: GlimpseOverlayAlign): GlimpseOverlayAlign {
  if (align === 'left') return 'center';
  if (align === 'center') return 'right';
  return 'left';
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export function cloneVoiceSegments(segments: GlimpseVoiceSegment[]): GlimpseVoiceSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

export function cloneOverlayLayers(layers: GlimpseOverlayLayer[]): GlimpseOverlayLayer[] {
  return layers.map((layer) => ({ ...layer }));
}

/**
 * Fold anything claiming to be an overlay layer into the one shape the editor
 * understands, clamping geometry and dropping rows with no id.
 *
 * Used at both boundaries — reading persisted meta back into the editor and
 * writing it out again — so the editor never sees a shape it cannot render.
 * Accepts the legacy `kind`/`uri`/`sticker` fields as well: documents written
 * before `type`/`content`/`assetUri` existed would otherwise collapse into an
 * invisible geometry-only box.
 */
export function normalizeOverlayLayers(layers?: unknown): GlimpseOverlayLayer[] {
  if (!Array.isArray(layers)) return [];

  return layers
    .filter((layer): layer is Record<string, unknown> => !!layer && typeof layer === 'object' && !!(layer as any).id)
    .map((layer) => {
      const declared = layer.type;
      const type: GlimpseOverlayLayer['type'] =
        declared === 'text' || declared === 'sticker' || declared === 'asset'
          ? declared
          : layer.kind === 'sticker' || !!layer.sticker
            ? 'sticker'
            : 'asset';

      const normalized: GlimpseOverlayLayer = {
        id: String(layer.id),
        type,
        content: String(layer.content ?? layer.sticker ?? ''),
        x: Math.round(Number(layer.x) || 0),
        y: Math.round(Number(layer.y) || 0),
        width: Math.max(1, Math.round(Number(layer.width) || 0)),
        height: Math.max(1, Math.round(Number(layer.height) || 0)),
        rotation: Math.round(Number(layer.rotation) || 0),
        scale: Number(layer.scale) > 0 ? Number(layer.scale) : 1,
      };

      const source = layer.assetUri ?? layer.uri;
      if (source) normalized.assetUri = String(source);
      if (layer.color) normalized.color = String(layer.color);
      if (layer.font) normalized.font = String(layer.font);

      return normalized;
    });
}

export function snapshotsEqual(
  left: EditorHistorySnapshot | undefined,
  right: EditorHistorySnapshot | undefined
): boolean {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}
