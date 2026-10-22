/**
 * JSON values in localStorage, guarded: a private window, a full quota or disabled storage all
 * fail silently and the game plays on without its saved bests. Keys are `berby.<mode>.<name>`.
 */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Returns false when the value could not be saved. */
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
