import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

const password = 'TextBridge-test-923!'
const accounts: { uid: string; token: string }[] = []
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.on('pageerror', (error) => console.log('Browser error:', error.message))
})
async function signUp(page: Page, email: string) {
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('button', { name: 'New here? Create an account' })
    .click()
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByLabel('Password', { exact: true }).fill(password)
  await dialog.getByLabel('Confirm password').fill(password)
  await dialog
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const account = await page.evaluate(async () => {
    const module = await import('/src/firebase-session.ts' /* @vite-ignore */)
    const user = module.firebaseSession().auth.currentUser!
    return { uid: user.uid, token: await user.getIdToken() }
  })
  accounts.push(account)
}
async function logOut(page: Page) {
  const menu = page.getByLabel('Open navigation')
  if (await menu.isVisible()) await menu.click()
  await page
    .getByRole('button', { name: 'Log out', exact: true })
    .filter({ visible: true })
    .click()
  if (
    (await menu.isVisible()) &&
    (await page.locator('.mobile-menu').getAttribute('open')) !== null
  )
    await menu.click()
}
async function logIn(page: Page, email: string) {
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByLabel('Password', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
async function assertLayout(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
}
test.afterEach(async () => {
  // Delete only records owned by accounts this test created; never reset emulators.
  for (const account of accounts.splice(0)) {
    const base = `http://127.0.0.1:8082/v1/projects/demo-textbridge/databases/(default)/documents/users/${account.uid}/notes`
    const response = await fetch(base, {
      headers: { Authorization: 'Bearer owner' },
    })
    const result = (await response.json()) as { documents?: { name: string }[] }
    for (const item of result.documents || [])
      await fetch(`http://127.0.0.1:8082/v1/${item.name}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      })
    await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: account.token }),
      },
    )
  }
})

test('save before sharing, rich editing, permanent private library, snapshots and receive-save', async ({
  page,
  context,
}, info) => {
  test.setTimeout(180_000)
  const email = `notes-${randomUUID()}@textbridge.invalid`
  const source =
    'My classroom note\n  const hello = "မင်္ဂလာပါ";\n<script>window.bad = true</script>'
  await page.goto('/')
  await page.getByLabel('Text or link', { exact: true }).fill(source)
  await page.getByRole('button', { name: 'Save to Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Close account dialog' }).click()
  await expect(page.getByLabel('Text or link', { exact: true })).toHaveValue(
    source,
  )
  await page.getByRole('button', { name: 'Save to Notes', exact: true }).click()
  await signUp(page, email)
  await expect(page.locator('.notes-toast')).toContainText(
    'Saved to your private notes.',
    { timeout: 20_000 },
  )
  await page
    .locator('.notes-toast')
    .getByRole('button', { name: 'Open note' })
    .click()
  await expect(page).toHaveURL(/\/saved$/)
  await expect(page.getByLabel('Note title', { exact: true })).toHaveValue(
    'My classroom note',
    { timeout: 20_000 },
  )
  const editor = page.getByRole('textbox', {
    name: 'Note content',
    exact: true,
  })
  await expect(editor).toContainText('<script>window.bad = true</script>')
  await expect(editor).toContainText('  const hello')
  await editor.fill('Formatted thought')
  await editor.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(editor.locator('strong')).toContainText('Formatted thought')
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(editor.locator('em')).toContainText('Formatted thought')
  await page.getByRole('button', { name: 'Underline', exact: true }).click()
  await editor.press('ArrowRight')
  await page.getByRole('button', { name: 'Insert emoji', exact: true }).click()
  await page.getByRole('button', { name: 'Insert ✅', exact: true }).click()
  await page.getByLabel('Note title', { exact: true }).fill('Classroom ideas')
  await expect(page.getByLabel('Note title', { exact: true })).toHaveValue(
    'Classroom ideas',
  )
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor-state')).toHaveText(/^Saved\.?$/, {
    timeout: 20_000,
  })
  await page.reload()
  await page
    .locator('.notes-list')
    .getByRole('button', { name: /Classroom ideas/ })
    .click()
  await expect(
    editor.locator(
      'strong em u, strong u em, em strong u, u em strong, u strong em, em u strong',
    ),
  ).toContainText('Formatted thought')
  await expect(editor).toContainText('✅')
  await assertLayout(page)
  for (const theme of ['dark', 'light']) {
    const toggle = page.getByRole('button', { name: `Switch to ${theme} mode` })
    if (await toggle.isVisible()) await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const results = await new AxeBuilder({ page }).include('#main').analyze()
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        description: violation.description,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([])
  }
  const darkMode = page.getByRole('button', { name: 'Switch to dark mode' })
  if (await darkMode.isVisible()) await darkMode.click()
  await page.screenshot({
    path: `artifacts/saved-notes-${info.project.name}.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Share note', exact: true }).click()
  const share = page.getByRole('dialog')
  await expect(
    share.getByRole('radio', { name: '5 minutes', exact: true }),
  ).toBeChecked()
  await share.getByRole('button', { name: 'Generate sharing code' }).click()
  const code = await share.locator('.notes-share-code').textContent()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  await share.getByRole('button', { name: 'Back to note' }).click()
  await editor.fill('Changed original after sharing')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor-state')).toHaveText(/^Saved\.?$/)
  const received = await context.newPage()
  await received.goto(`/receive#${code}`)
  await received.getByRole('button', { name: 'View content' }).click()
  await expect(received.getByLabel('Shared text content')).toHaveText(
    'Formatted thought✅',
  )
  await received
    .getByRole('button', { name: 'Save to Notes', exact: true })
    .click()
  // A new tab has an independent session; sign in if Firebase did not copy it.
  if (await received.getByRole('dialog').isVisible()) {
    await received.getByLabel('Email', { exact: true }).fill(email)
    await received.getByLabel('Password', { exact: true }).fill(password)
    await received
      .getByRole('dialog')
      .getByRole('button', { name: 'Log in', exact: true })
      .click()
  }
  await expect(received.locator('.notes-toast')).toContainText(
    'Saved to your private notes.',
  )
  await received.close()
  await page
    .locator('.notes-sidebar')
    .getByRole('button', { name: 'Refresh notes' })
    .click()
  await expect(page.locator('.notes-list li')).toHaveCount(2)
  await logOut(page)
  await expect(
    page.getByRole('heading', { name: 'A notebook of your own.' }),
  ).toBeVisible()
  await expect(page.locator('.notes-editor')).toHaveCount(0)
  await expect(page.locator('.notes-list')).toHaveCount(0)
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  await signUp(page, `other-${randomUUID()}@textbridge.invalid`)
  await expect(page.locator('.notes-empty')).toContainText('A little space')
  await expect(page.locator('.notes-list li')).toHaveCount(0)
  await logOut(page)
  await logIn(page, email)
  await page
    .locator('.notes-list')
    .getByRole('button', { name: /Classroom ideas/ })
    .click()
  await expect(editor).toHaveText('Changed original after sharing')
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(editor).toBeVisible()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, delete note' }).click()
  await expect(page.locator('.notes-list li')).toHaveCount(1)
  if (await page.getByLabel('Open navigation').isVisible())
    await page.getByLabel('Open navigation').click()
  await page
    .getByRole('link', { name: 'About', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page).toHaveURL(/\/#about$/)
  await expect(page.locator('#about')).toBeInViewport()
})

test('lists, unsaved edits and concurrent changes are recoverable', async ({
  page,
  context,
}) => {
  await page.goto('/saved')
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  await signUp(page, `conflict-${randomUUID()}@textbridge.invalid`)
  await page.getByRole('button', { name: '+ New note' }).click()
  await page.getByLabel('Note title', { exact: true }).fill('Shared draft')
  const editor = page.getByRole('textbox', {
    name: 'Note content',
    exact: true,
  })
  await editor.fill('First item')
  await page.getByRole('button', { name: 'Numbered list' }).click()
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor-state')).toHaveText(/^Saved\.?$/)
  await expect(editor.locator('ol')).toContainText('First item')
  const other = await context.newPage()
  await other.goto('/saved')
  // Duplicate tab auth via explicit browser session copy, emulating a logged-in second device.
  const storage = await page.evaluate(() =>
    Object.fromEntries(Object.entries(sessionStorage)),
  )
  await other.evaluate((values) => {
    for (const [key, value] of Object.entries(values))
      sessionStorage.setItem(key, value)
  }, storage)
  await other.reload()
  await other
    .locator('.notes-list')
    .getByRole('button', { name: /Shared draft/ })
    .click()
  await other
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Latest version from another device')
  await other.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(other.locator('.notes-editor-state')).toHaveText(/^Saved\.?$/)
  await editor.fill('My unsaved version')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor').getByRole('alert')).toContainText(
    'offline',
  )
  await expect(editor).toHaveText('My unsaved version')
  await context.setOffline(false)
  if (await page.getByLabel('Open navigation').isVisible())
    await page.getByLabel('Open navigation').click()
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page
    .getByRole('button', { name: 'Share now', exact: true })
    .filter({ visible: true })
    .click()
  await expect(editor).toHaveText('My unsaved version')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor').getByRole('alert')).toContainText(
    'changed on another device',
  )
  await expect(editor).toHaveText('My unsaved version')
  await page.getByRole('button', { name: 'Save edits as new note' }).click()
  await expect(page.locator('.notes-editor-state')).toHaveText(/^Saved\.?$/)
  await expect(page.locator('.notes-list li')).toHaveCount(2)
  await page.getByLabel('Search loaded notes').fill('another device')
  await page.getByRole('button', { name: 'Refresh notes' }).click()
  await expect(page.locator('.notes-list li')).toHaveCount(1)
  await other.close()
})
