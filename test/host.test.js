import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readdir } from 'node:fs/promises'
import { harness } from './helpers.js'

test('real rc.2: cold session deletion cleans log, cache, workspace and archive', async t => {
  const h = await harness(t)
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.status, 200, JSON.stringify(result))
  assert.equal(result.body.state, 'deleted')
  await assert.rejects(access(h.log('session-1')), { code: 'ENOENT' })
  await assert.rejects(access(h.cache('session-1')), { code: 'ENOENT' })
  assert.equal(await h.ctx.sessionPersistence.stat('session-1'), undefined)
  assert.equal(h.ctx.sessionProjectionCache.table.get('session-1'), undefined)
  assert.deepEqual(h.workspace.sessionIds, [])
  assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, [])
  assert.deepEqual(h.events, ['session-1'])
  assert.deepEqual(await readdir(h.dir('session-1')), ['session.lock'])
})

// These are behavioral tests over the published rc.2 services, including their
// real kernel write lease, storage domain queue and durable Workspace updates.
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { deferred } from './helpers.js'
import { createDeletionService, projectKey, validSessionId } from '../host.js'

function wrapPersistence(h, overrides) {
  const original = h.face.sessionPersistence
  h.face.sessionPersistence = new Proxy(original, { get(target, key) {
    if (key in overrides) return overrides[key]
    const value = target[key]
    return typeof value === 'function' ? value.bind(target) : value
  } })
  return original
}

async function preserved(h, id = 'session-1') {
  await access(h.log(id))
  assert.equal(h.events.includes(id), false)
}

for (const archived of [false, true]) {
  test(`real rc.2: ${archived ? 'already archived' : 'ordinary'} active session is refused`, async t => {
    const h = await harness(t)
    await h.seed()
    if (archived) await h.ctx.workspaceRegistry.archiveSession('session-1')
    h.ctx.on('workspace/session-activity', async (_request, next) => [{ kind: 'turn' }, ...await next()])
    const result = await h.service.remove('session-1')
    assert.equal(result.body.error, 'session-active')
    assert.equal(result.body.state, 'rejected')
    await preserved(h)
  })
}

test('real rc.2: live session has no public teardown capability; private detach is never called', async t => {
  const h = await harness(t)
  const header = await h.seed()
  const session = h.ctx.sessions.create('session-1', { meta: header })
  let detached = false
  const original = h.face.sessions
  h.face.sessions = { get: id => original.get(id), liveEntryFor() { detached = true; throw new Error('detach failure') } }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'live-unload-unsupported')
  assert.equal(h.ctx.sessions.get('session-1'), session)
  assert.equal(detached, false)
  await preserved(h)
})

test('real rc.2: another write owner (including an unfinished disposal close) blocks deletion', async t => {
  const h = await harness(t)
  await h.seed()
  const writer = await h.ctx.sessionPersistence.open('session-1', 'write')
  try {
    const result = await h.service.remove('session-1')
    assert.equal(result.body.error, 'session-owned')
    await preserved(h)
  } finally { await writer.close() }
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('required flush failure preserves all disk data and releases the acquired handle', async t => {
  const h = await harness(t)
  await h.seed()
  const persistence = h.ctx.sessionPersistence
  let closed = false
  wrapPersistence(h, { open: async (...args) => {
    const writer = await persistence.open(...args)
    return { header: writer.header, flush: async () => { throw new Error('injected flush failure') },
      close: async () => { closed = true; await writer.close() } }
  } })
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'flush-failed')
  assert.equal(result.body.state, 'rejected')
  assert.equal(closed, true)
  await preserved(h)
  await access(h.cache('session-1'))
})

test('real rc.2: a queued asynchronous cache write drains before delete', async t => {
  const fileUnlinked = deferred()
  let h
  h = await harness(t, { fs: { ...fs, unlink: async path => {
    await fs.unlink(path)
    if (path === h.log('session-1')) fileUnlinked.resolve()
  } } })
  await h.seed()
  const unit = h.ctx.sessionProjectionCache.table.host.unit
  const original = unit.putRecord.bind(unit)
  const entered = deferred()
  const release = deferred()
  unit.putRecord = async (...args) => { entered.resolve(); await release.promise; return original(...args) }
  const pending = h.ctx.sessionProjectionCache.table.put('session-1', h.ctx.sessionProjectionCache.table.get('session-1'))
  await entered.promise
  let settled = false
  const deletion = h.service.remove('session-1').then(result => { settled = true; return result })
  // Explicit filesystem checkpoint: deletion has reached disk cleanup while
  // the older cache write is still blocked. No timing assumption.
  await fileUnlinked.promise
  assert.equal(settled, false)
  release.resolve()
  await pending
  assert.equal((await deletion).status, 200)
  await assert.rejects(access(h.cache('session-1')), { code: 'ENOENT' })
})

test('real rc.2: a cache write suspended BEFORE put cannot recreate a deleted cache, even after hot-unload', async t => {
  const h = await harness(t)
  const header = await h.seed()
  const session = h.ctx.sessions.prepare('session-1', { meta: header })
  const detach = h.ctx.sessions.enter(session)
  const release = deferred()
  const original = h.ctx.sessions.flush.bind(h.ctx.sessions)
  h.ctx.sessions.flush = async () => { await release.promise; return true }
  const late = h.ctx.sessionProjectionCache.write(session)
  detach()
  h.ctx.sessions.flush = original
  assert.equal((await h.service.remove('session-1')).status, 200)
  await h.service.close()
  release.resolve()
  await assert.rejects(late, { code: 'session-deleted' })
  await assert.rejects(access(h.cache('session-1')), { code: 'ENOENT' })
})

test('missing cache is harmless; missing session is explicitly idempotent', async t => {
  const h = await harness(t)
  await h.seed()
  await h.ctx.sessionProjectionCache.table.delete('session-1')
  assert.equal((await h.service.remove('session-1')).body.state, 'deleted')
  assert.equal((await h.service.remove('session-1')).body.state, 'already-absent')
  assert.equal((await h.service.remove('session-never-existed')).body.state, 'already-absent')
})

test('Workspace failure is partial, retains recovery metadata and can retry across plugin instances', async t => {
  const h = await harness(t)
  await h.seed()
  const detach = h.workspace.detachSession.bind(h.workspace)
  h.workspace.detachSession = async () => { throw new Error('injected workspace failure') }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'partial')
  assert.equal(result.body.error, 'workspace-failed')
  assert.equal(h.ctx.workspaceRegistry.archivedSessionIds.includes('session-1'), true)
  assert.deepEqual(h.events, [])
  await access(join(h.root, '.dsh-session-delete', 'session-1.json'))
  h.workspace.detachSession = detach
  const retry = createDeletionService(h.face, { singleHost: true })
  assert.equal((await retry.remove('session-1')).body.state, 'deleted')
  await retry.close()
  assert.deepEqual(h.workspace.sessionIds, [])
  assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, [])
})

test('an unlink failure does not mask success; the current log remains retryable', async t => {
  let failing = true
  const h = await harness(t, { fs: { ...fs, unlink: async path => {
    if (failing && path.endsWith('session.jsonl')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    return fs.unlink(path)
  } } })
  await h.seed()
  await fs.writeFile(join(h.dir('session-1'), 'session.jsonl'), 'older generation')
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'files-failed')
  assert.equal(result.body.state, 'partial')
  await preserved(h)
  failing = false
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('same-session simultaneous requests join exactly one deletion', async t => {
  const h = await harness(t)
  await h.seed()
  const a = h.service.remove('session-1')
  const b = h.service.remove('session-1')
  assert.equal(a, b)
  assert.equal((await a).status, 200)
  assert.deepEqual(h.events, ['session-1'])
})

test('different sessions delete concurrently without affecting another session', async t => {
  const h = await harness(t)
  await h.seed('session-1')
  await h.seed('agent-session-2')
  await h.seed('session-keep')
  const results = await Promise.all([h.service.remove('session-1'), h.service.remove('agent-session-2')])
  assert.deepEqual(results.map(result => result.status), [200, 200])
  await access(h.log('session-keep'))
  await access(h.cache('session-keep'))
  assert.deepEqual(h.workspace.sessionIds, ['session-keep'])
})

for (const unsafe of ['session-link', 'log-link', 'cache-link', 'linked-project', 'unexpected-file', 'duplicate']) {
  test(`unsafe storage: ${unsafe} is refused before deleting any data`, async t => {
    const h = await harness(t)
    await h.seed()
    const outside = join(h.home, 'outside')
    await fs.mkdir(outside)
    const marker = join(outside, 'keep')
    await fs.writeFile(marker, 'untouched')
    if (unsafe === 'session-link') {
      await fs.rename(h.dir('session-1'), join(h.home, 'saved'))
      await fs.symlink(outside, h.dir('session-1'), 'dir')
    } else if (unsafe === 'log-link' || unsafe === 'cache-link') {
      const path = unsafe === 'log-link' ? h.log('session-1') : h.cache('session-1')
      await fs.unlink(path)
      await fs.symlink(marker, path)
    } else if (unsafe === 'linked-project') {
      await fs.symlink(outside, join(h.root, '--link--'), 'dir')
    } else if (unsafe === 'unexpected-file') {
      await fs.mkdir(join(h.dir('session-1'), 'attachments'))
    } else {
      await fs.mkdir(join(h.root, '--other--', 'session-1'), { recursive: true })
    }
    const result = await h.service.remove('session-1')
    assert.equal(result.body.ok, false)
    assert.equal(result.body.state, 'rejected')
    assert.equal(await fs.readFile(marker, 'utf8'), 'untouched')
    assert.deepEqual(h.events, [])
  })
}

test('storage readdir EACCES is an error, never an empty root', async t => {
  const h = await harness(t, { fs: { ...fs, readdir: async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) } } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'preflight-failed')
  await preserved(h)
})

test('invalid IDs never reach storage', async t => {
  const h = await harness(t)
  for (const id of [null, '', '..', '../session-1', 'session/a', 'session\\a', 'session.1', 'x'.repeat(201), 1]) {
    assert.equal(validSessionId(id), false)
    assert.equal((await h.service.remove(id)).status, 400)
  }
  assert.equal(validSessionId('session-1'), true)
  assert.equal(validSessionId('agent-session-a_b'), true)
})

test('provider-configured root wins over process DSH_HOME; no default home is touched', async t => {
  const h = await harness(t)
  await h.seed()
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = join(h.home, 'unrelated-home')
  try { assert.equal((await h.service.remove('session-1')).status, 200) }
  finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
  }
  await assert.rejects(access(join(h.home, 'unrelated-home')), { code: 'ENOENT' })
})

test('orphan archive pruning cleans only absent sessions; preserves existing, active and I/O-unknown sessions', async t => {
  const h = await harness(t)
  for (const id of ['session-gone', 'session-kept', 'session-active', 'session-error']) {
    await h.seed(id)
    await h.ctx.workspaceRegistry.archiveSession(id)
  }
  await fs.unlink(h.log('session-gone'))
  await fs.unlink(h.log('session-active'))
  h.ctx.on('workspace/session-activity', async ({ sessionId }, next) => sessionId === 'session-active' ? [{ kind: 'job' }] : next())
  const persistence = h.ctx.sessionPersistence
  wrapPersistence(h, { stat: async id => {
    if (id === 'session-error') throw new Error('injected I/O error')
    return persistence.stat(id)
  } })
  await h.service.pruneArchives()
  assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, ['session-kept', 'session-active', 'session-error'])
  assert.equal(h.workspace.sessionIds.includes('session-gone'), false)
  await access(h.log('session-kept'))
})

test('missing critical private cache seam fails closed', async t => {
  const h = await harness(t)
  await h.seed()
  h.face.sessionProjectionCache = {}
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'unsupported-runtime')
  await preserved(h)
})

test('activity appearing after archive is refused', async t => {
  const h = await harness(t)
  await h.seed()
  let checks = 0
  h.ctx.on('workspace/session-activity', async (_payload, next) => ++checks > 2 ? [{ kind: 'turn' }] : next())
  assert.equal((await h.service.remove('session-1')).body.error, 'session-active')
  await preserved(h)
})

test('project key uses the pinned upstream escaping and truncation rules', () => {
  assert.equal(projectKey(undefined), '_no-cwd')
  assert.equal(projectKey('/a b/中/~test'), '--a~0020b-~4E2D-~007Etest--')
  assert.equal(projectKey('/'), '--root--')
  assert.equal(projectKey('/' + 'a'.repeat(300)).length, 255)
})

import { fork } from 'node:child_process'
import { once } from 'node:events'

test('real cross-process DSH write lease refuses deletion without deleting its lock inode', { timeout: 10000 }, async t => {
  const h = await harness(t)
  await h.seed()
  const child = fork(new URL('./fixtures/lease-holder.js', import.meta.url), [h.root, 'session-1'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  t.after(() => { if (child.exitCode === null) child.kill() })
  assert.deepEqual((await once(child, 'message'))[0], 'ready')
  const lock = await fs.stat(join(h.dir('session-1'), 'session.lock'))
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'session-owned')
  await preserved(h)
  child.send('release')
  await once(child, 'exit')
  assert.equal((await h.service.remove('session-1')).status, 200)
  assert.equal((await fs.stat(join(h.dir('session-1'), 'session.lock'))).ino, lock.ino)
})

test('real process exit after log deletion leaves an explicit recoverable partial operation', { timeout: 10000 }, async t => {
  const h = await harness(t)
  await h.seed()
  await h.service.close()
  await h.ctx.fiber.dispose()
  const child = fork(new URL('./fixtures/crash-delete.js', import.meta.url), [h.home], { stdio: 'inherit' })
  assert.equal((await once(child, 'exit'))[0], 23)
  await assert.rejects(access(h.log('session-1')), { code: 'ENOENT' })
  await access(join(h.root, '.dsh-session-delete', 'session-1.json'))
  const restarted = await harness(t, { existingHome: h.home })
  await restarted.service.pruneArchives()
  assert.equal(restarted.ctx.workspaceRegistry.archivedSessionIds.includes('session-1'), true)
  assert.equal((await restarted.service.remove('session-1')).body.state, 'deleted')
  assert.deepEqual(restarted.ctx.workspaceRegistry.archivedSessionIds, [])
})

test('real filesystem directory permissions refuse deletion (not only injected EACCES)', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const h = await harness(t)
  await h.seed()
  await fs.chmod(h.dir('session-1'), 0o500)
  try {
    const result = await h.service.remove('session-1')
    assert.equal(result.body.ok, false)
    await preserved(h)
  } finally { await fs.chmod(h.dir('session-1'), 0o700) }
})

test('real Workspace: an attachment suspended before deletion cannot reattach the removed ID', async t => {
  const h = await harness(t)
  await h.seed()
  const host = h.ctx.workspaceRegistry.host
  const read = host.readSessionHeader
  const entered = deferred()
  const release = deferred()
  await h.workspace.detachSession('session-1')
  host.readSessionHeader = async id => {
    const header = await read(id)
    entered.resolve()
    await release.promise
    return header
  }
  const attach = h.workspace.attachSession('session-1')
  await entered.promise
  assert.equal((await h.service.remove('session-1')).status, 200)
  release.resolve()
  await attach
  assert.deepEqual(h.workspace.sessionIds, [])
  assert.deepEqual(h.ctx.workspaceRegistry.table.get(h.workspace.id).sessionIds, [])
})

test('write-handle close failure is partial and never emits successful removal', async t => {
  const h = await harness(t)
  await h.seed()
  const persistence = h.ctx.sessionPersistence
  wrapPersistence(h, { open: async (...args) => {
    const writer = await persistence.open(...args)
    return { header: writer.header, flush: () => writer.flush(), close: async () => {
      await writer.close()
      throw new Error('injected close failure')
    } }
  } })
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'close-failed')
  assert.equal(result.body.state, 'partial')
  assert.deepEqual(h.events, [])
  assert.equal(h.ctx.workspaceRegistry.archivedSessionIds.includes('session-1'), true)
})

test('cache deletion failure is partial and retry completes the same operation', async t => {
  const h = await harness(t)
  await h.seed()
  const table = h.ctx.sessionProjectionCache.table
  const remove = table.delete.bind(table)
  table.delete = async () => { throw new Error('injected cache failure') }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'cache-failed')
  assert.equal(result.body.state, 'partial')
  assert.deepEqual(h.events, [])
  table.delete = remove
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('archive write failure never begins disk deletion', async t => {
  const h = await harness(t)
  await h.seed()
  h.ctx.workspaceRegistry.archiveSession = async () => { throw new Error('injected archive failure') }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'archive-failed')
  assert.equal(result.body.state, 'rejected')
  await preserved(h)
})

test('unarchive failure reports partial completion, then retries idempotently', async t => {
  const h = await harness(t)
  await h.seed()
  const unarchive = h.ctx.workspaceRegistry.unarchiveSession.bind(h.ctx.workspaceRegistry)
  h.ctx.workspaceRegistry.unarchiveSession = async () => { throw new Error('injected unarchive failure') }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'unarchive-failed')
  assert.equal(result.body.state, 'partial')
  assert.deepEqual(h.events, [])
  h.ctx.workspaceRegistry.unarchiveSession = unarchive
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('service unload waits for accepted deletion and refuses new requests', async t => {
  const h = await harness(t)
  await h.seed()
  const entered = deferred()
  const release = deferred()
  const detach = h.workspace.detachSession.bind(h.workspace)
  h.workspace.detachSession = async id => { entered.resolve(); await release.promise; return detach(id) }
  const deletion = h.service.remove('session-1')
  await entered.promise
  let closed = false
  const closing = h.service.close().then(() => { closed = true })
  assert.equal((await h.service.remove('session-2')).body.error, 'plugin-closing')
  assert.equal(closed, false)
  release.resolve()
  assert.equal((await deletion).status, 200)
  await closing
  assert.equal(closed, true)
})

test('real rc.2 compressed JSONL (the shipped default encoding) deletes successfully', async t => {
  const h = await harness(t, { compression: 'zstd' })
  await h.seed()
  await access(h.log('session-1'))
  assert.equal((await h.service.remove('session-1')).status, 200)
  await assert.rejects(access(h.log('session-1')), { code: 'ENOENT' })
})

test('default deployment fails closed without an explicit single-Host declaration', async t => {
  const h = await harness(t, { singleHost: false })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'exclusive-storage-unverified')
  assert.equal(result.body.state, 'rejected')
  await preserved(h)
  assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, [])
})

test('asynchronous removal observer failure is reported instead of returning false success', async t => {
  const h = await harness(t)
  await h.seed()
  const dispose = h.ctx.on('api-session/removed', async () => { throw new Error('injected async notification failure') })
  const result = await h.service.remove('session-1')
  assert.equal(result.body.error, 'notify-failed')
  assert.equal(result.body.state, 'partial')
  await assert.rejects(access(h.log('session-1')), { code: 'ENOENT' })
  dispose()
  assert.equal((await h.service.remove('session-1')).body.state, 'already-absent')
})

test('case-folding aliases cannot delete another session ID cache on macOS', async t => {
  const h = await harness(t)
  await h.seed('session-A')
  await fs.unlink(h.log('session-A'))
  const result = await h.service.remove('session-a')
  assert.equal(['already-absent', 'rejected'].includes(result.body.state), true)
  await access(h.cache('session-A'))
  assert.notEqual(h.ctx.sessionProjectionCache.table.get('session-A'), undefined)
})
