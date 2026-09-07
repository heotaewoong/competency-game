import type { SessionResult } from './game-data';

export const MAX_STORED_RESULTS = 100;
export const RESULTS_SOFT_BYTE_BUDGET = 3_500_000;

export type SessionResultStorage = Pick<Storage, 'setItem'>;

export function getStorageSafely(getStorage: () => Storage): Storage | null {
  try {
    return getStorage();
  } catch {
    return null;
  }
}

export type PrepareSessionResultsOptions = {
  softByteBudget?: number;
};

export type PreparedSessionResults = {
  storedResults: SessionResult[];
  detailPruned: number;
};

export type PersistSessionResultsResult = PreparedSessionResults & {
  stored: boolean;
  summariesPruned: number;
  sessionsPruned: number;
  reason?: 'storage-write-failed';
};

function cloneResult(result: SessionResult): SessionResult {
  return {
    ...result,
    ...(result.detail ? { detail: { ...result.detail } } : {}),
    ...(result.review ? {
      review: {
        ...result.review,
        attempts: [...result.review.attempts],
        summary: {
          ...result.review.summary,
          errorCounts: { ...result.review.summary.errorCounts },
        },
      },
    } : {}),
  };
}

function completionTime(result: SessionResult) {
  const timestamp = Date.parse(result.completedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/**
 * Combines in-memory and newly read storage snapshots without dropping a
 * session written by another browser tab. Collections listed first win when
 * the same id appears more than once, and the merged result is always newest
 * first so the home screen and storage share one deterministic order.
 */
export function mergeSessionResults(...collections: readonly (readonly SessionResult[])[]) {
  const byId = new Map<string, { result: SessionResult; order: number }>();
  let order = 0;

  for (const collection of collections) {
    for (const result of collection) {
      if (!byId.has(result.id)) byId.set(result.id, { result: cloneResult(result), order });
      order += 1;
    }
  }

  return [...byId.values()]
    .sort((a, b) => completionTime(b.result) - completionTime(a.result) || a.result.id.localeCompare(b.result.id) || a.order - b.order)
    .slice(0, MAX_STORED_RESULTS)
    .map(({ result }) => result);
}

function newestResults(results: readonly SessionResult[]) {
  if (results.length <= MAX_STORED_RESULTS) return results.map(cloneResult);

  const retainedIndices = new Set(
    results
      .map((result, index) => ({ index, timestamp: completionTime(result) }))
      .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
      .slice(0, MAX_STORED_RESULTS)
      .map(({ index }) => index),
  );

  return results.flatMap((result, index) => retainedIndices.has(index) ? [cloneResult(result)] : []);
}

function oldestFirstIndices(results: readonly SessionResult[]) {
  return results
    .map((result, index) => ({ index, timestamp: completionTime(result) }))
    .sort((a, b) => a.timestamp - b.timestamp || b.index - a.index)
    .map(({ index }) => index);
}

function serializedByteLength(results: readonly SessionResult[]) {
  return new TextEncoder().encode(JSON.stringify(results)).byteLength;
}

function pruneReviewAttempts(result: SessionResult) {
  const review = result.review;
  if (!review || review.attempts.length === 0) return 0;

  const prunedCount = review.attempts.length;
  result.review = {
    ...review,
    attempts: [],
    summary: {
      ...review.summary,
      errorCounts: { ...review.summary.errorCounts },
      omittedDetailCount: review.summary.omittedDetailCount + prunedCount,
      coverage: review.summary.coverage === 'full' ? 'sampled' : review.summary.coverage,
    },
  };
  return prunedCount;
}

/**
 * Produces a storage-safe clone without mutating the caller's session results.
 * Old review attempts are the first data removed when the soft byte budget is
 * exceeded; their aggregate summary remains available to the review UI.
 */
export function prepareSessionResultsForStorage(
  results: readonly SessionResult[],
  options: PrepareSessionResultsOptions = {},
): PreparedSessionResults {
  const softByteBudget = options.softByteBudget ?? RESULTS_SOFT_BYTE_BUDGET;
  const storedResults = newestResults(results);
  let detailPruned = 0;

  if (serializedByteLength(storedResults) <= softByteBudget) {
    return { storedResults, detailPruned };
  }

  const detailIndices = oldestFirstIndices(storedResults).filter((index) => Boolean(storedResults[index].review?.attempts.length));
  let cursor = 0;
  let batchSize = 1;
  while (cursor < detailIndices.length) {
    const end = Math.min(cursor + batchSize, detailIndices.length);
    for (; cursor < end; cursor += 1) detailPruned += pruneReviewAttempts(storedResults[detailIndices[cursor]]);
    if (serializedByteLength(storedResults) <= softByteBudget) break;
    batchSize *= 2;
  }

  return { storedResults, detailPruned };
}

type WriteOutcome = 'stored' | 'quota-exceeded' | 'write-failed';

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'QuotaExceededError'
    || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || candidate.code === 22
    || candidate.code === 1014;
}

function tryWrite(storage: SessionResultStorage, key: string, results: readonly SessionResult[]): WriteOutcome {
  try {
    storage.setItem(key, JSON.stringify(results));
    return 'stored';
  } catch (error) {
    return isQuotaExceededError(error) ? 'quota-exceeded' : 'write-failed';
  }
}

/**
 * Stores results with progressively smaller fallbacks. Storage exceptions are
 * contained so a completed game remains usable even when localStorage is full
 * or unavailable.
 */
export function persistSessionResults(
  storage: SessionResultStorage,
  key: string,
  results: readonly SessionResult[],
  options: PrepareSessionResultsOptions = {},
): PersistSessionResultsResult {
  const prepared = prepareSessionResultsForStorage(results, options);
  let storedResults = prepared.storedResults;
  let detailPruned = prepared.detailPruned;
  let summariesPruned = 0;
  let sessionsPruned = 0;

  let writeOutcome = tryWrite(storage, key, storedResults);
  if (writeOutcome === 'stored') {
    return { storedResults, stored: true, detailPruned, summariesPruned, sessionsPruned };
  }
  if (writeOutcome === 'write-failed') {
    return { storedResults, stored: false, detailPruned, summariesPruned, sessionsPruned, reason: 'storage-write-failed' };
  }

  const indices = oldestFirstIndices(storedResults);
  const detailIndices = indices.filter((index) => Boolean(storedResults[index].review?.attempts.length));
  let cursor = 0;
  let batchSize = 1;
  while (cursor < detailIndices.length) {
    const end = Math.min(cursor + batchSize, detailIndices.length);
    for (; cursor < end; cursor += 1) {
      detailPruned += pruneReviewAttempts(storedResults[detailIndices[cursor]]);
    }
    writeOutcome = tryWrite(storage, key, storedResults);
    if (writeOutcome === 'stored') {
      return { storedResults, stored: true, detailPruned, summariesPruned, sessionsPruned };
    }
    if (writeOutcome === 'write-failed') {
      return { storedResults, stored: false, detailPruned, summariesPruned, sessionsPruned, reason: 'storage-write-failed' };
    }
    batchSize *= 2;
  }

  const summaryIndices = indices.filter((index) => Boolean(storedResults[index].review));
  cursor = 0;
  batchSize = 1;
  while (cursor < summaryIndices.length) {
    const end = Math.min(cursor + batchSize, summaryIndices.length);
    for (; cursor < end; cursor += 1) {
      delete storedResults[summaryIndices[cursor]].review;
      summariesPruned += 1;
    }
    writeOutcome = tryWrite(storage, key, storedResults);
    if (writeOutcome === 'stored') {
      return { storedResults, stored: true, detailPruned, summariesPruned, sessionsPruned };
    }
    if (writeOutcome === 'write-failed') {
      return { storedResults, stored: false, detailPruned, summariesPruned, sessionsPruned, reason: 'storage-write-failed' };
    }
    batchSize *= 2;
  }

  // If the origin is already close to its quota, review pruning may still be
  // insufficient. Remove complete sessions oldest-first in exponential
  // batches, but always keep the newest score as the final recovery attempt.
  batchSize = 1;
  while (storedResults.length > 1) {
    const removeCount = Math.min(batchSize, storedResults.length - 1);
    const removed = new Set(oldestFirstIndices(storedResults).slice(0, removeCount));
    storedResults = storedResults.filter((_, index) => !removed.has(index));
    sessionsPruned += removeCount;
    writeOutcome = tryWrite(storage, key, storedResults);
    if (writeOutcome === 'stored') {
      return { storedResults, stored: true, detailPruned, summariesPruned, sessionsPruned };
    }
    if (writeOutcome === 'write-failed') {
      return { storedResults, stored: false, detailPruned, summariesPruned, sessionsPruned, reason: 'storage-write-failed' };
    }
    batchSize *= 2;
  }

  return {
    storedResults,
    stored: false,
    detailPruned,
    summariesPruned,
    sessionsPruned,
    reason: 'storage-write-failed',
  };
}
