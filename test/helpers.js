import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Sessions, { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import Agents from '@deepseek-ai/dsh-agent'
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Projections from '@deepseek-ai/dsh-session-projection'
import Cache from '@deepseek-ai/dsh-session-projection-cache'
import Storage from '@deepseek-ai/dsh-storage'
import * as Json from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import Workspaces from '@deepseek-ai/dsh-workspace'
import { createDeletionService, projectKey } from '../host.js'

export function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

export async function harness(t, options = {}) {
  // realpath canonicalizes macOS /var -> /private/var BEFORE safety checks.
  const home = options.existingHome ?? await realpath(await mkdtemp(join(tmpdir(), 'dsh-delete-test-')))
  const ctx = new Context()
  const root = join(home, 'sessions')
  const storage = join(home, 'storages')
  const cwd = join(home, 'project')
  const logs = []
  const events = []
  await mkdir(cwd, { recursive: true })
  await ctx.plugin(Storage)
  await ctx.plugin(Json, { root: storage })
  await ctx.plugin(Domain, { backend: 'json' })
  await ctx.plugin(Sessions)
  await ctx.plugin(Agents)
  await ctx.plugin(Projections)
  await ctx.plugin(Persistence, { root, compression: options.compression ?? 'none' })
  await ctx.plugin(Cache, { writeEveryEvents: 100, writeIntervalMs: 60_000 })
  await ctx.plugin(Workspaces)
  const workspace = await ctx.workspaceRegistry.create(cwd)
  ctx.on('api-session/removed', id => events.push(id))
  // Keep actual Cordis service receiver behavior; only logs use a small facade.
  const face = {
    sessionPersistence: ctx.sessionPersistence,
    sessions: ctx.sessions,
    agents: ctx.agents,
    sessionProjectionCache: ctx.sessionProjectionCache,
    workspaceRegistry: ctx.workspaceRegistry,
    waterfall: (...args) => ctx.waterfall(...args),
    parallel: (...args) => ctx.parallel(...args),
    logger: { warn: value => logs.push(value) },
  }
  const service = createDeletionService(face, { singleHost: true, ...options })
  t.after(async () => {
    await service.close()
    await ctx.fiber.dispose()
    await rm(home, { recursive: true, force: true })
  })
  const meta = id => ({ version: SESSION_FORMAT_VERSION, id, createdAt: 10, isSeeded: false, cwd })
  async function seed(id = 'session-1') {
    const header = meta(id)
    const writer = await ctx.sessionPersistence.create(header)
    await writer.flush()
    await writer.close()
    // Public enter()/announce() with the retained detach capability, as an
    // owning upstream consumer would use it. The plugin never owns this.
    const session = ctx.sessions.prepare(id, { meta: header })
    const detach = ctx.sessions.enter(session)
    ctx.sessions.announce(session)
    await ctx.sessionProjectionCache.write(session)
    detach()
    // Await the real cache domain's queue after the disposal write.
    await ctx.sessionProjectionCache.table.put(id, {
      identity: { formatVersion: header.version, createdAt: 10, cwd, isSeeded: false, inheritedEventCount: 0 }, rows: {},
    })
    await workspace.attachSession(id)
    return header
  }
  return { ctx, face, service, root, storage, cwd, home, workspace, events, logs, seed, meta,
    dir: id => join(root, projectKey(cwd), id),
    log: id => join(root, projectKey(cwd), id, `session.v${SESSION_FORMAT_VERSION}.jsonl${options.compression === 'zstd' ? '.zstd' : ''}`),
    cache: id => join(storage, 'session_projcache', 'sessions', `${id}.json`),
  }
}
