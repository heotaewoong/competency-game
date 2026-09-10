export const RESULTS_STORAGE_PREFIX = 'nineflow-practice-results-v4:';
export const LEGACY_V3_RESULTS_STORAGE_KEY = 'nineflow-practice-results-v3';
export const LEGACY_RESULTS_STORAGE_KEY = 'nineflow-practice-results-v2';
export const RESULTS_GENERATION_KEY = 'nineflow-practice-results-generation-v1';
export const RESULTS_ENVELOPE_VERSION = 4 as const;
export const LEGACY_RESULTS_ENVELOPE_VERSION = 3 as const;

export type ResultsEnvelope = {
  version: typeof RESULTS_ENVELOPE_VERSION;
  generation: string;
  results: unknown[];
};

export type ParsedResultsEnvelope =
  | { ok: true; envelope: ResultsEnvelope }
  | { ok: false; reason: 'missing' | 'json' | 'shape' | 'generation-mismatch' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isResultsGeneration(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function resultsStorageKey(generation: string) {
  if (!isResultsGeneration(generation)) throw new TypeError('저장 세대 값이 올바르지 않습니다.');
  return `${RESULTS_STORAGE_PREFIX}${generation}`;
}

export function createResultsGeneration(now = Date.now(), entropy = Math.random()) {
  const safeNow = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : 0;
  const safeEntropy = Number.isFinite(entropy) ? Math.min(0.9999999999999999, Math.max(0, entropy)) : 0;
  return `${safeNow.toString(36)}-${safeEntropy.toString(36).slice(2, 14).padEnd(12, '0')}`;
}

export function serializeResultsEnvelope(generation: string, results: readonly unknown[]) {
  if (!isResultsGeneration(generation)) throw new TypeError('저장 세대 값이 올바르지 않습니다.');
  return JSON.stringify({ version: RESULTS_ENVELOPE_VERSION, generation, results });
}

export function parseResultsEnvelope(raw: string | null, expectedGeneration?: string | null): ParsedResultsEnvelope {
  if (!raw) return { ok: false, reason: 'missing' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isRecord(value)
    || value.version !== RESULTS_ENVELOPE_VERSION
    || !isResultsGeneration(value.generation)
    || !Array.isArray(value.results)) {
    return { ok: false, reason: 'shape' };
  }
  if (expectedGeneration && value.generation !== expectedGeneration) {
    return { ok: false, reason: 'generation-mismatch' };
  }
  return {
    ok: true,
    envelope: {
      version: RESULTS_ENVELOPE_VERSION,
      generation: value.generation,
      results: value.results,
    },
  };
}

/** Reads the short-lived fixed-key v3 format only for one-way migration. */
export function parseLegacyV3ResultsEnvelope(raw: string | null): ParsedResultsEnvelope {
  if (!raw) return { ok: false, reason: 'missing' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isRecord(value)
    || value.version !== LEGACY_RESULTS_ENVELOPE_VERSION
    || !isResultsGeneration(value.generation)
    || !Array.isArray(value.results)) {
    return { ok: false, reason: 'shape' };
  }
  return {
    ok: true,
    envelope: {
      version: RESULTS_ENVELOPE_VERSION,
      generation: value.generation,
      results: value.results,
    },
  };
}
