import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { deferred } from './helpers.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

async function client(t, { response, language = 'en', refresh, sessions: providedSessions } = {}) {
  const slots = new Map()
  const calls = []
  const keys = new Set()
  const requests = []
  let dictionaries
  let plugin
  let menuClosed = 0
  class Element {
    isConnected = true
    focus() { document.activeElement = this }
  }
  const previous = new Element()
  const first = new Element()
  const last = new Element()
  const cancel = new Element()
  const node = new Element()
  node.querySelector = () => cancel
  node.querySelectorAll = () => [first, cancel, last]
  node.contains = el => [first, cancel, last, node].includes(el)
  const document = {
    activeElement: previous,
    addEventListener(name, callback) { if (name === 'keydown') keys.add(callback) },
    removeEventListener(name, callback) { keys.delete(callback) },
  }
  const listed = { 'session-1': { id: 'session-1' } }
  const sessions = providedSessions ?? {
    handleSessionRemoved(id) { calls.push('remove'); delete listed[id] },
    async refresh() { calls.push('refresh'); await refresh?.() },
    list: { getSnapshot: () => ({ phase: 'ready', byId: listed }) },
  }
  const context = vm.createContext({
    window: { __ModuleLoader__: { load(definition) { plugin = definition.factory(name => {
      assert.equal(name, 'react')
      return React
    }) } } },
    document, HTMLElement: Element, console,
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      if (typeof response === 'function') return response()
      return Response.json(response ?? { ok: true, state: 'deleted', sessionId: 'session-1' })
    },
  })
  vm.runInContext(source, context, { filename: 'client.js' })
  plugin.apply({
    sessions,
    slots: { inject(_name, fn) { fn() }, register(options, component) { slots.set(options.name, component) } },
    effect(fn) { return fn() },
    get(name) { if (name === 'locale') return {
      register(_ns, dict) { dictionaries = dict; return () => {} },
      bind() { return key => dictionaries[language][key] ?? key },
    } },
  })
  const Menu = slots.get('sidebar.workspaces.session.menu.item')
  const Dialog = slots.get('shell.overlay')
  function useMenuOpenState() {
    const [value, setter] = React.useState(true)
    return [value, next => { menuClosed++; setter(next) }]
  }
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(React.Fragment, null,
      React.createElement(Menu, { sessionId: 'session-1', displayTitle: 'A very long 会话 title ' + '长'.repeat(200), useMenuOpenState }),
      React.createElement(Dialog)), { createNodeMock: () => node })
  })
  t.after(async () => { await act(async () => renderer.unmount()) })
  const menu = () => renderer.root.findByProps({ role: 'menuitem' })
  const dialog = () => renderer.root.findAllByProps({ role: 'dialog' })[0]
  const confirm = () => renderer.root.findByProps({ className: 'dsd_button dsd_primary dsd_confirmAction' })
  const alert = () => renderer.root.findByProps({ role: 'alert' }).children.join('')
  async function open() { await act(async () => menu().props.onClick()) }
  async function key(key, shiftKey = false) {
    let prevented = false
    await act(async () => {
      for (const listener of [...keys]) listener({ key, shiftKey, preventDefault() { prevented = true }, stopPropagation() {} })
    })
    return prevented
  }
  return { renderer, open, confirm, dialog, alert, key, document, first, last, cancel, previous,
    requests, calls, menuClosed: () => menuClosed }
}

test('menu Hook is called during render; confirmation shows title, risk and accessible labels', async t => {
  const c = await client(t)
  await c.open()
  assert.equal(c.menuClosed(), 1)
  assert.ok(c.dialog().props['aria-labelledby'])
  assert.ok(c.dialog().props['aria-describedby'])
  assert.equal(c.dialog().props['aria-modal'], 'true')
  assert.match(c.renderer.root.findByProps({ className: 'dsd_sessionTitle' }).children.join(''), /会话 title/)
  assert.equal(c.document.activeElement, c.cancel)
  await c.key('Escape')
  assert.equal(c.dialog(), undefined)
  assert.equal(c.document.activeElement, c.previous)
})

test('confirmed Host success removes locally before refresh and closes the dialog', async t => {
  const c = await client(t)
  await c.open()
  await act(async () => c.confirm().props.onClick())
  assert.deepEqual(c.requests, [{ sessionId: 'session-1' }])
  assert.deepEqual(c.calls, ['remove', 'refresh'])
  assert.equal(c.dialog(), undefined)
})

test('Host rejection and partial failure leave the row and show localized readable errors', async t => {
  for (const state of ['rejected', 'partial']) {
    const c = await client(t, { language: 'zh', response: () => Response.json({ ok: false, state, error: 'session-active' }, { status: 409 }) })
    await c.open()
    await act(async () => c.confirm().props.onClick())
    assert.deepEqual(c.calls, [])
    assert.ok(c.dialog())
    assert.match(c.alert(), /进行中的工作/)
    if (state === 'partial') assert.match(c.alert(), /部分执行/)
  }
})

test('a 200 response without explicit completion is not success', async t => {
  const c = await client(t, { response: { ok: false, error: 'delete-failed' } })
  await c.open()
  await act(async () => c.confirm().props.onClick())
  assert.deepEqual(c.calls, [])
  assert.ok(c.dialog())
})

test('two clicks in the same event turn submit once; Escape, mask and close are blocked while busy', async t => {
  const gate = deferred()
  const c = await client(t, { response: () => gate.promise })
  await c.open()
  let request
  await act(async () => {
    const click = c.confirm().props.onClick
    request = click()
    void click()
  })
  assert.equal(c.requests.length, 1)
  assert.equal(c.confirm().props.disabled, true)
  assert.equal(c.dialog().props['aria-busy'], true)
  await c.key('Escape')
  await act(async () => c.renderer.root.findByProps({ className: 'dsd_mask' }).props.onClick())
  await act(async () => c.renderer.root.findByProps({ className: 'dsd_close' }).props.onClick())
  assert.ok(c.dialog())
  await act(async () => {
    gate.resolve(Response.json({ ok: true, state: 'deleted', sessionId: 'session-1' }))
    await request
  })
  assert.equal(c.dialog(), undefined)
})

test('mask dismissal and Tab/Shift+Tab focus wrapping work', async t => {
  const c = await client(t)
  await c.open()
  c.document.activeElement = c.last
  assert.equal(await c.key('Tab'), true)
  assert.equal(c.document.activeElement, c.first)
  assert.equal(await c.key('Tab', true), true)
  assert.equal(c.document.activeElement, c.last)
  await act(async () => c.renderer.root.findByProps({ className: 'dsd_mask' }).props.onClick())
  assert.equal(c.dialog(), undefined)
})

test('client synchronization failure offers refresh retry without resubmitting deletion', async t => {
  let fail = true
  const c = await client(t, { refresh: async () => { if (fail) throw new Error('offline') } })
  await c.open()
  await act(async () => c.confirm().props.onClick())
  assert.match(c.alert(), /Host confirmed deletion/)
  assert.equal(c.confirm().children.join(''), 'Retry refresh')
  fail = false
  await act(async () => c.confirm().props.onClick())
  assert.equal(c.requests.length, 1)
  assert.equal(c.dialog(), undefined)
})

test('unsupported live deletion reports the actionable message in both languages', async t => {
  for (const language of ['en', 'zh']) {
    const c = await client(t, { language, response: () => Response.json({ ok: false, state: 'rejected', error: 'live-unload-unsupported' }, { status: 409 }) })
    await c.open()
    await act(async () => c.confirm().props.onClick())
    assert.match(c.alert(), language === 'en' ? /Restart the Host/ : /重启 Host/)
    assert.deepEqual(c.calls, [])
  }
})
