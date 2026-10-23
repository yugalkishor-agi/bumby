const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Stop Metro from crawling/watching dirs the native app never bundles.
// `dist/` is web build output; `.expo` is transient. Trimming the file map
// speeds up cold start and lowers CPU/memory on Windows (no watchman).
const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
const distDir = escapeRegex(path.resolve(__dirname, 'dist'));
const expoDir = escapeRegex(path.resolve(__dirname, '.expo'));

config.resolver.blockList = [
  new RegExp(`^${distDir}.*`),
  new RegExp(`^${expoDir}.*`),
];

// Shim map: packages that crash in Expo Go due to missing native modules.
// These shims are ONLY applied when running in Expo Go (detected by the absence
// of a real native build). When you run `expo run:android` or `eas build`,
// IS_EXPO_GO is false and all real packages are used — so calls work normally.
//
// How to detect Expo Go vs native build at Metro config time:
// - `expo start` (Expo Go) does NOT set EXPO_NATIVE_BUILD
// - `expo run:android` sets process.env.EXPO_NATIVE_BUILD = '1' via prebuild
// We also check for the android/ folder being present (prebuild was run).
const fs = require('fs');
const hasAndroidFolder = fs.existsSync(path.resolve(__dirname, 'android/app/build.gradle'));
const IS_EXPO_GO = !hasAndroidFolder;

if (IS_EXPO_GO) {
  const shims = {
    '@sayem314/react-native-keep-awake': path.resolve(__dirname, 'shims/react-native-keep-awake.js'),
    'zego-callkit-react-native':          path.resolve(__dirname, 'shims/zego-callkit-react-native.js'),
    'react-native-sound':                 path.resolve(__dirname, 'shims/react-native-sound.js'),
    '@zegocloud/zego-uikit-prebuilt-call-rn': path.resolve(__dirname, 'shims/zego-uikit-prebuilt-call-rn.js'),
    '@zegocloud/zego-uikit-rn':           path.resolve(__dirname, 'shims/zego-uikit-rn.js'),
  };

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (shims[moduleName]) {
      return { filePath: shims[moduleName], type: 'sourceFile' };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;