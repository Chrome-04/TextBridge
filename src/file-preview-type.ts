export type PreviewKind =
  'pdf' | 'docx' | 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

// Uploads arrive as generic bytes. Decide from their contents, not their name.
export async function filePreviewKind(blob: Blob): Promise<PreviewKind | null> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const text = new TextDecoder('ascii').decode(header)
  if (text.startsWith('%PDF-')) return 'pdf'
  if (
    header.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => header[index] === byte,
    )
  )
    return 'image/png'
  if (header[0] === 255 && header[1] === 216 && header[2] === 255)
    return 'image/jpeg'
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
    return 'image/webp'
  if (
    header[0] === 80 &&
    header[1] === 75 &&
    header[2] === 3 &&
    header[3] === 4
  ) {
    const { isPreviewableDocx } = await import('./docx-archive.ts')
    if (isPreviewableDocx(new Uint8Array(await blob.arrayBuffer())))
      return 'docx'
  }
  return null
}
