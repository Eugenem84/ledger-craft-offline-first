// src/utils/pin.js
//
// PIN-код приложения (задача 7.4): локальный замок, чтобы приложение не открывалось
// «само» на чужом устройстве. Это НЕ криптографическая защита данных: настоящий
// секрет — серверный токен Sanctum (владелец данных фильтруется на сервере, 3.10).
// Поэтому PIN храним не открытым текстом, а соль + SHA-256 (WebCrypto); если
// WebCrypto недоступен (старый WebView) — детерминированный фолбэк-хеш, о чём
// честно сказано в комментарии ниже.

/** Случайная соль в hex (16 байт). */
export function generateSalt() {
  const bytes = new Uint8Array(16)

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Фолбэк без WebCrypto: xorshift-хеш со смешиванием длины. Не криптостойкий —
 * нужен лишь чтобы PIN не лежал в хранилище открытым текстом.
 */
function fallbackHash(input) {
  let hash = 0x811c9dc5

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `fnv${hash.toString(16).padStart(8, '0')}${input.length.toString(16)}`
}

/**
 * Хеш PIN-кода: `salt:pin` → SHA-256 (hex) или фолбэк-хеш.
 * @param {string} pin
 * @param {string} salt
 * @returns {Promise<string>}
 */
export async function hashPin(pin, salt) {
  const data = `${salt}:${pin}`

  if (globalThis.crypto?.subtle?.digest) {
    const encoded = new TextEncoder().encode(data)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return toHex(digest)
  }

  return fallbackHash(data)
}

/**
 * Проверяет PIN против сохранённого хеша.
 * @param {string} pin
 * @param {string} salt
 * @param {string} expectedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPinHash(pin, salt, expectedHash) {
  if (!salt || !expectedHash) return false

  const hash = await hashPin(pin, salt)
  return hash === expectedHash
}
