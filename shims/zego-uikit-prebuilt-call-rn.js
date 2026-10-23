/**
 * Shim for @zegocloud/zego-uikit-prebuilt-call-rn
 *
 * This entire package requires custom native modules (ZegoUIKitPrebuiltCallRNModule,
 * LogRNModule, ReportRNModule, ZegoExpressNativeModule, ZIMNativeModule, ZPNsNativeModule)
 * that are not available in Expo Go. Rather than patching each crashing file one by one,
 * this shim replaces the whole package with safe no-ops so the app can load and run.
 * Call functionality simply won't work in Expo Go — it works in production builds.
 */
const React = require('react');
const { View, Text } = require('react-native');

// No-op service with the same API surface the app uses
const ZegoUIKitPrebuiltCallService = {
  useSystemCallingUI: () => {},
  init: async () => {},
  uninit: async () => {},
  sendCallInvitation: async () => {},
  cancelCallInvitation: async () => {},
  hangUp: async () => {},
};

// No-op screen components
function ZegoUIKitPrebuiltCallInCallScreen() {
  return React.createElement(View, null, React.createElement(Text, null, 'Call (Expo Go stub)'));
}

function ZegoUIKitPrebuiltCallWaitingScreen() {
  return React.createElement(View, null, React.createElement(Text, null, 'Waiting (Expo Go stub)'));
}

// No-op dialog
function ZegoCallInvitationDialog() {
  return null;
}

// Call config stubs
const ONE_ON_ONE_VIDEO_CALL_CONFIG = {};
const ONE_ON_ONE_VOICE_CALL_CONFIG = {};
const GROUP_VIDEO_CALL_CONFIG = {};
const GROUP_VOICE_CALL_CONFIG = {};
const ZegoInvitationType = { VideoCall: 1, VoiceCall: 0 };

module.exports = ZegoUIKitPrebuiltCallService;
module.exports.default = ZegoUIKitPrebuiltCallService;
module.exports.ZegoUIKitPrebuiltCallService = ZegoUIKitPrebuiltCallService;
module.exports.ZegoUIKitPrebuiltCallInCallScreen = ZegoUIKitPrebuiltCallInCallScreen;
module.exports.ZegoUIKitPrebuiltCallWaitingScreen = ZegoUIKitPrebuiltCallWaitingScreen;
module.exports.ZegoCallInvitationDialog = ZegoCallInvitationDialog;
module.exports.ONE_ON_ONE_VIDEO_CALL_CONFIG = ONE_ON_ONE_VIDEO_CALL_CONFIG;
module.exports.ONE_ON_ONE_VOICE_CALL_CONFIG = ONE_ON_ONE_VOICE_CALL_CONFIG;
module.exports.GROUP_VIDEO_CALL_CONFIG = GROUP_VIDEO_CALL_CONFIG;
module.exports.GROUP_VOICE_CALL_CONFIG = GROUP_VOICE_CALL_CONFIG;
module.exports.ZegoInvitationType = ZegoInvitationType;
