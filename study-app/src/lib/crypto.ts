// End-to-end encryption for everything the app stores.
//
// - A random 256-bit AES-GCM "data key" encrypts all records and files.
// - The data key itself is stored only in wrapped (encrypted) form, protected by
//   a key derived from your password with PBKDF2-SHA256 (600k iterations).
// - Your password is never stored anywhere. Without it the data is unreadable.

export const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface WrappedKey {
  salt: string; // base64
  iv: string; // base64
  wrapped: string; // base64
  iterations: number;
}

export interface Sealed {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKek(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Creates a brand-new data key and wraps it with the password. */
export async function createDataKey(password: string): Promise<{ key: CryptoKey; wrapped: WrappedKey }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapped = await wrapDataKey(key, password);
  // Re-import as non-extractable for day-to-day use.
  const usable = await unwrapDataKey(wrapped, password, false);
  return { key: usable, wrapped };
}

export async function wrapDataKey(key: CryptoKey, password: string, iterations = PBKDF2_ITERATIONS): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(password, salt, iterations);
  const wrapped = await crypto.subtle.wrapKey("raw", key, kek, { name: "AES-GCM", iv });
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped), iterations };
}

/** Throws if the password is wrong. */
export async function unwrapDataKey(w: WrappedKey, password: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveKek(password, fromB64(w.salt), w.iterations);
  return crypto.subtle.unwrapKey(
    "raw",
    fromB64(w.wrapped),
    kek,
    { name: "AES-GCM", iv: fromB64(w.iv) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export async function sealBytes(key: CryptoKey, data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12);
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, data: out };
}

export async function openBytes(key: CryptoKey, sealed: Sealed): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv as Uint8Array<ArrayBuffer> }, key, sealed.data);
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  return sealBytes(key, enc.encode(JSON.stringify(value)));
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  return JSON.parse(dec.decode(await openBytes(key, sealed))) as T;
}
