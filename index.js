import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Route registered on the Host; the browser addresses the same path. */
const ROUTE = '/api/dsh-session-delete/delete'

/** Ids reach the filesystem, so anything outside this shape is refused. */
const SAFE_ID = /^session-[A-Za-z0-9-]{4,80}$/

export const name = 'dsh-session-delete'

export const inject = ['workspaceRegistry', 'connection']

/**
 * Permanently remove one conversation: hide it through the supported archive
 * path, then delete its session directory and projection cache from disk.
 * @param ctx - Host context carrying the workspace registry and connection.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => deleteSession(ctx, request),
      }),
    'dsh-session-delete: route',
  )

  // A delete that stopped between archive and file removal can leave an id in
  // the durable archive set with no Session behind it. The id renders nothing,
  // but it is still dead state; clear it once the services are ready.
  ctx.inject(['sessions', 'sessionPersistence'], (child) => {
    void pruneOrphanedArchives(child).catch((error) => {
      child.logger.warn(`dsh-session-delete: pruning orphaned archive ids failed: ${messageOf(error)}`)
    })
  })
}

/**
 * Drop archive ids that have neither a live Session nor a stored log. At
 * startup, before any Client list exists, such an id cannot be restored and
 * only keeps dead state in the Workspace registry.
 * @param ctx - Host context with Sessions, persistence, and the registry.
 */
async function pruneOrphanedArchives(ctx) {
  for (const sessionId of [...ctx.workspaceRegistry.archivedSessionIds]) {
    if (ctx.sessions.get(sessionId) !== undefined) continue
    let snapshot
    try {
      snapshot = await ctx.sessionPersistence.stat(sessionId)
    } catch {
      // A storage fault is not proof of absence; keep the marker.
      continue
    }
    if (snapshot !== undefined) continue
    try {
      await ctx.workspaceRegistry.unarchiveSession(sessionId)
    } catch (error) {
      ctx.logger.warn(`dsh-session-delete: unarchiving orphaned '${sessionId}' failed: ${messageOf(error)}`)
    }
  }
}

/**
 * @param ctx - Host context.
 * @param request - The browser request carrying `{ sessionId }`.
 * @returns JSON response describing the outcome.
 */
async function deleteSession(ctx, request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'bad-request', message: '请求体不是合法的 JSON。' })
  }

  const sessionId = payload?.sessionId
  if (typeof sessionId !== 'string' || !SAFE_ID.test(sessionId)) {
    return json(400, { error: 'bad-request', message: '会话 id 不合法。' })
  }

  // The archive step is the real gate: it refuses a Session whose work is still
  // running. It does not unload a loaded-but-idle Session, though: that Session
  // keeps its persistence writer (and its `session.lock`) open, so the Host's
  // `session.list` would keep returning it forever. Drop the live instance
  // before touching its files.
  try {
    await ctx.workspaceRegistry.archiveSession(sessionId, {})
  } catch (error) {
    const detail = messageOf(error)
    const active = /active/i.test(detail)
    return json(409, {
      error: active ? 'session-active' : 'archive-rejected',
      message: active
        ? '这个会话还有进行中的工作，等它停下来后再删。'
        : `无法删除：${detail}`,
    })
  }

  await unloadLiveSession(ctx, sessionId)

  try {
    const removed = await removeSessionFiles(sessionId)
    await detachFromWorkspaces(ctx, sessionId)
    return json(200, { ok: true, removed })
  } catch (error) {
    return json(500, {
      error: 'delete-failed',
      message: `会话已从列表移除，但删除磁盘文件失败：${messageOf(error)}`,
    })
  }
}

/**
 * Flush and detach a live Session so its persistence writer closes and the
 * Host stops listing it. Archive already established that no work is running.
 * A cold Session (or a Host without the live handle) is left alone.
 * @param ctx - Host context.
 * @param sessionId - Validated session id.
 */
async function unloadLiveSession(ctx, sessionId) {
  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  if (sessions === undefined) return
  const session = sessions.get(sessionId)
  if (session === undefined) return

  try {
    await sessions.flush(session)
  } catch (error) {
    ctx.logger.warn(`dsh-session-delete: flushing '${sessionId}' before unload failed: ${messageOf(error)}`)
  }

  try {
    const entry = sessions.liveEntryFor(session)
    entry.detach()
  } catch (error) {
    ctx.logger.warn(`dsh-session-delete: detaching live session '${sessionId}' failed: ${messageOf(error)}`)
  }

  // `session/disposed` closes the writer asynchronously; give it a beat so the
  // directory removal does not race a final drain.
  await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * Drop the session from every workspace account. Archiving deliberately keeps
 * the accounting slot for unarchive; a deleted Session has nothing to restore.
 * @param ctx - Host context.
 * @param sessionId - Deleted session id.
 */
async function detachFromWorkspaces(ctx, sessionId) {
  for (const workspace of ctx.workspaceRegistry.list()) {
    // Call unconditionally: the public `sessionIds` getter hides ids whose
    // header can no longer be validated, but the durable record may still
    // carry the deleted slot. `detachSession` is a no-op when it does not.
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      ctx.logger.warn(`dsh-session-delete: detaching '${sessionId}' from workspace '${workspace.id}' failed: ${messageOf(error)}`)
    }
  }
}

/**
 * Delete the session directory under every project root plus its projection
 * cache. Only an exact directory named after the id is touched.
 * @param sessionId - Validated session id.
 * @returns the removed absolute paths.
 */
async function removeSessionFiles(sessionId) {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const removed = []

  const sessionsRoot = join(home, 'sessions')
  let projects = []
  try {
    projects = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    projects = []
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const dir = join(sessionsRoot, project.name, sessionId)
    if (await exists(dir)) {
      await rm(dir, { recursive: true, force: true })
      removed.push(dir)
    }
  }

  const cache = join(home, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
  if (await exists(cache)) {
    await rm(cache, { force: true })
    removed.push(cache)
  }

  return removed
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
