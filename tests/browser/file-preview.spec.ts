import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import AxeBuilder from '@axe-core/playwright'
import { strToU8, zipSync } from 'fflate'

function samplePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.launchURL("https://example.test/pdf-action")) >> >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['First page of your shared PDF', 'Second page of your shared PDF'].map(
      (text) => {
        const content = `BT /F1 18 Tf 36 230 Td (${text}) Tj ET\n`
        return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`
      },
    ),
  ]
  let content = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content))
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(content)
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  content += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  return Buffer.from(
    content +
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  )
}

async function receiveFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto('/')
  await page.getByRole('radio', { name: 'File', exact: true }).check()
  await page.getByLabel('Choose a file').setInputFiles(file)
  await page.getByRole('button', { name: 'Generate code' }).click()
  const sharing = page.getByLabel('Sharing link', { exact: true })
  await expect(sharing).toBeVisible()
  await page.goto(await sharing.inputValue())
  await page.getByRole('button', { name: 'View content' }).click()
  await expect(
    page.getByRole('heading', { name: 'File received.' }),
  ).toBeVisible()
}

test('PDF previews render pages, close cleanly, preserve downloads and disappear at expiry', async ({
  page,
}, info) => {
  await page.clock.install()
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('example.test/pdf-action'))
      external.push(request.url())
  })
  const buffer = samplePdf()
  await receiveFile(page, {
    name: 'classroom.pdf',
    mimeType: 'application/pdf',
    buffer,
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  const preview = page.getByRole('region', { name: 'File preview' })
  const canvas = preview.getByRole('img', {
    name: 'PDF page 1 of 2: classroom.pdf',
    exact: true,
  })
  await expect(canvas).toBeVisible()
  expect(
    await canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const pixels = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data
      return pixels.some((value, index) => index % 4 !== 3 && value < 150)
    }),
  ).toBe(true)
  await expect(
    preview.getByRole('button', { name: 'Previous page' }),
  ).toBeDisabled()
  await preview.getByRole('button', { name: 'Next page' }).click()
  await expect(
    preview.getByRole('img', { name: 'PDF page 2 of 2: classroom.pdf' }),
  ).toBeVisible()
  await expect(
    preview.getByRole('button', { name: 'Next page' }),
  ).toBeDisabled()
  await preview.getByRole('button', { name: 'First page', exact: true }).click()
  await expect(canvas).toBeVisible()
  await expect(
    preview.getByRole('button', { name: 'First page', exact: true }),
  ).toBeDisabled()
  await preview.getByRole('button', { name: 'Last page', exact: true }).click()
  await expect(
    preview.getByRole('img', { name: 'PDF page 2 of 2: classroom.pdf' }),
  ).toBeVisible()
  await expect(
    preview.getByRole('button', { name: 'Last page', exact: true }),
  ).toBeDisabled()
  await preview.getByRole('spinbutton', { name: 'Page number' }).fill('1')
  await preview.getByRole('button', { name: 'Go to page' }).click()
  await expect(canvas).toBeVisible()
  await preview.getByRole('spinbutton', { name: 'Page number' }).fill('9')
  await preview.getByRole('button', { name: 'Go to page' }).click()
  await expect(canvas).toBeVisible()
  await preview.getByRole('spinbutton', { name: 'Page number' }).fill('2')
  await preview.getByRole('spinbutton', { name: 'Page number' }).press('Enter')
  await expect(
    preview.getByRole('img', { name: 'PDF page 2 of 2: classroom.pdf' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.locator('.file-received').screenshot({
    path: `artifacts/file-preview-${info.project.name}.png`,
  })
  const accessibility = await new AxeBuilder({ page })
    .include('.file-received')
    .analyze()
  expect(accessibility.violations.map((item) => item.id)).toEqual([])
  await page.getByRole('button', { name: 'Hide preview' }).click()
  await expect(preview).toHaveCount(0)
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(canvas).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file' }).click()
  const download = await downloading
  expect(await readFile((await download.path())!)).toEqual(buffer)
  await page.clock.fastForward(600_000)
  await expect(
    page.getByRole('heading', { name: 'Code not found or expired.' }),
  ).toBeVisible()
  await expect(preview).toHaveCount(0)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('raster previews show actual file bytes and unsupported or damaged files keep downloads usable', async ({
  page,
}) => {
  const png = new PNG({ width: 32, height: 24 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 30
    png.data[i + 1] = 140
    png.data[i + 2] = 80
    png.data[i + 3] = 255
  }
  await receiveFile(page, {
    name: 'photo.dat',
    mimeType: 'application/octet-stream',
    buffer: PNG.sync.write(png),
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  const image = page.getByRole('img', { name: 'photo.dat', exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(32)
  await page.getByRole('button', { name: 'Hide preview' }).click()
  await expect(image).toHaveCount(0)
  await receiveFile(page, {
    name: 'pretend.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<html><script>window.injected=true</script></html>'),
  })
  await expect(
    page.getByRole('button', { name: 'Preview file', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Download file' }),
  ).toBeEnabled()
  expect(await page.evaluate(() => 'injected' in window)).toBe(false)
  await receiveFile(page, {
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nbroken'),
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'File preview' }),
  ).toContainText('This PDF could not be previewed.')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file' }).click()
  expect(await readFile((await (await downloading).path())!)).toEqual(
    Buffer.from('%PDF-1.4\nbroken'),
  )
})

test('a failed PDF viewer load leaves the file available to download', async ({
  page,
}) => {
  await page.route('**/PdfPreview*', (route) => route.abort('failed'))
  const buffer = samplePdf()
  await receiveFile(page, {
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer,
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'File preview' }),
  ).toContainText('The PDF viewer could not load.')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file' }).click()
  expect(await readFile((await (await downloading).path())!)).toEqual(buffer)
})

test('Word documents preview readable text, keep downloads intact, and clear at expiry', async ({
  page,
}, info) => {
  await page.clock.install()
  const external: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('example.test/word-image'))
      external.push(request.url())
  })
  const buffer = Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/document.xml': strToU8(
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Japanese grammar notes 日本語</w:t></w:r></w:p><w:p><w:r><w:t>မင်္ဂလာပါ</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;window.injected=true&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>',
      ),
      'word/_rels/document.xml.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="https://example.test/word-image"/></Relationships>',
      ),
    }),
  )
  await receiveFile(page, {
    name: 'grammar-notes.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  const preview = page.getByRole('region', { name: 'File preview' })
  const text = preview.getByLabel('Word document text: grammar-notes.docx', {
    exact: true,
  })
  await expect(text).toContainText('Japanese grammar notes 日本語')
  await expect(text).toContainText('မင်္ဂလာပါ')
  await expect(text).toContainText('<script>window.injected=true</script>')
  expect(await page.evaluate(() => 'injected' in window)).toBe(false)
  expect(external).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .locator('.file-received')
    .screenshot({ path: `artifacts/word-preview-${info.project.name}.png` })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download file' }).click()
  expect(await readFile((await (await downloading).path())!)).toEqual(buffer)
  await page.clock.fastForward(600_000)
  await expect(preview).toHaveCount(0)
})
