// Build preflight only; this does not prove native launch or link delivery.
function supportedPatch(version, minimumPatch) {
  const match = /^57\.(\d+)\.(\d+)$/.exec(version || '');
  return !!match && (Number(match[1]) > 0 || Number(match[2]) >= minimumPatch);
}

function iosSceneSupportError(expoVersion, propertiesVersion, plugins) {
  if (!supportedPatch(expoVersion, 23))
    return 'This QA candidate requires stable Expo SDK 57 >=57.0.23.';
  if (!supportedPatch(propertiesVersion, 20))
    return 'This QA candidate requires compatible expo-build-properties >=57.0.20.';
  const scene = (plugins || []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  if (scene?.[1]?.ios?.enableSceneSupport !== true)
    return 'iOS scene support must be enabled before generating an Xcode 27 Release build.';
  return null;
}

module.exports = { iosSceneSupportError };
