# Changelog

## Unreleased — reliability hardening candidate

Version remains **1.0.0**. Full 1.1.0 release acceptance is blocked by missing
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
