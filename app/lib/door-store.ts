// Small shared key-value store for the web door keypad (/door): the code
// index and the wrong-code counters. On Vercel this is the Runtime Cache,
// which every function instance in the region shares, so a limit holds no
// matter which instance answers. Locally, and if the cache is unreachable,
// it falls back to this process's memory.

import { getCache } from '@vercel/functions'

const NAMESPACE = 'door'

const fallback = new Map<string, { value: unknown; expiresAt: number }>()

function readFallback<T>(key: string): T | null {
  const entry = fallback.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    fallback.delete(key)
    return null
  }
  return entry.value as T
}

export async function storeGet<T>(key: string): Promise<T | null> {
  try {
    const value = await getCache({ namespace: NAMESPACE }).get(key)
    if (value !== null && value !== undefined) return value as T
  } catch (error) {
    console.error('[door-store] cache read failed, using memory:', error)
  }
  return readFallback<T>(key)
}

export async function storeSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  // Always keep the local copy too, so a cache outage degrades to
  // per-instance behaviour instead of forgetting everything.
  fallback.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  try {
    await getCache({ namespace: NAMESPACE }).set(key, value, {
      ttl: ttlSeconds,
      name: `door ${key.split(':')[0]}`,
    })
  } catch (error) {
    console.error('[door-store] cache write failed, using memory:', error)
  }
}
