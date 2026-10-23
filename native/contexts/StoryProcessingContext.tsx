import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { storyService } from '../services/story.service';
import { mediaService } from '../services/media.service.native';
import { createCompositeImage } from '../utils/storyCaptureUtils';
import { transcoderService } from '../services/transcoder.service';
import { editorFlags } from '../config/editorFlags';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

interface ProcessingStory {
  id: string;
  mediaUri: string;
  mediaType: 'image' | 'video';
  mediaWidth?: number;
  mediaHeight?: number;
  canvasConfig?: { width: number; height: number; aspectRatio: number }; // Editor canvas dimensions
  textElements: any[];
  stickers: any[];
  drawings: any[];
  audience: 'public' | 'closeFriends';
  storySettings: any;
  progress: number;
  status: 'processing' | 'uploading' | 'completed' | 'failed' | 'canceled';
  trimStart?: number;
  trimEnd?: number;
  audioOverlay?: { uri: string; name?: string; volume: number; start?: number; end?: number };
  filters?: { brightness?: number; contrast?: number; saturation?: number };
}

interface StoryProcessingContextType {
  processingStories: ProcessingStory[];
  startStoryProcessing: (storyData: Omit<ProcessingStory, 'id' | 'progress' | 'status'>) => string;
  getProcessingProgress: () => number;
  hasProcessingStories: () => boolean;
  cancelStoryProcessing: (id: string) => Promise<void>;
}

const StoryProcessingContext = createContext<StoryProcessingContextType | undefined>(undefined);

export function StoryProcessingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [processingStories, setProcessingStories] = useState<ProcessingStory[]>([]);
  const canceledRef = useRef<Set<string>>(new Set());
  // Process queue: ensure only one heavy job runs at a time (crucial for low-RAM devices)
  const queueRef = useRef<ProcessingStory[]>([]);
  const runningRef = useRef<boolean>(false);

  const updateStoryProgress = useCallback((id: string, progress: number, status?: ProcessingStory['status']) => {
    setProcessingStories(prev => prev.map(story =>
      story.id === id
        ? { ...story, progress, ...(status && { status }) }
        : story
    ));
  }, []);

  const removeProcessingStory = useCallback((id: string) => {
    setProcessingStories(prev => prev.filter(story => story.id !== id));
  }, []);

  const getDefaultHiddenUsers = useCallback(async (authorId: string): Promise<string[]> => {
    try {
      const snap = await getDocs(collection(db, `users/${authorId}/storyHiddenUsers`));
      return snap.docs.map((d) => d.id).filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  const getDefaultCloseFriends = useCallback(async (authorId: string): Promise<string[]> => {
    try {
      const snap = await getDocs(collection(db, `users/${authorId}/closeFriends`));
      return snap.docs.map((d) => d.id).filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  const processStoryInBackground = useCallback(async (story: ProcessingStory) => {
    if (!user) return;

    try {
      console.log('[StoryProcessing] ▶️ Start', { id: story.id, type: story.mediaType, uri: story.mediaUri });
      // Update status to processing
      updateStoryProgress(story.id, 10, 'processing');

      if (canceledRef.current.has(story.id)) {
        updateStoryProgress(story.id, 0, 'canceled');
        setTimeout(() => removeProcessingStory(story.id), 1500);
        return;
      }

      // Process overlays (web: composite image, native: save as metadata)
      updateStoryProgress(story.id, 20);
      let finalMediaUri = story.mediaUri;
      let hasOverlays = story.textElements.length > 0 || story.stickers.length > 0 || story.drawings.length > 0;

      if (hasOverlays && story.mediaType === 'image') {
        updateStoryProgress(story.id, 30);
        try {
          // Try to create composite image (works on web)
          console.log('[StoryProcessing] 🧩 Creating composite image on web (if available)');
          const compositeImageUrl = await createCompositeImage(
            story.mediaUri,
            story.textElements,
            story.stickers,
            story.drawings
          );

          // If composite was successful (web), use it
          if (compositeImageUrl !== story.mediaUri) {
            finalMediaUri = compositeImageUrl;
            console.log('[StoryProcessing] ✅ Composite created');
          } else {
            console.log('[StoryProcessing] 📱 Native: keeping overlays as metadata');
          }
          updateStoryProgress(story.id, 40);
        } catch (error) {
          console.warn('[StoryProcessing] ⚠️ Composite failed, using original with metadata:', error);
          // Continue with original image and save overlays as metadata
        }
      }

      // Upload media (composite or processed)
      let mediaURL = '';
      let thumbnailURL = '';
      let processedDurationMs: number | undefined;
      if (story.mediaType === 'video') {
        if (canceledRef.current.has(story.id)) {
          updateStoryProgress(story.id, 0, 'canceled');
          setTimeout(() => removeProcessingStory(story.id), 1500);
          return;
        }
        updateStoryProgress(story.id, 45, 'processing');
        let workUri = story.mediaUri;
        // Trim window
        const s = Math.max(0, Math.floor(story.trimStart ?? 0));
        let e = story.trimEnd != null ? Math.floor(story.trimEnd) : (s + 15);
        if (e <= s) e = s + 1;
        if (e - s > 60) e = s + 60;
        processedDurationMs = Math.max(1000, Math.round((e - s) * 1000));
        try {
          if (Platform.OS !== 'web') {
            workUri = await transcoderService.trim(workUri, s, e, {
              onProgress: (p) => updateStoryProgress(story.id, Math.min(70, 45 + Math.floor(p / 3))),
            });
          }
        } catch { }

        // Apply filters if supported and enabled
        if (!editorFlags.disableAdvancedVideoPipeline && story.filters && Platform.OS !== 'web') {
          try {
            workUri = await (transcoderService as any).applyFilters?.(workUri, story.filters, {
              onProgress: (p: number) => updateStoryProgress(story.id, Math.min(75, 60 + Math.floor(p / 4))),
            }) || workUri;
          } catch { }
        }

        // Merge audio overlay if provided and enabled
        if (!editorFlags.disableAdvancedVideoPipeline && story.audioOverlay && story.audioOverlay.uri && Platform.OS !== 'web') {
          try {
            workUri = await (transcoderService as any).mergeAudio?.(workUri, story.audioOverlay.uri, {
              volume: story.audioOverlay.volume ?? 1,
              audioStart: story.audioOverlay.start,
              audioEnd: story.audioOverlay.end,
              onProgress: (p: number) => updateStoryProgress(story.id, Math.min(80, 65 + Math.floor(p / 4))),
            }) || workUri;
          } catch { }
        }

        // Export cap
        try {
          if (Platform.OS !== 'web') {
            workUri = await transcoderService.compressVideo(workUri, {
              maxHeight: editorFlags.exportMaxHeightPx || 1920,
              onProgress: (p) => updateStoryProgress(story.id, Math.min(90, 70 + Math.floor(p / 3))),
            });
          }
        } catch { }

        console.log('[StoryProcessing] ⬆️ Uploading video to Supabase (signed PUT)');
        updateStoryProgress(story.id, 90, 'uploading');
        let uploaded: { mediaURL: string; thumbnailURL: string };
        if (Platform.OS === 'web') {
          const vResp = await fetch(workUri);
          const vBlob = await vResp.blob();
          uploaded = await mediaService.uploadStoryVideo(user.userId, vBlob as any);
        } else {
          uploaded = await mediaService.uploadStoryVideoPath(user.userId, workUri);
        }
        mediaURL = uploaded.mediaURL;
        thumbnailURL = uploaded.thumbnailURL || mediaURL;
        console.log('[StoryProcessing] ✅ Video uploaded', { mediaURL });
        updateStoryProgress(story.id, 95);
      } else {
        if (canceledRef.current.has(story.id)) {
          updateStoryProgress(story.id, 0, 'canceled');
          setTimeout(() => removeProcessingStory(story.id), 1500);
          return;
        }
        // Downscale image for export cap on native
        try {
          if (Platform.OS !== 'web') {
            const maxH = editorFlags.exportMaxHeightPx || 1920;
            const h = story.mediaHeight || 0;
            const w = story.mediaWidth || 0;
            const canManipulate = typeof (ImageManipulator as any)?.manipulateAsync === 'function';
            if (canManipulate && h && w && h > maxH) {
              const ar = w / h;
              const targetH = maxH;
              const targetW = Math.round(ar * targetH);
              const res = await (ImageManipulator as any).manipulateAsync(
                finalMediaUri,
                [{ resize: { width: targetW, height: targetH } }],
                { compress: 0.9, format: (ImageManipulator as any)?.SaveFormat?.JPEG || 'jpeg' }
              );
              if (res?.uri) finalMediaUri = res.uri;
            }
          }
        } catch { }

        console.log('[StoryProcessing] ⬆️ Uploading image to Supabase (signed PUT) v2');
        updateStoryProgress(story.id, 50, 'uploading');
        let uploaded: { mediaURL: string; thumbnailURL: string };
        if (Platform.OS === 'web') {
          try {
            const response = await fetch(finalMediaUri);
            const blob = await response.blob();
            updateStoryProgress(story.id, 60);
            console.log('[StoryProcessing] calling mediaService.uploadStoryMedia');
            uploaded = await mediaService.uploadStoryMedia(user.userId, blob as any);
            console.log('[StoryProcessing] uploadStoryMedia returned');
          } catch (e) {
            console.error('[StoryProcessing] uploadStoryMedia threw', e);
            throw e;
          }
        } else {
          try {
            console.log('[StoryProcessing] calling mediaService.uploadStoryImagePath', { uri: finalMediaUri });
            uploaded = await mediaService.uploadStoryImagePath(user.userId, finalMediaUri);
            console.log('[StoryProcessing] uploadStoryImagePath returned');
          } catch (e) {
            console.error('[StoryProcessing] uploadStoryImagePath threw', e, { hasFn: typeof (mediaService as any)?.uploadStoryImagePath });
            throw e;
          }
        }
        mediaURL = uploaded.mediaURL;
        thumbnailURL = uploaded.thumbnailURL || mediaURL;
        console.log('[StoryProcessing] ✅ Image uploaded', { mediaURL });
        updateStoryProgress(story.id, 95);
      }

      // Finalizing before creating Firestore story
      updateStoryProgress(story.id, 85, 'processing');
      console.log('[StoryProcessing] 🟣 Creating Firestore story...');

      // Create story data
      if (canceledRef.current.has(story.id)) {
        updateStoryProgress(story.id, 0, 'canceled');
        setTimeout(() => removeProcessingStory(story.id), 1500);
        return;
      }
      const hasMediaDims = typeof story.mediaWidth === 'number' && typeof story.mediaHeight === 'number' && (story.mediaWidth || 0) > 0 && (story.mediaHeight || 0) > 0;
      // Compute interactive widgets summary from stickers
      const interactiveTypes = new Set(['poll', 'slider', 'question', 'quiz']);
      const persistableTypes = new Set(['poll', 'slider', 'question', 'quiz', 'mention', 'hashtag', 'time', 'rating']);
      const allStickerTypes = Array.isArray(story.stickers) ? story.stickers.map((s: any) => (s && typeof s.type === 'string') ? s.type : null).filter(Boolean) : [];
      console.log('[StoryProcessing] stickers summary', {
        total: Array.isArray(story.stickers) ? story.stickers.length : 0,
        types: allStickerTypes,
      });
      const interactiveStickers = Array.isArray(story.stickers) ? story.stickers.filter((s: any) => s && typeof s.type === 'string' && interactiveTypes.has(s.type)) : [];
      const persistStickers = Array.isArray(story.stickers) ? story.stickers.filter((s: any) => s && typeof s.type === 'string' && persistableTypes.has(s.type)) : [];
      console.log('[StoryProcessing] interactive types', {
        count: interactiveStickers.length,
        types: Array.from(new Set(interactiveStickers.map((s: any) => s.type))),
      });
      console.log('[StoryProcessing] persistable types', {
        count: persistStickers.length,
        types: Array.from(new Set(persistStickers.map((s: any) => s.type))),
      });

      const rawSettings = (story.storySettings && typeof story.storySettings === 'object') ? story.storySettings : {};
      const [defaultHiddenFrom, defaultCloseFriends] = await Promise.all([
        getDefaultHiddenUsers(user.userId),
        getDefaultCloseFriends(user.userId),
      ]);

      const hiddenFrom = Array.from(new Set(
        (Array.isArray(rawSettings.hiddenFrom) && rawSettings.hiddenFrom.length > 0
          ? rawSettings.hiddenFrom
          : defaultHiddenFrom
        ).filter((id: any) => typeof id === 'string' && id && id !== user.userId)
      ));

      const closeFriends = Array.from(new Set(
        (Array.isArray(rawSettings.closeFriends) && rawSettings.closeFriends.length > 0
          ? rawSettings.closeFriends
          : defaultCloseFriends
        ).filter((id: any) => typeof id === 'string' && id && id !== user.userId)
      ));

      const allowReplies = typeof rawSettings.allowReplies === 'boolean' ? rawSettings.allowReplies : true;
      const allowSharing = typeof rawSettings.allowSharing === 'boolean' ? rawSettings.allowSharing : true;

      const storyData: any = {
        authorId: user.userId,
        authorUsername: user.username,
        authorAvatarURL: user.avatarURL || '',
        authorVerified: user.verified || false,
        mediaURL,
        thumbnailURL,
        mediaWidth: hasMediaDims ? story.mediaWidth : undefined,
        mediaHeight: hasMediaDims ? story.mediaHeight : undefined,
        mediaType: story.mediaType,
        duration: story.mediaType === 'video' ? (processedDurationMs ?? 15000) : 5000,
        audience: story.audience,
        allowReplies,
        allowSharing,
        hiddenFrom,
        closeFriends,
        viewsCount: 0,
        likesCount: 0,
        repliesCount: 0,
        isHighlighted: false,
        positionSpace: hasMediaDims ? 'media' : 'screen',
        version: 'widgets_v2', // Upgraded to v2 for canvasConfig support
        hasWidgets: interactiveStickers.length > 0,
        widgetCount: interactiveStickers.length,
        widgetTypes: Array.from(new Set(interactiveStickers.map((s: any) => String(s.type)))) as string[],
        widgetsVersion: interactiveStickers.length > 0 ? 2 : undefined,
        // Store canvas dimensions for position scaling in viewer
        canvasConfig: story.canvasConfig || { width: 375, height: 667, aspectRatio: 375 / 667 },
      };

      // Only add optional fields if they have values

      if (story.textElements.length > 0) {
        // Ensure text elements have proper positioning data and include transform
        storyData.textElements = story.textElements.map((element: any, idx: number) => {
          const x = (typeof element.x === 'number') ? element.x : (typeof element.initialX === 'number' ? element.initialX : 0.5);
          const y = (typeof element.y === 'number') ? element.y : (typeof element.initialY === 'number' ? element.initialY : 0.5);
          const color = element.color || '#FFFFFF';
          const fontSize = element.fontSize || element.size || 24;
          const scale = (typeof element.scale === 'number') ? element.scale : 1;
          const rotation = (typeof element.rotation === 'number') ? element.rotation : 0; // assume degrees already
          const size = (element.size && typeof element.size.w === 'number' && typeof element.size.h === 'number') ? element.size : undefined;
          const z_index = (typeof element.z_index === 'number') ? element.z_index : idx;
          return {
            id: element.id,
            text: element.text,
            x,
            y,
            color,
            fontSize,
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: 'rgba(0, 0, 0, 0.8) 2px 2px 4px',
            scale,
            rotation,
            size,
            z_index,
            transform: {
              x,
              y,
              w: size?.w,
              h: size?.h,
              rotation,
              z: z_index,
            },
          };
        });
        console.log('💾 Saved text elements:', storyData.textElements);
      }

      if (story.stickers.length > 0) {
        storyData.stickers = story.stickers.map((s: any, idx: number) => {
          const x = (typeof s.x === 'number') ? s.x : 0.5;
          const y = (typeof s.y === 'number') ? s.y : 0.5;
          const rotation = (typeof s.rotation === 'number') ? s.rotation : 0; // degrees
          const size = (s.size && typeof s.size.w === 'number' && typeof s.size.h === 'number') ? s.size : undefined;
          const z_index = (typeof s.z_index === 'number') ? s.z_index : idx;
          return {
            ...s,
            x,
            y,
            size,
            rotation,
            z_index,
            transform: {
              x,
              y,
              w: size?.w,
              h: size?.h,
              rotation,
              z: z_index,
            },
          };
        });
      }

      if (story.drawings.length > 0) {
        storyData.drawings = story.drawings;
      }

      // Attach optional metadata for playback (trim, filters, audio overlay)
      if (typeof story.trimStart === 'number') (storyData as any).trimStart = Math.max(0, Math.floor(story.trimStart));
      if (typeof story.trimEnd === 'number') (storyData as any).trimEnd = Math.max(0, Math.floor(story.trimEnd));
      if (story.filters && (story.filters.brightness != null || story.filters.contrast != null || story.filters.saturation != null)) {
        (storyData as any).filters = story.filters;
      }
      if (story.audioOverlay && story.audioOverlay.uri) {
        (storyData as any).audioOverlay = {
          uri: story.audioOverlay.uri,
          name: story.audioOverlay.name,
          volume: story.audioOverlay.volume ?? 1,
          start: story.audioOverlay.start,
          end: story.audioOverlay.end,
        };
      }

      // Create story
      const createdId = await storyService.createStory(storyData);
      console.log('[StoryProcessing] 🟢 Story created', { id: createdId });
      updateStoryProgress(story.id, 95, 'processing');
      updateStoryProgress(story.id, 100, 'completed');

      // Create widget docs from persistable stickers (interactive + decorative), if any
      try {
        if (persistStickers.length > 0) {
          // Debug: Log the stickers being saved with their style
          console.log('[StoryProcessing] 🧩 persistStickers data:', JSON.stringify(
            persistStickers.map((s: any) => ({
              type: s.type,
              style: s.style,
              contentStyle: s.content?.style,
            })),
            null, 2
          ));
          await storyService.createWidgets(createdId, user.userId, persistStickers);
          console.log('[StoryProcessing] 🧩 Widgets created:', persistStickers.length);
        }
      } catch (e) {
        console.warn('[StoryProcessing] ⚠️ Failed to create widgets subcollection', e);
      }

      // Remove from processing after a short delay
      setTimeout(() => {
        removeProcessingStory(story.id);
      }, 2000);


    } catch (error) {
      console.error('[StoryProcessing] ❌ Failed to process story:', error);
      const wasCanceled = canceledRef.current.has(story.id);
      updateStoryProgress(story.id, 0, wasCanceled ? 'canceled' : 'failed');

      // Remove failed story after delay
      setTimeout(() => {
        removeProcessingStory(story.id);
      }, 2000);


    }
  }, [user, updateStoryProgress, removeProcessingStory, getDefaultHiddenUsers, getDefaultCloseFriends]);

  // Pump the processing queue
  const pumpQueue = useCallback(async () => {
    if (runningRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    runningRef.current = true;
    try {
      await processStoryInBackground(next);
    } finally {
      runningRef.current = false;
      // Continue with next job
      setTimeout(() => { pumpQueue(); }, 0);
    }
  }, [processStoryInBackground]);

  const startStoryProcessing = useCallback((storyData: Omit<ProcessingStory, 'id' | 'progress' | 'status'>) => {
    const id = Date.now().toString();
    const newStory: ProcessingStory = {
      ...storyData,
      id,
      progress: 0,
      status: 'processing'
    };

    setProcessingStories(prev => [...prev, newStory]);
    // Enqueue and pump; ensures single active processing job
    queueRef.current.push(newStory);
    pumpQueue();

    return id;
  }, [pumpQueue]);

  const getProcessingProgress = useCallback(() => {
    if (processingStories.length === 0) return 0;
    const totalProgress = processingStories.reduce((sum, story) => sum + story.progress, 0);
    return Math.round(totalProgress / processingStories.length);
  }, [processingStories]);

  const hasProcessingStories = useCallback(() => {
    return processingStories.length > 0;
  }, [processingStories]);

  const cancelStoryProcessing = useCallback(async (id: string) => {
    canceledRef.current.add(id);
    setProcessingStories(prev => prev.map(story => story.id === id ? { ...story, status: 'canceled' } : story));
    try {
      const Compressor: any = await import('react-native-compressor');
      if (Compressor?.Video?.cancelCompression) {
        await Compressor.Video.cancelCompression();
      }
    } catch { }
  }, []);

  return (
    <StoryProcessingContext.Provider value={{
      processingStories,
      startStoryProcessing,
      getProcessingProgress,
      hasProcessingStories,
      cancelStoryProcessing
    }}>
      {children}
    </StoryProcessingContext.Provider>
  );
}

export function useStoryProcessing() {
  const context = useContext(StoryProcessingContext);
  if (context === undefined) {
    throw new Error('useStoryProcessing must be used within a StoryProcessingProvider');
  }
  return context;
}


