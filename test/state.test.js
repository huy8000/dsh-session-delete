import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { harness, deferred } from './helpers.js'
import { createDeletionService } from '../host.js'

function overridePersistence(h, overrides) {
  const original = h.face.sessionPersistence
  h.face.sessionPersistence = new Proxy(original, { get(target, key) {
    if (key in overrides) return overrides[key]
    const value = target[key]
    return typeof value === 'function' ? value.bind(target) : value
  } })
  return original
}

async function intact(h, protectedView = false) {
  await fs.access(h.log('session-1'))
  await fs.access(h.cache('session-1'))
  assert.deepEqual(h.workspace.sessionIds, protectedView ? [] : ['session-1'])
  assert.deepEqual(h.ctx.workspaceRegistry.table.get(h.workspace.id).sessionIds, ['session-1'])
  assert.deepEqual(h.events, [])
}

async function writable(h) {
  const table = h.ctx.sessionProjectionCache.table
  await table.put('session-1', table.get('session-1'))
  await h.workspace.detachSession('session-1')
  await h.workspace.attachSession('session-1')
  assert.deepEqual(h.workspace.sessionIds, ['session-1'])
}

test('ownership refusal preserves ordinary archive and pin state, then retries', async t => {
  const h = await harness(t)
  await h.seed()
  await h.ctx.workspaceRegistry.pinSession('session-1')
  const writer = await h.ctx.sessionPersistence.open('session-1', 'write')
  try {
    const result = await h.service.remove('session-1')
    assert.equal(result.body.error, 'session-owned')
    assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, [])
    assert.deepEqual(h.ctx.workspaceRegistry.pinnedSessionIds, ['session-1'])
    assert.equal(result.body.dataState, 'preserved')
    assert.equal(result.body.archive.after, false)
    await intact(h)
  } finally { await writer.close() }
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'deleted', JSON.stringify(result))
})

for (const archived of [false, true]) {
  test(`flush refusal preserves ${archived ? 'archived' : 'ordinary'} state without rollback`, async t => {
    const h = await harness(t)
    await h.seed()
    if (archived) await h.ctx.workspaceRegistry.archiveSession('session-1')
    const persistence = overridePersistence(h, { open: async (...args) => {
      const writer = await persistence.open(...args)
      return { header: writer.header, flush: async () => { throw new Error('injected') }, close: () => writer.close() }
    } })
    const result = await h.service.remove('session-1')
    assert.equal(result.body.state, 'rejected')
    assert.equal(h.ctx.workspaceRegistry.archivedSessionIds.includes('session-1'), archived)
    assert.equal(result.body.archive.before, archived)
    assert.equal(result.body.archive.after, archived)
    await intact(h)
    await writable(h)
  })
}

test('final directory check fails before irreversible cleanup or archive changes', async t => {
  let reads = 0
  let fail = true
  let h
  h = await harness(t, { fs: { ...fs, readdir: async (path, ...args) => {
    if (path === h.dir('session-1') && ++reads === 2 && fail) throw new Error('final check')
    return fs.readdir(path, ...args)
  } } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.protection, 'none')
  assert.deepEqual(h.ctx.workspaceRegistry.archivedSessionIds, [])
  await intact(h)
  await writable(h)
  await assert.rejects(fs.access(join(h.root, '.dsh-session-delete/session-1.json')), { code: 'ENOENT' })
  fail = false
  assert.equal((await h.service.remove('session-1')).status, 200)
})

for (const intercepted of [false, true]) {
  test(`prepared failure ${intercepted ? 'retains an exercised' : 'releases an unused'} fence and reports archive`, async t => {
    let fail = true
    let h
    h = await harness(t, { fs: { ...fs, open: async (path, ...args) => {
      if (fail && path === join(h.root, '.dsh-session-delete/session-1.json')) {
        if (intercepted) {
          const table = h.ctx.sessionProjectionCache.table
          await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
        }
        throw new Error('before first file removal')
      }
      return fs.open(path, ...args)
    } } })
    await h.seed()
    // No CAS exists upstream: automatic unarchive must never be attempted.
    let restores = 0
    const unarchive = h.ctx.workspaceRegistry.unarchiveSession.bind(h.ctx.workspaceRegistry)
    h.ctx.workspaceRegistry.unarchiveSession = async () => { restores++; throw new Error('rollback is unsafe') }
    const result = await h.service.remove('session-1')
    assert.equal(result.body.state, 'rejected')
    assert.equal(result.body.dataState, 'preserved')
    assert.equal(result.body.archive.after, true)
    assert.equal(result.body.archive.restoration, 'unsupported')
    assert.equal(result.body.protection, intercepted ? 'retained' : 'none')
    assert.equal(restores, 0)
    await intact(h, intercepted)
    if (!intercepted) await writable(h)
    else {
      const table = h.ctx.sessionProjectionCache.table
      await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
    }
    h.ctx.workspaceRegistry.unarchiveSession = unarchive
    fail = false
    assert.equal((await h.service.remove('session-1')).body.state, 'deleted')
  })
}

for (const action of ['archive', 'restore']) {
  test(`another client ${action}s after archive; preparation failure never rolls it back`, async t => {
    let h
    let operate
    h = await harness(t, { fs: { ...fs, open: async (path, ...args) => {
      if (path === join(h.root, '.dsh-session-delete/session-1.json')) {
        await operate()
        throw new Error('prepared failure after external operation')
      }
      return fs.open(path, ...args)
    } } })
    await h.seed()
    operate = () => action === 'archive' ? h.ctx.workspaceRegistry.archiveSession('session-1') : h.ctx.workspaceRegistry.unarchiveSession('session-1')
    const result = await h.service.remove('session-1')
    assert.equal(result.body.state, 'rejected')
    assert.equal(result.body.archive.after, action === 'archive')
    assert.equal(h.ctx.workspaceRegistry.archivedSessionIds.includes('session-1'), action === 'archive')
    await intact(h)
    await writable(h)
  })
}

test('directory changed during preparation is rejected, journal and unused fence are released', async t => {
  let inject = true
  let h
  h = await harness(t, { fs: { ...fs, open: async (path, ...args) => {
    const handle = await fs.open(path, ...args)
    if (inject && path === join(h.root, '.dsh-session-delete/session-1.json')) {
      await fs.mkdir(join(h.dir('session-1'), 'unexpected'))
    }
    return handle
  } } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.error, 'unsafe-path')
  assert.equal(result.body.protection, 'none')
  await intact(h)
  await writable(h)
  await assert.rejects(fs.access(join(h.root, '.dsh-session-delete/session-1.json')), { code: 'ENOENT' })
  inject = false
  await fs.rmdir(join(h.dir('session-1'), 'unexpected'))
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('a failure before the first unlink syscall releases an unused fence, not a partial result', async t => {
  let inspect = false
  let h
  h = await harness(t, { fs: { ...fs,
    open: async (path, ...args) => {
      const handle = await fs.open(path, ...args)
      if (path === join(h.root, '.dsh-session-delete/session-1.json')) inspect = true
      return handle
    },
    lstat: async (path, ...args) => {
      if (inspect && path === h.log('session-1')) throw new Error('final file check')
      return fs.lstat(path, ...args)
    },
  } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.dataState, 'preserved')
  assert.equal(result.body.protection, 'none')
  await intact(h)
  await writable(h)
})

test('failure to release a preparation writer is explicit and retains protection', async t => {
  const h = await harness(t)
  await h.seed()
  const persistence = overridePersistence(h, { open: async (...args) => {
    const writer = await persistence.open(...args)
    return { header: writer.header, flush: async () => { throw new Error('flush') }, close: async () => {
      await writer.close()
      throw new Error('close')
    } }
  } })
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.releaseFailed, true)
  assert.equal(result.body.protection, 'retained')
  await intact(h, true)
})

test('real SessionStore detach returns before the JSONL disposed close releases ownership', { timeout: 5000 }, async t => {
  const h = await harness(t)
  const header = await h.seed()
  const writer = await h.ctx.sessionPersistence.open('session-1', 'write')
  const entered = deferred()
  const release = deferred()
  const closed = deferred()
  const close = writer.close.bind(writer)
  writer.close = async () => {
    entered.resolve()
    await release.promise
    try { await close() } finally { closed.resolve() }
  }
  const session = h.ctx.sessions.prepare('session-1', { meta: header })
  const detach = h.ctx.sessions.enter(session)
  h.ctx.sessions.announce(session)
  session.append('turn/start', { turn: 1 })
  detach()
  await entered.promise
  try {
    assert.equal(h.ctx.sessions.get('session-1'), undefined)
    await assert.rejects(h.ctx.sessionPersistence.open('session-1', 'write'), { name: 'SessionAlreadyOwnedError' })
    const result = await h.service.remove('session-1')
    assert.equal(result.body.error, 'session-owned')
    assert.equal(result.body.archive.after, false)
    await intact(h)
  } finally { release.resolve(); await closed.promise }
  assert.equal((await h.service.remove('session-1')).body.state, 'deleted')
})

test('preparation journal cleanup failure keeps evidence and protection for an explicit retry', async t => {
  let fail = true
  let h
  h = await harness(t, { fs: { ...fs,
    lstat: async (path, ...args) => {
      if (fail && path === h.log('session-1') && await fs.access(join(h.root, '.dsh-session-delete/session-1.json')).then(() => true, () => false)) {
        throw new Error('after preparation')
      }
      return fs.lstat(path, ...args)
    },
    unlink: async path => {
      if (fail && path === join(h.root, '.dsh-session-delete/session-1.json')) throw new Error('cannot clear journal')
      return fs.unlink(path)
    },
  } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.protection, 'retained')
  await intact(h, true)
  await fs.access(join(h.root, '.dsh-session-delete/session-1.json'))
  fail = false
  assert.equal((await h.service.remove('session-1')).body.state, 'deleted')
})

test('a retry failure cannot release a protection retained by an earlier attempt or plugin instance', async t => {
  let attempt = 0
  let h
  h = await harness(t, { fs: { ...fs, open: async (path, ...args) => {
    if (path === join(h.root, '.dsh-session-delete/session-1.json')) {
      const table = h.ctx.sessionProjectionCache.table
      await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
      throw new Error('no journal created')
    }
    return fs.open(path, ...args)
  } } })
  await h.seed()
  const first = await h.service.remove('session-1')
  assert.equal(first.body.protection, 'retained')
  await h.service.close()
  const retry = createDeletionService(h.face, { singleHost: true, fs: { ...fs, open: async () => { attempt++; throw new Error('retry fails') } } })
  t.after(() => retry.close())
  const result = await retry.remove('session-1')
  assert.equal(attempt, 1)
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.protection, 'retained')
  const table = h.ctx.sessionProjectionCache.table
  await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
})

for (const archived of [false, true]) {
  test(`startup restores recovery protection for an ${archived ? 'archived' : 'unarchived'} ID without deleting`, async t => {
    const h = await harness(t)
    await h.seed()
    if (archived) await h.ctx.workspaceRegistry.archiveSession('session-1')
    await fs.mkdir(join(h.root, '.dsh-session-delete'))
    const { header } = await h.ctx.sessionPersistence.stat('session-1')
    await fs.writeFile(join(h.root, '.dsh-session-delete/session-1.json'), JSON.stringify({ version: 1, header }))
    await h.service.pruneArchives()
    const table = h.ctx.sessionProjectionCache.table
    await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
    await intact(h, true)
    await fs.access(join(h.root, '.dsh-session-delete/session-1.json'))
    const result = await h.service.remove('session-1')
    assert.equal(result.body.state, 'deleted', JSON.stringify(result))
  })
}

test('a Workspace predicate used during preparation is also evidence against releasing protection', async t => {
  let fail = true
  let h
  h = await harness(t, { fs: { ...fs, open: async (path, ...args) => {
    if (fail && path === join(h.root, '.dsh-session-delete/session-1.json')) {
      assert.deepEqual(h.workspace.sessionIds, [])
      throw new Error('failure after filtered read')
    }
    return fs.open(path, ...args)
  } } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.protection, 'retained')
  await intact(h, true)
  fail = false
  assert.equal((await h.service.remove('session-1')).status, 200)
})

test('a put intercepted while removing preparation metadata cannot accidentally lose its fence', async t => {
  let h
  h = await harness(t, { fs: { ...fs,
    lstat: async (path, ...args) => {
      if (path === h.log('session-1') && await fs.access(join(h.root, '.dsh-session-delete/session-1.json')).then(() => true, () => false)) {
        throw new Error('pre-delete check failed')
      }
      return fs.lstat(path, ...args)
    },
    unlink: async path => {
      if (path === join(h.root, '.dsh-session-delete/session-1.json')) {
        const table = h.ctx.sessionProjectionCache.table
        await assert.rejects(table.put('session-1', table.get('session-1')), { code: 'session-deleted' })
      }
      return fs.unlink(path)
    },
  } })
  await h.seed()
  const result = await h.service.remove('session-1')
  assert.equal(result.body.state, 'rejected')
  assert.equal(result.body.protection, 'retained')
  await intact(h, true)
  await assert.rejects(fs.access(join(h.root, '.dsh-session-delete/session-1.json')), { code: 'ENOENT' })
})

test('unreadable recovery metadata never claims that earlier deletion left intact data', async t => {
  const h = await harness(t)
  await h.seed()
  await fs.mkdir(join(h.root, '.dsh-session-delete'))
  await fs.writeFile(join(h.root, '.dsh-session-delete/session-1.json'), '{')
  const result = await h.service.remove('session-1')
  assert.equal(result.body.ok, false)
  assert.equal(result.body.dataState, 'uncertain')
  assert.equal(result.body.protection, 'retained')
  await intact(h, true)
})
