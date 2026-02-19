import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'

let _auth: Auth | null = null

export function getAdminAuth(): Auth {
  if (_auth) return _auth

  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase Admin environment variables')
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    })
  }

  _auth = getAuth()
  return _auth
}
