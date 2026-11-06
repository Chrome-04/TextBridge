import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

test('independent browser sessions share exact text and files through Firebase', async ({
  browser,
}) => {
  const sender = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  const receiver = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const send = await sender.newPage()
  const receive = await receiver.newPage()
  try {
    await send.goto('http://127.0.0.1:5175')
    await expect(
      send.getByText('Firebase · local testing', { exact: true }),
    ).toBeVisible()
    const text =
      'Firebase cross-browser test 🌉\nမြန်မာစာ 日本語\n<script>plain text</script>'
    await send.getByLabel('Text or link').fill(text)
    await send.getByRole('button', { name: 'Generate code' }).click()
    await expect(send.getByLabel('Sharing link', { exact: true })).toBeVisible()
    await receive.goto(
      await send.getByLabel('Sharing link', { exact: true }).inputValue(),
    )
    await receive.getByRole('button', { name: 'View content' }).click()
    expect(await receive.locator('pre').textContent()).toBe(text)
    expect(
      (
        await new AxeBuilder({ page: receive })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await receive.screenshot({
      path: 'artifacts/firebase-mobile-text.png',
      fullPage: true,
    })
    await send.getByRole('button', { name: 'Send another' }).click()
    await send.getByRole('radio', { name: 'File', exact: true }).check()
    const content = Buffer.from(
      '%PDF-1.4\nSynthetic Firebase download test\n%%EOF',
    )
    await send
      .getByLabel('Choose a file')
      .setInputFiles({
        name: 'cross-browser.pdf',
        mimeType: 'application/pdf',
        buffer: content,
      })
    await send.getByRole('button', { name: 'Generate code' }).click()
    await expect(send.getByLabel('Sharing link', { exact: true })).toBeVisible()
    await send.screenshot({
      path: 'artifacts/firebase-desktop-code.png',
      fullPage: true,
    })
    await receive.goto(
      await send.getByLabel('Sharing link', { exact: true }).inputValue(),
    )
    await receive.getByRole('button', { name: 'View content' }).click()
    await expect(
      receive.getByRole('heading', { name: 'File received.' }),
    ).toBeVisible()
    const pending = receive.waitForEvent('download')
    await receive.getByRole('button', { name: 'Download file' }).click()
    const download = await pending
    expect(await readFile((await download.path())!)).toEqual(content)
    await receive.reload()
    await receive.getByRole('button', { name: 'View content' }).click()
    await expect(
      receive.getByRole('heading', { name: 'File received.' }),
    ).toBeVisible()
    await receive.screenshot({
      path: 'artifacts/firebase-mobile-file.png',
      fullPage: true,
    })
    // A failed server request preserves the sender's draft rather than falling back to IndexedDB.
    await send.getByRole('button', { name: 'Send another' }).click()
    await send.getByRole('radio', { name: 'Text', exact: true }).check()
    await send.getByLabel('Text or link').fill('Keep this draft')
    await send.route('**/api/shares', (route) => route.abort())
    await send.getByRole('button', { name: 'Generate code' }).click()
    await expect(
      send.getByRole('heading', { name: 'The bridge is down.' }),
    ).toBeVisible()
    await send.getByRole('button', { name: 'Back to Send' }).click()
    await expect(send.getByLabel('Text or link')).toHaveValue('Keep this draft')
  } finally {
    await sender.close()
    await receiver.close()
  }
})
