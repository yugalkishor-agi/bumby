/**
 * StoryOverlayRenderer.tsx
 * 
 * Unified component for rendering story overlays (text, stickers, widgets, drawings).
 * Used by both StoryViewerScreenEnhanced (interactive) and NativeStoryRenderer (static export).
 * 
 * ALIGNMENT: Matches DraggableSticker (Editor) styles via sharedWidgetStyles.
 */

import React, { useMemo, useState } from 'react';
import { STORY_CANVAS, CanvasConfig, getDefaultCanvasConfig } from '../../constants/storyCanvas';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Dimensions} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

// Widget components
import { StoryWidget } from './widgets/StoryWidget';

// Shared styles for 100% consistency
import { sharedWidgetStyles, widgetColors, WidgetStyleOptions } from './widgets/styles';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Re-export for external usage
export type { WidgetStyleOptions };

export interface OverlayTextElement {
    id: string;
    text: string;
    x?: number;
    y?: number;
    transform?: {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        rotation?: number;
        z?: number;
    };
    size?: { w?: number; h?: number };
    scale?: number;
    rotation?: number;
    z_index?: number;
    color?: string;
    fontSize?: number;
    fontWeight?: string;
    textAlign?: string;
    backgroundColor?: string;
}

export interface OverlaySticker {
    id: string;
    type: 'emoji' | 'label' | 'gif' | 'location' | 'mention' | 'hashtag' | 'poll' | 'slider' | 'question' | 'quiz' | 'countdown' | 'time' | 'reshare' | 'rating';
    kind?: string;
    content: any;
    x?: number;
    y?: number;
    transform?: {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        rotation?: number;
        z?: number;
        scale?: number;
    };
    size?: { w?: number; h?: number };
    scale?: number;
    rotation?: number;
    z_index?: number;
    options?: string[];
    date?: any;

    // Style customization
    style?: WidgetStyleOptions;
}

export interface OverlayDrawing {
    id: string;
    svgData: string;
}

export interface StoryOverlayRendererProps {
    containerWidth: number;
    containerHeight: number;
    mediaWidth?: number;
    mediaHeight?: number;
    positionSpace?: 'screen' | 'media';
    // Canvas config from editor for proper scaling
    canvasConfig?: CanvasConfig;

    textElements?: OverlayTextElement[];
    stickers?: OverlaySticker[];
    drawings?: OverlayDrawing[];

    // Interactive mode props
    isInteractive?: boolean;
    isPaused?: boolean;
    isOwnStory?: boolean;

    // Poll interaction
    pollResults?: Record<string, { counts: number[]; total: number }>;
    myPollVote?: Record<string, number | null>;
    onPollVote?: (stickerId: string, optionIndex: number) => void;

    // Slider interaction
    sliderStats?: Record<string, { avg: number; count: number }>;
    mySliderValue?: Record<string, number | null>;
    onSliderSet?: (stickerId: string, value: number) => void;
    sliderWidths?: Record<string, number>;
    onSliderLayout?: (stickerId: string, width: number) => void;

    // Quiz interaction
    quizResults?: Record<string, { counts: number[]; total: number }>;
    myQuizAnswer?: Record<string, number | null>;
    onQuizAnswer?: (stickerId: string, optionIndex: number) => void;

    // Question interaction
    questionCounts?: Record<string, number>;
    activeQuestion?: { stickerId: string | null; text: string };
    onQuestionPress?: (stickerId: string) => void;
    onQuestionTextChange?: (text: string) => void;
    onQuestionSubmit?: (stickerId: string) => void;
    onQuestionCancel?: () => void;
    onViewQuestionReplies?: (stickerId: string) => void;
}

/**
 * Calculate the render area for the canvas within the container.
 * This accounts for aspect ratio differences between the editor canvas and viewer screen.
 */
function calculateCanvasRenderArea(
    containerWidth: number,
    containerHeight: number,
    canvasConfig: CanvasConfig
): { renderW: number; renderH: number; leftPad: number; topPad: number } {
    const containerAspect = containerWidth / containerHeight;
    const canvasAspect = canvasConfig.width / canvasConfig.height;

    let renderW: number, renderH: number, leftPad = 0, topPad = 0;

    if (containerAspect > canvasAspect) {
        // Container is wider - letterbox on sides
        renderH = containerHeight;
        renderW = renderH * canvasAspect;
        leftPad = (containerWidth - renderW) / 2;
    } else {
        // Container is taller - letterbox on top/bottom  
        renderW = containerWidth;
        renderH = renderW / canvasAspect;
        topPad = (containerHeight - renderH) / 2;
    }

    return { renderW, renderH, leftPad, topPad };
}

/**
 * Calculate widget position strictly in CANVAS coordinates.
 * The entire canvas will be scaled to fit the screen, so we don't need to do screen math here.
 */
function calculatePositionInCanvas(
    element: { x?: number; y?: number; transform?: any; size?: any; scale?: number },
    canvasConfig: CanvasConfig,
    defaultW = 0.3,
    defaultH = 0.12,
    anchor: 'center' | 'topLeft' = 'center'
) {
    const xv = element?.transform?.x ?? element.x ?? 0.5;
    const yv = element?.transform?.y ?? element.y ?? 0.5;

    // Width/Height logic:
    // If transform.w/h exists (from Editor), use it.
    // If normalized (0-1), multiply by canvas dimensions.
    // If > 1, it's already pixels.
    let w = element?.transform?.w ?? element.size?.w;
    let h = element?.transform?.h ?? element.size?.h;

    // Fallback to defaults (normalized) if undefined
    if (w === undefined) w = defaultW;
    if (h === undefined) h = defaultH;

    // Convert normalized dimensions to canvas pixels if needed
    let pixW = w;
    let pixH = h;

    // Heuristic: If value is small (< 2), treat as normalized. Canvas is usually > 300px.
    if (w <= 2) pixW = w * canvasConfig.width;
    if (h <= 2) pixH = h * canvasConfig.height;

    // Rotation and Scale
    const rotation = element?.transform?.rotation ?? (element as any).rotation ?? 0;
    const scale = element?.transform?.scale ?? element.scale ?? 1;
    const zIndex = element?.transform?.z ?? (element as any).z_index ?? 1;

    // Position (Center based)  
    // If coordinates are normalized, convert to pixels
    let pixX = xv;
    let pixY = yv;

    if (xv <= 2) pixX = xv * canvasConfig.width;
    if (yv <= 2) pixY = yv * canvasConfig.height;

    // IMPORTANT: Widget x,y are CENTER positions from editor!
    // React Native positioning uses top-left, so we keep center coords
    // and use transform: translate(-50%, -50%) in the rendering layer
    if (anchor === 'topLeft') {
        pixX = pixX + (pixW / 2);
        pixY = pixY + (pixH / 2);
    }

    return {
        left: pixX,  // Center X position
        top: pixY,   // Center Y position  
        width: pixW,
        height: pixH,
        rotation,
        scale,
        zIndex
    };
}

/**
 * Compute widget container and text styles based on style options
 */
function getWidgetContainerStyle(styleOptions?: WidgetStyleOptions) {
    const theme = styleOptions?.theme || 'light';
    const stylePreset = styleOptions?.stylePreset as 'neon' | 'pastel' | 'dark' | 'minimal' | undefined;
    const opacity = styleOptions?.opacity ?? 1;
    const customBg = styleOptions?.backgroundColor;
    const customTextColor = styleOptions?.textColor;
    const borderRadius = styleOptions?.borderRadius ?? 16;

    // Base styles by theme - use stylePreset for exact web editor matching
    let containerBg: string;
    let textColor: string;
    let optionBg: string;
    let optionTextColor: string;
    let isDark: boolean = false; // Track if effective style is dark

    // If stylePreset is available, use it for exact matching
    // Otherwise fall back to theme-based styling for backward compatibility
    if (stylePreset) {
        // Match web editor themeColors exactly
        switch (stylePreset) {
            case 'neon':
                containerBg = customBg || 'rgba(0,0,0,0.6)';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.15)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
            case 'dark':
                containerBg = customBg || 'rgba(0,0,0,0.75)';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.15)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
            case 'minimal':
                containerBg = customBg || 'rgba(255,255,255,0.85)';
                textColor = customTextColor || '#111111';
                optionBg = 'rgba(0,0,0,0.08)';
                optionTextColor = '#111111';
                isDark = false;
                break;
            case 'pastel':
            default:
                containerBg = customBg || 'rgba(0,0,0,0.55)';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.15)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
        }
    } else {
        // Fallback: use theme for backward compatibility with old data
        switch (theme) {
            case 'dark':
                containerBg = customBg || 'rgba(0,0,0,0.75)';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.15)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
            case 'glass':
                containerBg = customBg || 'rgba(255,255,255,0.25)';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.2)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
            case 'gradient':
                containerBg = customBg || 'transparent';
                textColor = customTextColor || '#FFFFFF';
                optionBg = 'rgba(255,255,255,0.2)';
                optionTextColor = '#FFFFFF';
                isDark = true;
                break;
            case 'light':
            default:
                containerBg = customBg || '#FFFFFF';
                textColor = customTextColor || '#111111';
                optionBg = '#F3F4F6';
                optionTextColor = '#111111';
                isDark = false;
                break;
        }
    }

    return {
        container: {
            backgroundColor: containerBg,
            borderRadius,
            padding: 12,
            minWidth: 220,
            opacity,
            // Glass effect
            ...(theme === 'glass' ? {
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.3)',
            } : {}),
            // Shadow for minimal/light theme
            ...(!isDark ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 3,
            } : {}),
        },
        title: {
            color: textColor,
            fontWeight: '700' as const,
            fontSize: 14,
            marginBottom: 10,
        },
        optionContainer: {
            backgroundColor: optionBg,
            borderRadius: 12,
            overflow: 'hidden' as const,
        },
        optionText: {
            color: optionTextColor,
            fontWeight: '600' as const,
            fontSize: 14,
        },
        subText: {
            color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280',
            fontSize: 12,
        },
        theme: isDark ? 'dark' : 'light', // Return effective theme
        isDark, // Direct boolean for easy checking
        isGradient: theme === 'gradient',
    };
}



export function StoryOverlayRenderer({
    containerWidth,
    containerHeight,
    mediaWidth,
    mediaHeight,
    positionSpace = 'screen',
    canvasConfig = getDefaultCanvasConfig(),
    textElements = [],
    stickers = [],
    drawings = [],
    isInteractive = false,
    isPaused = false,
    isOwnStory = false,
    pollResults = {},
    myPollVote = {},
    onPollVote,
    sliderStats = {},
    mySliderValue = {},
    onSliderSet,
    sliderWidths = {},
    onSliderLayout,
    quizResults = {},
    myQuizAnswer = {},
    onQuizAnswer,
    questionCounts = {},
    activeQuestion = { stickerId: null, text: '' },
    onQuestionPress,
    onQuestionTextChange,
    onQuestionSubmit,
    onQuestionCancel,
    onViewQuestionReplies,
}: StoryOverlayRendererProps) {
    // ----------------------------------------------------------------------
    // Compute Scale Factor to fit Canvas into Container (CONTAIN mode)
    // ----------------------------------------------------------------------
    const { scale, translateX, translateY } = useMemo(() => {
        const containerAspect = containerWidth / containerHeight;
        const canvasAspect = canvasConfig.width / canvasConfig.height;
        let s = 1;

        if (containerAspect > canvasAspect) {
            // Container is wider -> fit by height
            s = containerHeight / canvasConfig.height;
        } else {
            // Container is taller -> fit by width
            s = containerWidth / canvasConfig.width;
        }

        // Center the canvas
        // Note: transform origin in RN is center by default usually, but we are explicit
        return { scale: s, translateX: 0, translateY: 0 };
    }, [containerWidth, containerHeight, canvasConfig]);

    const renderTextElement = (element: OverlayTextElement, index: number) => {
        const pos = calculatePositionInCanvas(element, canvasConfig, 0.6, 0.1);
        return (
            <View
                key={element.id || index}
                style={[
                    styles.overlayElement,
                    {
                        left: pos.left,
                        top: pos.top,
                        width: pos.width,
                        zIndex: pos.zIndex,
                        transform: [
                            { translateX: -(pos.width / 2) },
                            { translateY: -(pos.height / 2) },
                            { rotateZ: `${pos.rotation}deg` },
                            { scale: pos.scale }
                        ],
                    },
                ]}
            >
                <Text
                    style={[
                        styles.overlayText,
                        {
                            color: element.color || '#FFFFFF',
                            fontSize: element.fontSize || 24,
                            fontWeight: (element.fontWeight as any) || 'bold',
                            textAlign: (element.textAlign as any) || 'center',
                            backgroundColor: element.backgroundColor || 'transparent',
                        },
                    ]}
                >
                    {element.text}
                </Text>
            </View>
        );
    };

    const renderSticker = (sticker: OverlaySticker, index: number) => {
        const type = String(sticker.type || sticker.kind || '').toLowerCase();
        let defaultW = 0.3;
        let defaultH = 0.12;
        if (type === 'poll' || type === 'quiz') { defaultW = 0.85; defaultH = 0.32; }
        else if (type === 'question') { defaultW = 0.85; defaultH = 0.18; }
        else if (type === 'slider' || type === 'rating') { defaultW = 0.85; defaultH = 0.16; }
        else if (type === 'mention' || type === 'hashtag' || type === 'time') { defaultW = 0.42; defaultH = 0.09; }

        const explicitAnchor = String((sticker as any)?.transform?.anchor || (sticker as any)?.anchor || '').toLowerCase();
        const hasExplicitSize = (typeof (sticker as any)?.transform?.w === 'number') || (typeof (sticker as any)?.transform?.h === 'number')
            || (typeof (sticker as any)?.size?.w === 'number') || (typeof (sticker as any)?.size?.h === 'number');
        const isWidgetType = ['poll', 'slider', 'question', 'quiz', 'mention', 'hashtag', 'time', 'rating'].includes(type);
        // Backward compatibility: older exports stored widget x/y as top-left without size.
        const inferredTopLeft = !explicitAnchor && isWidgetType && !hasExplicitSize;
        const anchorMode: 'center' | 'topLeft' = (explicitAnchor.includes('top') || inferredTopLeft) ? 'topLeft' : 'center';

        const pos = calculatePositionInCanvas(sticker, canvasConfig, defaultW, defaultH, anchorMode);
        return (
            <View
                key={sticker.id || index}
                style={[
                    styles.overlayElement,
                    {
                        left: pos.left,
                        top: pos.top,
                        width: pos.width,
                        height: pos.height,
                        zIndex: pos.zIndex,
                        // Align with Editor: Editor exports Top-Left coordinates/pivot.
                        // React Native rotates around center by default. If exact pivot matching is needed for rotation,
                        // we would need offset adjustments, but for position parity, this is correct.
                        transform: [
                            { translateX: -(pos.width / 2) },
                            { translateY: -(pos.height / 2) },
                            { rotate: `${pos.rotation}deg` },
                            { scale: pos.scale }
                        ],
                    },
                ]}
            >
                {renderStickerContent(sticker, type, pos)}
            </View>
        );
    };

    const renderStickerContent = (sticker: OverlaySticker, type: string | undefined, pos: any) => {
        return (
            <StoryWidget
                type={type as any}
                content={sticker.content}
                style={sticker.style || (typeof sticker.content === 'object' ? sticker.content.style : undefined)}
                isInteractive={isInteractive}
                isPaused={isPaused}

                // Poll
                onVote={(idx) => onPollVote?.(sticker.id, idx)}
                myVote={myPollVote?.[sticker.id]}
                pollResults={pollResults?.[sticker.id]}

                // Slider
                onSliderChange={(val) => onSliderSet?.(sticker.id, val)}
                sliderValue={mySliderValue?.[sticker.id]}
                sliderStats={sliderStats?.[sticker.id]}

                // Quiz
                onQuizAnswer={(idx) => onQuizAnswer?.(sticker.id, idx)}
                myQuizAnswer={myQuizAnswer?.[sticker.id]}
                quizResults={quizResults?.[sticker.id]}

                // Question
                questionCount={questionCounts?.[sticker.id] ?? 0}
                isOwnStory={isOwnStory}
                onViewReplies={() => onViewQuestionReplies?.(sticker.id)}
                onQuestionPress={() => onQuestionPress?.(sticker.id)}
                onQuestionSubmit={(_text) => onQuestionSubmit?.(sticker.id)}
            />
        );
    };

    const renderDrawing = (draw: OverlayDrawing) => (
        <SvgXml key={draw.id} xml={draw.svgData} style={styles.drawingOverlay} pointerEvents="none" />
    );

    const renderQuestionInput = () => {
        if (!activeQuestion?.stickerId) return null;

        // Find the active sticker to display its question text
        const activeSticker = stickers.find(s => s.id === activeQuestion.stickerId);
        const questionText = activeSticker?.content?.text || activeSticker?.content?.question || "Ask me anything";

        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 999 }]}>
                <View style={{ width: '80%', padding: 20, backgroundColor: 'white', borderRadius: 16 }}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.questionAvatar, { backgroundColor: '#ddd' }]} />
                        <Text style={{ fontWeight: '600', color: '#000', flex: 1 }}>{questionText}</Text>
                    </View>

                    <TextInput
                        style={{
                            backgroundColor: '#f3f4f6',
                            borderRadius: 12,
                            padding: 12,
                            minHeight: 100,
                            textAlignVertical: 'top',
                            fontSize: 16,
                            marginTop: 10
                        }}
                        placeholder="Type your answer..."
                        value={activeQuestion.text}
                        onChangeText={onQuestionTextChange}
                        multiline
                        autoFocus
                    />

                    <View style={styles.questionActions}>
                        <TouchableOpacity onPress={onQuestionCancel}>
                            <Text style={styles.questionCancel}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onQuestionSubmit?.(activeQuestion.stickerId!)}
                            disabled={!activeQuestion.text.trim()}
                        >
                            <Text style={[styles.questionSend, { opacity: activeQuestion.text.trim() ? 1 : 0.5 }]}>Send</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="box-none">
            {/* The Scaled Canvas Container */}
            <View
                style={{
                    width: canvasConfig.width,
                    height: canvasConfig.height,
                    transform: [{ scale }],
                    // Debug background to see canvas bounds
                    // backgroundColor: 'rgba(255,0,0,0.1)', 
                }}
            >
                {/* Draw layer (lowest) */}
                {drawings.map(renderDrawing)}

                {/* Render text elements */}
                {textElements.map(renderTextElement)}

                {/* Render stickers/widgets */}
                {stickers.map(renderSticker)}
            </View>

            {/* Top Level Overlays */}
            {isInteractive && renderQuestionInput()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { ...StyleSheet.absoluteFillObject },
    overlayElement: { position: 'absolute' },
    overlayText: {
        textShadowColor: 'rgba(0, 0, 0, 0.8)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
    },
    gifVideo: { width: '100%', height: '100%' },
    drawingOverlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
    pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
    questionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    questionAvatar: { width: 24, height: 24, borderRadius: 12 },
    questionActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 12 },
    questionCancel: { fontWeight: '600' },
    questionSend: { color: '#0af', fontWeight: '700' },
});

export default StoryOverlayRenderer;
