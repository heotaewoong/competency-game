import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionResult } from './game-data.ts';
import {
  MAX_STORED_RESULTS,
  RESULTS_SOFT_BYTE_BUDGET,
  getStorageSafely,
  mergeSessionResults,
  persistSessionResults,
  prepareSessionResultsForStorage,
  type SessionResultStorage,
} from './result-storage.ts';

test('브라우저 저장소 getter가 차단돼도 예외를 전파하지 않는다', () => {
  const storage = getStorageSafely(() => { throw new DOMException('차단됨', 'SecurityError'); });
  assert.equal(storage, null);
});

function result(id: string, completedAt: string, prompt = '문제'): SessionResult {
  return {
    id,
    gameId: 'rps',
    completedAt,
    accuracy: 50,
    medianRt: 800,
    stability: 75,
    errors: 1,
    detail: { sessionMode: '연습 모드' },
    review: {
      version: 2,
      gameId: 'rps',
      attempts: [{
        kind: 'generic',
        id: `${id}-attempt`,
        index: 0,
        status: 'error',
        errorCodes: ['rps-loss'],
        title: '1번 시도',
        prompt,
        expected: '바위',
        selected: '가위',
        explanation: '승리 관계를 반대로 적용했습니다.',
      }],
      summary: {
        attemptedCount: 1,
        correctCount: 0,
        neutralCount: 0,
        reviewPointCount: 1,
        errorCounts: { 'rps-loss': 1 },
        omittedDetailCount: 0,
        coverage: 'full',
      },
    },
  };
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

test('저장 결과 수는 최신 100개로 제한한다', () => {
  assert.equal(MAX_STORED_RESULTS, 100);
  assert.equal(RESULTS_SOFT_BYTE_BUDGET, 3_500_000);
  const input = Array.from({ length: 105 }, (_, index) => result(
    `session-${index}`,
    new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  ));

  const prepared = prepareSessionResultsForStorage(input);

  assert.equal(prepared.storedResults.length, 100);
  assert.equal(prepared.storedResults.some(({ id }) => id === 'session-0'), false);
  assert.equal(prepared.storedResults.some(({ id }) => id === 'session-104'), true);
});

test('소프트 예산을 넘으면 오래된 복습 상세부터 줄이고 요약·오류 집계를 보존한다', () => {
  const oldResult = result('old', '2026-08-27T00:00:00.000Z', '가'.repeat(2_000));
  const newResult = result('new', '2026-08-29T00:00:00.000Z');
  const expectedOld = result('old', '2026-08-27T00:00:00.000Z', '가'.repeat(2_000));
  expectedOld.review = {
    ...expectedOld.review!,
    attempts: [],
    summary: { ...expectedOld.review!.summary, omittedDetailCount: 1, coverage: 'sampled' },
  };
  const budget = bytes([expectedOld, newResult]);

  const prepared = prepareSessionResultsForStorage([oldResult, newResult], { softByteBudget: budget });

  assert.equal(prepared.detailPruned, 1);
  assert.deepEqual(prepared.storedResults[0].review?.attempts, []);
  assert.equal(prepared.storedResults[1].review?.attempts.length, 1);
  assert.deepEqual(prepared.storedResults[0].review?.summary.errorCounts, { 'rps-loss': 1 });
  assert.equal(prepared.storedResults[0].review?.summary.attemptedCount, 1);
  assert.equal(prepared.storedResults[0].review?.summary.omittedDetailCount, 1);
  assert.equal(prepared.storedResults[0].review?.summary.coverage, 'sampled');
  assert.ok(bytes(prepared.storedResults) <= budget);
  assert.equal(oldResult.review?.attempts.length, 1, '입력 결과는 변경하지 않는다');
});

test('첫 쓰기가 실패하면 오래된 상세를 제거해 재시도한다', () => {
  class FailOnceStorage implements SessionResultStorage {
    writes: string[] = [];

    setItem(_key: string, value: string) {
      this.writes.push(value);
      if (this.writes.length === 1) {
        const error = new Error('저장 용량 초과');
        error.name = 'QuotaExceededError';
        throw error;
      }
    }
  }

  const storage = new FailOnceStorage();
  const saved = persistSessionResults(storage, 'results', [
    result('new', '2026-08-29T00:00:00.000Z'),
    result('old', '2026-08-27T00:00:00.000Z'),
  ]);

  assert.equal(saved.stored, true);
  assert.equal(storage.writes.length, 2);
  assert.equal(saved.detailPruned, 1);
  assert.equal(saved.summariesPruned, 0);
  assert.equal(saved.sessionsPruned, 0);
  assert.equal(saved.storedResults[0].review?.attempts.length, 1);
  assert.deepEqual(saved.storedResults[1].review?.attempts, []);
  assert.deepEqual(saved.storedResults[1].review?.summary.errorCounts, { 'rps-loss': 1 });
});

test('모든 축소 쓰기가 실패해도 예외 없이 실패 이유를 반환한다', () => {
  const storage: SessionResultStorage = {
    setItem() {
      const error = new Error('저장 용량 초과');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };

  const saved = persistSessionResults(storage, 'results', [result('only', '2026-08-29T00:00:00.000Z')]);

  assert.equal(saved.stored, false);
  assert.equal(saved.detailPruned, 1);
  assert.equal(saved.summariesPruned, 1);
  assert.equal(saved.sessionsPruned, 0);
  assert.equal(saved.storedResults[0].review, undefined);
  assert.equal(saved.reason, 'storage-write-failed');
});

test('SecurityError는 축소 재시도 없이 즉시 실패한다', () => {
  let writes = 0;
  const storage: SessionResultStorage = {
    setItem() {
      writes += 1;
      const error = new Error('localStorage 접근 차단');
      error.name = 'SecurityError';
      throw error;
    },
  };

  const saved = persistSessionResults(storage, 'results', [result('only', '2026-08-29T00:00:00.000Z')]);

  assert.equal(writes, 1);
  assert.equal(saved.stored, false);
  assert.equal(saved.detailPruned, 0);
  assert.equal(saved.summariesPruned, 0);
  assert.equal(saved.sessionsPruned, 0);
  assert.equal(saved.storedResults[0].review?.attempts.length, 1);
  assert.equal(saved.reason, 'storage-write-failed');
});

test('계속되는 QuotaExceededError도 로그 수준 횟수만 재시도한다', () => {
  let writes = 0;
  const storage: SessionResultStorage = {
    setItem() {
      writes += 1;
      const error = new Error('저장 용량 초과');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };
  const input = Array.from({ length: MAX_STORED_RESULTS }, (_, index) => result(
    `session-${index}`,
    new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  ));

  const saved = persistSessionResults(storage, 'results', input);

  const retryLimit = 1 + (3 * Math.ceil(Math.log2(MAX_STORED_RESULTS + 1)));
  assert.ok(writes <= retryLimit, `${writes}회 쓰기는 제한 ${retryLimit}회를 초과합니다`);
  assert.equal(saved.stored, false);
  assert.equal(saved.detailPruned, MAX_STORED_RESULTS);
  assert.equal(saved.summariesPruned, MAX_STORED_RESULTS);
  assert.equal(saved.sessionsPruned, MAX_STORED_RESULTS - 1);
  assert.equal(saved.reason, 'storage-write-failed');
});

test('상세와 요약 축소로도 부족하면 가장 최신 세션을 남기고 오래된 세션부터 제거한다', () => {
  class OneSessionStorage implements SessionResultStorage {
    saved: SessionResult[] = [];

    setItem(_key: string, value: string) {
      const parsed = JSON.parse(value) as SessionResult[];
      if (parsed.length > 1) {
        const error = new Error('한 세션만 저장 가능');
        error.name = 'QuotaExceededError';
        throw error;
      }
      this.saved = parsed;
    }
  }

  const storage = new OneSessionStorage();
  const saved = persistSessionResults(storage, 'results', [
    result('newest', '2026-08-31T00:00:00.000Z'),
    result('middle', '2026-08-30T00:00:00.000Z'),
    result('oldest', '2026-08-29T00:00:00.000Z'),
  ]);

  assert.equal(saved.stored, true);
  assert.equal(saved.sessionsPruned, 2);
  assert.deepEqual(saved.storedResults.map(({ id }) => id), ['newest']);
  assert.deepEqual(storage.saved.map(({ id }) => id), ['newest']);
});

test('다른 탭의 최신 기록과 현재 탭 기록을 id 기준으로 병합한다', () => {
  const current = result('current', '2026-08-27T00:00:00.000Z');
  const remote = result('remote', '2026-08-28T00:00:00.000Z');
  const completedNow = result('new', '2026-08-29T00:00:00.000Z');
  const duplicateCurrent = result('current', '2026-08-27T00:00:00.000Z');

  const merged = mergeSessionResults([completedNow], [current], [remote, duplicateCurrent]);

  assert.deepEqual(merged.map((item) => item.id), ['new', 'remote', 'current']);
  assert.equal(merged.filter((item) => item.id === 'current').length, 1);
  assert.notEqual(merged[0], completedNow);
});

test('완료 시각이 같아도 탭별 입력 순서와 무관하게 같은 저장 순서로 수렴한다', () => {
  const completedAt = '2026-08-31T12:00:00.000Z';
  const left = result('tab-a', completedAt);
  const right = result('tab-b', completedAt);
  assert.deepEqual(
    mergeSessionResults([left], [right]).map(({ id }) => id),
    mergeSessionResults([right], [left]).map(({ id }) => id),
  );
});
