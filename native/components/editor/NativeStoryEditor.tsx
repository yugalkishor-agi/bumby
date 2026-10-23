import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Text,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEditorStore, getEditorState } from '../../stores/editorStore';
import { SkiaCanvasEditor } from './SkiaCanvas/SkiaCanvasEditor';
import { EditorHeader } from './UI/EditorHeader';
import { EditorToolbar } from './UI/EditorToolbar';
import { TextTool } from './Tools/TextTool';
import { DrawingTool } from './Tools/DrawingTool';
import { StickerTool } from './Tools/StickerTool';
import { FilterTool } from './Tools/FilterTool';
import { WidgetTool } from './Tools/WidgetTool';
import { exportStory as exportStoryImage, exportMetadata } from './SkiaCanvas/SkiaExporter';

interface NativeStoryEditorProps {
  visible: boolean;
  mediaUri: string;
  mediaType: 'image' | 'video';
  onSave: (result: ExportResult) => void;
  onCancel: () => void;
  giphyApiKey?: string;
}

export interface ExportResult {
  type: 'image' | 'video';
  dataUrl?: string;
  uri?: string;
  meta: {
    elements: any[];
    filters: any;
    canvas: {
      width: number;
      height: number;
    };
  };
}

export function NativeStoryEditor({
  visible,
  mediaUri,
  mediaType,
  onSave,
  onCancel,
}: NativeStoryEditorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [preparedImageUri, setPreparedImageUri] = useState<string | null>(null);
  const canvasRef = useRef<any>(null);

  const activeTool = useEditorStore(state => state.activeTool);
  const reset = useEditorStore(state => state.reset);
  const setBackgroundImage = useEditorStore(state => state.setBackgroundImage);
  const setActiveTool = useEditorStore(state => state.setActiveTool);

  // Prepare image when modal opens
  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;

    const prepareImage = async () => {
      try {
        setIsLoading(true);

        // For video, we'll handle it differently later
        if (mediaType === 'video') {
          setPreparedImageUri(mediaUri);
          setBackgroundImage(mediaUri, 1080, 1920);
          setIsLoading(false);
          return;
        }

        // Compress and resize image for better performance
        const result = await ImageManipulator.manipulateAsync(
          mediaUri,
          [
            {
              resize: {
                width: 1080, // Standard story width
              },
            },
          ],
          {
            compress: 0.9,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

        if (cancelled) return;

        setPreparedImageUri(result.uri);
        setBackgroundImage(result.uri, result.width, result.height);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to prepare image:', error);
        Alert.alert('Error', 'Failed to load image for editing');
        onCancel();
      }
    };

    prepareImage();

    return () => {
      cancelled = true;
    };
  }, [visible, mediaUri, mediaType]);

  // Reset store when modal closes
  useEffect(() => {
    if (!visible) {
      reset();
      setPreparedImageUri(null);
    }
  }, [visible]);

  const handleClose = () => {
    if (isExporting) return;

    Alert.alert(
      'Discard Changes?',
      'Are you sure you want to discard your edits?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: onCancel,
        },
      ]
    );
  };

  const handleSave = async () => {
    if (isExporting) return;

    try {
      setIsExporting(true);

      // Export will be implemented in SkiaExporter
      const result = await exportStory();

      onSave(result);
    } catch (error) {
      console.error('Failed to export story:', error);
      Alert.alert('Error', 'Failed to export story. Please try again.');
      setIsExporting(false);
    }
  };

  // Placeholder export function - will be implemented with SkiaExporter
  const exportStory = async (): Promise<ExportResult> => {
    const store = getEditorState();

    try {
      // Use Skia exporter
      const exportResult = await exportStoryImage(canvasRef.current, {
        format: 'jpg',
        quality: 0.9,
        includeMetadata: true,
      });

      if (!exportResult.success || !exportResult.base64) {
        throw new Error(exportResult.error || 'Export failed');
      }

      // Convert base64 to data URL
      const dataUrl = `data:image/jpeg;base64,${exportResult.base64}`;

      return {
        type: 'image',
        dataUrl,
        meta: {
          elements: store.elements,
          filters: store.filters,
          canvas: {
            width: store.canvasWidth,
            height: store.canvasHeight,
          },
          ...exportResult.metadata,
        },
      };
    } catch (error) {
      console.error('Export error:', error);
      
      // Fallback: return basic result with original image
      return {
        type: 'image',
        dataUrl: preparedImageUri || '',
        meta: {
          elements: store.elements,
          filters: store.filters,
          canvas: {
            width: store.canvasWidth,
            height: store.canvasHeight,
          },
        },
      };
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          {/* Header */}
          <EditorHeader onClose={handleClose} onSave={handleSave} />

          {/* Canvas */}
          <View style={styles.canvasContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#EC4899" />
                <Text style={styles.loadingText}>Preparing editor...</Text>
              </View>
            ) : preparedImageUri ? (
              <SkiaCanvasEditor imageUri={preparedImageUri} ref={canvasRef} />
            ) : null}
          </View>

          {/* Toolbar */}
          {!isLoading && <EditorToolbar />}

          {/* Tool Panels */}
          {activeTool === 'text' && <TextTool />}
          {activeTool === 'draw' && <DrawingTool />}
          {activeTool === 'sticker' && <StickerTool />}
          {activeTool === 'filter' && <FilterTool />}
          {activeTool === 'widget' && <WidgetTool onClose={() => setActiveTool('none')} />}

          {/* Export Overlay */}
          {isExporting && (
            <View style={styles.exportOverlay}>
              <ActivityIndicator size="large" color="#EC4899" />
              <Text style={styles.exportText}>Exporting story...</Text>
            </View>
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  exportOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 1000,
  },
  exportText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
