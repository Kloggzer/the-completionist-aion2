// Every view at the overlay sizes (360, 640) up to a maximized window (1280, 2000): screenshots for a visual check
// (e2e/.out/shots/resp-<w>-<view>.png) and no horizontal overflow anywhere (page or any scroll container).
import { expect, test, type Page } from '@playwright/test'
import { hasCache, openApp } from './host'

test.skip(!hasCache(), 'needs the app data cache in %LOCALAPPDATA%\\TheCompletionist\\cache (start the app once)')

const TABS = ['Übersicht', 'Ziele', 'Spots', 'Erfolge', 'Checkliste', 'Bosse', 'Timer']
const SIZES = [[360, 700], [640, 800], [1280, 800], [2000, 1100], [2560, 1400]] as const
const CHK = { srv: {}, chars: { Testchar: {}, Zweitchar: { supplyEmergency: { c: 1, at: Date.now() } } } }

/** Widest overflow found: the document plus every element that scrolls horizontally. */
const overflow = (page: Page) => page.evaluate(() => {
  const bad: string[] = []
  const d = document.documentElement
  if (d.scrollWidth > d.clientWidth + 1) bad.push(`document ${d.scrollWidth}>${d.clientWidth}`)
  for (const el of document.querySelectorAll<HTMLElement>('*')) {
    const ox = getComputedStyle(el).overflowX
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1)
      bad.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)} ${el.scrollWidth}>${el.clientWidth}`)
  }
  return bad
})

async function check(page: Page, w: number, name: string) {
  await page.waitForTimeout(150)
  await page.screenshot({ path: `e2e/.out/shots/resp-${w}-${name}.png` })
  expect(await overflow(page), `${name} @ ${w}px`).toEqual([])
}

for (const [w, h] of SIZES) {
  test(`every view fits at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openApp(page, { ui: { checklist: CHK, timerAll: true, charges: { 'odyle|Zweitchar': { v: 545, at: Date.now() } } } })
    for (const [i, name] of TABS.entries()) {
      await page.locator('[data-tabs] button').nth(i).click()
      await check(page, w, name)
    }
    // Checklist character page.
    await page.locator('[data-tabs] button').nth(TABS.indexOf('Checkliste')).click()
    await page.getByRole('button', { name: /Zweitchar/ }).first().click()
    await expect(page.getByText('wird von Hand gepflegt')).toBeVisible()
    await check(page, w, 'Checkliste-char')
    // Map tabs in list-only view.
    await page.locator('[data-tabs] button').nth(TABS.indexOf('Ziele')).click()
    await page.locator('[data-tip="Nur Liste"]').click()
    await check(page, w, 'Ziele-list')
    // Settings.
    await page.locator('[data-tip="Einstellungen"]').click()
    await check(page, w, 'Settings')
    await page.locator('nav [data-tip="Benachrichtigungen"]').click()
    await check(page, w, 'Settings-notify')
  })
}
