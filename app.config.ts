import { ExpoConfig } from 'expo/config';

// App config as TypeScript so native-build secrets (the Mapbox download token)
// come from the environment instead of being committed. Set
// MAPBOX_DOWNLOAD_TOKEN locally (and as an EAS secret) before native builds —
// an empty token means `pod install` cannot fetch the Mapbox SDK.
//
// `newArchEnabled` and top-level `splash` were dropped from the SDK 56
// ExpoConfig *type* (New Architecture is always on; splash migrated toward the
// expo-splash-screen plugin) but both are still resolved by `expo config` and
// prebuild, so they are kept via an intersection type.
type ConfigWithLegacyKeys = ExpoConfig & {
  newArchEnabled: boolean;
  splash: {
    image: string;
    backgroundColor: string;
    resizeMode: 'contain' | 'cover';
  };
};

const config: ConfigWithLegacyKeys = {
  name: 'Greek Ties',
  slug: 'greek-ties-app',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'greekties',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    backgroundColor: '#F6F1E7',
    resizeMode: 'contain',
  },
  ios: {
    // Never tested on iPad — scope the App Store submission to iPhone.
    supportsTablet: false,
    bundleIdentifier: 'com.greekties.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Greek Ties shows chapter and alumni locations on the map.',
      NSPhotoLibraryUsageDescription: 'Lets you choose a profile photo.',
      // Only standard HTTPS (exempt) encryption is used — skips the export
      // compliance questionnaire on every TestFlight/App Store upload.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.greekties.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#16294A',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? '',
      },
    ],
  ],
  web: {
    bundler: 'metro',
    output: 'single',
  },
  experiments: {
    typedRoutes: true,
    baseUrl: '/greekties',
  },
};

export default config;
