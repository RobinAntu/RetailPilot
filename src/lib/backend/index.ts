import { LocalBackend } from './LocalBackend'
import { FirestoreBackend, isFirebaseConfigured } from './FirestoreBackend'
import type { Backend } from './types'

let instance: Backend | null = null

export function getBackend(): Backend {
  if (instance) return instance
  instance = isFirebaseConfigured() ? new FirestoreBackend() : new LocalBackend()
  return instance
}

export type { Backend, AuthSession, SignupInput, CreateSaleInput, ReceivedOrderInput, RestoreRequest, BackupBundle } from './types'