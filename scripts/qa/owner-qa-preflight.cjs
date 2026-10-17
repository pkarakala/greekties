/* global __dirname, Buffer */
// Read-only release preflight. Never provisions, builds, submits, or uploads.
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { ownerQaTargetError } = require('../../config/owner-qa-policy.cjs');
const { iosSceneSupportError } = require('../../config/ios-scene-support.cjs');
const root = path.resolve(__dirname, '../..');
const target = require('../../config/owner-qa-release.json');
const checks = [];
const check = (name, pass, detail) =>
  checks.push({ name, status: pass ? 'PASS' : 'BLOCKED', detail });
check('QA build marker', process.env.EXPO_PUBLIC_BUILD_VARIANT === 'owner-qa');
const error = ownerQaTargetError(process.env.EXPO_PUBLIC_SUPABASE_URL, target.supabaseProjectRef);
check('Pinned isolated hosted backend', !error, error || 'Exact pinned HTTPS origin; no fallback.');
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
let publicKey = /^sb_publishable_/.test(key);
try {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  publicKey = claims.role === 'anon' && claims.ref === target.supabaseProjectRef;
} catch {
  // Publishable keys are opaque. Provenance must be verified in QA hosting preflight.
}
check(
  'QA public client key only',
  publicKey,
  'Never print key values or use a service-role client key.',
);
const mapboxPackagePath = require.resolve('@rnmapbox/maps/package.json');
const mapboxVersion = JSON.parse(fs.readFileSync(mapboxPackagePath, 'utf8')).version;
const tokenlessMapbox =
  mapboxVersion === '10.3.1' &&
  fs
    .readFileSync(path.join(path.dirname(mapboxPackagePath), 'rnmapbox-maps.podspec'), 'utf8')
    .includes('download token is no longer required');
check(
  'Mapbox SDK download prerequisites',
  tokenlessMapbox || !!process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
  tokenlessMapbox
    ? 'Pinned rnmapbox10.3.1 documents tokenless downloads; pod installation still must pass.'
    : 'Optional build credential stays in CocoaPods environment, never public Expo config.',
);
check('Explicit fresh build number', /^[1-9][0-9]*$/.test(process.env.OWNER_QA_BUILD_NUMBER || ''));
check('Release configuration', target.buildConfiguration === 'Release');
check('No automatic submission', target.autoSubmit === false);
try {
  const { getConfig } = require('@expo/config');
  const config = getConfig(root).exp;
  const sceneError = iosSceneSupportError(
    require('expo/package.json').version,
    require('expo-build-properties/package.json').version,
    config.plugins,
  );
  check(
    'Supported SDK 57 iOS scene configuration',
    !sceneError,
    sceneError || 'Native launch must still be verified.',
  );
} catch {
  check(
    'Supported SDK 57 iOS scene configuration',
    false,
    'Compatible runtime/config could not be verified.',
  );
}
try {
  const plist = JSON.parse(
    execFileSync(
      'plutil',
      ['-convert', 'json', '-o', '-', path.join(root, target.exportOptionsPlist)],
      {
        encoding: 'utf8',
      },
    ),
  );
  check(
    'Apple internal-only local export',
    plist.testFlightInternalTestingOnly === true &&
      plist.method === 'app-store-connect' &&
      plist.destination === 'export' &&
      plist.manageAppVersionAndBuildNumber === false,
  );
} catch {
  check('Apple internal-only local export', false, 'Export plist could not be verified.');
}
// Hosted synthetic-only provenance, delivery sinks, exact artifact and current
// TestFlight membership must be verified separately; config cannot prove them.
console.log(
  JSON.stringify({ checks, uploadAuthorized: false, hostedIntegration: 'NOT RUN' }, null, 2),
);
if (checks.some((c) => c.status !== 'PASS')) process.exitCode = 1;
