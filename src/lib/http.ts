export const CORS_PROXY = "https://api.allorigins.win/raw?url=";
const FETCH_TIMEOUT_MS = 12_000;

/** fetch() with a hard timeout so one hung source never blocks the feed. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GET a JSON API directly (they all send CORS headers); if the direct call
 *  fails for any reason, retry once through the generic CORS proxy. */
export async function fetchJson<T>(url: string): Promise<T> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (directError) {
    const res = await fetchWithTimeout(`${CORS_PROXY}${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`proxy HTTP ${res.status} (direct: ${String(directError)})`);
    return (await res.json()) as T;
  }
}
