// The hand-off between the service worker and the app for a shared image.
// Android's share sheet POSTs the file to /share; the worker parks it here
// under an id and sends the browser to /add?shared=<id>, where the add screen
// collects it. Plain `idb` with its own database so it works in both worlds
// and never interferes with the offline queue's schema.
import { openDB, type DBSchema } from 'idb'

export const SHARE_DB_NAME = 'xpensiv-share'
export const SHARE_PARAM = 'shared'

export type SharedFile = { id: string; blob: Blob; name: string; type: string; created_at: number }

interface ShareDB extends DBSchema {
  files: { key: string; value: SharedFile }
}

function db() {
  return openDB<ShareDB>(SHARE_DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('files', { keyPath: 'id' })
    },
  })
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Parks a shared image and returns the id the add screen is opened with. */
export async function storeSharedFile(file: Blob, name = 'screenshot'): Promise<string> {
  const id = newId()
  const d = await db()
  await d.put('files', {
    id,
    blob: file,
    name: file instanceof File ? file.name || name : name,
    type: file.type || 'image/png',
    created_at: Date.now(),
  })
  // Anything older than an hour was never collected; forget it.
  const all = await d.getAll('files')
  for (const f of all)
    if (Date.now() - f.created_at > 60 * 60 * 1000 && f.id !== id) await d.delete('files', f.id)
  d.close()
  return id
}

/** Collects (and forgets) a parked image. */
export async function takeSharedFile(id: string): Promise<File | null> {
  const d = await db()
  const rec = await d.get('files', id)
  if (rec) await d.delete('files', id)
  d.close()
  if (!rec) return null
  return new File([rec.blob], rec.name, { type: rec.type })
}
