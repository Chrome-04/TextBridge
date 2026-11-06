import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const baseURL = process.env.TEXTBRIDGE_BROWSER_URL || 'http://127.0.0.1:5175'

test('database comments persist across independent browsers; safe text, mobile layout and failures', async ({
  browser,
}) => {
  const sender = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  const reader = await browser.newContext({
    viewport: { width: 320, height: 740 },
  })
  try {
    const page = await sender.newPage()
    const mobile = await reader.newPage()
    await page.goto(`${baseURL}/#comments`)
    await expect(
      page.getByRole('button', { name: 'Refresh comments' }),
    ).toBeEnabled()
    await page
      .getByLabel('Nickname', { exact: true })
      .fill('Synthetic UI tester 🌉')
    const message =
      'A useful bridge!\nမြန်မာစာ 日本語\n<img src=x onerror=alert(1)>'
    await page.getByLabel('Your comment', { exact: true }).fill(message)
    await page
      .getByRole('button', { name: 'Post comment', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText(
      'Your comment is posted',
    )
    await expect(page.getByLabel('Your comment', { exact: true })).toHaveValue(
      '',
    )
    await mobile.goto(`${baseURL}/#comments`)
    await expect(
      mobile
        .locator('.comment-list article')
        .filter({ hasText: 'A useful bridge!' })
        .first(),
    ).toContainText(message)
    await expect(mobile.locator('.comment-list img')).toHaveCount(0)
    await mobile.reload()
    await expect(
      mobile
        .locator('.comment-list article')
        .filter({ hasText: 'A useful bridge!' })
        .first(),
    ).toContainText(message)
    expect(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      (
        await new AxeBuilder({ page: mobile })
          .include('#comments')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await mobile
      .locator('#comments')
      .screenshot({ path: 'artifacts/comments-mobile.png' })
    await page
      .locator('#comments')
      .screenshot({ path: 'artifacts/comments-desktop.png' })
    await page
      .getByLabel('Your comment', { exact: true })
      .fill('Keep this synthetic draft')
    await page.route('**/api/comments', (route) => route.abort())
    await page
      .getByRole('button', { name: 'Post comment', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText('Could not confirm')
    await expect(page.getByLabel('Your comment', { exact: true })).toHaveValue(
      'Keep this synthetic draft',
    )
    await page.unroute('**/api/comments')
    await page.route('**/api/comments', (route) =>
      route.fulfill({
        status: 429,
        body: JSON.stringify({ error: 'rate-limited' }),
      }),
    )
    await page
      .getByRole('button', { name: 'Post comment', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText('Wait a minute')
    await expect(page.getByLabel('Your comment', { exact: true })).toHaveValue(
      'Keep this synthetic draft',
    )
    await mobile.route('**/api/comments/list', (route) => route.abort())
    await mobile.getByRole('button', { name: 'Refresh comments' }).click()
    await expect(mobile.getByRole('alert')).toContainText('Could not load')
    await expect(
      mobile
        .locator('.comment-list article')
        .filter({ hasText: 'A useful bridge!' })
        .first(),
    ).toContainText(message)
  } finally {
    await sender.close()
    await reader.close()
  }
})
