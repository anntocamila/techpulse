const KEY = "techpulse:disabled-sources:v1";

/** Sources the viewer switched off in the right panel, persisted per browser. */
export function loadDisabledSources(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDisabledSources(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Storage unavailable: the toggle still works for this session.
  }
}
