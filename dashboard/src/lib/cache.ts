/**
 * In-memory TTL cache for expensive server-side computations.
 *
 * Used by API routes to avoid re-executing identical ClickHouse queries
 * on every request. Each entry expires after its TTL. Stale entries are
 * lazily evicted on next access.
 *
 * Thread-safe in Node.js single-threaded model. Cache is per-process
 * (does not share across workers/replicas).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Maximum cache entries to prevent unbounded growth */
const MAX_ENTRIES = 256;

/**
 * Get a cached value, or compute and cache it.
 *
 * @param key   Unique cache key
 * @param ttlMs Time-to-live in milliseconds
 * @param fn    Async factory function to produce the value on cache miss
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  // Evict expired entries lazily when cache is at capacity
  if (store.size >= MAX_ENTRIES) {
    store.forEach((v, k) => {
      if (v.expiresAt <= now) store.delete(k);
    });
    // If still at capacity after eviction, drop oldest entries
    if (store.size >= MAX_ENTRIES) {
      const keysToDelete = Array.from(store.keys()).slice(
        0,
        Math.floor(MAX_ENTRIES / 4),
      );
      keysToDelete.forEach((k) => store.delete(k));
    }
  }

  try {
    const value = await fn();
    store.set(key, { value, expiresAt: now + ttlMs });
    return value;
  } catch (err) {
    // Stale-while-error: if we have ANY cached value (even expired), return it
    // rather than propagating the error. This prevents the dashboard from
    // flashing to zeros during transient ClickHouse/network failures.
    if (existing) {
      return existing.value;
    }
    throw err;
  }
}

/** Invalidate a specific cache key */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Invalidate all cache entries matching a prefix */
export function invalidatePrefix(prefix: string): void {
  Array.from(store.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.delete(key);
  });
}

/** Clear all cached data */
export function clearAll(): void {
  store.clear();
}
