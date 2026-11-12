import { useEffect, useRef, useState } from 'react'
import {
  deleteSavedFile,
  downloadSavedFile,
  FILE_STORAGE_BYTES,
  loadSavedFiles,
  uploadSavedFile,
  type FileLibrary,
  type StoredFile,
} from './saved-files-client'
import { RefreshIcon } from './NoteIcons'

const sizeLabel = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(2)} MB`
    : bytes >= 1000
      ? `${(bytes / 1000).toFixed(1)} KB`
      : `${bytes} bytes`
export default function SavedFiles({ uid }: { uid: string }) {
  const [library, setLibrary] = useState<FileLibrary | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const lifetime = useRef(new AbortController())
  const version = useRef(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    void refresh()
    return () => {
      controller.abort()
      version.current++
    }
  }, [uid])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [busy])
  async function refresh(more = false) {
    const current = ++version.current
    setLoading(true)
    setError('')
    try {
      const result = await loadSavedFiles(
        uid,
        more ? (library?.files.length ?? 0) : 0,
        lifetime.current.signal,
      )
      if (version.current === current && !lifetime.current.signal.aborted)
        setLibrary((old) => ({
          ...result,
          files: more
            ? [
                ...new Map(
                  [...(old?.files ?? []), ...result.files].map((file) => [
                    file.id,
                    file,
                  ]),
                ).values(),
              ]
            : result.files,
        }))
    } catch (failure) {
      if (!lifetime.current.signal.aborted && version.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load your files.',
        )
    } finally {
      if (!lifetime.current.signal.aborted && version.current === current)
        setLoading(false)
    }
  }
  async function act(operation: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
    } catch (failure) {
      if (!lifetime.current.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'This action could not be completed. Refresh your files before trying again.',
        )
    } finally {
      lock.current = false
      if (!lifetime.current.signal.aborted) setBusy(false)
    }
  }
  async function upload(file: File) {
    if (!library) return
    if (file.size > FILE_STORAGE_BYTES - library.usedBytes) {
      setError(
        'This file exceeds your remaining storage. All saved files together must fit within 20 MB.',
      )
      return
    }
    await act(async () => {
      const id = crypto.randomUUID()
      setNotice('Uploading your file…')
      try {
        await uploadSavedFile(uid, file, id, lifetime.current.signal)
      } catch (failure) {
        setNotice(
          'The upload was not confirmed. Refresh files before retrying; it may have finished. Unfinished uploads release their space after cleanup.',
        )
        throw failure
      }
      await refresh()
      if (!lifetime.current.signal.aborted)
        setNotice('File saved privately to your account.')
    })
  }
  async function download(file: StoredFile) {
    await act(async () => {
      const blob = await downloadSavedFile(uid, file, lifetime.current.signal)
      if (lifetime.current.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Download started.')
    })
  }
  const used = library?.usedBytes ?? 0
  return (
    <section className="saved-files" aria-label="Private saved files">
      <div className="file-storage-summary">
        <div>
          <h2>Your files</h2>
          <p className="size-hint">
            Keep your CV and other important documents here.
          </p>
        </div>
        <div className="notes-actions">
          <button
            className="notes-refresh"
            type="button"
            aria-label="Refresh files"
            title="Refresh files"
            disabled={busy || loading}
            onClick={() => void refresh()}
          >
            <RefreshIcon />
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || loading || !library || used >= FILE_STORAGE_BYTES}
            onClick={() => input.current?.click()}
          >
            Upload file
          </button>
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Choose a file to save"
            disabled={busy || loading || !library}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
        </div>
      </div>
      <div className="file-storage-meter">
        <label htmlFor="saved-file-usage">
          {library
            ? `${sizeLabel(used)} of 20 MB used`
            : '20 MB total storage per account'}
        </label>
        <progress id="saved-file-usage" max={FILE_STORAGE_BYTES} value={used} />
        <p className="size-hint">
          All your saved files combined share this 20 MB. Files stay until you
          delete them; deleting frees space.
        </p>
      </div>
      {notice && (
        <p className="notes-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="size-hint">
          Loading files…
        </p>
      )}
      {library && !library.count && !loading && (
        <p className="notes-empty">
          No saved files yet. Upload a CV, PDF, image, or another document.
        </p>
      )}
      <ul className="saved-file-list" aria-busy={busy || loading}>
        {library?.files.map((file) => (
          <li key={file.id}>
            <div className="saved-file-details">
              <strong>{file.name}</strong>
              <span className="size-hint">
                {sizeLabel(file.size)} ·{' '}
                {new Date(file.created_at).toLocaleDateString()}
                {file.state === 'pending'
                  ? ' · Upload pending'
                  : file.state === 'deleting'
                    ? ' · Deletion pending'
                    : ''}
              </span>
            </div>
            <div className="notes-actions">
              <button
                className="secondary-button"
                type="button"
                aria-label={`Download ${file.name}`}
                disabled={busy || file.state !== 'ready'}
                onClick={() => void download(file)}
              >
                Download
              </button>
              <button
                className="text-button danger-button"
                type="button"
                aria-label={`Delete ${file.name}`}
                disabled={busy || file.state === 'pending'}
                onClick={() =>
                  setDeleting(deleting === file.id ? null : file.id)
                }
              >
                Delete
              </button>
            </div>
            {deleting === file.id && (
              <div
                className="notes-delete-confirm"
                role="group"
                aria-label={`Confirm deletion of ${file.name}`}
              >
                <p>
                  Permanently delete {file.name} and free {sizeLabel(file.size)}
                  ?
                </p>
                <div className="notes-actions">
                  <button
                    className="secondary-button danger-button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await deleteSavedFile(
                          uid,
                          file.id,
                          lifetime.current.signal,
                        )
                        setDeleting(null)
                        await refresh()
                        setNotice('File deleted. Storage space freed.')
                      })
                    }
                  >
                    Yes, delete file
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {library && library.files.length < library.count && (
        <button
          className="secondary-button"
          disabled={busy || loading}
          onClick={() => void refresh(true)}
        >
          Load more files
        </button>
      )}
      {!!library?.files.some((file) => file.state === 'pending') && (
        <p className="size-hint">
          Pending uploads count toward storage. Unfinished uploads are cleared
          by scheduled cleanup after 15 minutes.
        </p>
      )}
      <p className="size-hint">
        Only your signed-in account can access these files. Log out when you
        finish on a shared computer.
      </p>
    </section>
  )
}
