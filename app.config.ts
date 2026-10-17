import { ExpoConfig } from 'expo/config';
import { ownerQaTargetError } from './config/owner-qa-policy.cjs';
import ownerQaRelease from './config/owner-qa-release.json';

const ownerQa = process.env.EXPO_PUBLIC_BUILD_VARIANT === 'owner-qa';
if (process.env.EAS_BUILD_PROFILE === 'owner-qa' && !ownerQa)
  throw new Error('Owner QA requires EXPO_PUBLIC_BUILD_VARIANT=owner-qa.');
if (ownerQa) {
  const error = ownerQaTargetError(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    ownerQaRelease.supabaseProjectRef,
  );
  if (error) throw new Error(error);
}

// App config as TypeScript so native-build secrets (the Mapbox download token)
// come from the environment instead of being committed. Set
// MAPBOX_DOWNLOAD_TOKEN is retained for existing non-QA build profiles. The
// pinned rnmapbox 10.3.1 supports tokenless downloads; QA keeps credentials
// out of its public manifest and uses CocoaPods environment values if needed.
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
  name: ownerQa ? 'Greek Ties QA' : 'Greek Ties',
  slug: 'greek-ties',
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
    ...(ownerQa
      ? { buildNumber: process.env.OWNER_QA_BUILD_NUMBER, appleTeamId: ownerQaRelease.appleTeamId }
      : {}),
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
  extra: {
    eas: ownerQa ? {} : { projectId: '8b2653aa-f1c4-4f07-8a50-00f26112b58a' },
  },
  plugins: [
    // SDK 57's supported scene lifecycle is required for Xcode 27 / iOS 27 launch.
    ['expo-build-properties', { ios: { enableSceneSupport: true } }],
    'expo-router',
    'expo-font',
    'expo-image',
    'expo-secure-store',
    'expo-notifications',
    [
      '@rnmapbox/maps',
      {
        // Keep build credentials out of the QA public Expo manifest. CocoaPods
        // reads RNMAPBOX_MAPS_DOWNLOAD_TOKEN directly from the build environment.
        ...(ownerQa ? {} : { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? '' }),
      },
    ],
  ],
  web: {
    bundler: 'metro',
    output: 'single',
  },
  experiments: {
    typedRoutes: true,
    // GitHub Pages needs the repository base path, but native asset bundling
    // must use the app bundle root instead of nesting assets under that path.
    ...(process.env.EAS_BUILD_PLATFORM ? {} : { baseUrl: '/greekties' }),
  },
};

export default config;
