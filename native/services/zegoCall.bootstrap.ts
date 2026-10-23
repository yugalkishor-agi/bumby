import ZegoUIKitPrebuiltCallService from '@zegocloud/zego-uikit-prebuilt-call-rn';
import * as ZIM from 'zego-zim-react-native';
import * as ZPNs from 'zego-zpns-react-native';

// Enables the native system calling UI (CallKit / full-screen notification)
// for incoming calls while the app is in the background or killed.
ZegoUIKitPrebuiltCallService.useSystemCallingUI([ZIM, ZPNs]);

export {};
