import { useEffect, useState, type ComponentType } from 'react'
import type { PreviewKind } from './file-preview-type'

function ImagePreview({
  blob,
  kind,
  name,
}: {
  blob: Blob
  kind: Exclude<PreviewKind, 'pdf' | 'docx'>
  name: string
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    const source = URL.createObjectURL(new Blob([blob], { type: kind }))
    setUrl(source)
    setError(false)
    return () => URL.revokeObjectURL(source)
  }, [blob, kind])
  if (error)
    return (
      <p role="status">
        This image could not be previewed. You can still download the file.
      </p>
    )
  return url ? (
    <img
      className="received-image-preview"
      src={url}
      alt={name}
      onError={() => setError(true)}
    />
  ) : (
    <p role="status">Opening image…</p>
  )
}

export default function FilePreview({
  blob,
  kind,
  name,
}: {
  blob: Blob
  kind: PreviewKind
  name: string
}) {
  const [Document, setDocument] = useState<ComponentType<{
    blob: Blob
    name: string
  }> | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (kind !== 'pdf' && kind !== 'docx') return
    let cancelled = false
    const load =
      kind === 'pdf' ? import('./PdfPreview') : import('./DocxPreview')
    void load
      .then((module) => {
        if (!cancelled) setDocument(() => module.default)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [kind])
  return (
    <section className="file-preview" aria-label="File preview">
      {kind === 'pdf' || kind === 'docx' ? (
        error ? (
          <p role="status">
            The {kind === 'pdf' ? 'PDF' : 'Word'} viewer could not load.
            Download the file, or refresh this page and receive it again.
          </p>
        ) : Document ? (
          <Document blob={blob} name={name} />
        ) : (
          <p role="status">
            Opening {kind === 'pdf' ? 'PDF' : 'Word document'}…
          </p>
        )
      ) : (
        <ImagePreview blob={blob} kind={kind} name={name} />
      )}
    </section>
  )
}
