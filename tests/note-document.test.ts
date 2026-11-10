import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  documentFromText,
  notePayload,
  plainText,
  validateDocument,
} from '../src/note-document.ts'

test('note import preserves code indentation, emoji, Myanmar, empty lines and literal HTML', () => {
  const source = '  const hello = "မင်္ဂလာပါ 😀"\n\n<script>alert(1)</script>\n'
  const result = notePayload('Code', documentFromText(source))
  assert.equal(result.text, source)
  assert.equal(plainText(validateDocument(JSON.parse(result.document))), source)
})
test('rich notes produce a plain text snapshot without modifying formatting', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Keep this',
            marks: [
              { type: 'bold' },
              { type: 'italic' },
              { type: 'underline' },
            ],
          },
        ],
      },
    ],
  }
  const result = notePayload('Thought', doc)
  assert.equal(result.text, 'Keep this')
  assert.match(result.document, /"bold"/)
  assert.deepEqual(JSON.parse(result.document), doc)
})
test('unsupported HTML, links, images and active marks cannot become saved editor nodes', () => {
  for (const node of [
    { type: 'image', attrs: { src: 'javascript:alert(1)' } },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
    { type: 'paragraph', attrs: { onClick: 'alert(1)' } },
    { type: 'doc', content: [] },
  ])
    assert.throws(() => validateDocument({ type: 'doc', content: [node] }))
})
test('oversize and empty notes fail explicitly without silently truncating', () => {
  assert.throws(() => documentFromText('x'.repeat(50_001)), /50,000/)
  assert.equal(
    notePayload('', documentFromText('x'.repeat(50_000))).text.length,
    50_000,
  )
  assert.throws(
    () => notePayload('Empty', documentFromText('   \n')),
    /Add some text/,
  )
  assert.throws(
    () => notePayload('x'.repeat(121), documentFromText('Valid')),
    /120/,
  )
  let nested: unknown = { type: 'paragraph' }
  for (let depth = 0; depth < 20; depth++)
    nested = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [nested] }],
    }
  assert.throws(() => validateDocument({ type: 'doc', content: [nested] }))
})
