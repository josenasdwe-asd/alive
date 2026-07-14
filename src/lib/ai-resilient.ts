import "server-only";
import ZAI from "z-ai-web-dev-sdk";

/**
 * Resilient AI client with:
 * - Singleton promise (avoid re-creating the client on every request)
 * - In-memory caching (avoid re-calling the API for the same input)
 * - Request queuing (avoid firing multiple requests simultaneously)
 * - Exponential backoff retry on 429/5xx
 *
 * v3 FIX: The 429 "Too many requests" errors were breaking the entire AI pipeline.
 * This wrapper ensures that:
 * 1. Repeated VLM analysis of the same image returns cached result (no API call)
 * 2. Concurrent requests are queued (not fired simultaneously)
 * 3. 429 errors trigger exponential backoff retry (3 attempts: 2s, 4s, 8s)
 */

let _zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;
export async function getZai() {
  if (!_zaiPromise) _zaiPromise = ZAI.create();
  return _zaiPromise;
}

// === IN-MEMORY CACHE ===
// Cache key = hash of input. TTL = 10 minutes (images don't change).
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { value: any; expires: number }>();

function hashKey(...parts: any[]): string {
  const str = JSON.stringify(parts);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached(key: string, value: any) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
}

// === REQUEST QUEUING ===
// Only 1 AI request at a time to avoid hitting rate limits.
let queue: Promise<any> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn); // run even if previous rejected
  // reset queue after this completes (don't chain forever)
  queue = result.catch(() => {}).then(() => undefined);
  return result;
}

// === EXPONENTIAL BACKOFF RETRY ===
const RETRYABLE_STATUS = [429, 502, 503, 504];

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 2000
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? "");
      const isRetryable =
        RETRYABLE_STATUS.some((s) => msg.includes(String(s))) ||
        msg.includes("Too many requests") ||
        msg.includes("Gateway");

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff: 2s, 4s, 8s + jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[ai-resilient] retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`, msg.substring(0, 80));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// === CACHED + QUEUED + RETRIED VLM ANALYSIS ===

/**
 * Analyze an image with VLM. Results are cached by image data URL hash
 * so repeated calls (e.g. on re-analysis) don't hit the API.
 */
export async function analyzeImageCached(
  dataUrl: string,
  analyzeFn: (dataUrl: string) => Promise<any>
): Promise<any> {
  const key = `analyze:${hashKey(dataUrl.substring(0, 100))}`;
  const cached = getCached(key);
  if (cached) {
    console.log("[ai-resilient] analyze cache hit");
    return cached;
  }

  const result = await enqueue(() => withRetry(() => analyzeFn(dataUrl)));
  setCached(key, result);
  return result;
}

/**
 * Generate a depth map with caching + retry.
 * Cache key = hash of image + subject + operation type.
 */
export async function generateWithCache(
  cacheKey: string,
  fn: () => Promise<Buffer>
): Promise<Buffer> {
  const key = `gen:${cacheKey}`;
  const cached = getCached<Buffer>(key);
  if (cached) {
    console.log(`[ai-resilient] cache hit: ${cacheKey.substring(0, 30)}`);
    return cached;
  }

  const result = await enqueue(() => withRetry(fn));
  setCached(key, result);
  return result;
}
