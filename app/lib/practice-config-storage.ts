export type StoredPracticeConfig = {
  quantity: number;
  paceMs: number;
};

/** Builds a self-healing object snapshot while replacing only one key. */
export function upsertStoredObjectField<T>(
  raw: string | null,
  key: string,
  next: T,
) {
  let previous: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      previous = parsed as Record<string, unknown>;
    }
  } catch {
    // Replace damaged JSON with a clean snapshot containing the new value.
  }

  return JSON.stringify({ ...previous, [key]: next });
}

/** Reads one opt-in boolean without allowing strings or damaged snapshots to
 * silently enable an accessibility preference. */
export function readStoredBooleanField(
  raw: string | null,
  key: string,
  fallback = false,
) {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const value = (parsed as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Builds a self-healing game configuration snapshot. A malformed or
 * non-object legacy value must not permanently prevent later user changes
 * from being saved.
 */
export function upsertPracticeConfig(
  raw: string | null,
  gameId: string,
  next: StoredPracticeConfig,
) {
  return upsertStoredObjectField(raw, gameId, next);
}
