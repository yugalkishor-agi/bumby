import React from 'react';
import { View, Text} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { WidgetPoll, WidgetPollProps } from './WidgetStaticPoll';
import { WidgetSlider, WidgetSliderProps } from './WidgetStaticSlider';
import { WidgetQuestion, WidgetQuestionProps } from './WidgetStaticQuestion';
import { WidgetQuiz, WidgetQuizProps } from './WidgetStaticQuiz';
import { WidgetStaticMention } from './WidgetStaticMention';
import { WidgetStaticHashtag } from './WidgetStaticHashtag';
import { WidgetStaticTime } from './WidgetStaticTime';
import { WidgetStyleOptions, sharedWidgetStyles } from './styles';
import { Image } from 'expo-image';

export type OverlayStickerType = 'emoji' | 'label' | 'gif' | 'location' | 'mention' | 'hashtag' | 'poll' | 'slider' | 'question' | 'quiz' | 'countdown' | 'time' | 'reshare' | 'rating';

export interface StoryWidgetProps {
    type: string | OverlayStickerType;
    content: any;
    style?: WidgetStyleOptions;

    // Interactive Props
    isInteractive?: boolean;
    isPaused?: boolean;
    // Callbacks passed down
    onVote?: (index: number) => void;
    myVote?: number | null;
    pollResults?: any;

    onSliderChange?: (val: number) => void;
    sliderValue?: number | null;
    sliderStats?: any;

    onQuizAnswer?: (index: number) => void;
    myQuizAnswer?: number | null;
    quizResults?: any;

    onQuestionPress?: () => void;
    onQuestionSubmit?: (text: string) => void;
    questionCount?: number;
    isOwnStory?: boolean;
    onViewReplies?: () => void;
}

/**
 * Unified Dispatcher Component for all Story Widgets.
 * Ensures consistent rendering between Editor, Viewer, and Export.
 */
export function StoryWidget({
    type,
    content,
    style,
    isInteractive = false,
    isPaused = false,
    ...props
}: StoryWidgetProps) {
    const combinedStyle = style || (typeof content === 'object' ? content.style : undefined);
    const normalizedType = (type || 'label') as string;
    const asString = (value: any) => (typeof value === 'string' ? value : '');
    const extractMedia = (value: any) => {
        const result: { imageUri: string; mp4Uri: string } = { imageUri: '', mp4Uri: '' };
        if (typeof value === 'string') {
            if (value.trim().toLowerCase().endsWith('.mp4')) {
                result.mp4Uri = value.trim();
            } else {
                result.imageUri = value.trim();
            }
            return result;
        }
        if (!value || typeof value !== 'object') return result;

        if (typeof value.mp4Url === 'string' && value.mp4Url.trim()) result.mp4Uri = value.mp4Url.trim();
        else if (typeof value.mp4 === 'string' && value.mp4.trim()) result.mp4Uri = value.mp4.trim();
        else if (typeof value.videoUrl === 'string' && value.videoUrl.trim()) result.mp4Uri = value.videoUrl.trim();
        else if (typeof value.video === 'string' && value.video.trim()) result.mp4Uri = value.video.trim();

        if (typeof value.url === 'string' && value.url.trim()) result.imageUri = value.url.trim();
        else if (typeof value.src === 'string' && value.src.trim()) result.imageUri = value.src.trim();
        else if (typeof value.imageUrl === 'string' && value.imageUrl.trim()) result.imageUri = value.imageUrl.trim();
        else if (typeof value.gifUrl === 'string' && value.gifUrl.trim()) result.imageUri = value.gifUrl.trim();

        if (!result.mp4Uri && result.imageUri.toLowerCase().endsWith('.mp4')) {
            result.mp4Uri = result.imageUri;
            result.imageUri = '';
        }
        return result;
    };
    const normalizeMentionHandle = (value: any) => {
        const raw = typeof value === 'object'
            ? (value?.handle || value?.username || '')
            : String(value || '');
        return String(raw).replace(/^@+/, '');
    };
    const normalizeHashtag = (value: any) => {
        const raw = typeof value === 'object'
            ? (value?.tag || value?.text || '')
            : String(value || '');
        return String(raw).replace(/^#+/, '');
    };

    switch (normalizedType) {
        case 'poll':
            return (
                <WidgetPoll
                    data={typeof content === 'object' ? content : { question: String(content || 'Poll') }}
                    style={combinedStyle}
                    isInteractive={isInteractive}
                    onVote={props.onVote}
                    myVote={props.myVote}
                    results={props.pollResults}
                />
            );

        case 'slider':
            return (
                <WidgetSlider
                    data={typeof content === 'object' ? content : { question: String(content || 'Rate') }}
                    style={combinedStyle}
                    isInteractive={isInteractive}
                    value={props.sliderValue ?? 0}
                    onValueChange={props.onSliderChange}
                    stats={props.sliderStats}
                />
            );

        case 'question':
            return (
                <View style={{ opacity: isInteractive ? 1 : 1 }}>
                    <WidgetQuestion
                        data={typeof content === 'object' ? content : { text: String(content || 'Ask me anything') }}
                        style={combinedStyle}
                        isInteractive={isInteractive}
                        questionCount={props.questionCount}
                        isOwnStory={props.isOwnStory}
                        onViewReplies={props.onViewReplies}
                        onPress={props.onQuestionPress}
                    />
                </View>
            );

        case 'quiz':
            return (
                <WidgetQuiz
                    data={typeof content === 'object' ? content : { question: String(content || 'Quiz') }}
                    style={combinedStyle}
                    isInteractive={isInteractive}
                    onAnswer={props.onQuizAnswer}
                    myAnswer={props.myQuizAnswer}
                    results={props.quizResults}
                />
            );

        case 'mention':
            return (
                <WidgetStaticMention data={{ handle: normalizeMentionHandle(content) }} />
            );

        case 'hashtag':
            return (
                <WidgetStaticHashtag data={{ tag: normalizeHashtag(content) }} />
            );

        case 'time':
            return <WidgetStaticTime data={{ format: content?.format || 'time' }} />;

        case 'emoji':
            return <Text style={sharedWidgetStyles.emoji} numberOfLines={1} adjustsFontSizeToFit>{content}</Text>;

        case 'gif': {
            const media = extractMedia(content);
            if (!media.imageUri && !media.mp4Uri) {
                return (
                    <View style={sharedWidgetStyles.label}>
                        <Text style={sharedWidgetStyles.labelText}>GIF</Text>
                    </View>
                );
            }
            if (media.mp4Uri) {
                return (
                    <View style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.12)' }}>
                        <Video
                            source={{ uri: media.mp4Uri }}
                            style={{ width: '100%', height: '100%' }}
                            shouldPlay={!isPaused}
                            isMuted
                            isLooping
                            resizeMode={ResizeMode.COVER}
                        />
                    </View>
                );
            }
            return (
                <Image
                    source={{ uri: media.imageUri }}
                    style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
                    contentFit="contain"
                />
            );
        }

        case 'label':
            return <View style={sharedWidgetStyles.label}><Text style={sharedWidgetStyles.labelText}>{content}</Text></View>;

        case 'location':
            return (
                <View style={sharedWidgetStyles.badge}>
                    <Text style={sharedWidgetStyles.badgeText}>{typeof content === 'string' ? content : content?.name || ''}</Text>
                </View>
            );

        case 'reshare':
            return (
                <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 12, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: 'white', fontWeight: '700' }}>↻</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: 'white', fontWeight: '700' }}>Reshare</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>{content?.postId || 'Post'}</Text>
                    </View>
                </View>
            );

        case 'rating': {
            const text = typeof content === 'object' ? (content?.text || 'Rate this') : (asString(content) || 'Rate this');
            return (
                <View style={sharedWidgetStyles.label}>
                    <Text style={sharedWidgetStyles.labelText}>{text}</Text>
                </View>
            );
        }

        case 'countdown':
            return (
                <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#111', fontWeight: '700' }}>
                        {typeof content === 'string' ? content : 'Countdown'}
                    </Text>
                </View>
            );

        default:
            if (typeof content === 'object') {
                const media = extractMedia(content);
                if (media.mp4Uri) {
                    return (
                        <View style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.12)' }}>
                            <Video
                                source={{ uri: media.mp4Uri }}
                                style={{ width: '100%', height: '100%' }}
                                shouldPlay={!isPaused}
                                isMuted
                                isLooping
                                resizeMode={ResizeMode.COVER}
                            />
                        </View>
                    );
                }
                if (media.imageUri) {
                    return (
                        <Image
                            source={{ uri: media.imageUri }}
                            style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
                            contentFit="contain"
                        />
                    );
                }
            }
            if (typeof content === 'string') {
                return <View style={sharedWidgetStyles.label}><Text style={sharedWidgetStyles.labelText}>{content}</Text></View>;
            }
            return null;
    }
}
