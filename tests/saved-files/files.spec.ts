import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

const accounts: { token: string; email: string }[] = []
const password = 'Private-files-test-923!'
async function signup(page: Page) {
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  await page
    .getByRole('button', { name: 'New here? Create an account' })
    .click()
  const email = `files-ui-${crypto.randomUUID()}@example.test`
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const token = await page.evaluate(async () => {
    const { firebaseSession } = await import(
      '/src/firebase-session.ts' /* @vite-ignore */
    )
    return firebaseSession().auth.currentUser!.getIdToken()
  })
  const account = { token, email }
  accounts.push(account)
  return account
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Log in or create account' }),
  ).toBeVisible()
}
test.afterEach(async () => {
  for (const account of accounts.splice(0)) {
    const base = 'http://127.0.0.1:54321/functions/v1/api/files'
    const headers = {
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
    }
    const result = await fetch(`${base}/list`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    if (result.ok) {
      const data = await result.json()
      for (const file of data.files)
        if (file.state !== 'pending')
          await fetch(`${base}/delete`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id: file.id }),
          })
    }
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
test('private saved files fit desktop and phones, enforce remaining storage, and persist by account', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/saved')
  const account = await signup(page)
  const filesTab = page.getByRole('button', {
    name: 'Files · 20 MB',
    exact: true,
  })
  await filesTab.click()
  const library = page.getByRole('region', { name: 'Private saved files' })
  await expect(library).toContainText('0 bytes of 20 MB used')
  const content = Buffer.from(
    '%PDF-1.4\nSynthetic CV for browser test only. မင်္ဂလာပါ\n<script>literal</script>',
  )
  const name = 'CV - မင်္ဂလာပါ.pdf'
  await library
    .getByLabel('Choose a file to save')
    .setInputFiles({ name, mimeType: 'application/pdf', buffer: content })
  await expect(library.locator('.notes-message')).toContainText(
    'File saved privately',
    { timeout: 30_000 },
  )
  await expect(library.locator('.saved-file-list strong')).toHaveText(name)
  await expect(library.getByRole('progressbar')).toHaveAttribute(
    'value',
    String(content.length),
  )
  await expect(library.getByRole('progressbar')).toHaveAttribute(
    'max',
    '20000000',
  )
  const downloadEvent = page.waitForEvent('download')
  await library
    .getByRole('button', { name: `Download ${name}`, exact: true })
    .click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe(name)
  expect(await readFile((await download.path())!)).toEqual(content)
  await library.getByLabel('Choose a file to save').setInputFiles({
    name: 'too-large-for-remaining.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(20_000_000),
  })
  await expect(library.getByRole('alert')).toContainText('remaining storage')
  await expect(library.locator('.saved-file-list > li')).toHaveCount(1)
  await page.reload()
  await filesTab.click()
  await expect(library.locator('.saved-file-list strong')).toHaveText(name)
  await library
    .getByRole('button', { name: `Delete ${name}`, exact: true })
    .click()
  await library.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(library.locator('.saved-file-list > li')).toHaveCount(1)
  const accessibility = await new AxeBuilder({ page })
    .include('.saved-files')
    .analyze()
  expect(accessibility.violations.map((item) => item.id)).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `artifacts/saved-files-${info.project.name}.png`,
    fullPage: true,
  })
  await logout(page)
  await signup(page)
  await filesTab.click()
  await expect(library).toContainText('0 bytes of 20 MB used')
  await expect(library.locator('.saved-file-list > li')).toHaveCount(0)
  await logout(page)
  await page.getByRole('button', { name: 'Log in or create account' }).click()
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Log in', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await filesTab.click()
  await expect(library.locator('.saved-file-list strong')).toHaveText(name)
  await library
    .getByRole('button', { name: `Delete ${name}`, exact: true })
    .click()
  await library
    .getByRole('button', { name: 'Yes, delete file', exact: true })
    .click()
  await expect(library.locator('.notes-message')).toContainText(
    'Storage space freed.',
  )
  await expect(library).toContainText('0 bytes of 20 MB used')
  await expect(library.locator('.saved-file-list > li')).toHaveCount(0)
})
