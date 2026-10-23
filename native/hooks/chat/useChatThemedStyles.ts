import { useMemo } from 'react';
import type { StyleProp, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { getChatAccentForeground, getChatAccentForegroundMuted } from '../../constants/chat';

type NamedStyles = Record<string, any>;

type Params<T extends NamedStyles> = {
  styles: T;
  themeAccent: string;
  isCompactScreen: boolean;
  messageMaxWidthPx: number;
  pollLocationWidth: string;
  pollLocationMaxWidth: number;
  mediaBubbleWidth: number;
};

export function useChatThemedStyles<T extends NamedStyles>({
  styles,
  themeAccent,
  isCompactScreen,
  messageMaxWidthPx,
  pollLocationWidth,
  pollLocationMaxWidth,
  mediaBubbleWidth,
}: Params<T>) {
  return useMemo(() => {
    // The outgoing bubble is a solid accent fill, so its text needs an ink that
    // actually contrasts with that fill instead of the shared near-white one.
    const accentForeground = getChatAccentForeground(themeAccent);
    const accentForegroundMuted = getChatAccentForegroundMuted(themeAccent);

    return ({
    ...styles,
    accentColor: themeAccent,
    headerBlur: { ...styles.headerBlur, borderBottomColor: `${themeAccent}20`, backgroundColor: 'rgba(4, 10, 24, 0.24)' },
    composerBlur: { ...styles.composerBlur, borderTopColor: `${themeAccent}20`, backgroundColor: 'transparent' },
    typingIndicatorContainer: { ...styles.typingIndicatorContainer, borderColor: `${themeAccent}28`, backgroundColor: 'rgba(7, 14, 28, 0.62)' },
    typingIndicatorText: { ...styles.typingIndicatorText, color: themeAccent },
    headerButton: { ...styles.headerButton, borderColor: `${themeAccent}22`, backgroundColor: 'rgba(8, 15, 30, 0.5)' },
    messageBubble: {
      ...styles.messageBubble,
      maxWidth: messageMaxWidthPx,
      minWidth: 0,
      paddingHorizontal: isCompactScreen ? 14 : 16,
      paddingTop: isCompactScreen ? 10 : 12,
      paddingBottom: isCompactScreen ? 10 : 12,
    },
    messageBubbleWithReply: { ...styles.messageBubbleWithReply, minWidth: 0, maxWidth: messageMaxWidthPx },
    messageBubbleCompact: { ...styles.messageBubbleCompact, minWidth: isCompactScreen ? 78 : 96 },
    messageBubbleMe: { ...styles.messageBubbleMe, backgroundColor: `${themeAccent}f1`, borderColor: `${themeAccent}88` },
    messageBubbleMeCard: { ...styles.messageBubbleMeCard, borderColor: `${themeAccent}66`, backgroundColor: `${themeAccent}1f` },
    messageBubbleOther: { ...styles.messageBubbleOther, backgroundColor: 'rgba(16, 24, 40, 0.82)', borderColor: 'rgba(148, 163, 184, 0.2)' },
    messageBubbleOtherCard: { ...styles.messageBubbleOtherCard, borderColor: 'rgba(148, 163, 184, 0.26)', backgroundColor: 'rgba(15, 23, 42, 0.68)' },
    messageTextMe: { ...styles.messageTextMe, color: accentForeground },
    messageTextMeDeleted: { ...styles.messageTextDeleted, color: accentForegroundMuted, fontStyle: 'italic' },
    messageTextMeMention: { color: accentForeground, fontWeight: '800' },
    messageStatusIconMe: { color: accentForegroundMuted },
    editedLabel: { ...styles.editedLabel, color: accentForegroundMuted },
    replyPreview: { ...styles.replyPreview, borderLeftColor: `${themeAccent}cc`, borderColor: 'transparent', backgroundColor: 'transparent' },
    replyContainer: { ...styles.replyContainer, borderColor: `${themeAccent}24`, backgroundColor: 'rgba(6, 12, 24, 0.84)' },
    replyLabel: { ...styles.replyLabel, color: themeAccent },
    replyBarType: { ...styles.replyBarType, color: '#a8b5c9' },
    replyText: { ...styles.replyText, color: '#e5edf8' },
    replyBarMore: { ...styles.replyBarMore, color: themeAccent },
    latestHighlight: { ...styles.latestHighlight, shadowColor: themeAccent },
    editingBanner: { ...styles.editingBanner, borderColor: `${themeAccent}24`, backgroundColor: 'rgba(7, 14, 28, 0.82)' },
    editingBannerLabel: { ...styles.editingBannerLabel, color: themeAccent },
    editingBannerPreview: { ...styles.editingBannerPreview, color: '#d9e4f4' },
    dayTimeSeparatorWrap: { ...styles.dayTimeSeparatorWrap, borderColor: `${themeAccent}2c`, backgroundColor: 'rgba(8, 15, 30, 0.56)' },
    dayTimeSeparatorText: { ...styles.dayTimeSeparatorText, color: '#dbeafe' },
    sendButton: { ...styles.sendButton, backgroundColor: themeAccent },
    leadingIconButton: { ...styles.leadingIconButton, borderColor: `${themeAccent}35`, backgroundColor: 'rgba(10, 17, 32, 0.9)' },
    miniActionButton: { ...styles.miniActionButton, borderColor: `${themeAccent}32`, backgroundColor: 'rgba(10, 17, 32, 0.88)' },
    textInputContainer: { ...styles.textInputContainer, borderColor: `${themeAccent}24`, backgroundColor: 'rgba(7, 14, 28, 0.84)' },
    reactionChipPlus: { ...styles.reactionChipPlus, backgroundColor: `${themeAccent}22`, borderColor: themeAccent },
    reactionChipActive: { ...styles.reactionChipActive, backgroundColor: `${themeAccent}26`, borderColor: themeAccent },
    pollBar: { ...styles.pollBar, backgroundColor: themeAccent },
    pollOptionSelected: { ...styles.pollOptionSelected, borderColor: themeAccent, backgroundColor: `${themeAccent}16` },
    pollPctSelected: { ...styles.pollPctSelected, color: themeAccent },
    locBtn: { ...styles.locBtn, backgroundColor: themeAccent },
    pinnedBanner: { ...styles.pinnedBanner, borderColor: `${themeAccent}20`, backgroundColor: 'rgba(8, 15, 30, 0.72)' },
    pinnedIconWrap: { ...styles.pinnedIconWrap, backgroundColor: `${themeAccent}22` },
    pinnedLabel: { ...styles.pinnedLabel, color: themeAccent },
    pinnedCounter: { ...styles.pinnedCounter, color: themeAccent },
    scrollToBottomButton: { ...styles.scrollToBottomButton, borderColor: `${themeAccent}26`, backgroundColor: 'rgba(6, 12, 24, 0.84)' },
    swipeActionLeft: { ...styles.swipeActionLeft, backgroundColor: `${themeAccent}18` },
    swipeActionRight: { ...styles.swipeActionRight, backgroundColor: `${themeAccent}18` },
    pollBubbleWide: { ...styles.pollBubbleWide, width: pollLocationWidth, maxWidth: pollLocationMaxWidth, minWidth: 0 },
    messageImage: { ...styles.messageImage, width: mediaBubbleWidth, height: Math.round(mediaBubbleWidth * 1.08) },
    messageVideo: { ...styles.messageVideo, width: mediaBubbleWidth, height: Math.round(mediaBubbleWidth * 1.16) },
    });
  }, [
    isCompactScreen,
    mediaBubbleWidth,
    messageMaxWidthPx,
    pollLocationMaxWidth,
    pollLocationWidth,
    styles,
    themeAccent,
  ]);
}
