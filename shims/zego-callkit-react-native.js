/**
 * Shim for zego-callkit-react-native
 *
 * The real package reads ZegoCallKitNativeModule.prefix at module load time.
 * On Android, ZegoCallKitNativeModule is null (CallKit is iOS-only), so this
 * crashes with "Cannot read property 'prefix' of null" before the app registers.
 *
 * This shim exports a safe no-op CallKit that does nothing on Android
 * and preserves the original behaviour on iOS by deferring the native module
 * access to call time (not module load time).
 */
const { NativeModules, NativeEventEmitter, Platform } = require('react-native');

const isIOS = Platform.OS === 'ios' || Platform.OS === 'macos';

// Safe accessor — returns null instead of throwing if the module isn't linked.
function getNativeModule() {
  return NativeModules.ZegoCallKitNativeModule || null;
}

function getPrefix() {
  const mod = getNativeModule();
  return mod ? mod.prefix : '';
}

class CallKit {
  static _instatance = new CallKit();
  evs = [
    'didReceiveIncomingPush', 'providerDidReset', 'providerDidBegin',
    'didActivateAudioSession', 'didDeactivateAudioSession',
    'timedOutPerformingAction', 'performStartCallAction',
    'performAnswerCallAction', 'performEndCallAction',
    'performSetHeldCallAction', 'performSetMutedCallAction',
    'performSetGroupCallAction', 'performPlayDTMFCallAction',
  ];

  static setInitConfiguration(config) {
    if (isIOS) {
      const mod = getNativeModule();
      if (mod) mod.setCallKitInitConfig(config);
    }
  }

  static getInstance() {
    return CallKit._instatance;
  }

  on(type, listener) {
    if (!isIOS) return;
    const mod = getNativeModule();
    if (!mod) return;
    if (this.evs.indexOf(type) === -1) throw new Error(type + ' is not a supported event type.');
    if (!listener || typeof listener !== 'function') throw new Error('listener must be a function.');
    this.off(type);
    const emitter = new NativeEventEmitter(mod);
    const prefix = getPrefix();
    emitter.addListener(prefix + type, listener);
  }

  off(type) {
    if (!isIOS) return;
    const mod = getNativeModule();
    if (!mod) return;
    if (this.evs.indexOf(type) === -1) throw new Error(type + ' is not a supported event type.');
    const emitter = new NativeEventEmitter(mod);
    emitter.removeAllListeners(getPrefix() + type);
  }

  reportIncomingCall(cxCallUpdate, uuid) {
    if (isIOS) {
      const mod = getNativeModule();
      if (mod) return mod.reportIncomingCallWithTitle(cxCallUpdate, uuid);
    }
    return Promise.resolve();
  }

  reportOutgoingCall(uuid) {
    if (isIOS) {
      const mod = getNativeModule();
      if (mod) return mod.reportOutgoingCallWithUUID(uuid);
    }
    return Promise.resolve();
  }

  reportCallUpdate(cxCallUpdate, uuid) {
    if (isIOS) {
      const mod = getNativeModule();
      if (mod) return mod.reportCallUpdateWithUUID(cxCallUpdate, uuid);
    }
    return Promise.resolve();
  }

  reportCallEnded(endedReason, uuid) {
    if (isIOS) {
      const mod = getNativeModule();
      if (mod) return mod.reportCallEndedWithUUID(endedReason, uuid);
    }
    return Promise.resolve();
  }
}

module.exports = { CallKit, default: CallKit };
module.exports.default = CallKit;
