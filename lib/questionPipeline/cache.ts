import { createHash } from "node:crypto";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

interface CacheGlobal {
  _quorixPipelineCache?: Map<string, CacheEntry>;
}

const globalForCache = global as unknown as CacheGlobal;

function getStore(): Map<string, CacheEntry> {
  if (!globalForCache._quorixPipelineCache) {
    globalForCache._quorixPipelineCache = new Map();
  }
  return globalForCache._quorixPipelineCache;
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildCacheKey(parts: Record<string, unknown>): string {
  const normalized = Object.keys(parts)
    .sort()
    .map((key) => {
      const value = parts[key];
      if (Array.isArray(value)) {
        return `${key}=${[...value].map(String).sort().join(",")}`;
      }
      return `${key}=${String(value ?? "")}`;
    })
    .join("|");
  return hashValue(normalized);
}

export function getCached<T>(key: string): T | undefined {
  const store = getStore();
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = 300_000): void {
  const store = getStore();
  if (store.size > 2_000) {
    const now = Date.now();
    for (const [entryKey, entry] of store) {
      if (entry.expiresAt <= now) store.delete(entryKey);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearPipelineCache(): void {
  getStore().clear();
}
