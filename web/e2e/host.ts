// Mock of the C# host (OverlayForm.cs) for e2e tests: injects window.chrome.webview, answers the page's requests
// (ready -> init + dataReady, needMap -> mapReady; setPet, addSoul, setAch, setChar like OverlayForm/PetState; plaync)
// and serves /data/* from the app's real data cache
// (%LOCALAPPDATA%\TheCompletionist\cache). Tests drive the app with send({type: ...}) like the host does.
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

export const CACHE = path.join(process.env.LOCALAPPDATA || '', 'TheCompletionist', 'cache')
export const hasCache = () => fs.existsSync(path.join(CACHE, 'pets.json'))

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any

/** Synthetic pet state: every third pet unlocked, some levelled, souls on the way (entered by hand). */
export function fakeState(extra: Any = {}): Any {
  const pets = JSON.parse(fs.readFileSync(path.join(CACHE, 'pets.json'), 'utf8')).pets as Any[]
  const levels: Record<string, number> = {}, souls: Record<string, number> = {}
  pets.forEach((p, i) => { if (i % 3 === 0) { levels[p.id] = 1 + (i % 2); souls[p.id] = i % 20 } })
  const now = new Date().toISOString()
  return { levels, souls, updatedAt: now, charName: 'Testchar', ach: {}, ...extra }
}

/** No progress entered yet (what a fresh install starts with). */
export const emptyState = (extra: Any = {}): Any => ({ levels: {}, souls: {}, charName: '', ach: {}, ...extra })

export function settings(ui: Any = {}, extra: Any = {}): Any {
  return {
    version: '2.0.0', ...extra,
    opacity: 0.92, zoom: 1, onlineUpdates: true, statePath: 'C:\test\pet_state.json',
    hotkeys: { toggle: 'Ctrl+Alt+M', click: 'Ctrl+Alt+C', site: 'Ctrl+Alt+W', opaUp: 'Ctrl+Alt+PageUp', opaDown: 'Ctrl+Alt+PageDown', zoomIn: 'Ctrl+Alt+Oemplus', zoomOut: 'Ctrl+Alt+OemMinus' },
    hotkeyOk: {}, ui: { map: 'World_D_A', welcomed: 1, ...ui },
  }
}

export type HostOpts = { ui?: Any; state?: Any; settings?: Any; art?: boolean }

/** Install the mock host and open the app. Returns helpers to send host messages and read what the page posted. */
export async function openApp(page: Page, o: HostOpts = {}) {
  const init = {
    type: 'init', settings: settings(o.ui, o.settings), state: o.state ?? fakeState(), view: '',
  }
  await page.route('**/data/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^.*?\/data\//, ''))
    const f = path.join(CACHE, rel)
    if (!f.startsWith(CACHE) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'missing' })
    return route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' })
  })
  // coloured maps the app has rendered into the cache (GameData.EnsureTerrain): key -> newest terrain-v*.jpg
  const arts: Record<string, string> = {}
  const mapsDir = path.join(CACHE, 'maps')
  if (o.art !== false && fs.existsSync(mapsDir))
    for (const k of fs.readdirSync(mapsDir)) {
      const dir = path.join(mapsDir, k)
      const f = fs.statSync(dir).isDirectory()
        ? fs.readdirSync(dir).filter(x => /^terrain-v\d+\.jpg$/.test(x)).sort((a, b) => parseInt(a.slice(9)) - parseInt(b.slice(9))).pop() : undefined
      if (f) arts[k] = f
    }
  await page.addInitScript(({ init, arts }: Any) => {
    const ls: ((e: Any) => void)[] = []
    const w = window as Any
    w.__posted = []
    w.__send = (m: Any) => ls.forEach(f => f({ data: m }))
    w.chrome = {
      webview: {
        addEventListener: (_t: string, f: (e: Any) => void) => ls.push(f),
        postMessage: (m: Any) => {
          w.__posted.push(m)
          const reply = (r: Any) => setTimeout(() => w.__send(r), 0)
          if (m.type === 'ready') { reply(init); reply({ type: 'dataReady', ok: true }) }
          else if (m.type === 'needMap') reply({ type: 'mapReady', key: m.key, ok: true })
          // GameData.EnsureTerrain: the coloured map if the cache has it (rendered by the app), else none (relief stays)
          else if (m.type === 'needArt') reply({ type: 'artReady', key: m.key, file: arts[m.key] ?? null })
          else if (m.type === 'ui') Object.assign(init.settings.ui, m.patch)
          else if (m.type === 'opacity' || m.type === 'zoom') reply({ type: m.type, v: m.v })
          // ---- progress by hand (OverlayForm.OnUiMessage / PetState.Set / PetState.Gain)
          else if (m.type === 'setPet' || m.type === 'addSoul') {
            const st = init.state, NEED = [5, 25, 75]
            st.levels ||= {}; st.souls ||= {}
            if (m.type === 'setPet') {
              const lv = Math.max(0, Math.min(3, m.level))
              if (lv > 0) st.levels[m.id] = lv; else delete st.levels[m.id]
              st.souls[m.id] = lv >= 3 ? 0 : Math.max(0, Math.min(NEED[lv] - 1, m.souls))
            } else {
              let lv = st.levels[m.id] || 0, souls = (st.souls[m.id] || 0) + m.n, up = false
              while (lv < 3 && souls >= NEED[lv]) { souls -= NEED[lv]; lv++; up = true }
              if (lv >= 3) souls = 0
              if (lv > 0) st.levels[m.id] = lv
              st.souls[m.id] = souls
              reply({ type: 'soul', ev: { pet: m.id, gained: m.n, level: lv, souls, need: NEED[lv] || 0, levelUp: up } })
            }
            st.updatedAt = new Date().toISOString()
            reply({ type: 'state', state: structuredClone(st) })
          } else if (m.type === 'setAch') {
            const ts = Date.now()
            ;(init.state.ach ||= {})[m.id] = [m.val, m.tier, ts]
            reply({ type: 'achUpd', items: [[m.id, m.val, m.tier, ts]] })
          } else if (m.type === 'plaync') {
            // GameData.PlayNc: the host fetches the website; here the page does (tests mock it with page.route)
            fetch(m.url).then(async r => reply({ type: 'plaync', id: m.id, status: r.status, body: await r.text() }))
              .catch(() => reply({ type: 'plaync', id: m.id, status: 0, body: null }))
          } else if (m.type === 'setChar') {
            init.state.charName = m.name
            reply({ type: 'char', name: m.name })
          }
        },
      },
    }
  }, { init, arts })
  await page.goto('/')
  await page.locator('[data-tabs]').waitFor()
  return {
    send: (m: Any) => page.evaluate((m: Any) => (window as Any).__send(m), m),
    posted: (type?: string) => page.evaluate((t?: string) => (window as Any).__posted.filter((m: Any) => !t || m.type === t), type),
  }
}
