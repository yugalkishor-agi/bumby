/**
 * Shim for @sayem314/react-native-keep-awake
 *
 * The original package uses a legacy native module (ReactNativeKCKeepAwake)
 * that is incompatible with React Native's New Architecture (Bridgeless mode).
 * This shim delegates to expo-keep-awake, which is New Architecture compatible
 * and already installed as a transitive dependency.
 */
const ExpoKeepAwake = require('expo-keep-awake');

// expo-keep-awake exports: activateKeepAwake, deactivateKeepAwake, useKeepAwake
const activateKeepAwake = ExpoKeepAwake.activateKeepAwake || ExpoKeepAwake.default?.activateKeepAwake;
const deactivateKeepAwake = ExpoKeepAwake.deactivateKeepAwake || ExpoKeepAwake.default?.deactivateKeepAwake;
const useKeepAwake = ExpoKeepAwake.useKeepAwake || ExpoKeepAwake.default?.useKeepAwake;

// @sayem314/react-native-keep-awake API surface:
//   KeepAwake (component), activateKeepAwake(), deactivateKeepAwake()

const React = require('react');

function KeepAwake() {
  useKeepAwake();
  return null;
}

module.exports = KeepAwake;
module.exports.default = KeepAwake;
module.exports.KeepAwake = KeepAwake;
module.exports.activateKeepAwake = activateKeepAwake;
module.exports.deactivateKeepAwake = deactivateKeepAwake;
module.exports.useKeepAwake = useKeepAwake;
