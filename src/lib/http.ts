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

/** Free CORS proxies that return the upstream body untouched. Each has its own
 *  rate limit, so requests are spread across them (see `proxyOrderFor`) and a
 *  429/5xx on one moves on to the next. */
export const TEXT_PROXIES: { name: string; build: (url: string) => string }[] = [
  { name: "allorigins", build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "corsproxy.io", build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { name: "codetabs", build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Rotate the starting proxy per URL so the load is spread evenly. */
function proxyOrderFor(url: string) {
  const start = hashOf(url) % TEXT_PROXIES.length;
  return [...TEXT_PROXIES.slice(start), ...TEXT_PROXIES.slice(0, start)];
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "timeout";
    return err.message.replace(/^Error:\s*/, "");
  }
  return String(err);
}

/** Fetch a URL's raw body through the proxies in turn. Throws with every
 *  attempt's reason joined, so the UI can show why a source is empty. */
export async function fetchTextViaProxies(url: string): Promise<string> {
  const reasons: string[] = [];
  for (const proxy of proxyOrderFor(url)) {
    try {
      const res = await fetchWithTimeout(proxy.build(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error("empty body");
      return text;
    } catch (err) {
      reasons.push(`${proxy.name}: ${describeError(err)}`);
    }
  }
  throw new Error(reasons.join(" · "));
}

/** GET a JSON API directly (they should all send CORS headers); if the direct
 *  call fails for any reason, go through the proxies. */
export async function fetchJson<T>(url: string): Promise<T> {
  let directReason: string;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    directReason = `direct: ${describeError(err)}`;
  }
  try {
    return JSON.parse(await fetchTextViaProxies(url)) as T;
  } catch (err) {
    throw new Error(`${directReason} · ${describeError(err)}`);
  }
}

/** Run async jobs with at most `limit` in flight at once. Free proxies throttle
 *  bursts, so ~70 sources fired simultaneously is exactly what gets 429s. */
export async function runWithConcurrency<T>(
  jobs: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  });
  await Promise.all(workers);
  return results;
}
