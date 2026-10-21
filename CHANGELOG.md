# Changelog

## 1.1.0 — 2026-10-21

- Support permanent deletion of unloaded idle sessions on stock DSH
  0.2.1-rc.2, and ordinary loaded idle sessions with the included, separate
  lifecycle source patch. Active work is refused without cancellation.
- Wait for owner teardown, Flush and returned disposal promises before file
  cleanup. Preserve data on required lifecycle failure; keep cache and
  Workspace write protection, per-session request joining and retry state.
- Restrict deletion to verified storage paths and recognized files. Report
  partial cleanup and unknown outcomes explicitly; notify clients only after
  successful cleanup and offer refresh-only retry for synchronization errors.
- Improve bilingual confirmation copy, title presentation, failure details,
  focus handling, scrolling and button spacing.
- Rewrite installation, compatibility, recovery and verification documentation.
  Include the pinned DSH source patch in the package and release assets.
- Retain syntax/package CI checks. The automated test suite was removed at
  the maintainer's request; runtime acceptance evidence is recorded separately.

Compatibility: DSH **0.2.1-rc.2** only; `singleHost: true` requires exclusive
single-Host storage. Loaded-session deletion requires the separate patch.
Shared storage, unsupported owners and untracked third-party background writes
are outside the supported scope. Deletion is permanent and not transactional.

Verification: actual patched Desktop idle deletion and restart persistence;
isolated official Host checks on Node 22/24; official upstream build (9 gates);
latest dialog preview in Chinese/English including long titles and Escape.
The latest dialog layout has not had a new Desktop regression run. This release
does not turn the historical automated test results into a current test suite.

## 1.1.0-rc.1 — development history (not separately released)

Maintenance update:

- Simplify the bilingual delete dialog copy, distinguish the conversation
  title from the warning, tighten action widths and group failure details.
  Omit the routine unarchived status without hiding partial/unknown outcomes.

- Complete the pinned upstream official build using its original Project
  References: all 9 build gates pass. Remove the earlier temporary typecheck
  blocker; keep the candidate version unchanged.
- Fix setup-counter typing, disposal error aggregation and public error-code
  documentation; scoped type-aware lint and export JSDoc checks pass.
- Verify the official built Host under Node 22/24, including disposal failure
  preserving logs/accounting and safe retry after restart.

- Remove the automated test suite, fixtures, test-only dependencies, npm test
  script and CI test step at the maintainer's request. Keep syntax and package
  checks. Test counts below describe historical runs, not the current tree.
- Add a pinned local DSH idle-retirement patch and integrate its public
  owner-delegated completion API. Ordinary loaded idle Agents can now be
  deleted on the patched Host; active turns, maintenance and pending input
  are refused without cancellation. Stock Desktop remains cold-only.
- Await Flush, owner teardown and returned disposal promises; hold same-ID
  input/publication admission and defer removal notification until cleanup.
- Verify loaded idle deletion, busy refusals, held disposal, Flush failure,
  repeated/concurrent requests and restart retry in an isolated Web Host.
  This is local runtime verification, not a Desktop build/release.
- Simplify the README and state the patched and stock Host behavior.

Third-stage acceptance (same candidate version):

- Fix real-browser focus loss on dismissal: remember the menu-opening control;
  when rc.2 hides its action strip, focus its connected tree row and restore
  its original tab order on blur. Do not focus a disconnected trigger.
- Bound the dialog height and allow scrolling in short/narrow viewports;
  verified keyboard access to the footer at 360×240.
- Add three focused component regressions (77 total). Validate isolated real
  Web cold deletion, two clients, refusals, network uncertainty, storage fault
  recovery, bilingual themes and restart persistence. Desktop regression and
  other unexecuted scenarios remain explicitly unverified.
- Expand the owner/admission/storage lifecycle proposal, with an English issue
  draft and staged upstream PR/test plan. No upstream submission or release.

Earlier work in this candidate:

- Acquire the cold writer lease, Flush and validate paths before archiving,
  preserving archive/pin state on those failures. Report observed archive
  state when rc.2 cannot safely perform a conditional rollback.
- Separate preparation from cleanup attempts. Release only a new unused
  protection after successful writer/journal cleanup; retain exercised or
  inherited protection and report it explicitly. Restore recovery protection
  on startup, including journals for IDs no longer archived.
- Treat lost/invalid Host responses as unknown outcomes in both languages;
  distinguish untouched-by-request data, observed archive state and retained
  protection. Unreadable recovery metadata never claims intact data.
- Add 22 incremental regression tests, including real SessionStore disposal
  versus JSONL ownership, concurrent archive/restore, preparation failures,
  delayed writes, retry and startup recovery. Total: 74 tests on Node 22/24.
- Recheck live ownership, client reference release and shared-storage limits;
  document a minimal upstream lifecycle API proposal. Live deletion remains
  refused. No Tag or Release is created.

## Previous hardening candidate (e4077a3)

That candidate retained **1.0.0**. Full 1.1.0 release acceptance is blocked by missing
upstream teardown ownership for live Sessions and shared-storage coordination.
The historical 1.0.0 feature list below describes the original implementation,
not the safe behavior of this candidate.

- Refuse live Session/Agent deletion instead of calling private `liveEntryFor`
  and continuing after failed flush/detach. Check activity independently for
  ordinary and already archived sessions; never force-stop work.
- Delete cold sessions under the official persistence write lease, with strict
  flush/close failures and no fixed sleep. Keep the stable lock inode/directory.
- Locate exact paths from the pinned provider and Header; reject ambiguous,
  linked, unknown, unreadable and unsupported storage instead of recursive rm.
- Fence delayed cache writes and Workspace reattachments per ID, use the cache
  Domain's ordered deletion, and propagate all necessary cleanup failures.
- Refuse disk deletion and startup cleanup by default unless the deployment
  explicitly declares exclusive single-Host storage with `singleHost: true`.
- Join concurrent requests, report rejected/partial/deleted/already-absent
  states, retain minimal recovery metadata, and support explicit cleanup retry
  after partial failure or process exit.
- Keep orphan pruning conservative; perform archive/pin cleanup on the Host.
  Publish the standard removal event after completion; preserve upstream
  client refresh mutation ordering and distinguish client sync failure.
- Fix menu Hook usage, show the title, protect same-turn duplicate clicks,
  retain bilingual errors, and improve dialog focus and accessibility.
- Pin compatibility to DSH 0.2.1-rc.2. Add Node behavioral tests using published
  upstream services, native lock/child-process tests and React component tests;
  add Linux/macOS + Node 22.19/24 CI, lockfile and package verification.
- Verify cold deletion, live/default refusals, confirmation keyboard behavior
  and restart persistence in an isolated real DSH Desktop environment.
- Document private adapters, single-Host limits, unverified UI/platform behavior
  and remaining release blockers. No tag or release is created.

## 1.0.0

Initial public release.

- Add a **Delete session** action to the session row menu.
- Archive the session, then flush and detach a live instance before deleting files.
- Remove the session directory, log, and projection cache from disk.
- Detach the session from workspace accounting and the client-side list.
- Clear the archive marker and prune orphaned archive ids on startup.
- Chinese and English UI strings.
