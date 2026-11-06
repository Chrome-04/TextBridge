import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { createShareService } from './service.js'
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-textbridge'
)
  throw new Error('Cleanup is restricted to the local demo emulators.')
const app = initializeApp({
  projectId: 'demo-textbridge',
  storageBucket: 'demo-textbridge.appspot.com',
})
const counts = await createShareService({
  db: getFirestore(app),
  bucket: getStorage(app).bucket(),
  salt: 'local-emulator-only',
}).cleanup()
console.log('Cleanup counts:', counts)
