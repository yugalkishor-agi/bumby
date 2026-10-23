/**
 * Expo config plugin for ZEGOCLOUD CallKit (React Native UIKit).
 *
 * `expo prebuild` regenerates the native projects, so the Zego native
 * requirements (permissions, FCM/ZPNs dependency, ProGuard rules and iOS
 * usage descriptions) are applied here instead of being edited by hand.
 */
const {
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
  withDangerousMod,
  withInfoPlist,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ANDROID_PERMISSIONS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.MANAGE_OWN_CALLS',
  'android.permission.ACCESS_NOTIFICATION_POLICY',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
];

const PROGUARD_RULES = `
# ZEGOCLOUD CallKit
-keep class **.zego.**  { *; }
-keep class **.**.zego_zpns.** { *; }

-keep class com.hiennv.flutter_callkit_incoming.SharedPreferencesUtils* {*;}
-keep class com.fasterxml.jackson.** {*;}

-dontwarn com.google.firebase.messaging.TopicOperation$TopicOperations
-dontwarn com.heytap.msp.push.**
-dontwarn com.huawei.hms.**
-dontwarn com.vivo.push.**
-dontwarn com.xiaomi.mipush.sdk.**
-dontwarn java.beans.ConstructorProperties
-dontwarn java.beans.Transient
-dontwarn org.w3c.dom.bootstrap.DOMImplementationRegistry
`;

function withZegoAndroidManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const declared = new Set(
      manifest['uses-permission']
        .map((entry) => entry?.$?.['android:name'])
        .filter(Boolean)
    );

    for (const permission of ANDROID_PERMISSIONS) {
      if (!declared.has(permission)) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    }

    return config;
  });
}

function withZegoProjectRepositories(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;
    let contents = config.modResults.contents;

    if (!contents.includes('maven.zego.im')) {
      contents = contents.replace(
        /allprojects\s*\{[\s\S]*?repositories\s*\{/,
        (match) => `${match}\n        maven { url 'https://maven.zego.im' }\n        maven { url 'https://storage.zego.im/maven' }`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withZegoAppDependencies(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;
    let contents = config.modResults.contents;

    const dependencies = [
      "implementation 'im.zego:zpns-fcm:2.8.0'",
      "implementation 'com.google.firebase:firebase-messaging:24.0.1'",
    ];

    for (const dependency of dependencies) {
      if (!contents.includes(dependency)) {
        contents = contents.replace(/dependencies\s*\{/, (match) => `${match}\n    ${dependency}`);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withZegoProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );

      let contents = '';
      try {
        contents = await fs.promises.readFile(proguardPath, 'utf8');
      } catch {
        contents = '';
      }

      if (!contents.includes('-keep class **.zego.**')) {
        contents = `${contents.trimEnd()}\n${PROGUARD_RULES}`;
        await fs.promises.writeFile(proguardPath, contents, 'utf8');
      }

      return config;
    },
  ]);
}

function withZegoInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription =
      config.modResults.NSCameraUsageDescription ||
      'Allow Bumby to use your camera for video calls.';
    config.modResults.NSMicrophoneUsageDescription =
      config.modResults.NSMicrophoneUsageDescription ||
      'Allow Bumby to use your microphone for voice and video calls.';

    const backgroundModes = new Set(config.modResults.UIBackgroundModes || []);
    ['audio', 'voip', 'remote-notification'].forEach((mode) => backgroundModes.add(mode));
    config.modResults.UIBackgroundModes = Array.from(backgroundModes);

    return config;
  });
}

module.exports = function withZegoCallKit(config) {
  config = withZegoAndroidManifest(config);
  config = withZegoProjectRepositories(config);
  config = withZegoAppDependencies(config);
  config = withZegoProguardRules(config);
  config = withZegoInfoPlist(config);
  return config;
};
