import { createDemoStore, NOTE_PREFIX, ShareError } from './demo-store'

// IndexedDB supports larger notes than localStorage. One read/write transaction
// serializes local operations across tabs. Only changed records are written.
export function withDemoStore<T>(
  operation: (store: ReturnType<typeof createDemoStore>) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('textbridge-demo', 1)
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
    opening.onupgradeneeded = () => opening.result.createObjectStore('records')
    opening.onerror = fail
    opening.onblocked = fail
    opening.onsuccess = () => {
      clearTimeout(timeout)
      const db = opening.result
      if (openingFailed) {
        db.close()
        return
      }
      const transaction = db.transaction('records', 'readwrite')
      const records = transaction.objectStore('records')
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
          result = operation(createDemoStore(storage))
        } catch (error) {
          operationError = error
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
