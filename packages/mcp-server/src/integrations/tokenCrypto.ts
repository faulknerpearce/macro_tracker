/**
 * AES-256-GCM encryption for third-party OAuth tokens stored in Postgres.
 * The key is derived from the INTEGRATION_ENCRYPTION_KEY secret, so a leaked row
 * (or the owner reading their own row through RLS) never exposes a usable token.
 * Web Crypto only: runs in Cloudflare Workers and Node 20+.
 */

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must be at least 32 characters')
  }
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Returns "v1.<iv>.<ciphertext>" (base64url). */
export async function encryptToken(secret: string, plaintext: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`
}

export async function decryptToken(secret: string, payload: string): Promise<string> {
  const [version, ivPart, ctPart] = payload.split('.')
  if (version !== 'v1' || !ivPart || !ctPart) throw new Error('Unrecognized token format')
  const key = await deriveKey(secret)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(ivPart) },
    key,
    fromB64url(ctPart),
  )
  return new TextDecoder().decode(pt)
}
