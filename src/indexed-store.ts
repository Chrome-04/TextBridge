import { createDemoStore, NOTE_PREFIX, ShareError } from './demo-store'

// IndexedDB supports larger notes than localStorage. One read/write transaction
// serializes local operations across tabs. Only changed records are written.
export function withDemoStore<T>(
  operation: (store: ReturnType<typeof createDemoStore>) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('textbridge-demo', 2)
    let openingFailed = false
    const timeout = setTimeout(() => {
      openingFailed = true
      reject(new ShareError('storage'))
    }, 10_000)
    const fail = () => {
      openingFailed = true
      clearTimeout(timeout)
      reject(new ShareError('storage'))
    }
    opening.onupgradeneeded = () => {
      const db = opening.result
      if (!db.objectStoreNames.contains('records'))
        db.createObjectStore('records')
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
    }
    opening.onerror = fail
    opening.onblocked = fail
    opening.onsuccess = () => {
      clearTimeout(timeout)
      const db = opening.result
      if (openingFailed) {
        db.close()
        return
      }
      const transaction = db.transaction(['records', 'files'], 'readwrite')
      const records = transaction.objectStore('records')
      const files = transaction.objectStore('files')
      const blobs = new Map<string, Blob>()
      const dirtyBlobs = new Set<string>()
      let loaded = 0
      const values = new Map<string, string>()
      const dirty = new Set<string>()
      let result: T
      let operationError: unknown
      const migrated: string[] = []
      const storage: Storage = {
        get length() {
          return values.size
        },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value)
          dirty.add(key)
        },
        removeItem: (key) => {
          values.delete(key)
          dirty.add(key)
        },
        clear: () => {
          for (const key of values.keys()) dirty.add(key)
          values.clear()
        },
      }
      transaction.oncomplete = () => {
        db.close()
        // Remove old browser copies only after the new records are committed.
        try {
          for (const key of migrated) localStorage.removeItem(key)
        } catch {
          /* Optional migration cleanup. */
        }
        if (operationError) reject(operationError)
        else resolve(result)
      }
      transaction.onabort = () => {
        db.close()
        fail()
      }
      const cursor = records.openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (entry) {
          values.set(String(entry.key), entry.value)
          entry.continue()
          return
        }
        applyOperation()
      }
      const fileCursor = files.openCursor()
      fileCursor.onsuccess = () => {
        const entry = fileCursor.result
        if (entry) {
          blobs.set(String(entry.key), entry.value)
          entry.continue()
          return
        }
        applyOperation()
      }
      function applyOperation() {
        if (++loaded < 2) return
        if (!values.has('migration:v1')) {
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (
                key?.startsWith(NOTE_PREFIX) ||
                key?.startsWith('textbridge:demo:v1:rate:')
              ) {
                const value = localStorage.getItem(key)
                if (value !== null && !values.has(key)) {
                  storage.setItem(key, value)
                  migrated.push(key)
                }
              }
            }
          } catch {
            /* New notes can work even if localStorage is blocked. */
          }
          storage.setItem('migration:v1', 'done')
        }
        try {
          result = operation(
            createDemoStore(storage, Date.now, undefined, {
              get: (code) => blobs.get(code),
              set: (code, blob) => {
                blobs.set(code, blob)
                dirtyBlobs.add(code)
              },
              delete: (code) => {
                blobs.delete(code)
                dirtyBlobs.add(code)
              },
            }),
          )
        } catch (error) {
          operationError = error
        }
        if (operationError && !(operationError instanceof ShareError)) {
          transaction.abort()
          return
        }
        for (const code of dirtyBlobs) {
          const blob = blobs.get(code)
          if (blob) files.put(blob, code)
          else files.delete(code)
        }
        // Commit failed-lookup counters too, so guessing limits still apply.
        for (const key of dirty) {
          const value = values.get(key)
          if (value === undefined) records.delete(key)
          else records.put(value, key)
        }
      }
    }
  })
}
