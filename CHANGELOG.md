# Changelog

## 1.0.0

Initial public release.

- Add a **Delete session** action to the session row menu.
- Archive the session, then flush and detach a live instance before deleting files.
- Remove the session directory, log, and projection cache from disk.
- Detach the session from workspace accounting and the client-side list.
- Clear the archive marker and prune orphaned archive ids on startup.
- Chinese and English UI strings.
