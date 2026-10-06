# Slice 4 visual QA handoff

Paste into a fresh chat attached to Greek Ties once browser/computer inspection
is available. This prompt authorizes local inspection and QA documentation only.

```text
Perform local visual QA for Slice 4 in /Users/pkarakala/Desktop/greekties.
Read docs/SLICE_4_IMPLEMENTATION.md, docs/SLICE_4_REVIEW.md, and the pilot plan.
Inspect applicable AGENTS.md and preserve all uncommitted implementation work.

Slice 4 passed source/behavior review: 29 suites / 463 tests, typecheck, diff
checks, and lint with 0 errors / 26 warnings. Rendered visual approval is still
pending. Prior browser/computer tooling was unavailable or lacked permissions.
Check current supported inspection capabilities first. Do not bypass a denied
permission or claim generated HTML alone completes visual QA.

Inspect scripts/qa/render-slice4.cjs, then regenerate its synthetic static pages
if needed. They render actual app components without Expo startup or backend
access at /tmp/greekties-slice4-visual/index.html. Keep the network restrictions;
do not read live credentials or start the app against its existing remote config.
Use available browser tooling to view these fixtures and capture screenshots.
If a permitted isolated interactive fixture runtime already exists, also inspect
it; do not silently replace the real backend with unverified remote endpoints.

Review populated/sparse/loading/error/stale-retry Home and Me, Chats mentorship
discovery, representative Login and profile/map controls, at small and large
phone-width viewports and enlarged text. Inspect:
- Hierarchy, whitespace, text wrapping, card/button consistency, readable states.
- Long chapter names and job titles, long chat previews, fallback avatar sizing.
- Shared-token effects on form boundaries, disabled/loading buttons, and contrast.
- Focus, accessible labels, and actual five-tab/Admin return navigation where
  an interactive runtime supports it. Static fixtures cannot prove those flows.

Record fixture limitations: icons are substituted, controls do not navigate,
and browser inspection does not establish native layout, VoiceOver, keyboards,
real map rendering, or runtime authentication. Verify actual icons and native
behavior only where a compatible isolated runtime/device is available. Do not
mark unexecuted checks passed or use conceptual mockups as implementation proof.

Save docs/SLICE_4_VISUAL_QA.md with screenshot paths, tested viewports/states,
concrete findings with severity, and unexecuted checks. Update the pilot log.
Do not make speculative design edits; report reproducible corrections for review.
If inspection is still blocked, record the exact tool/permission prerequisite
and next owner action rather than looping or marking visual approval complete.

No production/remote data access, credentials, migrations, EAS/env changes,
builds, deployment, commits, pushes, external messages, or Slice 5 implementation.
V9–V11 stay unapplied; SQL/device release gates remain open. Return a concise
summary to the review chat.
```
