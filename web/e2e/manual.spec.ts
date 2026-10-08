// v2.0 tracks everything by hand: onboarding, pets / achievements / characters / bosses by hand, nothing read
// from the game (no radar, position, live status or automatic counts anywhere).
import { expect, test, type Page } from '@playwright/test'
import { emptyState, hasCache, openApp, type HostOpts } from './host'

test.skip(!hasCache(), 'needs the app data cache in %LOCALAPPDATA%\\TheCompletionist\\cache (start the app once)')

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/.out/shots/${name}.png` })
const FRESH: HostOpts = { state: emptyState() }
const manual = (page: Page, ui: Record<string, unknown> = {}, o: HostOpts = {}) => openApp(page, { ...FRESH, ...o, ui })

test('first start: short welcome card, no mode choice', async ({ page }) => {
  await manual(page, { welcomed: 0 })
  const card = page.locator('[data-welcome]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('liest nichts aus dem Spiel')
  await expect(card.locator('[data-mode]')).toHaveCount(0)
  await shot(page, 'manual-welcome')
  await card.getByRole('button', { name: "Los geht's" }).click()
  await expect(card).toHaveCount(0)
})

test('no live features: no status, radar or position anywhere', async ({ page }) => {
  const app = await openApp(page, { ui: { tab: 'targets', view: 'both' } })
  await expect(page.locator('[data-pet]').first()).toBeVisible()
  await expect(page.locator('header [data-status]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Radar/ })).toHaveCount(0)
  await expect(page.locator('[data-mini-radar], [data-radar-off]')).toHaveCount(0)
  await expect(page.getByText('In der Nähe')).toHaveCount(0)
  // the hand controls are always there
  await expect(page.locator('[data-manual]').first()).toBeVisible()
  for (const type of ['mode', 'trackNpcs', 'radarWin', 'radar2', 'instCheck']) expect(await app.posted(type)).toEqual([])
  await shot(page, 'manual-no-live')
})

test('pets: +1 soul on the tile, unlock at 5', async ({ page }) => {
  const app = await manual(page, { tab: 'targets', view: 'list' })
  await expect(page.getByText("So geht's:")).toBeVisible()
  const first = page.locator('[data-pet]').first(), id = await first.getAttribute('data-pet')
  const tile = page.locator(`[data-pet="${id}"]`)
  await tile.locator('[data-add-soul]').click()
  await expect(tile).toContainText('1/5')
  expect(await app.posted('addSoul')).toEqual([{ type: 'addSoul', id: +id!, n: 1 }])
  await expect(page.getByText("So geht's:")).toHaveCount(0) // hint gone once something is entered
  for (let i = 0; i < 4; i++) await tile.locator('[data-add-soul]').click()
  await expect(tile).toContainText('Lv1')
  await expect(tile).toContainText('0/25')
  await expect(page.locator('[data-toasts]').first()).toContainText('freigeschaltet')
  await expect(page.locator('[data-pin]')).toHaveCount(0) // the buttons do not select the tile
  await shot(page, 'manual-pets')
})

test('pets: level and souls in the popover', async ({ page }) => {
  const app = await manual(page, { tab: 'targets', view: 'list', showLv3: true })
  const id = await page.locator('[data-pet]').first().getAttribute('data-pet')
  const tile = page.locator(`[data-pet="${id}"]`)
  await tile.locator('[data-pet-edit]').click()
  const pop = page.locator('[data-slot="popover-content"]')
  await expect(pop).toBeVisible()
  await pop.locator('[data-tip="+1"]').first().click() // level 0 -> 1
  await expect(tile).toContainText('Lv1')
  await pop.locator('[data-tip="+1"]').nth(1).click() // one soul (counted by the host)
  await expect(pop).toContainText('1/25')
  await shot(page, 'manual-pet-popover')
  await pop.getByRole('button', { name: 'Lv3 – komplett' }).click()
  await expect(tile).toContainText('✓')
  const sets = await app.posted('setPet')
  expect(sets[0]).toEqual({ type: 'setPet', id: +id!, level: 1, souls: 0 })
  expect(sets.at(-1)).toEqual({ type: 'setPet', id: +id!, level: 3, souls: 0 })
})

test('characters: add, select, rename by hand', async ({ page }) => {
  const app = await manual(page, { tab: 'check' })
  await expect(page.getByText('Noch kein Charakter')).toBeVisible()
  await page.locator('[data-add-char]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Aria')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-char="Aria"]')).toBeVisible()
  expect((await app.posted('typing')).some((m: { on: boolean }) => m.on)).toBe(true) // the host lets the window take the keyboard
  await page.locator('[data-add-char]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Borin')
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('[data-char="Borin"]')).toBeVisible()
  expect((await app.posted('setChar')).map((m: { name: string }) => m.name)).toEqual(['Aria', 'Borin'])
  // the active character is picked in the bar
  await page.locator('[data-tip="Aktiven Charakter wählen"]').click()
  await page.getByRole('option', { name: 'Aria' }).click()
  await expect.poll(async () => (await app.posted('setChar')).at(-1).name).toBe('Aria')
  await shot(page, 'manual-chars')
  // rename on the character's page
  await page.locator('[data-char="Borin"]').click()
  await page.locator('[data-tip="Umbenennen"]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Borin2')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-list]').getByText('Borin2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Übersicht' }).last().click()
  await expect(page.locator('[data-char="Borin2"]')).toBeVisible()
  await expect(page.locator('[data-char="Borin"]')).toHaveCount(0)
})

test('achievements: counter and tier ticks by hand', async ({ page }) => {
  const app = await manual(page, { tab: 'ach', achDone: true })
  await expect(page.getByText("So geht's:")).toBeVisible()
  // first achievement with at least two tiers (one-tier ones are done after the first tick)
  let id = 0
  for (let i = 0; !id; i++) {
    const cand = page.locator('[data-ach]').nth(i)
    await cand.click()
    if (await cand.locator('[data-tier="2"]').count()) id = +(await cand.getAttribute('data-ach'))!
  }
  const tile = page.locator(`[data-ach="${id}"]`), edit = tile.locator('[data-ach-edit]')
  await expect(edit).toBeVisible()
  // tick tier 1: counter jumps to its goal
  await tile.locator('[data-tier="1"]').click()
  await expect.poll(async () => (await app.posted('setAch')).length).toBe(1)
  const [tick] = await app.posted('setAch')
  expect(tick).toMatchObject({ type: 'setAch', id, tier: 1 })
  await expect(tile.locator('[data-tier="1"]')).toContainText('☑')
  // fine counter
  await edit.getByRole('button', { name: '+1', exact: true }).click()
  await expect.poll(async () => (await app.posted('setAch')).at(-1).val).toBe(tick.val + 1)
  await expect(page.getByText("So geht's:")).toHaveCount(0)
  await shot(page, 'manual-ach')
})

test('bosses: prominent kill button starts the respawn estimate', async ({ page }) => {
  await manual(page, { tab: 'boss' })
  await expect(page.getByText('Nach dem Kill auf „getötet" tippen')).toBeVisible()
  const kill = page.locator('[data-kill]')
  if (await kill.count()) {
    const boss = page.locator('[data-boss]:has([data-kill])').first(), id = await boss.getAttribute('data-boss')
    await kill.first().click()
    await expect(page.locator(`[data-boss="${id}"]`)).toContainText(/\d\d:\d\d/)
  }
  await shot(page, 'manual-bosses')
})

test('settings: no tracking category, state file under data, version 2.0.0', async ({ page }) => {
  const app = await manual(page)
  await page.locator('[data-tip="Einstellungen"]').click()
  await expect(page.locator('nav [data-tip="Live-Tracking"]')).toHaveCount(0)
  await page.locator('nav [data-tip="Daten & Über"]').click()
  await expect(page.getByText('The Completionist 2.0.0')).toBeVisible()
  await expect(page.getByText('liest weder Spielspeicher noch Netzwerkverkehr')).toBeVisible()
  await page.getByRole('button', { name: 'Ändern …' }).click()
  expect(await app.posted('pickState')).toHaveLength(1)
})
