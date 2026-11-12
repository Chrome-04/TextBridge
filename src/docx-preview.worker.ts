import mammoth from 'mammoth'
import { isPreviewableDocx } from './docx-archive'

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null
  postMessage: (message: { text?: string; error?: boolean }) => void
}

worker.onmessage = async ({ data }) => {
  try {
    if (!isPreviewableDocx(new Uint8Array(data)))
      throw new Error('Invalid document.')
    const result = await mammoth.extractRawText({ arrayBuffer: data })
    if (result.value.length > 1_000_000)
      throw new Error('Text exceeds preview limits.')
    worker.postMessage({ text: result.value })
  } catch {
    worker.postMessage({ error: true })
  }
}
