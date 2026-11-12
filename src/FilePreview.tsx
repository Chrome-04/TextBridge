import { useEffect, useState, type ComponentType } from 'react'
import type { PreviewKind } from './file-preview-type'

function ImagePreview({
  blob,
  kind,
  name,
}: {
  blob: Blob
  kind: Exclude<PreviewKind, 'pdf'>
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
  const [Pdf, setPdf] = useState<ComponentType<{
    blob: Blob
    name: string
  }> | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (kind !== 'pdf') return
    let cancelled = false
    void import('./PdfPreview')
      .then((module) => {
        if (!cancelled) setPdf(() => module.default)
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
      {kind === 'pdf' ? (
        error ? (
          <p role="status">
            The PDF viewer could not load. Download the file, or refresh this
            page and receive it again.
          </p>
        ) : Pdf ? (
          <Pdf blob={blob} name={name} />
        ) : (
          <p role="status">Opening PDF…</p>
        )
      ) : (
        <ImagePreview blob={blob} kind={kind} name={name} />
      )}
    </section>
  )
}
