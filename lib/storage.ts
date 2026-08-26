"use client";

/**
 * Thin localStorage wrapper. Every accessor is guarded: private windows and
 * blocked site data make `localStorage` itself throw on access, not just on write.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the session still works, it just won't persist.
  }
}
