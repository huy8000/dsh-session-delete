window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Host route that archives and then deletes one conversation. */
    const ROUTE = '/api/dsh-session-delete/delete'
    const NS = 'dsh-session-delete'

    const zh = {
      menu: '删除会话',
      title: '删除会话？',
      close: '关闭',
      warning: '此会话的聊天记录将被永久删除，无法恢复。',
      cancel: '取消',
      confirm: '永久删除',
      busy: '正在删除…',
      failed: '删除失败',
      active: '会话正在运行，请等待任务结束后重试。',
      owned: '会话存储仍由写入者占用，可能正在关闭。请等待写入者释放后重试，不要删除锁文件。',
      liveUnsupported: '此 DSH 尚未安装空闲会话关闭补丁。请使用已修补的 Host，或重启 Host 后在打开此会话前删除。',
      retireFailed: '无法安全关闭会话，请重启 DSH 后重试。',
      unsafePath: '会话存储位置或目录结构无法安全确认，已拒绝删除。请检查 Host 日志。',
      unsupported: '当前 DSH 版本或存储接口未经验证，已拒绝删除。',
      exclusiveStorage: '尚未确认存储目录由单个 Host 独占，已拒绝删除。只有部署确实满足该条件时才能配置 singleHost: true；共享存储不受支持。',
      hostFailed: 'Host 未能完成删除。请排除存储或 Workspace 错误后重试。',
      partial: '清理已开始或上次操作尚未完成，数据可能已部分删除。请排除错误后重试。',
      syncFailed: 'Host 已确认删除，但客户端同步失败。请重试刷新或重新加载页面。',
      retrySync: '重试刷新',
      unknown: 'Host 结果未知：连接中断或响应无效，删除可能已经完成。请刷新核对，必要时重试同一会话。',
      preserved: '本次未删除聊天记录。',
      dataUnknown: '无法确认会话数据完整性，请检查 Host 日志和存储，勿假定数据仍完整。',
      archived: '会话当前已归档；可重试删除，或在 DSH 中手动恢复。',
      archiveUnknown: '当前归档状态无法确认，请刷新检查。',
      noRollback: '为保留其他客户端的操作，插件未自动恢复归档。',
      protected: 'Host 仍保留清理保护，请排除错误后重试。若要继续使用会话，请先重启 Host 并确认数据完整。',
    }

    const en = {
      menu: 'Delete session',
      title: 'Delete conversation?',
      close: 'Close',
      warning: 'This conversation’s chat history will be permanently deleted. This cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Delete permanently',
      busy: 'Deleting…',
      failed: 'Delete failed',
      active: 'This conversation is running. Wait for the task to finish, then try again.',
      owned: 'Session storage is still owned by a writer, possibly closing. Wait for ownership to be released; do not delete the lock file.',
      liveUnsupported: 'This Host needs the idle-session retirement patch. Use a patched Host, or restart and delete before opening this session.',
      retireFailed: 'The conversation could not close safely. Restart DSH and try again.',
      unsafePath: 'The storage location or structure could not be verified. Deletion was refused. Check the Host log.',
      unsupported: 'This DSH version or storage interface is unverified. Deletion was refused.',
      exclusiveStorage: 'Exclusive single-Host storage has not been declared. Deletion was refused. Configure singleHost: true only when this deployment meets that condition; shared storage is unsupported.',
      hostFailed: 'The Host could not complete deletion. Resolve storage or Workspace errors, then retry.',
      partial: 'Cleanup started or an earlier attempt is unfinished; data may be incomplete. Resolve the error and retry.',
      syncFailed: 'The Host confirmed deletion, but client synchronization failed. Retry refresh or reload the page.',
      retrySync: 'Retry refresh',
      unknown: 'The Host outcome is unknown: connection lost or invalid response. Deletion may have completed. Refresh to check; retry the same session if needed.',
      preserved: 'This attempt has not deleted chat history.',
      dataUnknown: 'Data integrity is unknown. Check the Host log and storage; do not assume the data is intact.',
      archived: 'The session is currently archived. Retry deletion or restore it manually in DSH.',
      archiveUnknown: 'The archive state is unknown. Refresh to check.',
      noRollback: 'Archive was not automatically restored, to preserve other clients\' actions.',
      protected: 'The Host retains cleanup protection. Resolve the error and retry; to use the session again, restart the Host and verify data integrity first.',
    }

    /** Resolved through the host locale service once the plugin applies. */
    let t = (key) => zh[key] ?? en[key] ?? key

    /**
     * Styles copied from the host menu item and modal primitives, renamed under
     * a plugin prefix so only the theme tokens stay shared.
     */
    const CSS = `
.dsd_itemWrap{position:relative}
.dsd_item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left;font-family:inherit}
.dsd_item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsd_item:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsd_item:disabled{opacity:.4;cursor:not-allowed}
.dsd_itemIcon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.dsd_itemIcon svg{width:14px;height:14px}
.dsd_itemLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsd_root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.dsd_mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur)}
.dsd_mask:after{content:"";position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.dsd_dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(400px,100%);max-height:100%;padding:0 0 24px;overflow:auto;border:0;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dsd_content,.dsd_footer{flex:none}
.dsd_dialog:focus{outline:none}
.dsd_content{display:flex;flex-direction:column;width:100%}
.dsd_header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:20px 16px 16px 24px}
.dsd_title{margin:0;font-size:16px;line-height:24px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsd_close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);padding:0}
.dsd_close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsd_body{display:flex;flex-direction:column;min-width:0;padding:0 24px}
.dsd_warning{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.dsd_warning p{margin:0}
.dsd_sessionTitle{margin:0 0 12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;max-height:132px;overflow:auto;white-space:pre-wrap}
.dsd_warningIcon{display:inline-flex;flex:none;margin-top:1px;color:var(--dsw-alias-state-error-primary)}
.dsd_error{display:flex;align-items:flex-start;gap:8px;margin-top:16px;padding:12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,transparent);font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}
.dsd_errorText{min-width:0;overflow-wrap:anywhere}
.dsd_error p{margin:0}
.dsd_error .dsd_errorDetail{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsd_footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.dsd_button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px;height:36px;font-family:inherit}
.dsd_button:disabled{cursor:not-allowed;opacity:.4}
.dsd_outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}
.dsd_outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsd_primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsd_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dsd_action{min-width:80px}
.dsd_confirmAction{min-width:96px}
`

    function Styles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } })
    }

    /** Host trash glyph (16px grid, 1px stroke) copied from the icon set. */
    function TrashIcon() {
      const stroke = 'currentColor'
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          strokeWidth: 1,
        },
        h('path', { d: 'M1.28149 3.88831H14.7187', stroke }),
        h('path', {
          d: 'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
          stroke,
        }),
        h('path', {
          d: 'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
          stroke,
        }),
        h('path', { d: 'M6.44946 6.98926V11.1238', stroke }),
        h('path', { d: 'M9.55054 6.98926V11.1238', stroke }),
      )
    }

    function WarningIcon() {
      return h(
        'svg',
        {
          width: 18,
          height: 18,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          strokeWidth: 1,
        },
        h('path', {
          d: 'M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z',
          stroke: 'currentColor',
        }),
        h('path', { d: 'M8 4.29199V9.79199', stroke: 'currentColor' }),
        h('path', { d: 'M8 10.708V11.708', stroke: 'currentColor' }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          strokeWidth: 1,
        },
        h('path', { d: 'M3.5 3.5L12.5 12.5', stroke: 'currentColor' }),
        h('path', { d: 'M12.5 3.5L3.5 12.5', stroke: 'currentColor' }),
      )
    }

    // ---------------------------------------------------------------------
    // Pending delete request shared by the menu row and the overlay dialog.
    // The menu row unmounts with the menu, so the dialog lives in `shell.overlay`.
    // ---------------------------------------------------------------------
    const listeners = new Set()
    let pending = null

    // The Host emits api-session/removed only after complete cleanup. A local
    // replay after confirmed success also covers the response/event ordering.
    let forgetSession = async () => { throw new Error('Session controller unavailable') }

    function setPending(next) {
      pending = next
      for (const listener of [...listeners]) listener()
    }

    function usePendingDelete() {
      const [value, setValue] = React.useState(pending)
      React.useEffect(() => {
        const listener = () => setValue(pending)
        listeners.add(listener)
        listener()
        return () => listeners.delete(listener)
      }, [])
      return value
    }

    async function requestDelete(sessionId) {
      let message = t('failed')
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ sessionId }),
        })
        const body = await response.json()
        if (response.ok && body?.ok === true && body.sessionId === sessionId
          && ['deleted', 'already-absent'].includes(body.state)) {
          try {
            await forgetSession(sessionId)
          } catch {
            return { ok: false, deleted: true, message: t('syncFailed') }
          }
          return { ok: true }
        }
        if (body?.ok !== false || body.sessionId !== sessionId || !['rejected', 'partial'].includes(body.state)) {
          return { ok: false, message: t('unknown') }
        }
        const key = body?.error === 'session-active' ? 'active'
          : body?.error === 'session-owned' ? 'owned'
          : body?.error === 'live-unload-unsupported' ? 'liveUnsupported'
          : body?.error === 'retire-failed' ? 'retireFailed'
          : ['unsafe-path', 'ambiguous-session', 'storage-unknown', 'identity-changed', 'storage-changed'].includes(body?.error) ? 'unsafePath'
          : ['unsupported-runtime', 'unsupported-format'].includes(body?.error) ? 'unsupported'
          : body?.error === 'exclusive-storage-unverified' ? 'exclusiveStorage' : 'hostFailed'
        message = t(key)
        const details = []
        if (body.state === 'partial') details.push(t('partial'))
        if (body.dataState === 'preserved') details.push(t('preserved'))
        if (body.dataState === 'uncertain' && body.state !== 'partial') details.push(t('dataUnknown'))
        if (body.archive?.after === true) details.push(t('archived'))
        else if (body.archive && body.archive.after !== false) details.push(t('archiveUnknown'))
        if (body.archive?.restoration === 'unsupported') details.push(t('noRollback'))
        if (body.protection === 'retained') details.push(t('protected'))
        return { ok: false, message, details }
      } catch {
        message = t('unknown')
      }
      return { ok: false, message }
    }

    // ---------------------------------------------------------------------
    // Menu row
    // ---------------------------------------------------------------------
    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
      const [menuOpen, setMenuOpen] = useMenuOpenState()
      // Capture the menu trigger before selection focuses an item that will
      // unmount. The upstream Menu also remembers focus at menu opening.
      const returnFocus = React.useRef(null)
      React.useEffect(() => {
        if (menuOpen) returnFocus.current = document.activeElement
      }, [menuOpen])

      return h(
        React.Fragment,
        null,
        h(Styles, null),
        h(
          'div',
          { className: 'dsd_itemWrap' },
          h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              className: 'dsd_item',
              onClick: () => {
                setMenuOpen(false)
                if (pending !== null) return
                setPending({ sessionId, displayTitle, returnFocus: returnFocus.current })
              },
            },
            h('span', { className: 'dsd_itemIcon' }, h(TrashIcon, null)),
            h('span', { className: 'dsd_itemLabel' }, t('menu')),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Overlay dialog: one confirmation, no acknowledgement step.
    // ---------------------------------------------------------------------
    function DeleteSessionDialog() {
      const request = usePendingDelete()
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [deleted, setDeleted] = React.useState(false)
      const dialogRef = React.useRef(null)
      const busyRef = React.useRef(false)
      const titleId = React.useId()
      const bodyId = React.useId()
      const sessionTitleId = React.useId()

      const open = request !== null
      const sessionKey = request?.sessionId

      React.useEffect(() => {
        if (!open) return undefined
        setBusy(false)
        busyRef.current = false
        setDeleted(false)
        setError(null)
        const previous = request.returnFocus
        const node = dialogRef.current
        if (node !== null) (node.querySelector('[data-delete-cancel]') ?? node).focus()
        return () => {
          if (!(previous instanceof HTMLElement) || !previous.isConnected) return
          previous.focus()
          // rc.2 hides the row's action strip with display:none when neither
          // hovered nor open. Focus the owning tree row if its trigger is hidden.
          if (document.activeElement === previous) return
          const row = previous.closest('[role="treeitem"]')
          if (!(row instanceof HTMLElement)) return
          const tabIndex = row.getAttribute('tabindex')
          if (tabIndex === null) {
            row.setAttribute('tabindex', '-1')
            row.addEventListener('blur', () => row.removeAttribute('tabindex'), { once: true })
          }
          row.focus()
        }
      }, [open, sessionKey])

      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            if (!busyRef.current) setPending(null)
          } else if (event.key === 'Tab') {
            const node = dialogRef.current
            const buttons = node === null ? [] : [...node.querySelectorAll('button:not(:disabled)')]
            const first = buttons[0]
            const last = buttons[buttons.length - 1]
            if (first === undefined) {
              event.preventDefault()
              node?.focus()
            } else if (!node.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)
              || (!event.shiftKey && document.activeElement === last)) {
              event.preventDefault()
              ;(event.shiftKey ? last : first).focus()
            }
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open])

      if (!open) return null

      const confirm = async () => {
        if (busyRef.current) return
        busyRef.current = true
        setBusy(true)
        setError(null)
        let result
        if (deleted) {
          try { await forgetSession(request.sessionId); result = { ok: true } }
          catch { result = { ok: false, deleted: true, message: t('syncFailed') } }
        } else result = await requestDelete(request.sessionId)
        busyRef.current = false
        setBusy(false)
        if (result.ok) setPending(null)
        else {
          setDeleted(result.deleted === true)
          setError({ message: result.message, details: result.details ?? [] })
        }
      }

      return h(
        React.Fragment,
        null,
        h(Styles, null),
        h(
          'div',
          { className: 'dsd_root', role: 'presentation' },
          h('div', {
            className: 'dsd_mask',
            'aria-hidden': 'true',
            onClick: () => {
              if (!busyRef.current) setPending(null)
            },
          }),
          h(
            'div',
            {
              ref: dialogRef,
              tabIndex: -1,
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': titleId,
              'aria-describedby': `${sessionTitleId} ${bodyId}`,
              'aria-busy': busy,
              className: 'dsd_dialog',
            },
            h(
              'div',
              { className: 'dsd_content' },
              h(
                'div',
                { className: 'dsd_header' },
                h('h2', { className: 'dsd_title', id: titleId }, t('title')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsd_close',
                    'aria-label': t('close'),
                    disabled: busy,
                    onClick: () => {
                      if (!busyRef.current) setPending(null)
                    },
                  },
                  h(CloseIcon, null),
                ),
              ),
              h(
                'div',
                { className: 'dsd_body' },
                h('p', { className: 'dsd_sessionTitle', id: sessionTitleId }, request.displayTitle || request.sessionId),
                h(
                  'div',
                  { className: 'dsd_warning' },
                  h('p', { id: bodyId }, t('warning')),
                ),
                error === null ? null : h('div', { className: 'dsd_error', role: 'alert' },
                  h('span', { className: 'dsd_warningIcon' }, h(WarningIcon, null)),
                  h('div', { className: 'dsd_errorText' },
                    h('p', null, error.message),
                    ...error.details.map((detail, index) => h('p', { className: 'dsd_errorDetail', key: index }, detail)),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'dsd_footer' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsd_button dsd_outline dsd_action',
                  disabled: busy,
                  'data-delete-cancel': true,
                  onClick: () => { if (!busyRef.current) setPending(null) },
                },
                t('cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsd_button dsd_primary dsd_confirmAction',
                  disabled: busy,
                  onClick: confirm,
                  'data-modal-autofocus': true,
                },
                busy ? t('busy') : deleted ? t('retrySync') : t('confirm'),
              ),
            ),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        const sessions = ctx.sessions
        if (typeof sessions?.handleSessionRemoved !== 'function' || typeof sessions?.refresh !== 'function') {
          throw new Error('dsh-session-delete: unsupported Session Controller')
        }
        forgetSession = async (id) => {
          // Record removal BEFORE joining a possibly older list pull: rc.2's
          // mutation journal applies it over that pull's stale baseline.
          sessions.handleSessionRemoved(id)
          await sessions.refresh()
          const list = sessions.list.getSnapshot()
          if (list.phase !== 'ready' || list.byId[id] !== undefined) throw new Error('Session list refresh failed')
        }

        try {
          const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
          if (locale !== undefined && typeof locale.bind === 'function') {
            ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-session-delete: dictionaries')
            const bound = locale.bind(NS)
            if (typeof bound === 'function') t = bound
          }
        } catch (error) {
          console.warn('dsh-session-delete: locale service unavailable, using Chinese', error)
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'dsh-session-delete',
              order: 900,
            },
            DeleteSessionMenuItem,
          ),
        )
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-session-delete.dialog',
            },
            DeleteSessionDialog,
          ),
        )
      },
    }
  },
})
