import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function send(page: Page, text: string) {
  await page.getByLabel('Text or link').fill(text)
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(
    page.getByRole('heading', { name: 'Your sharing code is ready.' }),
  ).toBeVisible()
  const code = await page.locator('.sharing-code').innerText()
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  return code
}
async function receive(page: Page, code: string) {
  await page.getByRole('tab', { name: 'Receive', exact: true }).click()
  await page.getByLabel('Enter sharing code').fill(code)
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('heading', { name: 'Text received.' }),
  ).toBeVisible()
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}
async function accessible(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(scan.violations).toEqual([])
}

test('send, copy, second note, cross-tab retrieval, reload, repeat reads, and safe text', async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const text =
    '🌉 မြန်မာစာ 日本語\n\nconst html = "<img src=x onerror=alert(1)>";\nhttps://example.com/' +
    'long'.repeat(500) +
    '\n'
  const code = await send(page, text)
  await noOverflow(page)
  await accessible(page)
  await page.screenshot({
    path: `artifacts/${info.project.name}-code.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Copy code' }).click()
  await expect(page.getByRole('status')).toContainText('Code copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
  await page.getByRole('button', { name: 'Send another' }).click()
  await expect(
    page.getByRole('radio', { name: '10 minutes', exact: true }),
  ).toBeChecked()
  await page.getByRole('radio', { name: '30 minutes', exact: true }).check()
  const second = await send(page, 'second note')
  expect(second).not.toBe(code)
  await expect(page.locator('.expiry-row')).toContainText(
    '30 minutes from creation',
  )
  const anotherTab = await context.newPage()
  await anotherTab.goto('/receive')
  await receive(
    anotherTab,
    ` ${code.slice(0, 3).toLowerCase()} - ${code.slice(3).toLowerCase()} `,
  )
  expect(await anotherTab.locator('pre').textContent()).toBe(text)
  await expect(anotherTab.locator('pre img')).toHaveCount(0)
  await noOverflow(anotherTab)
  await accessible(anotherTab)
  await anotherTab.screenshot({
    path: `artifacts/${info.project.name}-received.png`,
    fullPage: true,
  })
  await anotherTab.getByRole('button', { name: 'Copy text' }).click()
  await expect(anotherTab.getByRole('status')).toContainText('Text copied')
  expect(await anotherTab.evaluate(() => navigator.clipboard.readText())).toBe(
    text,
  )
  await anotherTab.reload()
  await receive(anotherTab, code)
  expect(await anotherTab.locator('pre').textContent()).toBe(text)
  await anotherTab.getByRole('button', { name: 'Receive another' }).click()
  await expect(anotherTab.getByLabel('Enter sharing code')).toHaveValue('')
  await receive(anotherTab, second)
  await expect(anotherTab.locator('pre')).toHaveText('second note')
})

test('word boundaries, default duration, and accessible responsive send/receive', async ({
  page,
}, info) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('radio', { name: '10 minutes', exact: true }),
  ).toBeChecked()
  await noOverflow(page)
  await accessible(page)
  await page.screenshot({
    path: `artifacts/${info.project.name}-send.png`,
    fullPage: true,
  })
  await page.getByLabel('Text or link').fill('word '.repeat(100001))
  await expect(page.getByRole('alert')).toContainText('Remove 1 word')
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeDisabled()
  await page.getByLabel('Text or link').fill('word '.repeat(100000))
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeEnabled()
  await expect(page.locator('#word-count')).toHaveText(
    '100,000 / 100,000 words',
  )
  await page.goto('/receive')
  await noOverflow(page)
  await accessible(page)
  await page.screenshot({
    path: `artifacts/${info.project.name}-receive.png`,
    fullPage: true,
  })
  for (const code of ['', 'abc', 'abc2345', 'abc23!', 'O0I123']) {
    await page.getByLabel('Enter sharing code').fill(code)
    await page.getByRole('button', { name: 'View content' }).click()
    await expect(page.getByRole('alert')).toContainText('Use exactly 6')
  }
})

test('unknown codes, simulated network/rate errors, and draft recovery', async ({
  page,
}) => {
  await page.goto('/receive')
  await page.getByLabel('Enter sharing code').fill('ABC234')
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
  await accessible(page)
  await page.getByRole('tab', { name: 'Send', exact: true }).click()
  await page.getByLabel('Text or link').fill('Keep my draft 🌉')
  await page.getByText('Demo testing options', { exact: true }).click()
  await page.getByLabel('Next request').selectOption('network')
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(
    page.getByRole('heading', { name: 'The bridge is down.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Send' }).click()
  await expect(page.getByLabel('Text or link')).toHaveValue('Keep my draft 🌉')
  await page.getByLabel('Next request').selectOption('rate-limited')
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(
    page.getByRole('heading', { name: 'Too many attempts. Take a moment.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Send' }).click()
  await send(page, 'Recovery works')
})

test('expired text disappears while open and cannot be retrieved again', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/')
  const code = await send(page, 'ephemeral text')
  await receive(page, code)
  await page.clock.fastForward(600_000)
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
  await expect(page.locator('pre')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to Receive' }).click()
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
})

test('clipboard denial does not report success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied')
        },
      },
    })
  })
  await page.goto('/')
  await send(page, 'clipboard test')
  await page.getByRole('button', { name: 'Copy code' }).click()
  await expect(page.getByRole('status')).toContainText('Could not copy')
  await expect(page.getByRole('button', { name: 'Copied!' })).toHaveCount(0)
})

test('keyboard tabs, browser navigation, and cancellation during loading', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Send', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/receive$/)
  await expect(
    page.getByRole('tab', { name: 'Receive', exact: true }),
  ).toBeFocused()
  await page.goBack()
  await expect(page.getByLabel('Text or link')).toBeVisible()
  const clockStart = new Date('2030-01-01T00:00:00Z')
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000))
  await page.getByLabel('Text or link').fill('cancel this request')
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(page.getByRole('status')).toContainText('Building your bridge')
  await page.getByRole('tab', { name: 'Receive', exact: true }).click()
  await expect(page.getByLabel('Enter sharing code')).toBeVisible()
  // After the delayed operation would finish, navigation must still win.
  await page.clock.runFor(700)
  await expect(page.getByLabel('Enter sharing code')).toBeVisible()
})

test('storage errors are actionable and do not lose the draft', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new Error('storage disabled')
    }
  })
  await page.goto('/')
  await page.getByLabel('Text or link').fill('Keep this text')
  await page.getByRole('button', { name: 'Generate code' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Your browser couldn’t save or read this note.',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to Send' }).click()
  await expect(page.getByLabel('Text or link')).toHaveValue('Keep this text')
})

test('100,000 words larger than old browser storage survive refresh and copy intact', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  // 6.1 MB, deliberately larger than localStorage's usual 5 MiB allowance.
  const text = ('abcdefghij'.repeat(6) + ' ').repeat(100_000)
  const code = await send(page, text)
  await page.reload()
  await receive(page, code)
  expect(await page.locator('pre').textContent()).toBe(text)
  await noOverflow(page)
  await page.getByRole('button', { name: 'Copy text' }).click()
  await expect(page.getByRole('status')).toContainText('Text copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)
})

test('light and dark themes are accessible and the chosen mode survives reload', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await noOverflow(page)
    await accessible(page)
    await page.screenshot({
      path: `artifacts/${info.project.name}-${theme}.png`,
      fullPage: true,
    })
    await expect(
      page.getByRole('radio', { name: '1 hour', exact: true }),
    ).toHaveCount(0)
    const code = await send(page, 'Theme preview 🌉\nconst text = "hello";')
    await accessible(page)
    await receive(page, code)
    await accessible(page)
    await page.getByRole('tab', { name: 'Send', exact: true }).click()
  }
})

test('existing local notes migrate without shortening their original expiration', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() =>
    localStorage.setItem(
      'textbridge:demo:v1:note:ABC234',
      JSON.stringify({
        code: 'ABC234',
        text: 'Existing demo note',
        duration: '1 hour',
        expiresAt: Date.now() + 3_600_000,
      }),
    ),
  )
  await receive(page, 'ABC234')
  await expect(page.locator('pre')).toHaveText('Existing demo note')
  expect(
    await page.evaluate(() =>
      localStorage.getItem('textbridge:demo:v1:note:ABC234'),
    ),
  ).toBeNull()
  await page.reload()
  await receive(page, 'ABC234')
  await expect(page.locator('pre')).toHaveText('Existing demo note')
})
