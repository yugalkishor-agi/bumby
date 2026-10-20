import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Animated, Modal, SafeAreaView, PanResponder, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Avatar } from '../../../components/ui/Avatar';
import { VerifiedBadge } from '../../../components/ui/VerifiedBadge';
import { colors, spacing } from '../../../styles/theme';
import { FlashList } from '@shopify/flash-list';

const groupIcon = require('../../../../assets/icons/icons8-group-48.png');

interface StoryViewerModalsProps {
  isOwnStory: boolean;
  canReply: boolean;
  showInsights: boolean;
  setShowInsights: (s: boolean) => void;
  loadingInsights: boolean;
  insightsUsers: any[];
  viewersData: any[];
  likersData: any[];
  setIsPaused: (p: boolean) => void;
  showMoreMenu: boolean;
  setShowMoreMenu: (s: boolean) => void;
  setShowDeleteDialog: (s: boolean) => void;
  openCurrentStorySettings: () => void;
  handleShare: () => void;
  navigation: any;
  userId: string;
  questionModal: { visible: boolean; stickerId?: string; text: string };
  setQuestionModal: (m: any) => void;
  sendQuestionReply: () => void;
  questionRepliesModal: { visible: boolean; stickerId?: string };
  setQuestionRepliesModal: (m: any) => void;
  questionReplies: Record<string, any[]>;
}

export const StoryViewerModals: React.FC<StoryViewerModalsProps> = ({
  isOwnStory,
  canReply,
  showInsights,
  setShowInsights,
  loadingInsights,
  insightsUsers,
  viewersData,
  likersData,
  setIsPaused,
  showMoreMenu,
  setShowMoreMenu,
  setShowDeleteDialog,
  openCurrentStorySettings,
  handleShare,
  navigation,
  userId,
  questionModal,
  setQuestionModal,
  sendQuestionReply,
  questionRepliesModal,
  setQuestionRepliesModal,
  questionReplies
}) => {
  const insightsSheetTranslateY = useRef(new Animated.Value(0)).current;

  const closeInsightsAnimated = React.useCallback(() => {
    Animated.timing(insightsSheetTranslateY, {
      toValue: 420,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      insightsSheetTranslateY.setValue(0);
      setShowInsights(false);
      setIsPaused(false);
    });
  }, [insightsSheetTranslateY, setShowInsights, setIsPaused]);

  const insightsPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) {
            insightsSheetTranslateY.setValue(Math.min(gesture.dy, 220));
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 88 || gesture.vy > 1.1) {
            closeInsightsAnimated();
            return;
          }
          Animated.spring(insightsSheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 18,
            bounciness: 6,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(insightsSheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 18,
            bounciness: 6,
          }).start();
        },
      }),
    [closeInsightsAnimated, insightsSheetTranslateY]
  );

  return (
    <>
      {/* Insights Modal */}
      <Modal
        visible={showInsights}
        transparent
        animationType="slide"
        onRequestClose={closeInsightsAnimated}
      >
        <View style={styles.insightsBackdrop}>
          <Animated.View
            style={[styles.insightsSheet, { transform: [{ translateY: insightsSheetTranslateY }] }]}
            {...insightsPanResponder.panHandlers}
          >
            <SafeAreaView style={styles.insightsContainer}>
              <View style={styles.insightsHandle} />
              <View style={styles.insightsHeader}>
                <View>
                  <Text style={styles.insightsTitle}>Story Audience</Text>
                  <Text style={styles.insightsSubtitle}>{viewersData.length} views - {likersData.length} likes</Text>
                </View>
                <TouchableOpacity style={styles.insightsCloseButton} onPress={closeInsightsAnimated}>
                  <Ionicons name="close" size={20} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
              {loadingInsights ? (
                <ActivityIndicator size="large" color={colors.accent.primary} style={styles.loadingInsights} />
              ) : insightsUsers.length === 0 ? (
                <View style={[styles.viewersList, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
                  <Image
                    source={groupIcon as any}
                    style={{ width: 64, height: 64, tintColor: colors.text.primary, opacity: 0.9 }}
                    contentFit="contain"
                  />
                  <Text style={[styles.viewerUsername, { marginTop: spacing.md }]}>No audience yet</Text>
                  <Text style={styles.viewerDisplayName}>Share your story to get views</Text>
                </View>
              ) : (
                <FlashList estimatedItemSize={100}
                  data={insightsUsers}
                  keyExtractor={(item) => item.userId}
                  renderItem={({ item }) => (
                    <View style={styles.viewerItem}>
                      <View style={styles.viewerAvatarWrap}>
                        <Avatar source={item.avatarURL} size={46} fallbackText={item.username || 'U'} />
                        {!!item.hasLiked && (
                          <Ionicons name="heart" size={14} color={colors.accent.error} style={styles.viewerHeartBadge} />
                        )}
                      </View>
                      <View style={styles.viewerInfo}>
                        <View style={styles.viewerNameRow}>
                          <Text style={styles.viewerUsername} numberOfLines={1}>{item.username}</Text>
                          {!!item.verified && <VerifiedBadge size={13} style={styles.viewerVerifiedBadge} />}
                        </View>
                        <Text style={styles.viewerDisplayName} numberOfLines={1}>{item.displayName || 'Viewer'}</Text>
                      </View>
                    </View>
                  )}
                  contentContainerStyle={styles.viewersList as any}
                />
              )}
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* More Menu Modal */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={styles.moreMenu}>
            {isOwnStory ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); }}>
                  <Ionicons name="bookmark-outline" size={22} color="white" />
                  <Text style={styles.menuText}>Highlight</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); setShowDeleteDialog(true); }}>
                  <Ionicons name="trash-outline" size={22} color={colors.accent.error} />
                  <Text style={[styles.menuText, { color: colors.accent.error }]}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); openCurrentStorySettings(); }}>
                  <Ionicons name="settings-outline" size={22} color="white" />
                  <Text style={styles.menuText}>Story Settings</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); handleShare(); }}>
                  <Ionicons name="share-social-outline" size={22} color="white" />
                  <Text style={styles.menuText}>Share Story</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); navigation.navigate('UserProfile', { userId }); }}>
                  <Ionicons name="person-outline" size={22} color="white" />
                  <Text style={styles.menuText}>Visit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMoreMenu(false); }}>
                  <Ionicons name="flag-outline" size={22} color={colors.accent.error} />
                  <Text style={[styles.menuText, { color: colors.accent.error }]}>Report Story</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Question Reply Modal */}
      <Modal
        visible={questionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setQuestionModal({ visible: false, text: '' })}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '85%', backgroundColor: '#111', borderRadius: 16, padding: 16 }}>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Reply to question</Text>
            <TextInput
              value={questionModal.text}
              onChangeText={(t) => setQuestionModal((prev: any) => ({ ...prev, text: t }))}
              placeholder="Type your reply..."
              placeholderTextColor="#888"
              style={{ color: 'white', borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 12 }}>
              <TouchableOpacity onPress={() => setQuestionModal({ visible: false, text: '' })}>
                <Text style={{ color: '#ccc', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendQuestionReply}>
                <Text style={{ color: '#0af', fontWeight: '700' }}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Question Replies Modal */}
      <Modal
        visible={questionRepliesModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => { setQuestionRepliesModal({ visible: false }); setIsPaused(false); }}
      >
        <View style={styles.insightsBackdrop}>
          <View style={[styles.insightsSheet, { height: '60%' }]}>
            <View style={styles.insightsHeader}>
              <Text style={styles.insightsTitle}>Replies</Text>
              <TouchableOpacity onPress={() => { setQuestionRepliesModal({ visible: false }); setIsPaused(false); }}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <FlashList estimatedItemSize={100}
              data={questionReplies[questionRepliesModal.stickerId!] || []}
              keyExtractor={(item) => item.replyId}
              renderItem={({ item }) => (
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' }}>
                  <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>User {item.senderId}</Text>
                  <Text style={{ color: 'white', fontSize: 15 }}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No replies yet.</Text>}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  insightsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  insightsSheet: {
    backgroundColor: '#1A1D24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '65%',
    overflow: 'hidden',
  },
  insightsContainer: {
    flex: 1,
  },
  insightsHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  insightsTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  insightsSubtitle: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  insightsCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingInsights: {
    marginTop: 40,
  },
  viewersList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewerAvatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  viewerHeartBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#1A1D24',
    borderRadius: 10,
    padding: 2,
    overflow: 'hidden',
  },
  viewerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  viewerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  viewerUsername: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  viewerVerifiedBadge: {
    marginLeft: 4,
  },
  viewerDisplayName: {
    color: colors.text.secondary,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreMenu: {
    width: 240,
    backgroundColor: '#1A1D24',
    borderRadius: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
});
