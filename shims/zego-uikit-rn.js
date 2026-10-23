/**
 * Shim for @zegocloud/zego-uikit-rn
 *
 * Same reason as the prebuilt-call-rn shim — requires native modules not
 * available in Expo Go. This shim exports safe no-ops for everything the app
 * transitively uses through zego-uikit-prebuilt-call-rn.
 */
const React = require('react');
const { View } = require('react-native');

const ZegoUIKit = {
  init: async () => {},
  uninit: async () => {},
  login: async () => {},
  logout: async () => {},
  installPlugins: () => {},
  getUser: () => null,
};

const ZegoUIKitLogger = {
  logInfo: () => {},
  logWarning: () => {},
  logError: () => {},
  logSetUserID: () => {},
};

const ZegoUIKitPluginType = { signaling: 'signaling' };

function ZegoAudioVideoView() { return null; }
function ZegoSendCallInvitationButton() { return null; }

module.exports = ZegoUIKit;
module.exports.default = ZegoUIKit;
module.exports.ZegoUIKit = ZegoUIKit;
module.exports.ZegoUIKitLogger = ZegoUIKitLogger;
module.exports.ZegoUIKitPluginType = ZegoUIKitPluginType;
module.exports.ZegoAudioVideoView = ZegoAudioVideoView;
module.exports.ZegoSendCallInvitationButton = ZegoSendCallInvitationButton;
