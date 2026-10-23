/**
 * Shim for react-native-sound
 *
 * react-native-sound 0.13.0 uses TurboModuleRegistry.getEnforcing('RNSound')
 * which throws an Invariant Violation in Expo Go (no custom native modules).
 * This shim provides a no-op Sound class so Zego's call UI can load without
 * crashing. Actual audio playback won't work in Expo Go but won't break the app.
 */
const { Platform } = require('react-native');

const NOOP = () => {};
const NOOP_SELF = function () { return this; };

class Sound {
  constructor(filename, basePath, onError) {
    if (typeof basePath === 'function') onError = basePath;
    // Simulate async load success so callers don't hang
    setTimeout(() => {
      if (typeof onError === 'function') onError(null, { duration: 0, numberOfChannels: 1 });
    }, 0);
  }
  isLoaded() { return false; }
  play(onEnd) { if (onEnd) onEnd(false); return this; }
  pause(cb) { if (cb) cb(); return this; }
  stop(cb) { if (cb) cb(); return this; }
  reset() { return this; }
  release() { return this; }
  getFilename() { return ''; }
  getDuration() { return -1; }
  getNumberOfChannels() { return -1; }
  getVolume() { return 1; }
  setVolume() { return this; }
  getPan() { return 0; }
  setPan() { return this; }
  getSpeed() { return 1; }
  setSpeed() { return this; }
  getPitch() { return 1; }
  setPitch() { return this; }
  getNumberOfLoops() { return 0; }
  setNumberOfLoops() { return this; }
  getCurrentTime(cb) { if (cb) cb(0); }
  setCurrentTime() { return this; }
  isPlaying() { return false; }
  setSpeakerphoneOn() {}
  getSystemVolume(cb) { if (cb) cb(1); return this; }
  setSystemVolume() { return this; }

  static setCategory() {}
  static enableInSilenceMode() {}
  static setActive() {}
  static setMode() {}
  static enable() {}
  static setSpeakerPhone() {}
  static MAIN_BUNDLE = '';
  static DOCUMENT = '';
  static LIBRARY = '';
  static CACHES = '';
}

module.exports = Sound;
module.exports.default = Sound;
