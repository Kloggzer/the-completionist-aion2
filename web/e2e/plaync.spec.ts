// Character lookup via the PLAYNC character search (website). Network mocked with page.route on the plaync hosts.
import { expect, test, type Page } from '@playwright/test'
import { emptyState, hasCache, openApp } from './host'

test.skip(!hasCache(), 'needs the app data cache in %LOCALAPPDATA%\TheCompletionist\cache (start the app once)')

const ID = 'V0E539Yq3qbVd9wpJHNAc9tJlQ3nHAsGeiGFf_Ayjs0%3D'
const CORS = { 'access-control-allow-origin': '*' }
const HIT = { characterId: ID, name: '<strong>Mar</strong>', race: 2, pcId: 24, level: 16, serverId: 2307, serverName: 'Ereshkigal', profileImageUrl: '/game_profile_images/aion2global/images?gameServerKey=2307&charKey=1', region: 'eu' }
const DETAIL = {
  profile: { characterName: 'Mar', characterLevel: 16, className: 'Spiritmaster', combatPower: 9519, raceId: 2, serverName: 'Ereshkigal', profileImage: null, titleName: '' },
  title: { ownedCount: 13, totalCount: 297, titleList: [{ equipCategory: 'Attack', ownedCount: 6, totalCount: 103 }] },
}

async function mockPlaync(page: Page, detail: unknown = DETAIL) {
  const urls: string[] = []
  await page.route('https://api-search.plaync.com/**', r => { urls.push(r.request().url()); return r.fulfill({ json: { list: [HIT], pagination: { page: 1, size: 20, total: 1 } }, headers: CORS }) })
  await page.route('https://aion2.plaync.com/**', r => { urls.push(r.request().url()); return r.fulfill({ json: detail, headers: CORS }) })
  await page.route('https://profileimg.plaync.com/**', r => r.fulfill({ status: 404, body: '' }))
  return urls
}

test('search -> pick -> character shows level, class, CP and titles', async ({ page }) => {
  const urls = await mockPlaync(page)
  const app = await openApp(page, { state: emptyState(), ui: { tab: 'check' } })
  await page.locator('[data-add-char]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Mar')
  await page.locator('[data-pnc-search]').click()
  const hit = page.locator('[data-pnc-hit="Mar"]')
  await expect(hit).toContainText('Lv 16 · Ereshkigal · Asmodier')
  await hit.click()
  const tile = page.locator('[data-char="Mar"]')
  await expect(tile).toContainText('Lv 16 · Spiritmaster · 9.519 CP')
  await expect(tile).toContainText('Titel 13/297')
  await expect(tile.locator('[data-pnc-info]')).toHaveAttribute('data-tip', /Quelle: PLAYNC-Charaktersuche · Stand: gerade eben/)
  expect(urls[0]).toContain('keyword=Mar&region=eu')
  expect(urls[1]).toContain(`characterId=${ID}&serverId=2307&region=eu`)
  expect((await app.posted('setChar')).at(-1).name).toBe('Mar')
  expect((await app.posted('ui')).some((m: { patch: { pnc?: Record<string, { cls: string }> } }) => m.patch.pnc?.Mar?.cls === 'Spiritmaster')).toBe(true)
  // character page: titles, refresh action
  await tile.click()
  await expect(page.locator('[data-pnc-titles]')).toContainText('Attack 6/103')
  await page.locator('[data-pnc-refresh]').click()
  await expect.poll(() => urls.length).toBe(3)
  await page.screenshot({ path: 'e2e/.out/shots/plaync-char.png' })
})

test('detail without data: search values stay, refresh failure is quiet', async ({ page }) => {
  await mockPlaync(page, { profile: { characterName: null, characterLevel: null }, title: { ownedCount: null, totalCount: null, titleList: null } })
  await openApp(page, { state: emptyState(), ui: { tab: 'check' } })
  await page.locator('[data-add-char]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Mar')
  await page.locator('[data-pnc-search]').click()
  await page.locator('[data-pnc-hit="Mar"]').click()
  const tile = page.locator('[data-char="Mar"]')
  await expect(tile).toContainText('Lv 16 · Ereshkigal · Asmodier')
  // offline: cached data stays, a short note instead of an error dialog
  await page.unroute('https://aion2.plaync.com/**')
  await page.route('https://aion2.plaync.com/**', r => r.abort())
  await tile.click()
  await page.locator('[data-pnc-refresh]').click()
  await expect(page.getByText('PLAYNC-Charaktersuche nicht erreichbar').first()).toBeVisible()
  await expect(page.locator('[data-list]').getByText('Lv 16').first()).toBeVisible()
})

test('manual add without search still works; region in the settings', async ({ page }) => {
  const urls = await mockPlaync(page)
  const app = await openApp(page, { state: emptyState(), ui: { tab: 'check' } })
  await page.locator('[data-add-char]').click()
  await page.getByPlaceholder('Name des Charakters').fill('Ohne')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-char="Ohne"]')).toBeVisible()
  await expect(page.locator('[data-char="Ohne"] [data-pnc-info]')).toHaveCount(0)
  expect(urls).toEqual([])
  await page.locator('[data-tip="Einstellungen"]').click()
  await page.locator('nav [data-tip="Daten & Über"]').click()
  await expect(page.getByText('öffentliche Charaktersuche von NCSOFT')).toBeVisible()
  await page.getByRole('combobox').filter({ hasText: 'Europa' }).click()
  await page.getByRole('option', { name: 'Nordamerika' }).click()
  await expect.poll(async () => (await app.posted('ui')).some((m: { patch: { pncRegion?: string } }) => m.patch.pncRegion === 'nae')).toBe(true)
})
