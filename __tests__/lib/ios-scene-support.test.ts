import { describe, expect, it } from '@jest/globals';
import { iosSceneSupportError } from '../../config/ios-scene-support.cjs';

const enabled = [['expo-build-properties', { ios: { enableSceneSupport: true } }]];

describe('iOS 27 launch configuration preflight', () => {
  it.each(['56.0.22', '57.0.22', '58.0.0', '57.0.29-preview.1', undefined])(
    'rejects unsupported or unapproved Expo runtime %s even with the flag enabled',
    (version) => {
      expect(iosSceneSupportError(version, '57.0.22', enabled)).toMatch(/Expo SDK 57/);
    },
  );

  it.each(['57.0.19', '56.0.26', undefined])(
    'rejects a build-properties version without supported scene generation: %s',
    (version) => {
      expect(iosSceneSupportError('57.0.29', version, enabled)).toMatch(/build-properties/);
    },
  );

  it.each([
    { plugins: [] },
    { plugins: ['expo-build-properties'] },
    { plugins: [['expo-build-properties', { ios: { enableSceneSupport: false } }]] },
    { plugins: [['expo-build-properties', { android: { enableSceneSupport: true } }]] },
  ])('rejects absent or disabled iOS scene support: %j', ({ plugins }) => {
    expect(iosSceneSupportError('57.0.29', '57.0.22', plugins)).toMatch(/scene support/);
  });

  it('accepts the documented minimum and the selected compatible patches', () => {
    expect(iosSceneSupportError('57.0.23', '57.0.20', enabled)).toBeNull();
    expect(iosSceneSupportError('57.0.29', '57.0.22', enabled)).toBeNull();
  });
});
