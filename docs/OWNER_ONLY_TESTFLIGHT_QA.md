# Owner-only TestFlight QA preparation

This is a synthetic-data QA candidate, not public-release clearance. Account
upload/deletion coordination remains defective; see
[review findings](ACCOUNT_DELETION_COORDINATION_LIMITS.md). The server finalization
safeguard and disabled legacy RPC are preserved. For this QA build, deletion is
unavailable before any destructive request. A separate Free hosted QA project was provisioned on 2026-10-14 after the
$0/month eligibility check. Local Release archive/export preparation is recorded
in owner-testflight-build beside the QA handoff. No binary upload is authorized.

## Build 14 launch defect and SDK 57 repair

Build 14 was uploaded with owner-only authorization, but immediately failed to
launch on the owner's iOS 27 device. Its iOS 27-linked native binary lacked the
required scene lifecycle. Original IPA, symbols and five device reports remain
preserved in the release-QA evidence; they must not be overwritten.

The separately approved compatibility repair pins Expo **57.0.29** and
expo-build-properties **57.0.22**, with `ios.enableSceneSupport=true`. Required
SDK dependencies use Expo's SDK 57 compatibility table, including React Native
0.86.3. Supabase and Mapbox resolutions remain unchanged. SDK 58 is outside this
repair. The owner preflight now rejects an unsupported runtime or missing scene
configuration, but that structural check is not a native startup test.

Generate native files only in an isolated complete source copy. The replacement
uses build number **15** and the existing QA backend/deletion restrictions.
Release startup, foreground/background transitions, SecureStore session
persistence and warm/cold links require native execution evidence; compilation
alone cannot close the launch defect. A blocked simulator check remains explicit.
The new internal-only IPA must stop before upload for owner approval and a fresh
recipient/build-number audit. Historical Build 14 upload authorization does not
apply to the replacement. Public release remains HOLD.

Expo's supported scene migration and patch requirements:
https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md.

## Current prerequisites and costs

The verified QA project is `greekties-owner-qa-20261014`, ref
`cfeaytslodpfthjaypyo`, API `https://cfeaytslodpfthjaypyo.supabase.co`, in the
separate **Greek Ties Owner QA** Free organization `ciwzsfvpmhjfcbsojeqo`.
The creation form showed Free **$0/month**; project UI showed **Free / Nano**.
Supabase documents two Free projects across Owner/Admin organizations; only one
existing project was listed before creation. No plan upgrade, paid compute,
project deletion or shared paid organization was used. No additional charges
were authorized. Free quotas/pause limits apply; never upgrade automatically.
Official reference: https://supabase.com/docs/guides/platform/billing-on-supabase.
Local Xcode uses no EAS cloud build credits.

The fresh project's Auth/Storage/public tables were verified empty first. A
schema-only export of the verified disposable local QA database was sanitized
and imported without any member rows, historical push triggers, or external
endpoints. The local catalog originated from an earlier catalog-only capture;
no production access occurred in this run. Hosted default ACLs differ: restore
**both object-level and column-level grants explicitly**, then compare with the
local effective ACLs. The saved scripts/evidence document the corrected import,
356 object privilege commands, 42 column grants, RLS and deletion guards.

Four confirmed synthetic Auth accounts plus 51 synthetic directory-only rows
populate two isolated chapters. User checks use normal password JWTs and the QA
anon key; service-role credentials are limited to fixture/bucket setup and kept
in private temporary files. All Auth emails end in `@example.test`.
Self-signup is disabled; the email/password provider remains enabled. SMTP points
to `smtp-disabled.greekties.invalid`, replacing the default sender. SMS is disabled.
No push Edge Functions/outbound SQL triggers are installed, and the QA public
manifest omits the Expo push project ID, preventing push-token registration.
Mapbox runtime token is empty, so live map service checks are NOT RUN.

Before pinning a project ref, verify its creation/provenance and owner, empty initial
data, schema-only import origin, all API/Auth/Storage/Realtime/function destinations,
RLS/grants and current deletion safeguards. Use synthetic accounts and normal JWTs
for user checks. Do not blindly replay historical migrations containing external
push endpoints. Disable external email/SMS/push; use an approved capture sink or
clearly labeled mocks. Preprovision synthetic normal accounts, pending/approved
student/alumni variants, populated plans/jobs/chats and mentorship threads. Do not
copy real credentials or member data. Provisioning changes were restricted to the verified new QA project and recorded
in owner-testflight-build. Never replay the import against another destination.

## Prepared client safety

`config/owner-qa-release.json` pins the separately verified synthetic QA project.
Missing or mismatched pins block a QA build. The known
existing app ref is explicitly rejected. Merely naming an EAS environment "preview"
does not prove isolation.

With `EXPO_PUBLIC_BUILD_VARIANT=owner-qa`, app config rejects unpinned/mismatched
origins and names the app Greek Ties QA. At runtime a config error prevents use of
an invalid backend, and the Supabase fetch wrapper refuses non-QA origins and
redirects. It rejects account-deletion Edge/RPC/admin-user routes before transport.
Me displays an unavailable notice and disabled action; its handler also returns
before any deletion operation. Ordinary builds retain their existing behavior.
Existing server-side cleanup/finalization guards are unchanged.

Use `.env.owner-qa.example` only as a template. Real QA values belong in the ignored
`.env.owner-qa.local` or private shell environment, never a QA source artifact.
The pinned rnmapbox 10.3.1 supports tokenless CocoaPods downloads (verified by
actual pod installation). Optional download credentials remain in CocoaPods
environment values and are omitted from the QA public Expo manifest. Run the owner preflight
without default dotenv loading:

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_BUILD_VARIANT=owner-qa EAS_BUILD_PLATFORM=ios \
  node scripts/qa/owner-qa-preflight.cjs
```

It is read-only, exits nonzero while prerequisites are absent, and cannot provision,
build or upload. It checks the destination, public client-key shape/project claim,
pinned Mapbox SDK download requirements, explicit build number, Release configuration, and
internal-only local export settings. It does not prove hosted synthetic-only data,
provider delivery sinks, native rendering, or exact future tester membership.

## Release build route — local archive, internal-only export

Use local Xcode (27.0 was available during preparation) in an isolated complete
source copy. This is an App Store-signed **Release** build, not Expo Go, a simulator
binary or EAS `distribution: internal` (ad hoc). Keep the existing bundle ID
`com.greekties.app` and ASC app `6811528438`; this candidate replaces this app's
installation on the owner's device. QA and production sessions use different
Supabase project namespaces. Display name identifies QA; no new UI redesign.

After hosting prerequisites and owner approval of build/signing setup:

1. Verify a fresh build number in ASC; 13 was last observed, not a reservation of14.
   Set `OWNER_QA_BUILD_NUMBER` explicitly. Load only private QA environment values;
   export `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_BUILD_VARIANT=owner-qa`, and
   `EAS_BUILD_PLATFORM=ios`. Run the preflight in the isolated source copy.
2. Resolve/install the reviewed SDK 57 lockfile there; do not select SDK 58 or
   independently upgrade unrelated dependencies.
   Run `expo prebuild --platform ios` in that copy only. Determine the generated
   workspace/scheme rather than guessing their filenames. Native signing team,
   distribution certificate/provisioning profile and Mapbox SDK download must
   be verified before archive. Do not use the existing EAS production profile.
3. Use `xcodebuild archive` with `-configuration Release`,
   `-destination 'generic/platform=iOS'`, an explicit archive path and fresh build
   number. Use the separate `Greek Ties Owner QA 20261014 Distribution` App Store profile
   with team `4Z96MG78TQ` and the verified local Distribution certificate/private
   key. The generated app Release target uses manual signing; Pods receive no
   provisioning profile. Explicit `-allowProvisioningUpdates` was used to download
   the missing named profile, without device registration or revocation. Xcode27
   requires the generated Mapbox resource target to use iOS16.4, matching the app;
   the archive command sets that minimum in the isolated generated workspace.
4. Export locally with the saved plist:

```sh
xcodebuild -exportArchive -archivePath /ABSOLUTE/OwnerQA.xcarchive \
  -exportPath /ABSOLUTE/owner-qa-export \
  -exportOptionsPlist config/OwnerQAExportOptions.plist
```

`destination=export` prevents this command from uploading. The installed Xcode
help documents `testFlightInternalTestingOnly=true` as disallowing external
TestFlight and App Store distribution. Verify the exact export log/IPA identity,
release bundle's QA URL/marker and blocked deletion routes, signatures, build
number, and archive/export source hashes. No ordinary EAS Submit/auto-submit route
is prepared: it must not replace this internal-only export.

5. Run automated native/hosted smoke checks where available. Stop with exact IPA
   path/hash, environment evidence, updated group audit and smoke results for
   explicit upload approval. No upload or tester notification before that approval.

## Verified distribution boundary and required recheck

Read-only App Store Connect observation on 2026-10-14:

- Internal `Team (Expo)` group: ID `20ebfaa8-3826-4a5e-9705-202ac7a811af`, exactly
  one tester, pkarakala@gmail.com / Pranav Reddy. Build distribution says
  "Automatic for Xcode Builds". No other internal group was listed.
- External `Friends Name`: ID `ebff96cf-9361-47ef-ab92-4408fbb20750`, three testers,
  one existing build (10). No public link exists ("Create Public Link" displayed).
  Settings expose no automatic-build-distribution control. No membership,
  settings or build association was changed.

The existing external group is not a reason to distribute this candidate there.
[Apple documents](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
that an internal-only exported build cannot be assigned to external groups or
customers. That export restriction is the external-distribution control; absence
of a settings control alone is not proof that all remote automations are disabled.
The current one-member internal group establishes the intended owner recipient.
Recheck all internal groups/testers and automation immediately before upload:
any additional automatic internal group/member blocks owner-only clearance.
Exact future binary/internal-only marking and its eventual assignments are NOT
verified before a build/upload exists. Do not claim delivered/owner-only distribution
from configuration or historical build13 alone.

## Finite automated smoke matrix

Prepared and locally checked: QA destination allowlist/production rejection;
missing configuration blocks; deletion UI disabled/no confirmation/no requests;
transport rejects deletion RPC/Edge routes and foreign origins; redirects refused;
non-QA Me behavior preserved; Release/export configuration and internal-only flag.

Hosted/browser checks completed in this run: normal synthetic signup/login
or explicitly mocked email flows; approved/pending membership and Home/People;
two-user group/mentorship sending/reconnect; event RSVP persistence; jobs links;
profile/avatar operations; logout/account switch; deletion remains unavailable with
zero destructive requests. Use synthetic fixture IDs, sanitized network logs and
strict nonzero failure exits. Email/push delivery is a sink/mock, not an external
service PASS. Native launch/render/auth/deletion-disabled checks remain NOT RUN
until an actual QA release artifact/tooling is available. No manual testing is
requested in this preparation. W01 remains a separate unresolved historical
observation with its prior passing bounded diagnostics.

Owner-only QA may proceed with deletion unavailable once isolation, build/signing,
smoke and recipient checks pass. Public release stays HOLD for the deletion defect
and deferred native/external-service gaps. No permanent disablement is called a fix.

## Current evidence and remaining gates

See `OWNER_TESTFLIGHT_BUILD_HANDOFF.txt` and `owner-testflight-build/` beside the
2026-10-13 QA handoff for exact final commands/results/artifact identity. All
initial failures are retained; a group Realtime delivery timeout remains an
unexplained observation despite one focused diagnostic and subsequent passing
bounded matrices. It is not labeled transient or fixed.

The owner elected to perform the fresh App Store Connect group/tester audit after
the browser connection became unavailable. Do not claim sole-recipient clearance
until that audit confirms only `pkarakala@gmail.com` in every automatic internal
group. Internal-only export restrictions do not restrict the number of internal
testers. No tester/group/build associations were changed.

Public release remains HOLD for the unresolved deletion lifecycle defect and
native/external-service gaps. QA deletion is intentionally unavailable, not fixed.
W01 remains a historical unresolved observation with prior passing diagnostics;
this run makes no W01 fix claim. No manual app testing is requested here.
