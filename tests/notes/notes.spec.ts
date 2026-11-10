import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

test.use({ actionTimeout: 20_000 })
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
  await expect(
    dialog.getByRole('button', { name: 'Continue with Apple' }),
  ).toHaveCount(0)
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
async function closeNote(page: Page) {
  const close = page.getByRole('button', { name: 'Close note', exact: true })
  if (await close.isVisible()) await close.click()
}
async function expectNoteSaved(page: Page) {
  await expect(page.locator('.note-editor-dialog')).toHaveCount(0)
  await expect(page.locator('.note-save-notice')).toHaveText('Note saved.')
}
async function logOut(page: Page) {
  await closeNote(page)
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page
    .getByRole('region', { name: 'Your profile' })
    .getByRole('button', { name: 'Log out', exact: true })
    .click()
  await expect(
    page
      .getByRole('banner')
      .getByRole('button', { name: 'Log in', exact: true }),
  ).toBeVisible()
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
      `http://127.0.0.1:8082/v1/projects/demo-textbridge/databases/(default)/documents/users/${account.uid}/noteState/quota`,
      { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
    )
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

test('profile and note cards work on desktop and phones', async ({
  page,
}, info) => {
  const email = `preview-${randomUUID().slice(0, 8)}@example.test`
  await page.goto('/')
  const header = page.getByRole('banner')
  await header.getByRole('button', { name: 'Log in', exact: true }).click()
  await signUp(page, email)
  const profile = header.getByRole('button', { name: 'Profile', exact: true })
  const panel = header.getByRole('region', { name: 'Your profile' })
  if (info.project.name === 'desktop') {
    const viewport = page.viewportSize()!
    await page.setViewportSize({ ...viewport, width: 768 })
    await header.getByLabel('Open navigation').click()
    await expect(
      header.getByRole('link', { name: 'About', exact: true }),
    ).toBeVisible()
    await assertLayout(page)
    await header.getByLabel('Open navigation').click()
    await page.setViewportSize(viewport)
  }
  await expect(header.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await profile.click()
  await expect(panel.getByText(email, { exact: true })).toBeVisible()
  const bounds = await panel.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  await assertLayout(page)
  await page.screenshot({ path: `artifacts/profile-${info.project.name}.png` })
  await panel.getByRole('button', { name: 'Saved notes' }).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(profile).toBeFocused()
  await profile.click()
  await page.getByLabel('Text or link', { exact: true }).click()
  await expect(panel).toBeHidden()
  await profile.click()
  await panel.getByRole('button', { name: 'Saved notes' }).click()
  await expect(page).toHaveURL(/\/saved$/)
  const toolbar = page.locator('.notes-toolbar')
  const search = toolbar.getByRole('searchbox', { name: 'Search loaded notes' })
  const add = toolbar.getByRole('button', { name: 'Add note', exact: true })
  await expect(search).toBeVisible()
  await expect(
    toolbar.getByRole('button', { name: 'Refresh notes' }),
  ).toBeVisible()
  for (const [title, content, colour] of [
    [
      'Classroom ideas',
      'Try a short keyboard exercise at the start of class.',
      'Sage',
    ],
    ['Weekend plans', 'Bring a notebook and pick a spot by the window.', 'Sky'],
  ]) {
    await add.click()
    await page.getByLabel('Note title', { exact: true }).fill(title)
    const editor = page.getByRole('textbox', { name: 'Note content' })
    await editor.fill(content)
    const original = await editor.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await page.getByRole('button', { name: colour, exact: true }).click()
    const dialog = page.locator('.note-editor-dialog')
    await expect(editor).not.toHaveCSS('background-color', original)
    const selected = await dialog.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await expect(editor).toHaveCSS('background-color', selected)
    await expect(
      dialog.getByRole('group', { name: 'Text formatting' }),
    ).toHaveCSS('background-color', selected)
    await page.getByRole('button', { name: 'Save note', exact: true }).click()
    await expectNoteSaved(page)
    await assertLayout(page)
  }
  const cards = page.locator('.saved-note-card')
  await expect(cards.first()).toContainText('Weekend plans')
  await page.getByRole('button', { name: 'Pin Classroom ideas' }).click()
  await expect(cards.first()).toHaveAttribute('data-pinned', 'true')
  await page.reload()
  await expect(cards.first()).toContainText('Classroom ideas')
  await expect(cards.first()).toHaveAttribute('data-note-colour', 'sage')
  await expect(cards.nth(1)).toHaveAttribute('data-note-colour', 'sky')
  await search.fill('weekend')
  await expect(cards).toHaveCount(1)
  await search.clear()
  await expect(cards).toHaveCount(2)
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Grid view' }).click()
  await assertLayout(page)
  await page.screenshot({
    path: `artifacts/notes-cards-${info.project.name}.png`,
  })
  await page.getByRole('button', { name: 'Open note: Classroom ideas' }).click()
  await expect(
    page.getByRole('button', { name: 'Sage', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Pinned', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({
    path: `artifacts/notes-edit-${info.project.name}.png`,
  })
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.note-editor-dialog')).toHaveCount(0)
  await logOut(page)
  await expect(cards).toHaveCount(0)
  await expect(header.getByText(email, { exact: true })).toHaveCount(0)
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
  await expect(editor.locator('em')).toHaveCSS('font-synthesis-style', 'auto')
  await page.getByRole('button', { name: 'Underline', exact: true }).click()
  await editor.press('ArrowRight')
  await page.getByRole('button', { name: 'Insert emoji', exact: true }).click()
  await page.getByRole('button', { name: 'Insert ✅', exact: true }).click()
  await page.getByLabel('Note title', { exact: true }).fill('Classroom ideas')
  await expect(page.getByLabel('Note title', { exact: true })).toHaveValue(
    'Classroom ideas',
  )
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expectNoteSaved(page)
  await page.reload()
  const classroomNote = page.getByRole('button', {
    name: 'Open note: Classroom ideas',
    exact: true,
  })
  await classroomNote.click()
  await expect(
    editor.locator(
      'strong em u, strong u em, em strong u, u em strong, u strong em, em u strong',
    ),
  ).toContainText('Formatted thought')
  await expect(editor).toContainText('✅')
  await assertLayout(page)
  for (const theme of ['dark', 'light']) {
    await closeNote(page)
    const toggle = page.getByRole('button', { name: `Switch to ${theme} mode` })
    if (await toggle.isVisible()) await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await classroomNote.click()
    const results = await new AxeBuilder({ page }).include('#main').analyze()
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        description: violation.description,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([])
  }
  await closeNote(page)
  const darkMode = page.getByRole('button', { name: 'Switch to dark mode' })
  if (await darkMode.isVisible()) await darkMode.click()
  await classroomNote.click()
  await page.screenshot({
    path: `artifacts/saved-notes-${info.project.name}.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Share note', exact: true }).click()
  const share = page.locator('.share-note-dialog')
  await expect(
    share.getByRole('radio', { name: '5 minutes', exact: true }),
  ).toBeChecked()
  await share.getByRole('button', { name: 'Generate sharing code' }).click()
  const code = await share.locator('.notes-share-code').textContent()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  await share.getByRole('button', { name: 'Back to note' }).click()
  await editor.fill('Changed original after sharing')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expectNoteSaved(page)
  await expect(classroomNote).toBeFocused()
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
  await closeNote(page)
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
    .getByRole('button', { name: 'Open note: Classroom ideas', exact: true })
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
  await page.getByRole('button', { name: 'Add note' }).click()
  await page.getByLabel('Note title', { exact: true }).fill('Shared draft')
  const editor = page.getByRole('textbox', {
    name: 'Note content',
    exact: true,
  })
  await editor.fill('First item')
  await page.getByRole('button', { name: 'Numbered list' }).click()
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expectNoteSaved(page)
  await page.getByRole('button', { name: 'Open note: Shared draft' }).click()
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
    .getByRole('button', { name: 'Open note: Shared draft', exact: true })
    .click()
  await other
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Latest version from another device')
  await other.getByRole('button', { name: 'Save note', exact: true }).click()
  await expectNoteSaved(other)
  await editor.fill('My unsaved version')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor').getByRole('alert')).toContainText(
    'offline',
  )
  await expect(editor).toHaveText('My unsaved version')
  await context.setOffline(false)
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.getByRole('button', { name: 'Close note', exact: true }).click()
  await expect(editor).toHaveText('My unsaved version')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-editor').getByRole('alert')).toContainText(
    'changed on another device',
  )
  await expect(editor).toHaveText('My unsaved version')
  await page.getByRole('button', { name: 'Save edits as new note' }).click()
  await expectNoteSaved(page)
  await expect(page.locator('.notes-list li')).toHaveCount(2)
  await closeNote(page)
  await page.getByLabel('Search loaded notes').fill('another device')
  await page.getByRole('button', { name: 'Refresh notes' }).click()
  await expect(page.locator('.notes-list li')).toHaveCount(1)
  await other.close()
})

test('20 slots, draft preservation, edit/share at cap and delete to free a slot', async ({
  page,
}, info) => {
  await page.goto('/saved')
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  await signUp(page, `capacity-${randomUUID()}@textbridge.invalid`)
  await expect(page.locator('.notes-list-meta')).toContainText(
    '0 / 20 notes saved',
  )
  await page.evaluate(async () => {
    const { firebaseSession } = await import(
      '/src/firebase-session.ts' /* @vite-ignore */
    )
    const notes = await import('/src/notes-client.ts' /* @vite-ignore */)
    const { documentFromText } = await import(
      '/src/note-document.ts' /* @vite-ignore */
    )
    const uid = firebaseSession().auth.currentUser!.uid
    for (let i = 1; i <= 20; i++)
      await notes.saveNote(
        uid,
        notes.newNoteId(uid),
        `Note ${i}`,
        documentFromText(`Thought ${i}`),
        null,
      )
  })
  await page.getByRole('button', { name: 'Refresh notes' }).click()
  await expect(page.locator('.notes-list-meta')).toContainText(
    '20 / 20 notes saved',
  )
  await expect(page.getByRole('button', { name: 'Add note' })).toBeDisabled()
  await page.getByLabel('Search loaded notes').fill('Note 20')
  await expect(page.locator('.notes-list li')).toHaveCount(1)
  await expect(page.locator('.notes-list-meta')).toContainText(
    '20 / 20 notes saved',
  )
  await page.locator('.notes-list .note-card-open').click()
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Edited at capacity')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expectNoteSaved(page)
  await page.locator('.notes-list .note-card-open').click()
  await page.getByRole('button', { name: 'Share note', exact: true }).click()
  await page
    .locator('.share-note-dialog')
    .getByRole('button', { name: 'Generate sharing code' })
    .click()
  await expect(page.locator('.notes-share-code')).toHaveText(/^[A-Z2-9]{6}$/)
  await page.getByRole('button', { name: 'Back to note' }).click()
  await assertLayout(page)
  await page.screenshot({
    path: `artifacts/notes-capacity-${info.project.name}.png`,
    fullPage: true,
  })
  await page.goto('/')
  await page
    .getByLabel('Text or link', { exact: true })
    .fill('Keep my unsaved twenty-first thought')
  await page.getByRole('button', { name: 'Save to Notes', exact: true }).click()
  await expect(page.locator('.notes-toast')).toContainText('20-note limit')
  await expect(page.getByLabel('Text or link', { exact: true })).toHaveValue(
    'Keep my unsaved twenty-first thought',
  )
  await page.goto('/saved')
  await page.locator('.notes-list .note-card-open').first().click()
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, delete note' }).click()
  await expect(page.locator('.notes-list-meta')).toContainText(
    '19 / 20 notes saved',
  )
  await page.getByRole('button', { name: 'Add note' }).click()
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Replacement thought')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-list-meta')).toContainText(
    '20 / 20 notes saved',
  )
})

test('immediate email signup, password reset and cancelled provider popup preserve the draft', async ({
  page,
}, info) => {
  const email = `instant-${randomUUID()}@textbridge.invalid`
  await page.goto('/')
  await page
    .getByLabel('Text or link', { exact: true })
    .fill('Keep this while I sign up')
  await page.getByRole('button', { name: 'Save to Notes', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Continue with Apple' }),
  ).toHaveCount(0)
  const popupEvent = page.waitForEvent('popup')
  await dialog.getByRole('button', { name: 'Continue with Google' }).click()
  const popup = await popupEvent
  await popup.waitForURL(/127\.0\.0\.1:9099\/emulator\/auth\/handler/)
  await popup.waitForLoadState('load')
  await popup.close()
  await expect(dialog.getByRole('alert')).toContainText('cancelled', {
    timeout: 20_000,
  })
  await expect(page.getByLabel('Text or link', { exact: true })).toHaveValue(
    'Keep this while I sign up',
  )
  await page.screenshot({
    path: `artifacts/account-options-${info.project.name}.png`,
    fullPage: true,
  })
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
    const { firebaseSession } = await import(
      '/src/firebase-session.ts' /* @vite-ignore */
    )
    const user = firebaseSession().auth.currentUser!
    return {
      uid: user.uid,
      token: await user.getIdToken(),
      emailVerified: user.emailVerified,
    }
  })
  accounts.push(account)
  expect(account.emailVerified).toBe(false)
  await expect(page.locator('.notes-toast')).toContainText(
    'Saved to your private notes.',
  )
  const codes = await fetch(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-textbridge/oobCodes',
  )
  const { oobCodes: sentCodes = [] } = await codes.json()
  expect(
    sentCodes.filter(
      (item: { email: string; requestType: string }) =>
        item.email === email && item.requestType === 'VERIFY_EMAIL',
    ),
  ).toEqual([])
  await logOut(page)
  await page.getByRole('button', { name: 'Save to Notes', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(
    dialog.getByRole('button', { name: 'Continue with Google' }),
  ).toHaveCount(0)
  await dialog.getByLabel('Email', { exact: true }).fill(email)
  await dialog.getByRole('button', { name: 'Send reset link' }).click()
  await expect(dialog.getByRole('status')).toContainText(
    'Password reset link generated',
  )
  const response = await fetch(
    'http://127.0.0.1:9099/emulator/v1/projects/demo-textbridge/oobCodes',
  )
  const { oobCodes } = await response.json()
  const reset = oobCodes
    .filter(
      (item: { email: string; requestType: string }) =>
        item.email === email && item.requestType === 'PASSWORD_RESET',
    )
    .at(-1)
  expect(reset).toBeTruthy()
  const newPassword = 'Reset-test-8473!'
  const applied = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode: reset.oobCode, newPassword }),
    },
  )
  expect(applied.ok).toBe(true)
  await dialog.getByRole('button', { name: 'Back to log in' }).click()
  await dialog.getByLabel('Password', { exact: true }).fill(newPassword)
  await dialog.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.notes-toast')).toContainText(
    'Saved to your private notes.',
  )
  await assertLayout(page)
})

test('Google popup sign-in saves and reopens the same private library', async ({
  page,
}, info) => {
  await page.goto('/saved')
  const provider = 'Google'
  const email = `provider-${randomUUID()}@textbridge.invalid`
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  const dialog = page.getByRole('dialog')
  const accessibility = await new AxeBuilder({ page })
    .include('.account-dialog')
    .analyze()
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([])
  await page.screenshot({
    path: `artifacts/signin-${info.project.name}.png`,
    fullPage: true,
  })
  const open = page.waitForEvent('popup')
  await dialog
    .getByRole('button', { name: `Continue with ${provider}` })
    .click()
  const popup = await open
  await popup.waitForURL(/127\.0\.0\.1:9099\/emulator\/auth\/handler/)
  await popup.waitForLoadState('load')
  await popup.getByText('Add new account', { exact: true }).click()
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill(`Test ${provider}`)
  await popup
    .getByRole('button', {
      name: /Sign in with/,
    })
    .click()
  await expect(dialog).not.toBeVisible()
  const account = await page.evaluate(async () => {
    const { firebaseSession } = await import(
      '/src/firebase-session.ts' /* @vite-ignore */
    )
    const user = firebaseSession().auth.currentUser!
    return { uid: user.uid, token: await user.getIdToken() }
  })
  accounts.push(account)
  await expect(page.locator('.notes-account-label')).toContainText(email)
  await expect(page.locator('.notes-list-meta')).toContainText(
    '0 / 20 notes saved',
  )
  await page.getByRole('button', { name: 'Add note' }).click()
  await page
    .getByLabel('Note title', { exact: true })
    .fill(`${provider} thought`)
  await page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .fill('Private provider note')
  await page.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.locator('.notes-list-meta')).toContainText(
    '1 / 20 notes saved',
  )
  await logOut(page)
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  const reopen = page.waitForEvent('popup')
  await page.getByRole('button', { name: `Continue with ${provider}` }).click()
  const returning = await reopen
  await returning.waitForURL(/127\.0\.0\.1:9099\/emulator\/auth\/handler/)
  await returning.waitForLoadState('load')
  await returning.getByText(email, { exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.notes-list')).toContainText(`${provider} thought`)
  await expect(page.locator('.notes-list-meta')).toContainText(
    '1 / 20 notes saved',
  )
  await logOut(page)
})
