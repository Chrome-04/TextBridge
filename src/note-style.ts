export const NOTE_COLOURS = [
  { value: 'default', label: 'Default' },
  { value: 'sage', label: 'Sage' },
  { value: 'sand', label: 'Sand' },
  { value: 'peach', label: 'Peach' },
  { value: 'sky', label: 'Sky' },
  { value: 'lavender', label: 'Lavender' },
] as const
export type NoteColour = (typeof NOTE_COLOURS)[number]['value']
export type NoteStyle = { colour: NoteColour; pinned: boolean }
export const DEFAULT_NOTE_STYLE: NoteStyle = {
  colour: 'default',
  pinned: false,
}

export function noteStyle(value: {
  colour?: unknown
  pinned?: unknown
}): NoteStyle {
  const colour = value.colour ?? 'default'
  const pinned = value.pinned ?? false
  if (
    !NOTE_COLOURS.some((item) => item.value === colour) ||
    typeof pinned !== 'boolean'
  )
    throw new Error(
      'This note has unsupported appearance settings. Its saved copy has not been changed.',
    )
  return { colour: colour as NoteColour, pinned }
}
