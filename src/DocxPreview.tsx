import { useEffect, useState } from 'react'

export default function DocxPreview({
  blob,
  name,
}: {
  blob: Blob
  name: string
}) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    let reader: Worker | undefined
    const fail = () => {
      if (cancelled) return
      setError(true)
      cancelled = true
      reader?.terminate()
    }
    const timeout = window.setTimeout(fail, 15_000)
    void (async () => {
      const buffer = await blob.arrayBuffer()
      if (cancelled) return
      reader = new Worker(
        new URL('./docx-preview.worker.ts', import.meta.url),
        { type: 'module' },
      )
      reader.onmessage = (
        event: MessageEvent<{ text?: string; error?: boolean }>,
      ) => {
        window.clearTimeout(timeout)
        if (cancelled) return
        if (event.data.error || typeof event.data.text !== 'string') fail()
        else setText(event.data.text)
        reader?.terminate()
      }
      reader.onerror = (event) => {
        event.preventDefault()
        window.clearTimeout(timeout)
        fail()
      }
      reader.postMessage(buffer, [buffer])
    })().catch(() => {
      window.clearTimeout(timeout)
      fail()
    })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      reader?.terminate()
    }
  }, [blob])
  if (error)
    return (
      <p role="status">
        This Word document could not be previewed. You can still download the
        file.
      </p>
    )
  if (text === null) return <p role="status">Opening Word document…</p>
  return (
    <>
      <p className="document-preview-caption">
        Word text preview · Download to open the original formatting.
      </p>
      {text.trim() ? (
        <pre
          className="word-text-preview"
          tabIndex={0}
          aria-label={`Word document text: ${name}`}
        >
          {text}
        </pre>
      ) : (
        <p role="status">
          This document has no readable text. Download it to view its images or
          other content.
        </p>
      )}
    </>
  )
}
