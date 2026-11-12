import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filePreviewKind } from '../src/file-preview-type.ts'
import { isPreviewableDocx } from '../src/docx-archive.ts'
import { strToU8, zipSync } from 'fflate'

test('file previews use signatures rather than untrusted MIME types or names', async () => {
  for (const [bytes, expected] of [
    ['%PDF-1.7\n', 'pdf'],
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
    [new Uint8Array([255, 216, 255, 224]), 'image/jpeg'],
    ['GIF89a', 'image/gif'],
    ['GIF87a', 'image/gif'],
    ['RIFF1234WEBP', 'image/webp'],
  ] as const)
    assert.equal(
      await filePreviewKind(
        new Blob([bytes], { type: 'application/octet-stream' }),
      ),
      expected,
    )
  for (const text of [
    '',
    '<svg onload="alert(1)">',
    '<script>alert(1)</script>',
    'PK\x03\x04',
    'ordinary text',
  ])
    assert.equal(
      await filePreviewKind(new Blob([text], { type: 'application/pdf' })),
      null,
    )
})

test('Word preview recognises the package and bounds archive expansion', async () => {
  const data = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8('<document/>'),
  })
  assert.equal(isPreviewableDocx(data), true)
  assert.equal(await filePreviewKind(new Blob([data])), 'docx')
  const otherZip = zipSync({ 'example.txt': strToU8('Sample') })
  assert.equal(await filePreviewKind(new Blob([otherZip])), null)
  assert.equal(isPreviewableDocx(new Uint8Array([80, 75, 3, 4])), false)
  const excessive = data.slice()
  const view = new DataView(excessive.buffer)
  for (let i = 0; i < excessive.length - 28; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 60_000_000, true)
      break
    }
  }
  assert.equal(isPreviewableDocx(excessive), false)
})
