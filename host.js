import * as filesystem from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const VERSION = '0.2.1-rc.2'
const fences = new WeakMap()
const workspaceFences = new WeakMap()
const LOG = /^session(?:\.v[1-9][0-9]*)?\.jsonl(?:\.zstd)?$/

// DSH accepts arbitrary branded strings and encodes them for disk. Support
// only the JSON cache's safe-key subset (including session-1 and agent IDs).
export const validSessionId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)

class Refusal extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}
function refuse(code, message, status) { throw new Refusal(code, message, status) }

function checkVersions() {
  try {
    for (const name of ['session', 'agent', 'session-persistence-jsonl', 'session-projection-cache', 'storage-domain', 'storage-json', 'workspace', 'client-connection', 'api-session-controller']) {
      if (require(`@deepseek-ai/dsh-${name}/package.json`).version !== VERSION) {
        refuse('unsupported-runtime', 'Only DSH 0.2.1-rc.2 is supported.', 503)
      }
    }
  } catch {
    refuse('unsupported-runtime', 'DSH 0.2.1-rc.2 runtime packages could not be verified.', 503)
  }
}

// rc.2 has no public cache removal API. Use its existing KvTable's ordered
// delete (disk AND memory). Fence at the final put boundary: a suspended
// write is rejected later; an already queued put precedes delete on the
// domain chain. Keep the fence for this table's lifetime: hot-unload must
// not let an older suspended write resurrect a deleted checkpoint.
function cacheAdapter(cache) {
  const table = cache?.table
  const unit = table?.host?.unit
  if (unit?.descriptor?.name !== 'session_projcache' || unit.descriptor.layout !== 'per-record'
    || !isAbsolute(unit.dir ?? '') || typeof table?.delete !== 'function'
    || typeof table?.put !== 'function' || typeof table?.get !== 'function') {
    refuse('unsupported-runtime', 'The projection cache cannot be safely drained and removed.', 503)
  }
  let fence = fences.get(table)
  if (fence === undefined) {
    const blocked = new Set()
    const put = table.put
    const guardedPut = function (id, record) {
      if (blocked.has(id)) return Promise.reject(new Refusal('session-deleted', 'Session deletion blocks cache writes.'))
      return put.call(this, id, record)
    }
    table.put = guardedPut
    fence = { blocked, guardedPut }
    fences.set(table, fence)
  }
  if (table.put !== fence.guardedPut) refuse('unsupported-runtime', 'The cache write boundary has changed.', 503)
  return { table, blocked: fence.blocked, cacheRoot: unit.dir }
}

// Workspace keeps a header/path index after a cold log disappears. Fence the
// candidate predicate evaluated INSIDE each entity's domain update slot, so
// an attach started before deletion cannot put the erased ID back later.
function fenceWorkspace(registry, blocked) {
  const host = registry.host
  if (typeof host?.candidateMatches !== 'function') refuse('unsupported-runtime', 'Workspace membership cannot be fenced.', 503)
  let fence = workspaceFences.get(host)
  if (fence === undefined) {
    const original = host.candidateMatches
    const candidateMatches = (id, path) => !blocked.has(id) && original(id, path)
    host.candidateMatches = candidateMatches
    fence = { blocked, candidateMatches }
    workspaceFences.set(host, fence)
  }
  if (fence.blocked !== blocked || host.candidateMatches !== fence.candidateMatches) {
    refuse('unsupported-runtime', 'Workspace membership boundary changed; restart the Host.', 503)
  }
}

// Exact projectKey algorithm from the pinned JSONL provider.
export function projectKey(cwd) {
  if (cwd === undefined) return '_no-cwd'
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) refuse('unsafe-path', 'Invalid session project metadata.')
  let readable = ''
  let separator = false
  for (let i = 0; i < cwd.length; i++) {
    const ch = cwd[i]
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separator) readable += '-'
      separator = true
    } else {
      readable += ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)
        ? ch : '~' + cwd.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
      separator = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export function createDeletionService(ctx, { fs = filesystem, verifyVersions = checkVersions, singleHost = false } = {}) {
  const inflight = new Map()
  const pruning = new Map()
  let closed = false
  let runtime

  function adapter() {
    verifyVersions()
    const persistence = ctx.sessionPersistence
    if (persistence?.name !== 'session-persistence-jsonl' || typeof persistence.identity !== 'symbol' || !isAbsolute(persistence.root ?? '')
      || typeof persistence.open !== 'function' || typeof persistence.stat !== 'function'
      || typeof ctx.sessions?.get !== 'function' || typeof ctx.agents?.get !== 'function'
      || typeof ctx.waterfall !== 'function' || typeof ctx.parallel !== 'function') {
      refuse('unsupported-runtime', 'The session storage/lifecycle is unsupported.', 503)
    }
    const cache = cacheAdapter(ctx.sessionProjectionCache)
    fenceWorkspace(ctx.workspaceRegistry, cache.blocked)
    const next = { persistence, identity: persistence.identity, root: persistence.root, ...cache }
    if (runtime !== undefined && (runtime.identity !== persistence.identity || runtime.table !== cache.table
      || runtime.root !== next.root || runtime.cacheRoot !== next.cacheRoot)) {
      refuse('unsupported-runtime', 'Storage was replaced; restart the Host before deleting.', 503)
    }
    runtime = next
    return next
  }

  async function maybeStat(path) {
    try { return await fs.lstat(path) } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }

  // Validate every ancestor, including the configured root. No symlink walks.
  async function checkPath(path, kind) {
    const absolute = resolve(path)
    const base = parse(absolute).root
    let current = base
    const segments = relative(base, absolute).split(/[\\/]/).filter(Boolean)
    for (let i = 0; i < segments.length; i++) {
      current = join(current, segments[i])
      const info = await maybeStat(current)
      if (info === undefined) return undefined
      const leaf = i === segments.length - 1
      if (info.isSymbolicLink() || (leaf && kind === 'file' ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())) {
        refuse('unsafe-path', 'A storage path has an unsafe type or link.')
      }
    }
    // Also reject case-folding/normalization aliases (notably on macOS): an
    // absent ID must never unlink a different ID's case-colliding cache file.
    if (await fs.realpath(absolute) !== absolute) refuse('unsafe-path', 'A storage path aliases another spelling.')
    return maybeStat(absolute)
  }

  async function entries(path) {
    if (await checkPath(path, 'dir') === undefined) return []
    return fs.readdir(path, { withFileTypes: true })
  }

  async function inactive(id) {
    const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
    if (!Array.isArray(activity)) refuse('activity-unknown', 'Session activity could not be verified.')
    if (activity.length > 0) refuse('session-active', 'This session still has active work. Wait for it to finish.')
  }

  function cold(id) {
    // SessionEntry.detach neither destroys its Agent nor awaits disposed
    // observers. This plugin holds no official AgentHandle capability.
    if (ctx.sessions.get(id) !== undefined || ctx.agents.get(id) !== undefined) {
      refuse('live-unload-unsupported', 'DSH cannot safely unload this live session for a third-party plugin. Restart the Host, then retry before opening the session.')
    }
  }

  function headerValid(header, id) {
    if (header?.id !== id || !Number.isSafeInteger(header.version) || !Number.isFinite(header.createdAt)
      || typeof header.isSeeded !== 'boolean') refuse('unsafe-path', 'Session identity could not be verified.')
    projectKey(header.cwd)
    return header
  }

  async function locate(rt, id, header) {
    const matches = []
    for (const project of await entries(rt.root)) {
      if (project.name === '.dsh-session-delete') continue
      if (project.isSymbolicLink()) refuse('unsafe-path', 'Linked project directories are unsupported.')
      if (!project.isDirectory()) refuse('unsafe-path', 'Unexpected session storage structure.')
      const path = join(rt.root, project.name, id)
      if (await checkPath(path, 'dir') !== undefined) matches.push(path)
    }
    if (matches.length > 1) refuse('ambiguous-session', 'Multiple storage directories match this session.')
    const expected = header === undefined ? undefined : join(rt.root, projectKey(header.cwd), id)
    if (matches.length === 1 && expected !== undefined && matches[0] !== expected) {
      refuse('unsafe-path', 'Session metadata and its storage location disagree.')
    }
    const path = matches[0] ?? expected
    const files = []
    if (path !== undefined) {
      for (const entry of await entries(path)) {
        if (!entry.isFile() || (!LOG.test(entry.name) && entry.name !== 'session.lock')) {
          refuse('unsafe-path', 'Unexpected files or links in the session directory.')
        }
        await checkPath(join(path, entry.name), 'file')
        if (entry.name !== 'session.lock') files.push(entry.name)
      }
    }
    if (header === undefined && files.length > 0) refuse('storage-unknown', 'Unrecognized session data must be inspected before deletion.')
    return { path, files: files.sort() }
  }

  async function cachePath(rt, id) {
    const path = join(rt.cacheRoot, 'sessions', `${id}.json`)
    await checkPath(path, 'file')
    return path
  }

  async function journal(rt, id) {
    const folder = join(rt.root, '.dsh-session-delete')
    const path = join(folder, `${id}.json`)
    if (await checkPath(path, 'file') === undefined) return { folder, path }
    const record = JSON.parse(await fs.readFile(path, 'utf8'))
    if (record.version !== 1) refuse('journal-invalid', 'Deletion recovery metadata is unsupported.')
    headerValid(record.header, id)
    return { folder, path, record }
  }

  async function unlinkFile(path) {
    if (await checkPath(path, 'file') === undefined) return
    await fs.unlink(path)
  }

  async function detachWorkspaces(id) {
    for (const workspace of ctx.workspaceRegistry.list()) await workspace.detachSession(id)
  }

  async function perform(id) {
    let phase = 'preflight'
    let destructive = false
    let writer
    try {
      if (!singleHost) {
        refuse('exclusive-storage-unverified', 'Deletion requires singleHost: true and an exclusively owned storage directory. Shared-storage access cannot be verified by DSH.', 503)
      }
      const rt = adapter()
      await inactive(id)
      cold(id)
      const saved = await journal(rt, id)
      const snapshot = await rt.persistence.stat(id)
      if (snapshot?.formatStatus === 'migration-required') refuse('unsupported-format', 'Open/migrate this session with DSH before deleting it.')
      const header = snapshot === undefined ? saved.record?.header : headerValid(snapshot.header, id)
      if (saved.record !== undefined && snapshot !== undefined
        && JSON.stringify(saved.record.header) !== JSON.stringify(snapshot.header)) {
        refuse('identity-changed', 'A different session now occupies this ID.')
      }
      const target = await locate(rt, id, header)
      await cachePath(rt, id)
      if (snapshot !== undefined) {
        phase = 'archive'
        await ctx.workspaceRegistry.archiveSession(id, {})
        await inactive(id) // archive skips checking already-archived IDs
        cold(id)
        phase = 'ownership'
        writer = await rt.persistence.open(id, 'write')
        if (JSON.stringify(writer.header) !== JSON.stringify(header)) refuse('identity-changed', 'Session identity changed while acquiring ownership.')
        phase = 'flush'
        await writer.flush()
      } else if (target.files.length > 0) {
        refuse('storage-unknown', 'Partial storage without a readable log cannot be safely erased.')
      }
      await inactive(id)
      cold(id)
      if (snapshot !== undefined && !ctx.workspaceRegistry.archivedSessionIds.includes(id)) {
        refuse('archive-changed', 'The session was restored during deletion; retry.')
      }
      if (header !== undefined && saved.record === undefined) {
        phase = 'journal'
        await checkPath(saved.folder, 'dir')
        await fs.mkdir(saved.folder, { recursive: true, mode: 0o700 })
        await checkPath(saved.folder, 'dir')
        const handle = await fs.open(saved.path, 'wx', 0o600)
        try {
          await handle.writeFile(JSON.stringify({ version: 1, header }))
          await handle.sync()
        } finally { await handle.close() }
      }
      phase = 'files'
      destructive = true
      rt.blocked.add(id)
      const currentName = header?.version === 0 ? 'session.jsonl' : `session.v${header?.version}.jsonl`
      const current = target.files.find(file => file === currentName || file === `${currentName}.zstd`)
      const verified = await locate(rt, id, header)
      if (JSON.stringify(verified) !== JSON.stringify(target)) refuse('storage-changed', 'Session storage changed during deletion.')
      // Keep the current artifact until last: earlier failures remain
      // write-openable for a retry. No recursive deletion of unknown files.
      for (const file of target.files.filter(file => file !== current).concat(target.files.includes(current) ? [current] : [])) {
        await unlinkFile(join(target.path, file))
      }
      // Retain session.lock and its directory. Removing a POSIX lock inode
      // forfeits exclusion. These contain no conversation data.
      phase = 'cache'
      const path = await cachePath(rt, id)
      await rt.table.delete(id)
      await unlinkFile(path) // invalid/unloaded disk-only cache record
      if (rt.table.get(id) !== undefined) refuse('cache-not-removed', 'The cache still contains this session.')
      phase = 'close'
      if (writer !== undefined) {
        const owned = writer
        writer = undefined
        await owned.close()
      }
      phase = 'verify'
      cold(id)
      if (await rt.persistence.stat(id) !== undefined) refuse('storage-not-removed', 'Session storage still exists.')
      phase = 'workspace'
      await detachWorkspaces(id)
      phase = 'unarchive'
      await ctx.workspaceRegistry.unpinSession(id)
      await ctx.workspaceRegistry.unarchiveSession(id)
      phase = 'journal-cleanup'
      await unlinkFile(saved.path)
      phase = 'notify'
      await ctx.parallel('api-session/removed', id)
      return { status: 200, body: { ok: true, state: snapshot === undefined && saved.record === undefined ? 'already-absent' : 'deleted', sessionId: id } }
    } catch (error) {
      const owned = error?.name === 'SessionAlreadyOwnedError'
      const code = error instanceof Refusal ? error.code : owned ? 'session-owned' : `${phase}-failed`
      ctx.logger.warn(JSON.stringify({ plugin: 'dsh-session-delete', sessionId: id, phase, error: code, cause: error?.code ?? error?.name }))
      return { status: error instanceof Refusal ? error.status : owned ? 409 : 500, body: {
        ok: false, state: destructive ? 'partial' : 'rejected', error: code, phase, sessionId: id,
        message: error instanceof Refusal ? error.message : owned
          ? 'Session storage is still owned by a writer. Wait for it to close, then retry.'
          : 'Deletion could not complete. Retry after resolving the Host error.',
      } }
    } finally {
      if (writer !== undefined) {
        try { await writer.close() } catch (error) {
          ctx.logger.warn(JSON.stringify({ plugin: 'dsh-session-delete', sessionId: id, phase: 'release-after-failure', error: error?.code ?? error?.name }))
        }
      }
    }
  }

  function remove(id) {
    if (!validSessionId(id)) return Promise.resolve({ status: 400, body: { ok: false, state: 'rejected', error: 'bad-request' } })
    if (closed) return Promise.resolve({ status: 503, body: { ok: false, state: 'rejected', error: 'plugin-closing' } })
    if (pruning.has(id)) return pruning.get(id).then(() => remove(id))
    if (inflight.has(id)) return inflight.get(id)
    const operation = perform(id).finally(() => inflight.delete(id))
    inflight.set(id, operation)
    return operation
  }

  async function pruneArchives() {
    // Do not resume interrupted destructive work automatically. Only clean
    // bookkeeping for absent, unambiguous IDs; I/O errors preserve markers.
    if (!singleHost) return
    for (const id of [...ctx.workspaceRegistry.archivedSessionIds]) {
      if (closed) break
      if (!validSessionId(id) || inflight.has(id) || pruning.has(id)) continue
      const operation = (async () => {
        try {
          const rt = adapter()
          if ((await journal(rt, id)).record !== undefined) return
          await inactive(id)
          cold(id)
          if (await rt.persistence.stat(id) !== undefined) return
          if ((await locate(rt, id)).files.length > 0) return
          rt.blocked.add(id)
          await detachWorkspaces(id)
          await ctx.workspaceRegistry.unarchiveSession(id)
        } catch (error) {
          ctx.logger.warn(JSON.stringify({ plugin: 'dsh-session-delete', sessionId: id, phase: 'prune-archives', error: error?.code ?? error?.name }))
        }
      })().finally(() => pruning.delete(id))
      pruning.set(id, operation)
      await operation
    }
  }

  return { remove, pruneArchives, async close() {
    closed = true
    await Promise.allSettled([...inflight.values(), ...pruning.values()])
  } }
}
