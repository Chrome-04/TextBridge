export const MAX_NOTE_TEXT = 50_000
export const MAX_NOTE_DOCUMENT_BYTES = 200_000
export const MAX_NOTE_TITLE = 120

export type NoteNode = {
  type:
    | 'doc'
    | 'paragraph'
    | 'text'
    | 'hardBreak'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
  text?: string
  marks?: { type: 'bold' | 'italic' | 'underline' }[]
  content?: NoteNode[]
}

export function documentFromText(text: string): NoteNode {
  if (text.length > MAX_NOTE_TEXT)
    throw new Error(
      'Notes support up to 50,000 characters. Shorten this text before saving; nothing has been removed.',
    )
  return {
    type: 'doc',
    content: text.split(/\r\n|\r|\n/).map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

export function validateDocument(value: unknown): NoteNode {
  let nodes = 0
  const visit = (node: unknown, depth: number): NoteNode => {
    if (
      !node ||
      typeof node !== 'object' ||
      Array.isArray(node) ||
      depth > 12 ||
      ++nodes > 20_000
    )
      throw new Error(
        'This note has unsupported formatting. Its saved copy has not been changed.',
      )
    const n = node as Record<string, unknown>
    const allowed = [
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'bulletList',
      'orderedList',
      'listItem',
    ]
    if (
      !allowed.includes(String(n.type)) ||
      Object.keys(n).some(
        (key) => !['type', 'text', 'content', 'marks', 'attrs'].includes(key),
      )
    )
      throw new Error('This note has unsupported formatting.')
    if (depth === 0 ? n.type !== 'doc' : n.type === 'doc')
      throw new Error('Invalid note document.')
    if (
      n.attrs !== undefined &&
      (n.type !== 'orderedList' ||
        !n.attrs ||
        typeof n.attrs !== 'object' ||
        Object.entries(n.attrs).some(([key, val]) =>
          key === 'type'
            ? val !== null && val !== '1'
            : key !== 'start' || val !== 1,
        ))
    )
      throw new Error('This note has unsupported formatting.')
    const result = { type: n.type } as NoteNode
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text || n.content !== undefined)
        throw new Error('Invalid note text.')
      result.text = n.text
    } else if (n.text !== undefined) throw new Error('Invalid note text.')
    if (n.marks !== undefined) {
      if (
        n.type !== 'text' ||
        !Array.isArray(n.marks) ||
        n.marks.length > 3 ||
        n.marks.some(
          (mark) =>
            !mark ||
            typeof mark !== 'object' ||
            !['bold', 'italic', 'underline'].includes(mark.type) ||
            Object.keys(mark).some((key) => key !== 'type'),
        )
      )
        throw new Error('Unsupported note formatting.')
      result.marks = n.marks
    }
    if (n.content !== undefined) {
      if (
        !Array.isArray(n.content) ||
        ['text', 'hardBreak'].includes(String(n.type))
      )
        throw new Error('Invalid note content.')
      result.content = n.content.map((child) => visit(child, depth + 1))
      const children = result.content.map((child) => child.type)
      const permitted =
        n.type === 'paragraph'
          ? ['text', 'hardBreak']
          : ['bulletList', 'orderedList'].includes(String(n.type))
            ? ['listItem']
            : ['paragraph', 'bulletList', 'orderedList']
      if (children.some((type) => !permitted.includes(type)))
        throw new Error('Invalid note structure.')
    }
    return result
  }
  const doc = visit(value, 0)
  const encoded = JSON.stringify(doc)
  if (
    new TextEncoder().encode(encoded).length > MAX_NOTE_DOCUMENT_BYTES ||
    plainText(doc).length > MAX_NOTE_TEXT
  )
    throw new Error(
      'This note is too large. Use up to 50,000 characters and simpler formatting. Your edits are still here.',
    )
  return doc
}

export function plainText(node: NoteNode): string {
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  const content = node.content || []
  return content.map(plainText).join(node.type === 'paragraph' ? '' : '\n')
}

export function notePayload(title: string, document: unknown) {
  const safe = validateDocument(document)
  const text = plainText(safe)
  if (!text.trim()) throw new Error('Add some text before saving your note.')
  if (title.length > MAX_NOTE_TITLE)
    throw new Error('Use a title of up to 120 characters.')
  return {
    title: title.trim() || 'Untitled note',
    document: JSON.stringify(safe),
    text,
    formatVersion: 1,
  }
}

export function titleFromText(text: string) {
  return (
    text.trim().split(/\r?\n/)[0].slice(0, MAX_NOTE_TITLE) || 'Untitled note'
  )
}
