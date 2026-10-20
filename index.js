import { createDeletionService, validSessionId } from './host.js'

const ROUTE = '/api/dsh-session-delete/delete'
export const name = 'dsh-session-delete'
export const inject = ['workspaceRegistry', 'connection', 'sessions', 'agents', 'sessionPersistence', 'sessionProjectionCache']

export function apply(ctx, config = {}) {
  const service = createDeletionService(ctx, { singleHost: config.singleHost === true })
  // DSH's shared API carrier applies Host/Origin/authentication fences and
  // owner-principal admission BEFORE calling an exact fetch route (rc.2).
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE, methods: ['POST'], requestBody: 'buffered',
    fetch: async (request) => {
      if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return json(415, { error: 'bad-request', message: 'Expected application/json.' })
      }
      let payload
      try { payload = await request.json() } catch {
        return json(400, { error: 'bad-request', message: 'Invalid JSON.' })
      }
      if (!validSessionId(payload?.sessionId)) return json(400, { error: 'bad-request', message: 'Invalid or unsupported session ID.' })
      const result = await service.remove(payload.sessionId)
      return json(result.status, result.body)
    },
  }), 'dsh-session-delete: route')
  // Finish accepted work on disconnect/hot-unload. The cache fence lives as
  // long as its cache table, including after this plugin unloads.
  ctx.effect(() => () => service.close(), 'dsh-session-delete: drain')
  void service.pruneArchives().catch(() => {
    ctx.logger.warn(JSON.stringify({ plugin: name, phase: 'prune-archives', error: 'cleanup-failed' }))
  })
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
