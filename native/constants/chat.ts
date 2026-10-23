export const QUICK_REACTION_KEY = 'chat_quick_reaction';

export const DEFAULT_REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDE21', '\uD83D\uDC4D'] as const;

export const CHAT_THEME_COLORS: Record<string, string> = {
  nebula: '#a855f7',
  lagoon: '#38bdf8',
  ember: '#f59e0b',
  mint: '#34d399',
  ocean: '#0ea5e9',
  sunset: '#f43f5e',
  aurora: '#8b5cf6',
  glass: '#ffffff',
};

export const THEME_GRADIENTS: Record<string, string[]> = {
  nebula: ['#0f172a', '#1e1b4b', '#312e81'],
  lagoon: ['#0f172a', '#0c4a6e', '#075985'],
  ember: ['#0f172a', '#451a03', '#78350f'],
  mint: ['#0f172a', '#064e3b', '#065f46'],
  ocean: ['#0f172a', '#0c4a6e', '#0369a1'],
  sunset: ['#0f172a', '#4c0519', '#881337'],
  aurora: ['#0f172a', '#2e1065', '#4c1d95'],
  glass: ['#000000', '#111111', '#1a1a1a'],
};

export const getChatAccent = (themeKey?: string) => {
  return CHAT_THEME_COLORS[themeKey || ''] || '#38bdf8';
};

/**
 * Ink used for foreground content drawn on top of a solid chat-accent fill.
 * The composer send button already uses this colour on the accent fill, so the
 * outgoing message bubble follows the same convention.
 */
export const CHAT_ACCENT_INK = '#060a12';
export const CHAT_LIGHT_INK = '#e2e8f0';

const parseHexColor = (hex: string): { r: number; g: number; b: number } => {
  const raw = String(hex || '').trim().replace('#', '');
  const normalized = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

/** WCAG relative luminance of a hex colour. */
const relativeLuminance = (hex: string): number => {
  const { r, g, b } = parseHexColor(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (a: number, b: number): number => {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Pick the readable foreground for text drawn on a solid chat-accent fill.
 *
 * The outgoing bubble is filled with the chat accent (a bright colour such as
 * `#38bdf8`), so the shared near-white message colour only reached a ~1.7:1
 * contrast ratio and the text was effectively invisible. This compares both
 * candidate inks and returns whichever has the better contrast.
 */
export const getChatAccentForeground = (accent?: string): string => {
  if (!accent) return CHAT_ACCENT_INK;
  const accentLuminance = relativeLuminance(accent);
  const inkContrast = contrastRatio(accentLuminance, relativeLuminance(CHAT_ACCENT_INK));
  const lightContrast = contrastRatio(accentLuminance, relativeLuminance(CHAT_LIGHT_INK));
  return inkContrast >= lightContrast ? CHAT_ACCENT_INK : CHAT_LIGHT_INK;
};

/** Muted variant of {@link getChatAccentForeground} for secondary labels. */
export const getChatAccentForegroundMuted = (accent?: string): string =>
  getChatAccentForeground(accent) === CHAT_ACCENT_INK
    ? 'rgba(6, 10, 18, 0.72)'
    : 'rgba(226, 232, 240, 0.78)';

export const getChatGradient = (themeKey?: string): [string, string, ...string[]] => {
  const gradient = THEME_GRADIENTS[themeKey || ''] || THEME_GRADIENTS.nebula;
  if (gradient.length >= 2) {
    return [gradient[0], gradient[1], ...gradient.slice(2)];
  }
  return ['#0f172a', '#1e1b4b'];
};
