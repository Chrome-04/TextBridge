import { useEffect, useRef, useState } from 'react'
import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

function PageArrow({
  forward = false,
  edge = false,
}: {
  forward?: boolean
  edge?: boolean
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform={forward ? 'translate(24 0) scale(-1 1)' : undefined}>
        <path d="m15 6-6 6 6 6" />
        {edge && <path d="M5 5v14" />}
      </g>
    </svg>
  )
}

// Vite publishes these bundled resources under its own asset URLs.
const assets = import.meta.glob<string>(
  '/node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/*',
  { eager: true, query: '?url', import: 'default' },
)
const assetDirectories = {
  cMapUrl: 'cmaps',
  standardFontDataUrl: 'standard_fonts',
  wasmUrl: 'wasm',
}
class PdfAssets {
  async fetch({
    kind,
    filename,
  }: {
    kind: keyof typeof assetDirectories
    filename: string
  }) {
    const url =
      assets[`/node_modules/pdfjs-dist/${assetDirectories[kind]}/${filename}`]
    if (!url) throw new Error('Unsupported PDF resource.')
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error('PDF resource unavailable.')
    return new Uint8Array(await response.arrayBuffer())
  }
}

function PdfPage({
  pdf,
  pageNumber,
  name,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  name: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [error, setError] = useState(false)
  const [rendering, setRendering] = useState(true)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    )
    observer.observe(container.current!)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!width) return
    let cancelled = false
    let task: RenderTask | undefined
    const canvas = document.createElement('canvas')
    canvas.setAttribute('role', 'img')
    canvas.setAttribute(
      'aria-label',
      `PDF page ${pageNumber} of ${pdf.numPages}: ${name}`,
    )
    setRendering(true)
    setError(false)
    container.current!.replaceChildren()
    void (async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const original = page.getViewport({ scale: 1 })
      const scale = Math.min(
        width / original.width,
        1.5,
        4096 / original.height,
      )
      const viewport = page.getViewport({ scale })
      const pixels = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(4_000_000 / (viewport.width * viewport.height)),
      )
      canvas.width = Math.ceil(viewport.width * pixels)
      canvas.height = Math.ceil(viewport.height * pixels)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      task = page.render({
        canvas,
        viewport,
        transform: pixels === 1 ? undefined : [pixels, 0, 0, pixels, 0, 0],
        annotationMode: AnnotationMode.DISABLE,
      })
      await task.promise
      if (cancelled) return
      container.current!.replaceChildren(canvas)
      setRendering(false)
    })().catch(() => {
      if (!cancelled) {
        setError(true)
        setRendering(false)
      }
    })
    return () => {
      cancelled = true
      task?.cancel()
      canvas.width = 0
      canvas.height = 0
    }
  }, [pdf, pageNumber, name, width])
  return (
    <>
      {rendering && <p role="status">Rendering page {pageNumber}…</p>}
      {error && (
        <p role="status">
          This page could not be previewed. You can still download the PDF.
        </p>
      )}
      <div className="pdf-page" ref={container} aria-busy={rendering} />
    </>
  )
}

export default function PdfPreview({
  blob,
  name,
}: {
  blob: Blob
  name: string
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  function goToPage(page: number) {
    setPageNumber(page)
    setPageInput(String(page))
  }
  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | undefined
    void (async () => {
      const data = new Uint8Array(await blob.arrayBuffer())
      if (cancelled) return
      task = getDocument({
        data,
        BinaryDataFactory: PdfAssets,
        useWorkerFetch: false,
        enableXfa: false,
        maxImageSize: 16_000_000,
        canvasMaxAreaInBytes: 16_000_000,
        verbosity: 0,
      })
      const document = await task.promise
      if (!cancelled) setPdf(document)
    })().catch((failure: unknown) => {
      if (!cancelled)
        setError(
          (failure as { name?: string })?.name === 'PasswordException'
            ? 'This PDF is password-protected. Download it to open it with your PDF reader.'
            : 'This PDF could not be previewed. You can still download the file.',
        )
    })
    return () => {
      cancelled = true
      void task?.destroy().catch(() => {})
    }
  }, [blob])
  if (error) return <p role="status">{error}</p>
  if (!pdf) return <p role="status">Opening PDF…</p>
  return (
    <>
      <div className="pdf-controls" role="group" aria-label="PDF pages">
        <button
          className="secondary-button"
          type="button"
          aria-label="First page"
          title="First page"
          disabled={pageNumber === 1}
          onClick={() => goToPage(1)}
        >
          <PageArrow edge />
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-label="Previous page"
          title="Previous page"
          disabled={pageNumber === 1}
          onClick={() => goToPage(pageNumber - 1)}
        >
          <PageArrow />
        </button>
        <form
          className="pdf-page-jump"
          onSubmit={(event) => {
            event.preventDefault()
            const target = Number(pageInput)
            if (
              Number.isInteger(target) &&
              target >= 1 &&
              target <= pdf.numPages
            )
              goToPage(target)
          }}
        >
          <label>
            Page
            <input
              type="number"
              name="page"
              aria-label="Page number"
              min={1}
              max={pdf.numPages}
              step={1}
              required
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
            />
          </label>
          <span>of {pdf.numPages}</span>
          <button
            className="secondary-button"
            type="submit"
            aria-label="Go to page"
            title="Go to page"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
          </button>
        </form>
        <span className="sr-only" role="status">
          Page {pageNumber} of {pdf.numPages}
        </span>
        <button
          className="secondary-button"
          type="button"
          aria-label="Next page"
          title="Next page"
          disabled={pageNumber === pdf.numPages}
          onClick={() => goToPage(pageNumber + 1)}
        >
          <PageArrow forward />
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-label="Last page"
          title="Last page"
          disabled={pageNumber === pdf.numPages}
          onClick={() => goToPage(pdf.numPages)}
        >
          <PageArrow forward edge />
        </button>
      </div>
      <PdfPage pdf={pdf} pageNumber={pageNumber} name={name} />
    </>
  )
}
