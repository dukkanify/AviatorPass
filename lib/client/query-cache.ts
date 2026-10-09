/**
 * Tiny GET cache + in-flight de-dupe for dashboard widgets.
 * Avoids adding React Query / SWR to the public bundle.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DASHBOARD_QUERY_TTL_MS = 15_000;

export function readQueryCache<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) memory.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeQueryCache<T>(key: string, value: T, ttlMs = DASHBOARD_QUERY_TTL_MS): T {
  memory.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

export async function cachedQuery<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = DASHBOARD_QUERY_TTL_MS,
): Promise<T> {
  const cached = readQueryCache<T>(key);
  if (cached !== null) return cached;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const request = load()
    .then((value) => {
      writeQueryCache(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function clearQueryCache(key?: string) {
  if (key) {
    memory.delete(key);
    inflight.delete(key);
    return;
  }
  memory.clear();
  inflight.clear();
}
