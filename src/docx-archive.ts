import { unzipSync } from 'fflate'

// Check the archive directory without inflating entries before starting a reader.
export function isPreviewableDocx(data: Uint8Array): boolean {
  let files = 0
  let expandedSize = 0
  let document = false
  let contentTypes = false
  try {
    unzipSync(data, {
      filter: (file) => {
        files++
        expandedSize += file.originalSize
        if (files > 4096 || expandedSize > 50_000_000)
          throw new Error('Document exceeds preview limits.')
        if (file.name === 'word/document.xml') {
          if (file.originalSize > 8_000_000)
            throw new Error('Document exceeds preview limits.')
          document = true
        }
        if (file.name === '[Content_Types].xml') contentTypes = true
        return false
      },
    })
    return document && contentTypes
  } catch {
    return false
  }
}
