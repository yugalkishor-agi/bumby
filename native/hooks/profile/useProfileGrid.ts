import { useState, useMemo, useCallback, useRef } from 'react';

export function useProfileGrid(
  userPosts: any[],
  userGlimpses: any[],
  taggedPosts: any[],
  profileUser: any,
  displayUserId: string,
  navigation: any
) {
  const [activeTab, setActiveTab] = useState<'posts' | 'glimpses' | 'tagged'>('posts');
  const [tilePreview, setTilePreview] = useState<{
    itemId: string;
    isGlimpse: boolean;
    mediaIsVideo: boolean;
    mediaUri: string;
    tileUri: string;
    username: string;
  } | null>(null);
  
  const lastLongPressRef = useRef<{ itemId: string; at: number } | null>(null);

  const toMillis = useCallback((value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const sortPinnedFirst = useCallback((items: any[]) => {
    return [...items].sort((a, b) => {
      const aPin = toMillis(a?.pinnedAt);
      const bPin = toMillis(b?.pinnedAt);
      if (aPin !== bPin) return bPin - aPin;
      return toMillis(b?.createdAt) - toMillis(a?.createdAt);
    });
  }, [toMillis]);

  const getItemId = useCallback((item: any) => item?.postId || item?.glimpseId || item?.storyId || item?.id || '', []);

  const normalizeGlimpseItem = useCallback((entry: any) => ({
    ...entry,
    glimpseId: entry?.glimpseId || entry?.storyId || entry?.id,
    storyId: entry?.glimpseId || entry?.storyId || entry?.id,
    mediaURL: entry?.mediaURL || entry?.mediaUrl || entry?.mediaURLs?.[0],
    mediaType:
      entry?.mediaType ||
      (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(String(entry?.mediaURL || entry?.mediaUrl || entry?.mediaURLs?.[0] || ''))
        ? 'video'
        : 'image'),
  }), []);

  const normalizedGlimpseItems = useMemo(() => {
    return sortPinnedFirst((userGlimpses || [])
      .filter((entry: any) => !!getItemId(entry))
      .map((entry: any) => normalizeGlimpseItem(entry))
    );
  }, [getItemId, normalizeGlimpseItem, sortPinnedFirst, userGlimpses]);

  const combinedProfileItems = useMemo(() => {
    return sortPinnedFirst(
      [...(userPosts || []), ...normalizedGlimpseItems]
        .filter((item: any) => !!getItemId(item))
    );
  }, [getItemId, normalizedGlimpseItems, sortPinnedFirst, userPosts]);

  const taggedProfileItems = useMemo(() => {
    return sortPinnedFirst(
      (taggedPosts || [])
        .filter((item: any) => !!getItemId(item))
    );
  }, [getItemId, sortPinnedFirst, taggedPosts]);

  const currentData = useMemo(() => {
    if (activeTab === 'glimpses') return normalizedGlimpseItems;
    if (activeTab === 'tagged') return taggedProfileItems;
    return combinedProfileItems;
  }, [activeTab, combinedProfileItems, normalizedGlimpseItems, taggedProfileItems]);

  const navigateToViewer = useCallback((screenName: 'PostView' | 'GlimpseViewer', params: Record<string, any>) => {
    const nav: any = navigation as any;
    if (typeof nav?.push === 'function') {
      nav.push(screenName, params);
      return;
    }
    nav.navigate(screenName, params);
  }, [navigation]);

  const openTileViewer = useCallback((item: any, isGlimpse: boolean) => {
    const itemId = getItemId(item);
    if (!itemId) return;

    if (isGlimpse) {
      const normalizedCurrent = normalizeGlimpseItem(item);
      const currentGlimpseId = getItemId(normalizedCurrent);
      if (!currentGlimpseId) return;

      const existsInViewer = normalizedGlimpseItems.some((entry: any) => String(getItemId(entry)) === String(currentGlimpseId));
      const viewerItems = existsInViewer
        ? normalizedGlimpseItems
        : sortPinnedFirst([normalizedCurrent, ...normalizedGlimpseItems]);
      const startIndex = viewerItems.findIndex((entry: any) => String(getItemId(entry)) === String(currentGlimpseId));

      navigateToViewer('GlimpseViewer', {
        glimpseId: String(currentGlimpseId),
        glimpses: viewerItems,
        index: startIndex >= 0 ? startIndex : 0,
      });
      return;
    }

    const sourceItems = activeTab === 'tagged' ? taggedProfileItems : combinedProfileItems;
    const existsInViewer = sourceItems.some((entry: any) => String(getItemId(entry)) === String(itemId));
    const viewerItems = existsInViewer
      ? sourceItems
      : sortPinnedFirst([item, ...sourceItems]);
    const startIndex = Math.max(0, viewerItems.findIndex((entry: any) => String(getItemId(entry)) === String(itemId)));

    navigateToViewer('PostView', {
      postId: String(itemId),
      id: String(itemId),
      userId: displayUserId,
      items: viewerItems,
      index: startIndex,
    });
  }, [activeTab, combinedProfileItems, displayUserId, getItemId, navigateToViewer, normalizeGlimpseItem, normalizedGlimpseItems, taggedProfileItems, sortPinnedFirst]);

  const handleTileLongPress = useCallback((payload: {
    itemId: string;
    isGlimpse: boolean;
    mediaIsVideo: boolean;
    mediaUri: string;
    tileUri: string;
  }) => {
    lastLongPressRef.current = { itemId: payload.itemId, at: Date.now() };
    setTilePreview({
      ...payload,
      username: profileUser?.username || '',
    });
  }, [profileUser?.username]);

  const clearTilePreview = useCallback(() => {
    setTilePreview(null);
  }, []);

  const formatCompactCount = useCallback((raw: any) => {
    const value = Number(raw || 0);
    if (!Number.isFinite(value) || value <= 0) return '0';
    if (value < 1000) return String(Math.floor(value));
    if (value < 1000000) {
      const base = value / 1000;
      return `${base >= 10 ? base.toFixed(0) : base.toFixed(1).replace(/\.0$/, '')}K`;
    }
    const base = value / 1000000;
    return `${base >= 10 ? base.toFixed(0) : base.toFixed(1).replace(/\.0$/, '')}M`;
  }, []);

  return {
    activeTab,
    setActiveTab,
    currentData,
    tilePreview,
    clearTilePreview,
    handleTileLongPress,
    openTileViewer,
    lastLongPressRef,
    formatCompactCount
  };
}
