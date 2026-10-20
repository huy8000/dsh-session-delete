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
      title: '删除这个会话？',
      close: '关闭',
      warning: '该会话的日志与投影缓存会被永久删除，删除后无法恢复。',
      cancel: '取消',
      confirm: '删除',
      busy: '正在删除…',
      failed: '删除失败',
    }

    const en = {
      menu: 'Delete session',
      title: 'Delete this conversation?',
      close: 'Close',
      warning: 'Its log and projection cache are removed permanently. This cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Delete',
      busy: 'Deleting…',
      failed: 'Delete failed',
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
.dsd_dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(380px,100%);padding:0 0 24px;overflow:hidden;border:0;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent)}
.dsd_dialog:focus{outline:none}
.dsd_content{display:flex;flex-direction:column;width:100%}
.dsd_header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.dsd_title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsd_close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);padding:0}
.dsd_close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsd_body{display:flex;flex-direction:column;min-width:0;padding:0 24px}
.dsd_warning{display:flex;align-items:flex-start;gap:10px;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.dsd_warning p{margin:0}
.dsd_warningIcon{flex:none;margin-top:2px;color:var(--dsw-alias-state-error-primary)}
.dsd_error{margin-top:12px;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}
.dsd_footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.dsd_button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;padding:0 14px;height:36px;font-family:inherit}
.dsd_button:disabled{cursor:not-allowed;opacity:.4}
.dsd_outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}
.dsd_outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsd_primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsd_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dsd_action{min-width:72px}
.dsd_confirmAction{min-width:136px}
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

    /**
     * The Host unloads a live Session before deleting its files, which emits
     * `api-session/removed` and lets the list drop the row. Pull the baseline
     * again for a cold Session, then remove the local summary as a fallback:
     * the Client may still hold a resident row for a Host generation that is
     * slow to dispose. `handleSessionRemoved` exists on the Session Controller
     * and is what the real removal event calls.
     */
    let forgetSession = async () => {}

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

    async function requestDelete(sessionId, displayTitle) {
      let message = t('failed')
      try {
        const response = await fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ sessionId }),
        })
        if (response.ok) {
          try {
            await forgetSession(sessionId)
          } catch (error) {
            console.warn('dsh-session-delete: removing the deleted row from the sidebar failed', error)
          }
          return { ok: true }
        }
        try {
          const body = await response.json()
          if (typeof body?.message === 'string' && body.message !== '') message = body.message
        } catch {
          message = `${t('failed')}: HTTP ${response.status} (${displayTitle})`
        }
      } catch (error) {
        message = `${t('failed')}：${error instanceof Error ? error.message : String(error)}`
      }
      return { ok: false, message }
    }

    // ---------------------------------------------------------------------
    // Menu row
    // ---------------------------------------------------------------------
    function DeleteSessionMenuItem({ sessionId, displayTitle, useMenuOpenState }) {
      const closeMenu = () => {
        try {
          const state = typeof useMenuOpenState === 'function' ? useMenuOpenState() : undefined
          if (Array.isArray(state) && typeof state[1] === 'function') state[1](false)
        } catch {
          /* the menu also closes on pointer leave */
        }
      }

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
                closeMenu()
                setPending({ sessionId, displayTitle })
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
      const dialogRef = React.useRef(null)

      const open = request !== null
      const sessionKey = request?.sessionId

      React.useEffect(() => {
        if (!open) return undefined
        setBusy(false)
        setError(null)
        const previous = document.activeElement
        const node = dialogRef.current
        if (node !== null) node.focus()
        return () => {
          if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
        }
      }, [open, sessionKey])

      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || busy) return
          event.preventDefault()
          setPending(null)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [open, busy])

      if (!open) return null

      const confirm = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        const result = await requestDelete(request.sessionId, request.displayTitle)
        setBusy(false)
        if (result.ok) setPending(null)
        else setError(result.message)
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
              if (!busy) setPending(null)
            },
          }),
          h(
            'div',
            {
              ref: dialogRef,
              tabIndex: -1,
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('title'),
              className: 'dsd_dialog',
            },
            h(
              'div',
              { className: 'dsd_content' },
              h(
                'div',
                { className: 'dsd_header' },
                h('h2', { className: 'dsd_title' }, t('title')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsd_close',
                    'aria-label': t('close'),
                    onClick: () => {
                      if (!busy) setPending(null)
                    },
                  },
                  h(CloseIcon, null),
                ),
              ),
              h(
                'div',
                { className: 'dsd_body' },
                h(
                  'div',
                  { className: 'dsd_warning' },
                  h('span', { className: 'dsd_warningIcon' }, h(WarningIcon, null)),
                  h('p', null, t('warning')),
                ),
                error === null ? null : h('div', { className: 'dsd_error', role: 'alert' }, error),
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
                  onClick: () => setPending(null),
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
                busy ? t('busy') : t('confirm'),
              ),
            ),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        try {
          const sessions = ctx.sessions ?? (typeof ctx.get === 'function' ? ctx.get('sessions') : undefined)
          if (sessions !== undefined) {
            const refresh = typeof sessions.refresh === 'function' ? () => sessions.refresh() : async () => {}
            const removeLocal =
              typeof sessions.handleSessionRemoved === 'function'
                ? (id) => sessions.handleSessionRemoved(id)
                : () => {}
            const workspaces = typeof ctx.get === 'function' ? ctx.get('workspaces') : undefined
            const unarchive =
              workspaces !== undefined && typeof workspaces.unarchiveSession === 'function'
                ? (id) => workspaces.unarchiveSession(id)
                : async () => {}
            forgetSession = async (id) => {
              try {
                await refresh()
              } catch (error) {
                console.warn('dsh-session-delete: session list refresh failed', error)
              }
              // Only clear the archive marker once the Host no longer lists the
              // Session: a live Session that failed to unload must stay archived
              // rather than turn into an unopenable normal row.
              const stillListed = sessions.list.getSnapshot().byId[id] !== undefined
              removeLocal(id)
              if (!stillListed) {
                try {
                  await unarchive(id)
                } catch (error) {
                  console.warn('dsh-session-delete: clearing the archive marker failed', error)
                }
              }
            }
          }
        } catch (error) {
          console.warn('dsh-session-delete: session controller unavailable; sidebar may keep the deleted row until reload', error)
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
