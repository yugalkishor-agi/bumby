import { makeImageFromView } from '@shopify/react-native-skia';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEditorStore, getEditorState } from '../../../stores/editorStore';

export interface ExportOptions {
  format?: 'png' | 'jpg';
  quality?: number; // 0-1
  width?: number;
  height?: number;
  includeMetadata?: boolean;
}

export interface ExportResult {
  success: boolean;
  base64?: string;
  uri?: string;
  format: string;
  metadata?: any;
  fallback?: boolean;
  error?: string;
}

/**
 * Export the story canvas as an image
 * Uses Skia's makeImageFromView as primary method
 * Falls back to react-native-view-shot if Skia fails
 */
export async function exportStoryImage(
  canvasRef: any,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const {
    format = 'jpg',
    quality = 0.9,
    width,
    height,
    includeMetadata = true,
  } = options;

  try {
    // Get store state for metadata (optional chaining for safety)
    const store = getEditorState();
    
    // Try Skia export first (preferred method)
    try {
      console.log('Attempting Skia export...');
      const snapshot = await makeImageFromView(canvasRef);
      
      if (!snapshot) {
        throw new Error('Skia snapshot is null');
      }

      // Encode to base64
      const base64 = snapshot.encodeToBase64();
      
      // Optionally resize if dimensions provided
      let finalBase64 = base64;
      if (width || height) {
        const tempUri = `${FileSystem.cacheDirectory}temp_export.${format}`;
        await FileSystem.writeAsStringAsync(tempUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const resized = await ImageManipulator.manipulateAsync(
          tempUri,
          [{ resize: { width, height } }],
          {
            compress: quality,
            format: format === 'png' 
              ? ImageManipulator.SaveFormat.PNG 
              : ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        finalBase64 = resized.base64 || base64;
        
        // Clean up temp file
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      }

      console.log('Skia export successful');
      
      return {
        success: true,
        base64: finalBase64,
        format: format,
        metadata: includeMetadata ? exportMetadata(store) : undefined,
      };
    } catch (skiaError) {
      console.warn('Skia export failed, trying fallback:', skiaError);
      
      // Fallback to react-native-view-shot
      try {
        console.log('Attempting view-shot fallback export...');
        const uri = await captureRef(canvasRef, {
          format: format,
          quality: quality,
          result: 'tmpfile',
        });

        // Read as base64
        let base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Optionally resize
        if (width || height) {
          const resized = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width, height } }],
            {
              compress: quality,
              format: format === 'png'
                ? ImageManipulator.SaveFormat.PNG
                : ImageManipulator.SaveFormat.JPEG,
              base64: true,
            }
          );

          base64 = resized.base64 || base64;
        }

        // Clean up temp file
        await FileSystem.deleteAsync(uri, { idempotent: true });

        console.log('Fallback export successful');

        return {
          success: true,
          base64,
          uri,
          format: format,
          metadata: includeMetadata ? exportMetadata(store) : undefined,
          fallback: true,
        };
      } catch (fallbackError) {
        console.error('Fallback export also failed:', fallbackError);
        throw fallbackError;
      }
    }
  } catch (error) {
    console.error('Export failed:', error);
    return {
      success: false,
      format: format,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const exportStory = exportStoryImage;

/**
 * Export metadata about the edited story
 * This maintains compatibility with the Konva editor format
 */
export function exportMetadata(store: any) {
  return {
    version: '1.0',
    editor: 'native-skia',
    timestamp: Date.now(),
    canvas: {
      width: store.canvasWidth || 1080,
      height: store.canvasHeight || 1920,
      backgroundImage: store.backgroundImage,
    },
    elements: store.elements.map(element => ({
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
      scale: element.scale,
      zIndex: element.zIndex,
      opacity: element.opacity,
      locked: element.locked,
      // Type-specific properties
      ...(element.type === 'text' && {
        text: element.text,
        fontSize: element.fontSize,
        fontFamily: element.fontFamily,
        color: element.color,
        backgroundColor: element.backgroundColor,
        textAlign: element.textAlign,
        fontWeight: element.fontWeight,
        textShadow: element.textShadow,
      }),
      ...(element.type === 'drawing' && {
        paths: element.paths,
        brushType: element.brushType,
        brushSize: element.brushSize,
        brushColor: element.brushColor,
        points: element.points,
      }),
      ...(element.type === 'sticker' && {
        emoji: element.emoji,
        fontSize: element.fontSize,
      }),
      ...(element.type === 'gifSticker' && {
        gifUrl: element.gifUrl,
        thumbnailUrl: element.thumbnailUrl,
        aspectRatio: element.aspectRatio,
      }),
      ...(element.type === 'widget' && {
        widgetType: element.widgetType,
        config: element.config,
      }),
    })),
    filters: {
      brightness: store.filters.brightness,
      contrast: store.filters.contrast,
      saturation: store.filters.saturation,
      blur: store.filters.blur,
      temperature: store.filters.temperature,
    },
  };
}

/**
 * Export to file system (for saving drafts)
 */
export async function exportToFile(
  canvasRef: any,
  filename: string,
  options: ExportOptions = {}
): Promise<string | null> {
  try {
    const result = await exportStory(canvasRef, options);
    
    if (!result.success || !result.base64) {
      throw new Error(result.error || 'Export failed');
    }

    const filepath = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(filepath, result.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Exported to file:', filepath);
    return filepath;
  } catch (error) {
    console.error('Export to file failed:', error);
    return null;
  }
}

/**
 * Export with compression optimization
 * Useful for uploading to server
 */
export async function exportCompressed(
  canvasRef: any,
  targetSizeKB: number = 500
): Promise<ExportResult> {
  // Start with high quality
  let quality = 0.9;
  let result = await exportStory(canvasRef, { quality, format: 'jpg' });

  if (!result.success || !result.base64) {
    return result;
  }

  // Calculate size in KB
  let sizeKB = (result.base64.length * 3) / 4 / 1024;

  // Reduce quality until size target is met
  while (sizeKB > targetSizeKB && quality > 0.3) {
    quality -= 0.1;
    result = await exportStory(canvasRef, { quality, format: 'jpg' });
    
    if (!result.success || !result.base64) {
      break;
    }
    
    sizeKB = (result.base64.length * 3) / 4 / 1024;
    console.log(`Compression attempt: quality=${quality.toFixed(1)}, size=${sizeKB.toFixed(1)}KB`);
  }

  return result;
}

/**
 * Quick preview export (low quality, fast)
 */
export async function exportPreview(canvasRef: any): Promise<ExportResult> {
  return await exportStory(canvasRef, {
    format: 'jpg',
    quality: 0.6,
    width: 540, // Half resolution
  });
}
