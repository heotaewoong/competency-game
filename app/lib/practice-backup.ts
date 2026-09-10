import { games, type GameId, type SessionResult } from './game-data.ts';
import {
  MAX_REVIEW_ATTEMPTS,
  MAX_REVIEW_BYTES,
  MAX_ROTATION_EVENTS,
  REVIEW_SCHEMA_VERSION,
  sanitizeReviewPayload,
} from './review-data.ts';
import { MAX_STORED_RESULTS, mergeSessionResults } from './result-storage.ts';
import { isRotationTransformId } from './rotation-game.ts';

export const PRACTICE_RESULTS_BACKUP_FORMAT = 'nineflow-practice-results' as const;
export const PRACTICE_RESULTS_BACKUP_VERSION = 1 as const;
export const MAX_PRACTICE_RESULTS_BACKUP_BYTES = 5 * 1024 * 1024;

export type PracticeResultsBackup = {
  format: typeof PRACTICE_RESULTS_BACKUP_FORMAT;
  version: typeof PRACTICE_RESULTS_BACKUP_VERSION;
  exportedAt: string;
  results: SessionResult[];
};

export type PracticeResultsBackupErrorCode =
  | '입력_형식_오류'
  | '파일_크기_초과'
  | 'JSON_파싱_오류'
  | '백업_객체_오류'
  | '백업_형식_불일치'
  | '백업_버전_미지원'
  | '내보내기_시각_오류'
  | '기록_배열_오류'
  | '기록_개수_초과'
  | '기록_항목_오류'
  | '복습_버전_미지원';

export type ParsePracticeResultsBackupResult =
  | PracticeResultsBackup & { ok: true }
  | { ok: false; code: PracticeResultsBackupErrorCode; message: string };

type BackupFailure = Extract<ParsePracticeResultsBackupResult, { ok: false }>;
type SessionNormalization = { ok: true; result: SessionResult } | BackupFailure;

const gameIds = new Set<GameId>(games.map(({ id }) => id));
const reviewStatuses = new Set(['correct', 'error', 'neutral']);
const rotationOperations = new Set(['left', 'right', 'flip-x', 'flip-y']);
const rotationActions = new Set(['start', 'left', 'right', 'flip-x', 'flip-y', 'undo', 'reset', 'submit', 'timeout', 'budget']);
const reviewKeys = new Set(['version', 'gameId', 'attempts', 'summary']);
const genericAttemptKeys = new Set([
  'kind', 'scored', 'id', 'index', 'status', 'errorCodes', 'title', 'prompt', 'expected', 'selected', 'explanation', 'rtMs', 'facts',
]);
const rotationAttemptKeys = new Set([
  'kind', 'scored', 'id', 'index', 'status', 'errorCodes', 'title', 'prompt', 'expected', 'selected', 'explanation', 'rtMs',
  'phaseEnded', 'puzzle', 'submitted', 'correction', 'events', 'firstInefficientEvent',
]);
const rotationPuzzleKeys = new Set(['kind', 'baseId', 'transformId', 'letter', 'pattern', 'target', 'optimal']);
const rotationEventKeys = new Set(['index', 'action', 'elapsedMs', 'chargedClicks', 'remainingOptimal', 'inefficient']);
const reviewSummaryKeys = new Set([
  'attemptedCount', 'correctCount', 'neutralCount', 'reviewPointCount', 'errorCounts', 'omittedDetailCount', 'coverage',
]);
const requiredAttemptTextKeys = ['id', 'title', 'prompt', 'expected', 'selected', 'explanation'] as const;
const requiredSummaryNumberKeys = ['attemptedCount', 'correctCount', 'neutralCount', 'reviewPointCount', 'omittedDetailCount'] as const;

function failure(code: PracticeResultsBackupErrorCode, message: string): BackupFailure {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (!isValidDate(value)) return false;
  return new Date(value).toISOString() === value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasOwnKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedText(value: unknown, maxLength: number, requireContent = false): value is string {
  return typeof value === 'string' && value.length <= maxLength && (!requireContent || value.trim().length > 0);
}

function isSafeCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;
}

function isSafeElapsed(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isStrictStringArray(value: unknown, maxItems: number, maxItemLength: number) {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isBoundedText(item, maxItemLength));
}

function serializedByteLength(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? new TextEncoder().encode(serialized).byteLength : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isReviewFact(value: unknown) {
  if (typeof value === 'string') return value.length <= 300;
  if (isFiniteNumber(value) || typeof value === 'boolean' || value === null) return true;
  if (!Array.isArray(value) || value.length > 40) return false;
  if (value.every((item) => typeof item === 'string')) {
    return value.every((item) => item.length <= 80);
  }
  return value.every(isFiniteNumber);
}

function isStrictFacts(value: unknown) {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0
    && entries.length <= 12
    && entries.every(([key, fact]) => key.length <= 40 && isReviewFact(fact));
}

function hasStrictAttemptBase(value: Record<string, unknown>) {
  return hasOwnKeys(value, ['kind', ...requiredAttemptTextKeys, 'index', 'status', 'errorCodes'])
    && requiredAttemptTextKeys.every((key) => isBoundedText(value[key], 500, key === 'id'))
    && isSafeCount(value.index)
    && typeof value.status === 'string' && reviewStatuses.has(value.status)
    && isStrictStringArray(value.errorCodes, 8, 80)
    && (!Object.hasOwn(value, 'scored') || value.scored === false)
    && (!Object.hasOwn(value, 'rtMs') || isSafeElapsed(value.rtMs));
}

function isStrictGenericAttempt(value: Record<string, unknown>) {
  return value.kind === 'generic'
    && hasOnlyKeys(value, genericAttemptKeys)
    && hasStrictAttemptBase(value)
    && (!Object.hasOwn(value, 'facts') || isStrictFacts(value.facts));
}

function isRotationSequence(value: unknown) {
  return Array.isArray(value)
    && value.length <= 8
    && value.every((operation) => typeof operation === 'string' && rotationOperations.has(operation));
}

function isRotationMatrix(value: unknown) {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function isStrictRotationPuzzle(value: unknown) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, rotationPuzzleKeys)
    || !hasOwnKeys(value, ['kind', 'baseId', 'target', 'optimal'])
    || (value.kind !== 'letter' && value.kind !== 'tiles')
    || !isBoundedText(value.baseId, 500, true)
    || !isRotationMatrix(value.target)
    || !isRotationSequence(value.optimal)
    || (Object.hasOwn(value, 'transformId') && !isRotationTransformId(value.transformId))
    || (Object.hasOwn(value, 'letter') && !isBoundedText(value.letter, 2, true))
    || (Object.hasOwn(value, 'pattern') && (!Array.isArray(value.pattern)
      || value.pattern.length > 25
      || !value.pattern.every((cell) => cell === 0 || cell === 1)))) return false;

  if (value.kind === 'letter') return Object.hasOwn(value, 'letter') && !Object.hasOwn(value, 'pattern');
  return Object.hasOwn(value, 'pattern') && !Object.hasOwn(value, 'letter');
}

function isStrictRotationEvent(value: unknown) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, rotationEventKeys)
    || !hasOwnKeys(value, ['index', 'action', 'elapsedMs', 'chargedClicks', 'remainingOptimal', 'inefficient'])) return false;
  return isSafeCount(value.index)
    && typeof value.action === 'string' && rotationActions.has(value.action)
    && isSafeElapsed(value.elapsedMs)
    && isSafeElapsed(value.chargedClicks)
    && isSafeElapsed(value.remainingOptimal)
    && typeof value.inefficient === 'boolean';
}

function isStrictRotationAttempt(value: Record<string, unknown>) {
  return value.kind === 'rotation'
    && hasOnlyKeys(value, rotationAttemptKeys)
    && hasOwnKeys(value, ['puzzle', 'submitted', 'correction', 'events', 'firstInefficientEvent'])
    && hasStrictAttemptBase(value)
    && (!Object.hasOwn(value, 'phaseEnded') || value.phaseEnded === true)
    && isStrictRotationPuzzle(value.puzzle)
    && isRotationSequence(value.submitted)
    && isRotationSequence(value.correction)
    && Array.isArray(value.events)
    && value.events.length <= MAX_ROTATION_EVENTS
    && value.events.every(isStrictRotationEvent)
    && (value.firstInefficientEvent === null || isSafeCount(value.firstInefficientEvent));
}

function isStrictReviewAttempt(value: unknown) {
  if (!isRecord(value)) return false;
  return value.kind === 'rotation' ? isStrictRotationAttempt(value) : isStrictGenericAttempt(value);
}

function isStrictErrorCounts(value: unknown) {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 100
    && entries.every(([code, count]) => code.length > 0 && code.length <= 80 && isSafeCount(count));
}

function isStrictReviewSummary(value: unknown, requireComplete: boolean) {
  if (!isRecord(value) || !hasOnlyKeys(value, reviewSummaryKeys)) return false;
  if (requireComplete && !hasOwnKeys(value, [...requiredSummaryNumberKeys, 'errorCounts', 'coverage'])) return false;
  if (!requiredSummaryNumberKeys.every((key) => !Object.hasOwn(value, key) || isSafeCount(value[key]))) return false;
  if (Object.hasOwn(value, 'errorCounts') && !isStrictErrorCounts(value.errorCounts)) return false;
  if (Object.hasOwn(value, 'coverage')
    && value.coverage !== 'full' && value.coverage !== 'sampled' && value.coverage !== 'legacy-unknown') return false;
  return true;
}

/**
 * Strictly checks a persisted review before its lossy sanitizer is allowed to
 * normalize counts. Any unknown, mistyped, oversized, or truncated attempt
 * field makes the whole payload invalid so backup import remains atomic.
 */
export function isReviewPayloadStructurallyValid(value: unknown, expectedGameId: GameId): boolean {
  if (!isRecord(value)
    || !hasOnlyKeys(value, reviewKeys)
    || !hasOwnKeys(value, ['version', 'gameId', 'attempts', 'summary'])
    || (value.version !== 1 && value.version !== REVIEW_SCHEMA_VERSION)
    || value.gameId !== expectedGameId
    || !Array.isArray(value.attempts)
    || value.attempts.length > MAX_REVIEW_ATTEMPTS
    || !value.attempts.every(isStrictReviewAttempt)
    || !isStrictReviewSummary(value.summary, value.version === REVIEW_SCHEMA_VERSION)
    || serializedByteLength(value) > MAX_REVIEW_BYTES) return false;
  return true;
}

function normalizeDetail(value: unknown): Record<string, string | number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, detailValue]) => typeof detailValue !== 'string' && !isFiniteNumber(detailValue))) return null;
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))) as Record<string, string | number>;
}

function futureReviewVersion(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value.review)) return null;
  const version = value.review.version;
  return isFiniteNumber(version) && version > REVIEW_SCHEMA_VERSION ? version : null;
}

function sanitizeReviewForBackup(value: unknown, gameId: GameId) {
  if (!isReviewPayloadStructurallyValid(value, gameId)) return undefined;
  const sanitized = sanitizeReviewPayload(value);
  const attemptCount = (value as { attempts: unknown[] }).attempts.length;
  return sanitized?.gameId === gameId && sanitized.attempts.length === attemptCount ? sanitized : undefined;
}

function normalizeSessionResult(value: unknown, index: number): SessionNormalization {
  const position = index + 1;
  if (!isRecord(value)) {
    return failure('기록_항목_오류', `${position}번째 기록이 객체가 아닙니다. 파일 전체를 가져오지 않았습니다.`);
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    return failure('기록_항목_오류', `${position}번째 기록의 ID가 올바르지 않습니다. 파일 전체를 가져오지 않았습니다.`);
  }
  if (typeof value.gameId !== 'string' || !gameIds.has(value.gameId as GameId)) {
    return failure('기록_항목_오류', `${position}번째 기록의 게임 ID가 지원 목록에 없습니다. 파일 전체를 가져오지 않았습니다.`);
  }
  if (!isValidDate(value.completedAt)) {
    return failure('기록_항목_오류', `${position}번째 기록의 완료 시각이 올바른 날짜가 아닙니다. 파일 전체를 가져오지 않았습니다.`);
  }

  const numericFields = [value.accuracy, value.medianRt, value.stability, value.errors];
  if (!numericFields.every(isFiniteNumber)) {
    return failure('기록_항목_오류', `${position}번째 기록의 점수나 반응 시간이 유한한 숫자가 아닙니다. 파일 전체를 가져오지 않았습니다.`);
  }

  let detail: Record<string, string | number> | undefined;
  if (Object.hasOwn(value, 'detail') && value.detail !== undefined) {
    const normalizedDetail = normalizeDetail(value.detail);
    if (!normalizedDetail) {
      return failure('기록_항목_오류', `${position}번째 기록의 상세 정보는 문자열 또는 유한한 숫자만 포함해야 합니다. 파일 전체를 가져오지 않았습니다.`);
    }
    detail = normalizedDetail;
  }

  const gameId = value.gameId as GameId;
  let review: SessionResult['review'];
  if (Object.hasOwn(value, 'review') && value.review !== undefined) {
    const sanitizedReview = sanitizeReviewForBackup(value.review, gameId);
    if (!sanitizedReview || sanitizedReview.gameId !== gameId) {
      return failure('기록_항목_오류', `${position}번째 기록의 복습 정보가 손상되었거나 게임과 일치하지 않습니다. 파일 전체를 가져오지 않았습니다.`);
    }
    review = sanitizedReview;
  }

  return {
    ok: true,
    result: {
      id: value.id.trim(),
      gameId,
      completedAt: value.completedAt,
      accuracy: Math.min(100, Math.max(0, Math.round(value.accuracy as number))),
      medianRt: Math.max(0, Math.round(value.medianRt as number)),
      stability: Math.min(100, Math.max(0, Math.round(value.stability as number))),
      errors: Math.max(0, Math.round(value.errors as number)),
      ...(detail ? { detail } : {}),
      ...(review ? { review } : {}),
    },
  };
}

function normalizeResults(values: readonly unknown[]): { ok: true; results: SessionResult[] } | BackupFailure {
  if (values.length > MAX_STORED_RESULTS) {
    return failure(
      '기록_개수_초과',
      `백업 파일에는 최대 ${MAX_STORED_RESULTS}개의 연습 기록만 포함할 수 있습니다. 파일 전체를 가져오지 않았습니다.`,
    );
  }
  for (let index = 0; index < values.length; index += 1) {
    const version = futureReviewVersion(values[index]);
    if (version !== null) {
      return failure(
        '복습_버전_미지원',
        `${index + 1}번째 기록의 복습 데이터 버전(${version})은 현재 지원 버전(${REVIEW_SCHEMA_VERSION})보다 새롭습니다. 앱을 업데이트한 뒤 다시 시도해 주세요. 파일 전체를 가져오지 않았습니다.`,
      );
    }
  }

  const normalized: SessionResult[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = normalizeSessionResult(values[index], index);
    if (!item.ok) return item;
    normalized.push(item.result);
  }
  return { ok: true, results: mergeSessionResults(normalized) };
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableJsonValue(nested)]),
  );
}

export function createPracticeResultsBackup(results: readonly SessionResult[], now: Date = new Date()): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError('백업 생성 시각이 올바른 날짜가 아닙니다.');
  }
  const normalized = normalizeResults(results);
  if (!normalized.ok) throw new TypeError(normalized.message);

  const backup: PracticeResultsBackup = {
    format: PRACTICE_RESULTS_BACKUP_FORMAT,
    version: PRACTICE_RESULTS_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    results: normalized.results,
  };
  return JSON.stringify(stableJsonValue(backup), null, 2);
}

export function parsePracticeResultsBackup(raw: string): ParsePracticeResultsBackupResult {
  if (typeof raw !== 'string') {
    return failure('입력_형식_오류', '백업 내용은 JSON 문자열이어야 합니다.');
  }
  if (raw.length > MAX_PRACTICE_RESULTS_BACKUP_BYTES
    || new TextEncoder().encode(raw).byteLength > MAX_PRACTICE_RESULTS_BACKUP_BYTES) {
    return failure('파일_크기_초과', '백업 파일은 5MB 이하만 가져올 수 있습니다. 파일 전체를 가져오지 않았습니다.');
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure('JSON_파싱_오류', '파일이 올바른 JSON 형식이 아닙니다. 다른 파일을 선택해 주세요.');
  }

  if (!isRecord(value)) {
    return failure('백업_객체_오류', '백업의 최상위 내용이 객체가 아닙니다. 파일 전체를 가져오지 않았습니다.');
  }
  if (value.format !== PRACTICE_RESULTS_BACKUP_FORMAT) {
    return failure('백업_형식_불일치', '이 파일은 NineFlow 연습 기록 백업이 아닙니다.');
  }
  if (value.version !== PRACTICE_RESULTS_BACKUP_VERSION) {
    return failure('백업_버전_미지원', `백업 버전 ${String(value.version)}은 현재 지원하지 않습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.`);
  }
  if (!isCanonicalIsoDate(value.exportedAt)) {
    return failure('내보내기_시각_오류', '백업 생성 시각이 올바른 ISO 날짜가 아닙니다. 파일 전체를 가져오지 않았습니다.');
  }
  if (!Array.isArray(value.results)) {
    return failure('기록_배열_오류', '백업의 연습 기록 목록이 배열이 아닙니다. 파일 전체를 가져오지 않았습니다.');
  }

  const normalized = normalizeResults(value.results);
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    format: PRACTICE_RESULTS_BACKUP_FORMAT,
    version: PRACTICE_RESULTS_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    results: normalized.results,
  };
}
