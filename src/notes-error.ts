import { notesAreLocal } from './firebase-session'

export function notesError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code?.endsWith('permission-denied'))
    return 'Notes access was denied. Log in again. If this continues, the owner needs to deploy the Firestore notes rules.'
  if (code?.endsWith('unavailable') || code?.endsWith('deadline-exceeded'))
    return notesAreLocal
      ? 'Notes emulators are unavailable. Start npm run notes:emulators and try again. Your edits are still here.'
      : 'Could not connect to your notes. Check your connection and try again. Your edits are still here.'
  if (code?.endsWith('resource-exhausted'))
    return 'The notes service has reached its quota. Try again later. Your edits are still here.'
  return error instanceof Error && !code
    ? error.message
    : 'Could not save this change. Your edits are still here. Please try again.'
}
