import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as Cordis from '@deepseek-ai/cordis'
import * as Gateway from '@deepseek-ai/dsh-api-gateway/client'
import * as Store from '@deepseek-ai/dsh-client-store'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import * as Plugin from '../index.js'
import { harness, deferred } from './helpers.js'

const require = createRequire(import.meta.url)

test('real rc.2 connection: origin/Host/authentication and owner admission protect plugin route', async t => {
  const h = await harness(t)
  await h.seed()
  await h.ctx.plugin(ctx => { new HostConnectionService(ctx, [], {
    isAuthenticated: request => request.headers.get('cookie') === 'test-owner',
    authenticateApi: () => undefined,
  }) })
  const connection = h.ctx.connection
  const fiber = await h.ctx.plugin(Plugin, { singleHost: true })
  t.after(() => fiber.dispose())
  const url = 'http://127.0.0.1/api/dsh-session-delete/delete'
  const request = headers => new Request(url, { method: 'POST', headers: {
    host: '127.0.0.1', 'content-type': 'application/json', ...headers,
  }, body: JSON.stringify({ sessionId: 'session-1' }) })
  assert.equal(connection.admit(request({ origin: 'https://evil.example', cookie: 'test-owner' })).rejection, 403)
  assert.equal(connection.admit(request({ host: 'evil.example', cookie: 'test-owner' })).rejection, 403)
  assert.equal(connection.admit(request({ 'sec-fetch-site': 'cross-site', cookie: 'test-owner' })).rejection, 403)
  assert.equal(connection.admit(request({})).rejection, 401)
  const shared = connection.createSharedFetchHandler('/api')
  const guest = connection.createPeer({ principal: { kind: 'test-guest' } })
  assert.equal((await shared.fetch(request({}), guest)).status, 403)
  await access(h.log('session-1'))
  const req = request({ cookie: 'test-owner', origin: 'http://127.0.0.1' })
  const admission = connection.admit(req)
  assert.equal((await shared.fetch(req, admission.peer)).status, 200)
})

test('route rejects malformed JSON, unsafe IDs and non-JSON bodies', async t => {
  const h = await harness(t)
  await h.ctx.plugin(ctx => { new HostConnectionService(ctx, [], {}) })
  await h.ctx.plugin(Plugin)
  const shared = h.ctx.connection.createSharedFetchHandler('/api')
  const url = 'http://127.0.0.1/api/dsh-session-delete/delete'
  for (const [body, contentType, status] of [['{', 'application/json', 400], ['{"sessionId":"../escape"}', 'application/json', 400], ['{}', 'text/plain', 415]]) {
    const result = await shared.fetch(new Request(url, { method: 'POST', headers: { 'content-type': contentType }, body }), h.ctx.connection.browserPeer)
    assert.equal(result.status, status)
    assert.equal(result.headers.get('cache-control'), 'no-store')
  }
})

test('real rc.2 Session Controller: removal wins over an older in-flight refresh baseline for two clients', async t => {
  const bundle = await readFile(require.resolve('@deepseek-ai/dsh-api-session-controller/client'), 'utf8')
  let controller
  vm.runInNewContext(bundle, {
    window: { __ModuleLoader__: { load({ factory }) {
      controller = factory(id => ({ '@deepseek-ai/cordis': Cordis,
        '@deepseek-ai/dsh-api-gateway/client': Gateway,
        '@deepseek-ai/dsh-client-store': Store })[id])
    } } },
    console, AbortController, setTimeout, clearTimeout, queueMicrotask,
  })
  for (let i = 0; i < 2; i++) {
    const ctx = new Cordis.Context()
    t.after(() => ctx.fiber.dispose())
    const gate = deferred()
    const listeners = new Map()
    ctx.provide('connection', { generation: { getSnapshot: () => undefined, subscribe: () => () => {} } })
    ctx.provide('typert', { contexts: { registerClient: () => () => {} } })
    ctx.provide('remote', { $on: (name, fn) => { listeners.set(name, fn) }, session: { list: () => gate.promise },
      $stream: () => ({ run: () => { throw new Error('Unexpected control stream') }, dispose: async () => {} }) })
    controller.apply(ctx)
    const pull = ctx.sessions.refresh()
    listeners.get('api-session/removed')('session-1')
    // Same order as the plugin's success path while that older pull runs.
    ctx.sessions.handleSessionRemoved('session-1')
    const joined = ctx.sessions.refresh()
    gate.resolve({ ok: true, value: { items: [{ sessionId: 'session-1', running: false, blank: true, updatedAt: 1 }] } })
    await Promise.all([pull, joined])
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(ctx.sessions.list.getSnapshot().phase, 'ready')
    assert.equal(ctx.sessions.list.getSnapshot().byId['session-1'], undefined)
  }
})

test('real plugin route uses the safe default when singleHost is not configured', async t => {
  const h = await harness(t)
  await h.seed()
  await h.ctx.plugin(ctx => { new HostConnectionService(ctx, [], {}) })
  await h.ctx.plugin(Plugin)
  const response = await h.ctx.connection.createSharedFetchHandler('/api').fetch(new Request(
    'http://127.0.0.1/api/dsh-session-delete/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"sessionId":"session-1"}' },
  ), h.ctx.connection.browserPeer)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'exclusive-storage-unverified')
  await access(h.log('session-1'))
})

test('real route supports repeated requests through scoped Cordis service proxies', async t => {
  const h = await harness(t)
  await h.seed()
  await h.ctx.plugin(ctx => { new HostConnectionService(ctx, [], {}) })
  await h.ctx.plugin(Plugin, { singleHost: true })
  const shared = h.ctx.connection.createSharedFetchHandler('/api')
  for (const expected of ['deleted', 'already-absent']) {
    const response = await shared.fetch(new Request('http://127.0.0.1/api/dsh-session-delete/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"sessionId":"session-1"}',
    }), h.ctx.connection.browserPeer)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).state, expected)
  }
})
