import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { readFile } from 'node:fs/promises'

async function checkLayout(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(scan.violations).toEqual([])
}

test('copy link, decode QR, follow link, and retrieve exact text', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const text = 'A link and QR 🌉\nမြန်မာစာ 日本語\n<script>plain text</script>'
  await page.getByLabel('Text or link').fill(text)
  await page.getByRole('button', { name: 'Generate code' }).click()
  const link = page.getByLabel('Sharing link', { exact: true })
  await expect(link).toBeVisible()
  const value = await link.inputValue()
  const code = await page.locator('.sharing-code').innerText()
  expect(value).toBe(`http://127.0.0.1:5174/receive#${code}`)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('status')).toContainText('Link copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value)
  const png = PNG.sync.read(await page.locator('.sharing-qr svg').screenshot())
  expect(
    jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
  ).toBe(value)
  await checkLayout(page)
  await page.screenshot({
    path: `artifacts/${info.project.name}-link-qr.png`,
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Open link', exact: true }).click()
  await expect(page.getByLabel('Enter sharing code')).toHaveValue(code)
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(page.locator('pre')).toHaveText(text)
  const isolated = await context.browser()!.newContext()
  try {
    const other = await isolated.newPage()
    await other.goto(value)
    await other.getByRole('button', { name: 'View content' }).click()
    await expect(
      other.getByRole('heading', { name: 'Code not found or expired.' }),
    ).toBeVisible()
  } finally {
    await isolated.close()
  }
})

test('PDF and JPG persist across refresh, download exact bytes, and expire', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.clock.install()
  await page.goto('/')
  const samples = [
    {
      name: 'sample-မြန်မာ.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nSynthetic test bytes\n%%EOF'),
    },
    {
      name: 'sample-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([255, 216, 255, 224, 0, 1, 255, 217]),
    },
  ]
  for (const sample of samples) {
    await page.getByRole('radio', { name: 'File', exact: true }).check()
    await page.getByLabel('Choose a file').setInputFiles(sample)
    await checkLayout(page)
    await page.getByRole('button', { name: 'Generate code' }).click()
    await expect(page.getByLabel('Sharing link', { exact: true })).toBeVisible()
    const link = await page
      .getByLabel('Sharing link', { exact: true })
      .inputValue()
    await page.goto(link)
    await page.reload()
    await page.getByRole('button', { name: 'View content' }).click()
    await expect(
      page.getByRole('heading', { name: 'File received.' }),
    ).toBeVisible()
    await checkLayout(page)
    await page.screenshot({
      path: `artifacts/${info.project.name}-file.png`,
      fullPage: true,
    })
    for (let i = 0; i < 2; i++) {
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download file' }).click()
      const download = await pending
      expect(download.suggestedFilename()).toBe(sample.name)
      expect(await readFile((await download.path())!)).toEqual(sample.buffer)
    }
    await page.getByRole('tab', { name: 'Send', exact: true }).click()
  }
  // Active content is downloaded as bytes, never embedded or executed.
  await page.getByRole('radio', { name: 'File', exact: true }).check()
  await page.getByLabel('Choose a file').setInputFiles({
    name: 'example.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<script>window.injected=true</script>'),
  })
  await page.getByRole('button', { name: 'Generate code' }).click()
  await page.getByRole('link', { name: 'Open link', exact: true }).click()
  const link = page.url()
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('button', { name: 'Download file' }),
  ).toBeVisible()
  expect(await page.evaluate(() => 'injected' in window)).toBe(false)
  await page.clock.fastForward(600_000)
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download file' })).toHaveCount(
    0,
  )
  await page.goto(link)
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
})

test('reject oversized file, remove selection, and upgrade old IndexedDB notes', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'File', exact: true }).check()
  await page.getByLabel('Choose a file').setInputFiles({
    name: 'too-large.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(20_000_000),
  })
  await expect(page.getByRole('alert')).toContainText('smaller than 20 MB')
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Remove file' }).click()
  await expect(page.getByLabel('Choose a file')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Generate code' }),
  ).toBeDisabled()
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('textbridge-demo', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('records')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('records', 'readwrite')
          tx.objectStore('records').put(
            JSON.stringify({
              code: 'ABC234',
              text: 'Before file upgrade',
              duration: '30 minutes',
              expiresAt: Date.now() + 1_800_000,
            }),
            'textbridge:demo:v1:note:ABC234',
          )
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onabort = () => reject(tx.error)
        }
      }),
  )
  await page.goto('/receive#ABC234')
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(page.locator('pre')).toHaveText('Before file upgrade')
})
