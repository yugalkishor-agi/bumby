import React from 'react';

// Web fallbacks so the native ZEGOCLOUD SDK is never bundled for web.
const Noop = (_props: any) => null;

export const ZegoCallInvitationDialog: React.ComponentType<any> = Noop;
export const ZegoUIKitPrebuiltCallInCallScreen: React.ComponentType<any> = Noop;
export const ZegoUIKitPrebuiltCallWaitingScreen: React.ComponentType<any> = Noop;
