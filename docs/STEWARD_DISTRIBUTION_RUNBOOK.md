# Pilot steward distribution runbook

Prepared 2026-09-17. **Draft only — do not distribute yet.** Release decision:
[Slice 6 readiness](SLICE_6_READINESS.md). This document sends nothing and creates
no accounts, invitations, events, or other live data. Fill every placeholder and
complete the release gates before the owner separately authorizes invitations.

## Chapter handoff sheet

| Item | Sigma Phi Epsilon, UCSB | Pi Beta Phi, UCSB |
| --- | --- | --- |
| Active-member steward | [SIGEP_ACTIVE_STEWARD_NAME / CONTACT] | [PI_PHI_ACTIVE_STEWARD_NAME / CONTACT] |
| Alumni steward | [SIGEP_ALUMNI_STEWARD_NAME / CONTACT] | [PI_PHI_ALUMNI_STEWARD_NAME / CONTACT] |
| Authorized chapter admin | [SIGEP_ADMIN_NAME / CONTACT] | [PI_PHI_ADMIN_NAME / CONTACT] |
| Verified candidate installation | [SIGEP_TESTFLIGHT_INSTALL_URL / BUILD] | [PI_PHI_TESTFLIGHT_INSTALL_URL / BUILD] |
| Verified chapter invitation | [SIGEP_CHAPTER_INVITE_URL / CODE] | [PI_PHI_CHAPTER_INVITE_URL / CODE] |
| Real upcoming event and host | [SIGEP_EVENT / DATE / HOST] | [PI_PHI_EVENT / DATE / HOST] |
| Welcome thread and responder | [SIGEP_WELCOME_THREAD / NAME] | [PI_PHI_WELCOME_THREAD / NAME] |
| Available mentors and response commitment | [SIGEP_MENTORS / COVERAGE] | [PI_PHI_MENTORS / COVERAGE] |

Shared release owner: [RELEASE_OWNER_NAME / CONTACT]. Technical escalation:
[TECHNICAL_OWNER_NAME / CONTACT]. Monitored support: [VERIFIED_SUPPORT_CONTACT].
Do not assume the support address shown in the app has been provisioned.

The active-member steward verifies the intended cohort, checks install/join
problems and pending approvals with the admin, welcomes members, and owns the
chapter funnel log. The alumni steward verifies alumni identity with the admin,
confirms designation and mentor availability, and follows up on unanswered
requests. Stewardship alone grants no admin privileges. Only an authorized
chapter admin approves, designates, or reinstates members through existing controls.

Before inviting anyone, both stewards confirm a real scheduled event, a welcome
thread with a named responder, and mentors who agreed to respond. These are
prerequisites, not content to fabricate. The release owner records the exact
candidate build/browser version, passed QA evidence, verified install and chapter
links, support coverage, and separate distribution approval.

## Member journey

1. Keep the original invitation. Its chapter link/code selects the chapter;
   the TestFlight installation link installs the candidate app. Installation
   does not join a chapter, and the chapter link does not enroll a TestFlight tester.
2. Follow [VERIFIED_TESTFLIGHT_INSTALL_URL] and install the verified Greek Ties
   candidate. If enrollment/build access is unavailable, contact the steward;
   another chapter code will not fix installation access.
3. Reopen the original chapter invitation after installation. If it opens in
   the browser or the app has no invitation, open Greek Ties and use **Paste an
   invitation link or code** / **Join a chapter**. Paste the original supported
   full link or raw code. Browser invitation state does not transfer to the app.
4. Check the full organization and UCSB identity before joining. Create an
   account or log in with the intended account. If asked to confirm email,
   confirm from the email, return to Greek Ties, and log in. Resume the saved
   invitation or paste it again. Do not start a second account to escape a delay.
5. If approval is pending, contact the chapter steward/admin and use **Check
   again** after approval. An invitation does not bypass review. A different
   chapter, removed membership, or declined request needs admin/support review.
   Each account belongs to one chapter; repeated invites do not transfer it.
6. Alumni ask the alumni steward to arrange verified admin designation. Editing
   professional role text to “Alumni” does not grant alumni access. After an
   authorized designation, refresh membership. Mentors choose their own
   availability; designation does not promise a response from every alumnus.
7. Complete useful profile fields; city and map sharing are optional. Alumni
   who choose a map pin enable **Share my city on the alumni map** and Save.
   A member who opted in before alumni designation must Save again afterward.
   Turning the switch off and saving removes the pin while retaining city text.
8. Within 48 hours, choose a useful action: introduce yourself in the welcome
   thread, RSVP to the real event, make/answer a mentorship request, or engage
   with a relevant job. Return within seven days to continue that conversation
   or activity. Stewards confirm progress manually; no analytics feature is needed.

## Recovery and escalation

| Symptom | Steward response |
| --- | --- |
| Install succeeded, invitation missing | Reopen the original invitation or paste its code in the app; verify chapter identity. |
| Interrupted signup/confirmation or switched devices | Keep the original invite, confirm email if requested, return and log in; paste again on the new platform. Check spam/email spelling without collecting passwords or confirmation tokens. |
| Invalid/revoked/expired invitation | Ask the authorized admin to verify/replace the invitation; keep installation instructions separate. |
| Temporary invitation/membership error | Use Retry invitation or Check again; preserve the original link. Escalate persistent errors with build, platform, time, and redacted steps. |
| Pending / removed / wrong chapter | Admin review. For an approved reinstatement decision: Me → Admin → Members → View removed / declined members → Reinstate → Confirm reinstatement. Reinstatement does not restore admin roles. Do not delete the profile to enable rejoining. |
| Map save uncertain or old app save fails | Do not claim opt-out succeeded until confirmed. Escalate; verify candidate version and V10 readiness. Never restore legacy coordinates or edit protected columns manually. |
| Message failed or delivery uncertain | Use Retry for that saved attempt; Discard removes local recovery, not a possibly delivered message. Preserve newer typing. Recovery ends on app termination/browser reload, so do not prescribe those as draft-preserving fixes. |
| Event/job share paused after leaving chat | Return, explicitly Add/Append to draft, review, then Send. Returning alone should not send. Report a stuck loading control. |
| Privacy, access, repeated duplicate-send or crash concern | Pause further chapter invitations and notify the release/technical owner through the agreed support channel. Capture a minimal redacted reproduction; do not weaken membership checks. |

Stewards review the queue daily during the pilot and arrange coverage before
promising a response time. The release owner must confirm the support and
moderation response commitment used in App Review copy. Do not request passwords,
tokens, or private message bodies in the funnel log. Support and operational
messages are future owner/steward actions, not authorized sends by this session.

## Invitation copy — unsent templates

Use separately for each chapter and replace every bracketed value.

> [CHAPTER_NAME], UCSB: join our Greek Ties pilot to meet chapter members,
> connect with alumni, and take part in [REAL_EVENT]. First install the verified
> app through TestFlight: [TESTFLIGHT_INSTALL_URL]. Then reopen this chapter
> invitation: [CHAPTER_INVITE_URL], or paste [CHAPTER_INVITE_CODE] in the app.
> Installation and joining are separate steps. If asked, confirm your email,
> return, and log in. If approval is pending, contact [ACTIVE_STEWARD]. Say
> hello in [WELCOME_THREAD] when you arrive. Help: [VERIFIED_SUPPORT_CONTACT].

Alumni follow-up:

> Alumni: contact [ALUMNI_STEWARD] so our chapter admin can verify your alumni
> designation. Let us know if you can respond to mentorship requests during
> [COVERAGE_WINDOW]. City and alumni-map sharing are optional. Start with an
> introduction in [WELCOME_THREAD] or join us for [REAL_EVENT].

## Manual chapter funnel

Keep a steward-controlled log outside the repository with one row per invited
person, an internal reference, chapter, cohort (active/alumni), steward, and the
dates/evidence below. Do not populate this draft with invented numbers.

| Stage | Count once when | Evidence |
| --- | --- | --- |
| Invited | Steward delivers the approved installation + chapter invitation | Sent date and steward |
| Installed | Member confirms the verified candidate app opens | Member confirmation and build |
| Joined | Member has approved access to the intended chapter | Member/admin confirmation; pending is separate |
| Useful action within 48 hours | One agreed useful action occurs within 48 hours of joining | Action category and date, without private content |
| Returned within seven days | Member returns in a later session within seven days of joining | Member/steward confirmation and date |

Report counts separately for each chapter and active/alumni cohort. Leave unknown
or unconfirmed stages blank, never infer installs from link clicks, and report
48-hour/seven-day outcomes only for cohorts whose observation window has elapsed.
Record pending approval, alumni designation pending, and support blockers beside
the funnel. A manual return confirmation is not automated retention telemetry.
