// Main flows of the overlay UI with a mocked host. Screenshots land in e2e/.out/shots for a visual check.
import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { CACHE, fakeState, hasCache, openApp } from './host'

test.skip(!hasCache(), 'needs the app data cache in %LOCALAPPDATA%\TheCompletionist\cache (start the app once)')

const TABS = ['Übersicht', 'Ziele', 'Spots', 'Erfolge', 'Checkliste', 'Bosse', 'Timer']
const tab = (page: Page, name: string) => page.locator('[data-tabs] button').nth(TABS.indexOf(name))
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/.out/shots/${name}.png` })
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!

const CHK = { srv: {}, chars: { Testchar: {}, Zweitchar: { supplyEmergency: { c: 1, at: Date.now() } } } }

test('navigation stays in place on every tab', async ({ page }) => {
  await openApp(page)
  const ref = await box(page, '[data-tabs]'), hdr = await box(page, 'header')
  for (const name of TABS) {
    await tab(page, name).click()
    await expect(tab(page, name)).toHaveClass(/border-gold/)
    expect(await box(page, '[data-tabs]')).toEqual(ref)
    expect(await box(page, 'header')).toEqual(hdr)
    await shot(page, 'tab-' + name)
  }
})

test('tabs fit a narrow window without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await openApp(page)
  for (const name of TABS) {
    await tab(page, name).click()
    const nav = page.locator('[data-tabs] > div')
    expect(await nav.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    for (let i = 0; i < TABS.length; i++) {
      const b = (await tab(page, TABS[i]).boundingBox())!
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(360)
    }
  }
  await shot(page, 'narrow-360')
})

test('toasts never cover the navigation', async ({ page }) => {
  const app = await openApp(page)
  const pet = fakeState().levels, id = +Object.keys(pet)[0]
  for (const name of ['Ziele', 'Erfolge']) {
    await tab(page, name).click()
    await app.send({ type: 'soul', ev: { pet: id, level: 1, souls: 3, need: 25, levelUp: false } })
    const t = page.locator('[data-toasts] > div').first()
    await t.waitFor()
    const nav = await box(page, '[data-tabs]'), tb = (await t.boundingBox())!
    expect(tb.y).toBeGreaterThanOrEqual(nav.y + nav.height)
    expect(await page.locator('[data-toasts]').first().evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none')
    await shot(page, 'toast-' + name)
  }
})

test('checklist: dashboard -> character page -> back', async ({ page }) => {
  await openApp(page, { ui: { tab: 'check', checklist: CHK } })
  await expect(page.getByText('Zweitchar')).toBeVisible()
  await page.getByRole('button', { name: /Zweitchar/ }).click()
  await expect(page.getByText('wird von Hand gepflegt')).toBeVisible()
  await shot(page, 'check-char')
  await page.getByRole('button', { name: 'Übersicht' }).last().click()
  await expect(page.getByText('Charaktere', { exact: true })).toBeVisible()
})

test('charges: odyle about to overflow shows a red warning with a CTA', async ({ page }) => {
  const at = Date.now()
  await openApp(page, { ui: { tab: 'home', checklist: CHK, charges: { 'odyle|Zweitchar': { v: 545, at } } } })
  const warn = page.getByRole('button', { name: /Zweitchar:.*Odyle-Energie 545\/560/ })
  await expect(warn).toBeVisible()
  await shot(page, 'alerts-home')
  await warn.click()
  await expect(page.getByText('wird von Hand gepflegt')).toBeVisible()
  await expect(page.getByText('Odyle-Energie', { exact: true })).toBeVisible()
  await page.locator('[data-tip="−40"]').first().click()
  await expect(page.getByText('505/560', { exact: true })).toBeVisible()
  await shot(page, 'charges-char')
})

test('overview: +1 on the checklist and jump to a tab', async ({ page }) => {
  const app = await openApp(page, { ui: { tab: 'home', checklist: CHK } })
  const row = page.locator('div', { hasText: /^Ludra \(Abgrundsveredelung\)0\/1$/ }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button').click()
  await expect(page.getByText('Ludra (Abgrundsveredelung)')).toHaveCount(0)
  expect((await app.posted('ui')).some((m: { patch: { checklist?: unknown } }) => m.patch.checklist)).toBe(true)
  await shot(page, 'overview')
  await page.getByRole('button', { name: 'alle Timer' }).click()
  await expect(tab(page, 'Timer')).toHaveClass(/border-gold/)
})

test('spots: ranking explanation toggles', async ({ page }) => {
  await openApp(page, { ui: { tab: 'spots' } })
  await page.getByRole('button', { name: /Wie wird das berechnet/ }).click()
  await expect(page.getByText('Spawns im Umkreis von')).toBeVisible()
  await shot(page, 'spots-how')
  await page.getByRole('button', { name: /Wie wird das berechnet/ }).click()
  await expect(page.getByText('Spawns im Umkreis von')).toHaveCount(0)
})

test('settings: every category opens, closes again', async ({ page }) => {
  await openApp(page)
  await page.locator('[data-tip="Einstellungen"]').click()
  for (const c of ['Allgemein', 'Karte', 'Ziele & Filter', 'Benachrichtigungen', 'Hotkeys', 'Daten & Über']) {
    await page.locator(`nav [data-tip="${c}"]`).click()
    await expect(page.locator(`nav [data-tip="${c}"]`)).toHaveClass(/text-gold/)
  }
  await shot(page, 'settings')
  await page.locator('[data-tip="Schließen"]').click()
  await expect(page.getByText('Einstellungen', { exact: true })).toHaveCount(0)
})

test('language switch de -> en', async ({ page }) => {
  await openApp(page)
  await page.locator('[data-tip="Einstellungen"]').click()
  await page.getByRole('combobox').filter({ hasText: /System/ }).click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByText('General', { exact: true }).first()).toBeVisible()
  await page.locator('[data-tip="Close"]').click()
  await expect(tab(page, 'Ziele')).toHaveText(/Targets/)
  await shot(page, 'english')
})

test('multi-select pets -> find spot for the selection', async ({ page }) => {
  await openApp(page, { ui: { tab: 'targets', view: 'list' } })
  const tiles = page.locator('[data-pet]')
  await expect(page.locator('[data-pin]')).toHaveCount(0) // no checkboxes while nothing is selected
  const w0 = (await tiles.nth(4).boundingBox())!.width
  await tiles.nth(4).click()
  await tiles.nth(5).click()
  await tiles.nth(6).click()
  expect((await tiles.nth(4).boundingBox())!.width).toBe(w0) // selected tiles keep their size
  expect(await page.locator('[data-pin]').count()).toBeGreaterThan(3) // every tile shows its checkbox now
  const bar = page.locator('[data-selbar]')
  await expect(bar).toContainText('3 ausgewählt')
  await shot(page, 'multi-targets')
  await bar.getByRole('button', { name: 'Spot suchen' }).click()
  await expect(tab(page, 'Spots')).toHaveClass(/border-gold/)
  await expect(bar).toContainText('Spots nur für deine Auswahl')
  await expect(page.locator('[data-spot="1"][data-sel]')).toBeVisible()
  await shot(page, 'multi-spots')
  await bar.getByRole('button', { name: /Auswahl aufheben/ }).click()
  await expect(page.locator('[data-selbar]')).toHaveCount(0)
})

test('tooltips: shadcn tooltip on hover, no native titles', async ({ page }) => {
  await openApp(page)
  expect(await page.locator('[title]').count()).toBe(0)
  await page.locator('[data-tip="Einstellungen"]').hover()
  await expect(page.locator('[data-slot=tooltip-content]')).toHaveText('Einstellungen')
  await shot(page, 'tooltip')
  await page.mouse.move(300, 600)
  await expect(page.locator('[data-slot=tooltip-content]')).toHaveCount(0)
})

test('bosses + timers: big bell toggles', async ({ page }) => {
  const app = await openApp(page, { ui: { tab: 'boss' } })
  const bell = page.locator('main button[data-tip="Ansage vor dem Respawn"]').first()
  await expect(bell).toBeVisible()
  const b = (await bell.boundingBox())!
  expect(b.height).toBeGreaterThanOrEqual(42)
  expect(b.width).toBeGreaterThanOrEqual(30)
  await bell.click()
  expect((await app.posted('ui')).some((m: { patch: { bossBells?: unknown } }) => m.patch.bossBells)).toBe(true)
  await shot(page, 'boss-bells')
  await tab(page, 'Timer').click()
  await shot(page, 'timer-bells')
})

test('bosses: abyss bosses always shown in their own group', async ({ page }) => {
  await openApp(page, { ui: { tab: 'boss' } })
  await expect(page.locator('[data-boss="2600089"]')).toBeVisible({ timeout: 15000 }) // Watcher Kaira (Abyss)
  await expect(page.getByText('Abyss', { exact: true })).toBeVisible()
  await page.locator('[data-boss="2600089"]').scrollIntoViewIfNeeded()
  await shot(page, 'boss-abyss')
})

test('timers: calendar, occurrence and series bells', async ({ page }) => {
  const app = await openApp(page, { ui: { tab: 'timer' } })
  await expect(page.locator('[data-cal]')).toBeVisible()
  const visibleDays = () => page.locator('[data-day]').evaluateAll(els => els.filter(e => getComputedStyle(e).display !== 'none').length)
  expect(await visibleDays()).toBe(3)
  await shot(page, 'timer-cal-640')
  // an upcoming occurrence (overrides of past ones are dropped right away)
  const key = await page.locator('[data-occ]').evaluateAll(els => els.map(e => e.getAttribute('data-occ')!).find(k => +k.split('|').pop()! > Date.now() + 3600e3))
  await page.locator(`[data-occ="${key}"]`).click()
  const pop = page.locator('[data-calpop]')
  await expect(pop).toBeVisible()
  await pop.getByRole('button', { name: /Nur dieser Termin/ }).click()
  expect((await app.posted('ui')).some((m: { patch: { timerOnce?: Record<string, boolean> } }) => m.patch.timerOnce && Object.values(m.patch.timerOnce).includes(false))).toBe(true)
  await shot(page, 'timer-cal-pop')
  await pop.getByRole('button', { name: /Alle/ }).click()
  expect((await app.posted('ui')).some((m: { patch: { timerOn?: unknown } }) => m.patch.timerOn)).toBe(true)
  await page.mouse.click(5, 790)
  await expect(pop).toHaveCount(0)
  await page.setViewportSize({ width: 2000, height: 1100 })
  expect(await visibleDays()).toBe(7)
  await shot(page, 'timer-cal-2000')
})

// Map background (Kartenstil): the coloured map rendered by the host (GameData.EnsureTerrain) or the relief.
// Screenshots map-style-{map,relief}-{640,2000}.png compare the two.
for (const [w, h] of [[640, 800], [2000, 1100]]) {
  test(`map style at ${w}x${h}: coloured map, switch to the relief in the settings`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    // which image the canvas draws behind the markers
    await page.addInitScript(() => {
      const ctx = CanvasRenderingContext2D.prototype, draw = ctx.drawImage
      ctx.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        const img = a[0]
        if (img instanceof HTMLImageElement && /\/data\/(maps|dungeons)\//.test(img.src)) (window as unknown as { __bg: string }).__bg = img.src.replace(/^.*\/data\//, '')
        return (draw as (...x: unknown[]) => void).apply(this, a)
      } as typeof ctx.drawImage
    })
    const bg = () => page.evaluate(() => (window as unknown as { __bg?: string }).__bg ?? '')
    const app = await openApp(page, { ui: { tab: 'targets', view: 'both', map: 'World_D_A', mapStyle: 'map' } })
    await expect.poll(async () => (await app.posted('needArt')).at(-1)?.key).toBe('World_D_A')
    // the coloured map once the app has rendered it into the cache, else the relief meanwhile
    const rendered = fs.readdirSync(path.join(CACHE, 'maps', 'World_D_A')).some(f => /^terrain-v\d+\.jpg$/.test(f))
    await expect.poll(bg).toMatch(rendered ? /^maps\/World_D_A\/terrain-v\d+\.jpg$/ : /^maps\/World_D_A\/relief\.png$/)
    await page.waitForTimeout(300)
    await shot(page, `map-style-map-${w}`)
    await page.locator('[data-tip="Einstellungen"]').click()
    await page.locator('nav [data-tip="Karte"]').click()
    await page.locator('div.flex-wrap', { hasText: 'Kartenstil' }).last().getByRole('combobox').click()
    await page.getByRole('option', { name: 'Relief' }).click()
    expect((await app.posted('ui')).at(-1)).toMatchObject({ patch: { mapStyle: 'relief' } })
    await page.locator('[data-tip="Schließen"]').click()
    await expect.poll(bg).toBe('maps/World_D_A/relief.png')
    await page.waitForTimeout(300)
    await shot(page, `map-style-relief-${w}`)
  })
}
