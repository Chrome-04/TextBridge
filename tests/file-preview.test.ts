import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filePreviewKind } from '../src/file-preview-type.ts'

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
