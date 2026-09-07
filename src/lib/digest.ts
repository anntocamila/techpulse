import type { Digest, DigestIndexEntry } from "../types";

const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    // Cache-bust so a freshly deployed edition shows up without a hard reload.
    const res = await fetch(`${BASE}${path}?t=${Math.floor(Date.now() / 60_000)}`, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const loadLatestDigest = () => getJson<Digest>("digest.json");
export const loadDigestIndex = async () => (await getJson<DigestIndexEntry[]>("digests/index.json")) ?? [];
export const loadDigestById = (id: string) => getJson<Digest>(`digests/${encodeURIComponent(id)}.json`);
