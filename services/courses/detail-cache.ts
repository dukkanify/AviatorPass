/** Request-scoped course detail memo. Cleared on every courses-store write. */

const cache = new Map<string, unknown>();
let graph: unknown = null;

export function readCourseDetailCache<T>(id: string): T | undefined {
  return cache.get(id) as T | undefined;
}

export function writeCourseDetailCache<T>(id: string, value: T): T {
  cache.set(id, value);
  return value;
}

export function readCourseGraphCache<T>(): T | null {
  return (graph as T | null) ?? null;
}

export function writeCourseGraphCache<T>(value: T): T {
  graph = value;
  return value;
}

export function clearCourseDetailCache() {
  cache.clear();
  graph = null;
}
