import { StyleSheet, Dimensions } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../styles/theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  media: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  glimpseContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  editorStyleOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  editorOverlayAsset: {
    position: 'absolute',
    borderRadius: 16,
    overflow: 'hidden',
  },
  editorOverlayAssetImage: {
    width: '100%',
    height: '100%',
  },
  editorOverlaySticker: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorOverlayStickerText: {
    fontSize: 64,
    textAlign: 'center',
  },
  editorOverlayTextWrap: {
    position: 'absolute',
    left: 22,
    right: 22,
  },
  editorOverlayTop: {
    top: 92,
  },
  editorOverlayCenter: {
    top: '44%',
  },
  editorOverlayBottom: {
    bottom: 132,
  },
  editorOverlayText: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    textAlign: 'center',
  },
  editorOverlayShell: {
    alignSelf: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '92%',
  },
  editorOverlayShellNone: {
    backgroundColor: 'transparent',
  },
  editorOverlayShellBlack: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
  },
  editorOverlayShellWhite: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(15,23,42,0.12)',
    borderWidth: 1,
  },
  editorOverlayShellGlass: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
  },
  editorOverlayDefaultShadow: {
    textShadowColor: 'rgba(0,0,0,0.36)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 18,
  },
  editorOverlayShadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  editorOverlayGlow: {
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  uiContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topUI: {
    paddingTop: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  topLeftSpacer: {
    width: 42,
  },
  topRightSpacer: {
    width: 42,
  },
  muteButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  moreButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  bottomPanel: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 42,
  },
  bottomLeft: {
    flex: 1,
    marginRight: 18,
    paddingBottom: 6,
  },
  socialProofBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  socialProofAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialAvatarWrap: {
    borderRadius: 12,
  },
  socialAvatar: {
    borderWidth: 1.5,
    borderColor: '#101010',
  },
  socialProofTextWrap: {
    marginLeft: 8,
    flex: 1,
  },
  socialProofText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  socialProofPrimaryName: {
    fontWeight: '700',
  },
  viewerUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerUserText: {
    flex: 1,
    marginLeft: 12,
  },
  viewerUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  viewerUsername: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  viewerCaptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  viewerCaption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  viewerCaptionMore: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerFollowButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 10,
  },
  viewerFollowButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerMetaText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 8,
  },
  viewerMusicRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerMusicText: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
  viewerActions: {
    alignItems: 'center',
    gap: 22,
    paddingBottom: 22,
  },
  viewerActionButton: {
    alignItems: 'center',
  },
  viewerActionDisabled: {
    opacity: 0.45,
  },
  viewerActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  bigHeartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapFeedbackBubble: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 64,
    height: 64,
    marginLeft: -32,
    marginTop: -32,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#fff',
  },
  commentsSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  commentsDismissArea: {
    flex: 1,
  },
  commentsSheet: {
    maxHeight: Dimensions.get('window').height * 0.72,
    backgroundColor: '#090b10',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  sheetCommentContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  sheetReplyContainer: {
    marginLeft: 24,
    marginTop: 10,
  },
  sheetCommentBody: {
    flex: 1,
  },
  sheetCommentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sheetCommentUsername: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetCommentTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  sheetCommentText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
  },
  sheetCommentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  sheetActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetActionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  sheetReportText: {
    color: '#ef4444',
  },
  sheetRepliesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  sheetRepliesLine: {
    width: 22,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginRight: 8,
  },
  sheetRepliesToggleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  sheetRepliesWrap: {
    marginTop: 8,
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0c1016',
  },
  commentInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#141922',
    borderRadius: 18,
    marginRight: 10,
  },
  commentSendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#0b0d12',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  menuItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  editOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
  },
  editCard: {
    width: '100%',
    backgroundColor: '#0b0d12',
    borderRadius: 18,
    padding: 18,
  },
  editTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  editInput: {
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: '#141922',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  editButton: {
    minWidth: 96,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    marginLeft: 10,
  },
  editSave: {
    backgroundColor: colors.accent.primary,
  },
  editCancel: {
    backgroundColor: '#1a1f29',
  },
  editSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  editCancelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});