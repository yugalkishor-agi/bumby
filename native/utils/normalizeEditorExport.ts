import { CanvasConfig, getDefaultCanvasConfig } from '../constants/storyCanvas';

export type NormalizedExport = {
  mediaWidth?: number;
  mediaHeight?: number;
  canvasConfig: CanvasConfig; // Editor canvas dimensions for position scaling
  textElements: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
    scale: number;
    rotation: number;
    z_index?: number;
    transform?: { x?: number; y?: number; w?: number; h?: number; rotation?: number; z?: number };
  }>;
  stickers: any[];
  drawings: any[];
  audience: 'public' | 'closeFriends';
  storySettings: {
    allowReplies: boolean;
    allowSharing: boolean;
    audience: 'everyone' | 'closeFriends';
    hiddenFrom: string[];
    closeFriends: string[];
  };
  filters?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
  audioOverlay?: {
    uri: string;
    name?: string;
    volume: number;
    start?: number;
    end?: number;
  };
};

function toStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0);
}

function toBool(value: any, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toAudience(value: any): 'everyone' | 'closeFriends' {
  return value === 'closeFriends' ? 'closeFriends' : 'everyone';
}

function toFiniteNumber(value: any): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeFilters(payload: any, meta: any) {
  const source = (meta?.filters && typeof meta.filters === 'object')
    ? meta.filters
    : ((payload?.filters && typeof payload.filters === 'object') ? payload.filters : null);

  if (!source) return undefined;

  const brightness = toFiniteNumber(source.brightness);
  const contrast = toFiniteNumber(source.contrast);
  const saturation = toFiniteNumber(source.saturation);

  if (brightness == null && contrast == null && saturation == null) {
    return undefined;
  }

  return { brightness, contrast, saturation };
}

function normalizeAudioOverlay(payload: any, meta: any) {
  const raw = payload?.audioOverlay || meta?.audioOverlay;
  if (!raw || typeof raw !== 'object') return undefined;

  const uri = raw.uri || raw.url || raw.src || raw.trackUrl;
  if (typeof uri !== 'string' || !uri.trim()) return undefined;

  const start = toFiniteNumber(raw.start ?? raw.startMs);
  const end = toFiniteNumber(raw.end ?? raw.endMs);
  const volumeRaw = toFiniteNumber(raw.volume);
  const volume = volumeRaw == null ? 1 : Math.max(0, Math.min(1, volumeRaw));

  return {
    uri: uri.trim(),
    name: typeof raw.name === 'string' ? raw.name : (typeof raw.title === 'string' ? raw.title : undefined),
    volume,
    start,
    end,
  };
}

function normalizeStorySettings(payload: any, meta: any) {
  const payloadSettings = payload?.storySettings || payload?.settings || {};
  const metaSettings = meta?.storySettings || meta?.settings || {};

  const audience = toAudience(
    payloadSettings?.audience ??
    metaSettings?.audience ??
    meta?.audience ??
    payload?.audience
  );

  const allowReplies = toBool(
    payloadSettings?.allowReplies ?? metaSettings?.allowReplies ?? meta?.allowReplies,
    true
  );

  const allowSharing = toBool(
    payloadSettings?.allowSharing ?? metaSettings?.allowSharing ?? meta?.allowSharing,
    true
  );

  const hiddenFrom = toStringArray(
    payloadSettings?.hiddenFrom ?? metaSettings?.hiddenFrom ?? meta?.hiddenFrom
  );

  const closeFriends = toStringArray(
    payloadSettings?.closeFriends ?? metaSettings?.closeFriends ?? meta?.closeFriends
  );

  return { allowReplies, allowSharing, audience, hiddenFrom, closeFriends };
}

// Normalize export payload from web-editor to the app's StoryProcessing input
export function normalizeEditorExport(payload: any): NormalizedExport {
  try {
    const m = payload?.meta;
    const storySettings = normalizeStorySettings(payload, m || {});
    const filters = normalizeFilters(payload, m || {});
    const audioOverlay = normalizeAudioOverlay(payload, m || {});

    // If no meta, return minimal fallback
    if (!m || typeof m !== 'object') {
      return {
        mediaWidth: undefined,
        mediaHeight: undefined,
        canvasConfig: getDefaultCanvasConfig(),
        textElements: [],
        stickers: [],
        drawings: [],
        audience: 'public',
        storySettings,
        filters,
        audioOverlay,
      };
    }

    const SW = Math.max(1, Number(m?.stage?.width) || 375);
    const SH = Math.max(1, Number(m?.stage?.height) || 667);

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const toNorm = (x: number, y: number) => {
      return { x: clamp01(Number(x) / SW), y: clamp01(Number(y) / SH) };
    };
    const avg = (a?: number, b?: number) => {
      const ax = typeof a === 'number' ? a : 1;
      const by = typeof b === 'number' ? b : 1;
      return (ax + by) / 2;
    };


    const nextTexts = Array.isArray(m.text) ? m.text.map((t: any) => {
      const pos = toNorm(Number(t?.x) || 0, Number(t?.y) || 0);
      const scale = avg(t?.scaleX, t?.scaleY);
      const rawSz = typeof t?.fontSize === 'number' ? t.fontSize : 24;
      const sz = rawSz;
      const rot = typeof t?.rotation === 'number' ? t.rotation : 0;
      return {
        id: String(t?.id || `t_${Date.now()}_${Math.random()}`),
        text: String(t?.text || ''),
        x: pos.x,
        y: pos.y,
        color: String(t?.fill || '#FFFFFF'),
        fontSize: sz,
        scale: typeof scale === 'number' ? scale : 1,
        rotation: rot,
      };
    }) : [];

    const nextDrawings = Array.isArray(m.drawings) ? m.drawings.map((d: any) => {
      const pts: number[] = Array.isArray(d?.points) ? d.points : [];
      const pairs: string = pts.reduce((acc: string[], _v: number, i: number) => {
        if (i % 2 === 0) {
          const x = Number(pts[i] || 0);
          const y = Number(pts[i + 1] || 0);
          acc.push(`${x},${y}`);
        }
        return acc;
      }, []).join(' ');
      const stroke = String(d?.stroke || '#FFFFFF');
      const rawStrokeWidth = Math.max(1, Number(d?.strokeWidth || 3));
      const strokeWidth = rawStrokeWidth;
      const xml = `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${SW} ${SH}\"><polyline points=\"${pairs}\" stroke=\"${stroke}\" stroke-width=\"${strokeWidth}\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>`;
      return { id: String(d?.id || `dr_${Date.now()}_${Math.random()}`), svgData: xml };
    }) : [];

    const widgetToSticker = (w: any) => {
      const rawX = w?.x ?? w?.left ?? w?.centerX ?? w?.data?.position?.x ?? w?.data?.x;
      const rawY = w?.y ?? w?.top ?? w?.centerY ?? w?.data?.position?.y ?? w?.data?.y;

      let pos: { x: number; y: number };
      const numX = typeof rawX === 'number' ? rawX : 0;
      const numY = typeof rawY === 'number' ? rawY : 0;

      if (numX >= 0 && numX <= 1 && numY >= 0 && numY <= 1 && (numX > 0 || numY > 0)) {
        pos = { x: numX, y: numY };
      } else {
        pos = toNorm(numX, numY);
      }

      const scale = avg(w?.scaleX, w?.scaleY);
      const scaleValue = typeof scale === 'number' ? scale : 1;
      const rot = typeof w?.rotation === 'number' ? w.rotation : 0;
      const rawKind = String(w?.kind || w?.type || '');
      const kind = rawKind === 'question' ? 'ask' : rawKind;

      const widgetData = (w?.data && typeof w.data === 'object')
        ? w.data
        : ((w?.content && typeof w.content === 'object') ? w.content : {});

      const toNormScalar = (value: any, max: number, fallback: number) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
        if (value <= 2) return clamp01(value);
        return clamp01(value / Math.max(1, max));
      };

      const getFallbackSize = (widgetKind: string) => {
        if (widgetKind === 'ask' || widgetKind === 'suggest') return { w: 0.85, h: 0.18 };
        if (widgetKind === 'slider' || widgetKind === 'rating') return { w: 0.85, h: 0.16 };
        if (widgetKind === 'poll' || widgetKind === 'quiz') return { w: 0.85, h: 0.32 };
        if (widgetKind === 'mention' || widgetKind === 'hashtag' || widgetKind === 'time') return { w: 0.42, h: 0.09 };
        return { w: 0.3, h: 0.12 };
      };

      const fallbackSize = getFallbackSize(kind);
      const hasExplicitSize = (typeof w?.transform?.w === 'number') || (typeof w?.transform?.h === 'number')
        || (typeof w?.size?.w === 'number') || (typeof w?.size?.h === 'number');
      const widthNorm = toNormScalar(w?.transform?.w ?? w?.size?.w, SW, fallbackSize.w);
      const heightNorm = toNormScalar(w?.transform?.h ?? w?.size?.h, SH, fallbackSize.h);
      const anchorRaw = String(w?.transform?.anchor || w?.anchor || '').toLowerCase();
      const inferTopLeftKinds = new Set(['poll', 'slider', 'ask', 'question', 'quiz', 'mention', 'hashtag', 'time', 'rating', 'suggest']);
      const isTopLeft = anchorRaw.includes('top') || (!anchorRaw && !hasExplicitSize && inferTopLeftKinds.has(kind));

      if (isTopLeft) {
        pos = {
          x: clamp01(pos.x + (widthNorm / 2)),
          y: clamp01(pos.y + (heightNorm / 2)),
        };
      }

      const webTheme = widgetData?.theme as 'neon' | 'pastel' | 'dark' | 'minimal' | undefined;
      const webOpacity = typeof w?.opacity === 'number' ? w.opacity : 1;
      const isAnonymous = widgetData?.replyPrivacy === 'anonymous';
      const showPrivacyBadge = widgetData?.showPrivacyBadge ?? true;

      let nativeTheme: 'light' | 'dark' | 'glass' | 'gradient' = 'dark';
      if (webTheme === 'minimal') {
        nativeTheme = 'light';
      }

      const style = {
        theme: nativeTheme,
        stylePreset: webTheme || 'pastel',
        opacity: webOpacity,
        isAnonymous,
        hideBadge: !showPrivacyBadge,
      };

      const base = {
        id: `w_${Date.now()}_${Math.random()}`,
        x: pos.x,
        y: pos.y,
        size: { w: widthNorm, h: heightNorm },
        scale: scaleValue,
        rotation: rot,
        transform: {
          x: pos.x,
          y: pos.y,
          w: widthNorm,
          h: heightNorm,
          scale: scaleValue,
          rotation: rot,
          positionSpace: 'screen' as const,
          anchor: 'center' as const,
        },
      };

      if (kind === 'poll') {
        const q = (widgetData?.text) || 'Which one?';
        const options = Array.isArray(widgetData?.options) ? widgetData.options : [widgetData?.optionA || 'Yes', widgetData?.optionB || 'No'];
        return { ...base, type: 'poll', content: { question: String(q), options: options.slice(0, 4), style }, style };
      }
      if (kind === 'slider') {
        const q = (widgetData?.text) || 'How much?';
        const emoji = (widgetData?.emoji) || '\ud83d\ude0d';
        return { ...base, type: 'slider', content: { question: String(q), emoji: String(emoji), style }, style };
      }
      if (kind === 'quiz') {
        const q = (widgetData?.text) || 'Quiz';
        const options = Array.isArray(widgetData?.options) ? widgetData.options.slice(0, 4) : ['A', 'B'];
        const correctIndex = typeof widgetData?.correctIndex === 'number' ? widgetData.correctIndex : 0;
        const quizStyle = { ...style, theme: 'dark' as const };
        return { ...base, type: 'quiz', content: { question: String(q), options, correctIndex, style: quizStyle }, style: quizStyle };
      }
      if (kind === 'ask') {
        const text = (widgetData?.text) || 'Ask me anything';
        return { ...base, type: 'question', content: { text: String(text), style }, style };
      }
      if (kind === 'time') {
        const mode = (widgetData?.mode) || 'time';
        const iso = (widgetData?.iso) || new Date().toISOString();
        return { ...base, type: 'time', content: { mode: String(mode), iso: String(iso), style }, style };
      }
      if (kind === 'rating') {
        const text = (widgetData?.text) || 'Rate this';
        const ratingType = (widgetData?.ratingType) || 'star';
        const max = (typeof widgetData?.max === 'number' ? widgetData.max : 5);
        const emojis = (Array.isArray(widgetData?.emojis) ? widgetData.emojis : undefined);
        return { ...base, type: 'rating', content: { text: String(text), ratingType: String(ratingType), max: Number(max), emojis, style }, style };
      }
      if (kind === 'suggest') {
        const text = (widgetData?.text) || 'Suggest something';
        const placeholder = (widgetData?.placeholder) || 'Type here...';
        const replyPrivacy = (widgetData?.replyPrivacy) || 'anonymous';
        const badgeVisible = (widgetData?.showPrivacyBadge ?? true);
        return { ...base, type: 'question', content: { text: String(text), variant: 'suggest', placeholder: String(placeholder), replyPrivacy: String(replyPrivacy), showPrivacyBadge: !!badgeVisible, style }, style };
      }
      if (kind === 'mention') {
        const handle = (widgetData?.handle) || '@username';
        return { ...base, type: 'mention', content: String(handle) };
      }
      if (kind === 'hashtag') {
        const tag = (widgetData?.tag) || '#hashtag';
        return { ...base, type: 'hashtag', content: String(tag) };
      }
      return null;
    };

    const nextStickersFromWidgets = Array.isArray(m.widgets) ? m.widgets.map(widgetToSticker).filter(Boolean) as any[] : [];
    const nextMediaStickers = Array.isArray(m.stickers) ? m.stickers.map((st: any) => {
      const src = typeof st?.src === 'string'
        ? st.src
        : (typeof st?.url === 'string' ? st.url : (typeof st?.content?.url === 'string' ? st.content.url : ''));
      const trimmedSrc = src.trim();
      if (!trimmedSrc) return null;

      const rawX = st?.x ?? st?.left ?? st?.transform?.x ?? 0;
      const rawY = st?.y ?? st?.top ?? st?.transform?.y ?? 0;
      const nX = typeof rawX === 'number' ? rawX : 0;
      const nY = typeof rawY === 'number' ? rawY : 0;
      const topLeftPos = (nX >= 0 && nX <= 1 && nY >= 0 && nY <= 1)
        ? { x: nX, y: nY }
        : toNorm(nX, nY);

      const rawW = st?.width ?? st?.w ?? st?.transform?.w ?? st?.size?.w;
      const rawH = st?.height ?? st?.h ?? st?.transform?.h ?? st?.size?.h;
      const widthNorm = typeof rawW === 'number'
        ? (rawW <= 2 ? clamp01(rawW) : clamp01(rawW / SW))
        : 0.3;
      const heightNorm = typeof rawH === 'number'
        ? (rawH <= 2 ? clamp01(rawH) : clamp01(rawH / SH))
        : 0.3;

      const centerX = clamp01(topLeftPos.x + (widthNorm / 2));
      const centerY = clamp01(topLeftPos.y + (heightNorm / 2));

      const scale = avg(st?.scaleX, st?.scaleY);
      const rotation = typeof st?.rotation === 'number' ? st.rotation : 0;
      const mp4Url = typeof st?.mp4Url === 'string' ? st.mp4Url.trim() : '';

      return {
        id: String(st?.id || `st_${Date.now()}_${Math.random()}`),
        type: 'gif',
        content: {
          url: trimmedSrc,
          src: trimmedSrc,
          ...(mp4Url ? { mp4Url } : {}),
        },
        src: trimmedSrc,
        x: centerX,
        y: centerY,
        size: { w: widthNorm, h: heightNorm },
        scale: typeof scale === 'number' ? scale : 1,
        rotation,
        transform: {
          x: centerX,
          y: centerY,
          w: widthNorm,
          h: heightNorm,
          scale: typeof scale === 'number' ? scale : 1,
          rotation,
        },
      };
    }).filter(Boolean) as any[] : [];

    const nextEmojiStickers = Array.isArray(m.emojis) ? m.emojis.map((em: any) => {
      const pos = toNorm(Number(em?.x) || 0, Number(em?.y) || 0);
      const scale = avg(em?.scaleX, em?.scaleY);
      return {
        id: String(em?.id || `e_${Date.now()}_${Math.random()}`),
        type: 'emoji',
        content: String(em?.emoji || '\ud83d\ude00'),
        x: pos.x,
        y: pos.y,
        scale: typeof scale === 'number' ? scale : 1,
        rotation: typeof em?.rotation === 'number' ? em.rotation : 0,
      };
    }) : [];

    const PR = 2;
    const mediaW = Math.floor(SW * PR);
    const mediaH = Math.floor(SH * PR);

    const normalizedText = nextTexts.map((el: any, idx: number) => ({
      id: el.id,
      text: el.text,
      color: el.color,
      fontSize: el.fontSize,
      x: el.x,
      y: el.y,
      scale: typeof el.scale === 'number' ? el.scale : 1,
      rotation: el.rotation || 0,
      z_index: idx,
      transform: { x: el.x, y: el.y, w: undefined, h: undefined, rotation: el.rotation || 0, z: idx },
    }));

    const normalizedStickers = [...nextEmojiStickers, ...nextMediaStickers, ...nextStickersFromWidgets]
      .map((st: any, idx: number) => ({ ...st, z_index: idx }));
    const normalizedDrawings = nextDrawings;

    const finalAudience = storySettings.audience === 'closeFriends' ? 'closeFriends' : 'public';

    const canvasConfig: CanvasConfig = {
      width: SW,
      height: SH,
      aspectRatio: SW / SH,
    };

    return {
      mediaWidth: mediaW,
      mediaHeight: mediaH,
      canvasConfig,
      textElements: normalizedText,
      stickers: normalizedStickers,
      drawings: normalizedDrawings,
      audience: finalAudience,
      storySettings,
      filters,
      audioOverlay,
    };
  } catch {
    const safeMeta = payload?.meta || {};
    const storySettings = normalizeStorySettings(payload, safeMeta);
    const filters = normalizeFilters(payload, safeMeta);
    const audioOverlay = normalizeAudioOverlay(payload, safeMeta);

    return {
      mediaWidth: undefined,
      mediaHeight: undefined,
      canvasConfig: getDefaultCanvasConfig(),
      textElements: [],
      stickers: [],
      drawings: [],
      audience: 'public',
      storySettings,
      filters,
      audioOverlay,
    };
  }
}
