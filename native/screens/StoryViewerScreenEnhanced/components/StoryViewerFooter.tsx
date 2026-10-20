import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Avatar } from '../../../components/ui/Avatar';
import { colors } from '../../../styles/theme';

const groupIcon = require('../../../../assets/icons/icons8-group-48.png');
const quickReplyEmoji = ['😂', '😮', '😍', '😢', '👏', '🔥'];

interface StoryViewerFooterProps {
  insets: { bottom: number };
  isOwnStory: boolean;
  canReply: boolean;
  isTyping: boolean;
  setIsTyping: (t: boolean) => void;
  setIsPaused: (p: boolean) => void;
  replyText: string;
  setReplyText: (t: string) => void;
  handleSendReply: () => void;
  sendQuickReaction: (emoji: string) => void;
  handleLike: () => void;
  isLiked: boolean;
  heartButtonScale: any; // Animated.Value
  ownerAudiencePreview: any[];
  viewersData: any[];
  openInsights: () => void;
  handleShare: () => void;
  setShowMoreMenu: (s: boolean) => void;
  navigation: any;
  storyUser: any;
}

export const StoryViewerFooter: React.FC<StoryViewerFooterProps> = ({
  insets,
  isOwnStory,
  canReply,
  isTyping,
  setIsTyping,
  setIsPaused,
  replyText,
  setReplyText,
  handleSendReply,
  sendQuickReaction,
  handleLike,
  isLiked,
  heartButtonScale,
  ownerAudiencePreview,
  viewersData,
  openInsights,
  handleShare,
  setShowMoreMenu,
  navigation,
  storyUser
}) => {

  const renderEmojiReactions = () => (
    <View style={styles.emojiContainer}>
      {quickReplyEmoji.map((emoji) => (
        <TouchableOpacity
          key={emoji}
          style={styles.emojiButton}
          onPress={() => sendQuickReaction(emoji)}
          activeOpacity={0.82}
        >
          <Text style={styles.emojiText}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.9)']}
      style={styles.bottomGradient}
      pointerEvents="box-none"
    >
      <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
        {isOwnStory ? (
          <View style={styles.ownerBottomRow}>
            <View style={styles.ownerAudienceWrap}>
              <TouchableOpacity style={styles.viewersIndicator} onPress={openInsights} activeOpacity={0.85}>
                {ownerAudiencePreview.length > 0 ? (
                  <View style={styles.stackedAvatars}>
                    {ownerAudiencePreview.map((item, index) => (
                      <View key={item.userId || index} style={[styles.stackedAvatarWrap, { marginLeft: index === 0 ? 0 : -16, zIndex: 40 - index }]}>
                        <Avatar source={item.avatarURL} size={34} fallbackText={item.username || 'U'} style={styles.stackedAvatar} />
                        {!!item.hasLiked && <Ionicons name="heart" size={12} color={colors.accent.error} style={styles.stackedAvatarHeart} />}
                      </View>
                    ))}
                  </View>
                ) : viewersData.length === 0 ? (
                  <Image source={groupIcon as any} style={styles.ownerEmptyIcon} contentFit="contain" />
                ) : null}
              </TouchableOpacity>
              <Text style={styles.seenByText}>{`seen by ${viewersData.length}`}</Text>
            </View>

            <View style={styles.ownerActionsRow}>
              <TouchableOpacity style={styles.ownerAction} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ownerAction} onPress={() => navigation.navigate('Highlights')}>
                <Ionicons name="bookmark-outline" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ownerAction} onPress={() => setShowMoreMenu(true)}>
                <Ionicons name="ellipsis-horizontal" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {canReply && isTyping && renderEmojiReactions()}
            {canReply && (
              <View style={styles.replyContainer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder={`Send message to ${storyUser?.username}`}
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  value={replyText}
                  onChangeText={setReplyText}
                  onFocus={() => { setIsTyping(true); setIsPaused(true); }}
                  onBlur={() => { setIsTyping(false); setIsPaused(false); }}
                />
                <Animated.View style={{ transform: [{ scale: heartButtonScale }] }}>
                  <TouchableOpacity style={styles.heartButton} onPress={handleLike} activeOpacity={0.82}>
                    <Ionicons
                      name={isLiked ? "heart" : "heart-outline"}
                      size={28}
                      color={isLiked ? colors.accent.error : "white"}
                    />
                  </TouchableOpacity>
                </Animated.View>
                {replyText.trim().length > 0 && (
                  <TouchableOpacity style={styles.sendButton} onPress={handleSendReply}>
                    <Ionicons name="send" size={20} color={colors.accent.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    paddingTop: 40,
  },
  bottomActions: {
    paddingHorizontal: 16,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  replyInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    color: 'white',
    paddingHorizontal: 20,
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heartButton: {
    marginLeft: 14,
    padding: 6,
  },
  sendButton: {
    marginLeft: 12,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
  },
  emojiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  emojiButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
  },
  emojiText: {
    fontSize: 26,
  },
  ownerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerAudienceWrap: {
    alignItems: 'center',
  },
  viewersIndicator: {
    minHeight: 34,
    justifyContent: 'center',
  },
  stackedAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatarWrap: {
    position: 'relative',
  },
  stackedAvatar: {
    borderWidth: 2,
    borderColor: '#000',
  },
  stackedAvatarHeart: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 1,
    overflow: 'hidden',
  },
  ownerEmptyIcon: {
    width: 28,
    height: 28,
    tintColor: 'white',
    opacity: 0.8,
  },
  seenByText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  ownerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerAction: {
    marginLeft: 16,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
  },
});
