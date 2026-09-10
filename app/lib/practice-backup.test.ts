import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionResult } from './game-data.ts';
import { MAX_REVIEW_BYTES, MAX_ROTATION_EVENTS, REVIEW_SCHEMA_VERSION } from './review-data.ts';
import {
  MAX_PRACTICE_RESULTS_BACKUP_BYTES,
  PRACTICE_RESULTS_BACKUP_FORMAT,
  PRACTICE_RESULTS_BACKUP_VERSION,
  createPracticeResultsBackup,
  isReviewPayloadStructurallyValid,
  parsePracticeResultsBackup,
  type ParsePracticeResultsBackupResult,
} from './practice-backup.ts';

const exportedAt = '2026-09-10T01:02:03.000Z';

function session(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    id: 'session-rps-1',
    gameId: 'rps',
    completedAt: '2026-09-09T12:00:00.000Z',
    accuracy: 80,
    medianRt: 720,
    stability: 74,
    errors: 2,
    detail: { sessionMode: '연습 모드', quantity: 20 },
    ...overrides,
  };
}

function rawBackup(results: readonly unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: PRACTICE_RESULTS_BACKUP_FORMAT,
    version: PRACTICE_RESULTS_BACKUP_VERSION,
    exportedAt,
    results,
    ...overrides,
  });
}

function expectSuccess(parsed: ParsePracticeResultsBackupResult) {
  if (!parsed.ok) assert.fail(`${parsed.code}: ${parsed.message}`);
  return parsed;
}

function genericAttempt(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'generic',
    id: 'attempt-0',
    index: 0,
    status: 'error',
    errorCodes: ['rps-loss'],
    title: '1번 시도',
    prompt: '내가 이기는 패를 고르세요.',
    expected: '바위',
    selected: '가위',
    explanation: '승리 관계를 반대로 적용했습니다.',
    rtMs: 720,
    facts: { phase: 'mixed', switched: true, choices: ['가위', '바위', '보'] },
    ...overrides,
  };
}

function rotationAttempt(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'rotation',
    id: 'rotation-0',
    index: 0,
    status: 'correct',
    errorCodes: [],
    title: '알파벳 1번',
    prompt: '알파벳 F · 왼쪽 45도',
    expected: '왼쪽 45도 회전',
    selected: '왼쪽 45도 회전',
    explanation: '최소 조작으로 완성했습니다.',
    rtMs: 840,
    puzzle: {
      kind: 'letter',
      baseId: 'letter-f',
      transformId: 'turn-left-45',
      letter: 'F',
      target: [1, 0, 0, 1],
      optimal: ['left'],
    },
    submitted: ['left'],
    correction: [],
    events: [{ index: 0, action: 'start', elapsedMs: 0, chargedClicks: 0, remainingOptimal: 1, inefficient: false }],
    firstInefficientEvent: null,
    ...overrides,
  };
}

function reviewPayload(attempts: readonly unknown[] = [genericAttempt()], gameId = 'rps', overrides: Record<string, unknown> = {}) {
  return {
    version: REVIEW_SCHEMA_VERSION,
    gameId,
    attempts,
    summary: {
      attemptedCount: attempts.length,
      correctCount: 0,
      neutralCount: 0,
      reviewPointCount: attempts.length,
      errorCounts: attempts.length ? { 'rps-loss': attempts.length } : {},
      omittedDetailCount: 0,
      coverage: 'full',
    },
    ...overrides,
  };
}

function expectReviewRejected(review: unknown, gameId: SessionResult['gameId'] = 'rps') {
  assert.equal(isReviewPayloadStructurallyValid(review, gameId), false);
  const parsed = parsePracticeResultsBackup(rawBackup([{ ...session({ gameId }), review }]));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.code, '기록_항목_오류');
}

test('백업은 고정된 키 순서와 ISO 시각을 사용해 안정적인 JSON을 만든다', () => {
  const now = new Date(exportedAt);
  const left = session({ detail: { zeta: 3, alpha: '값' } });
  const right = session({ detail: { alpha: '값', zeta: 3 } });

  const first = createPracticeResultsBackup([left], now);
  const second = createPracticeResultsBackup([right], now);

  assert.equal(first, second);
  const parsed = expectSuccess(parsePracticeResultsBackup(first));
  assert.equal(parsed.format, PRACTICE_RESULTS_BACKUP_FORMAT);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.exportedAt, exportedAt);
  assert.deepEqual(parsed.results[0].detail, { alpha: '값', zeta: 3 });
});

test('손상된 JSON은 한글 오류 코드와 메시지로 거절한다', () => {
  const parsed = parsePracticeResultsBackup('{"format":');

  assert.deepEqual(parsed, {
    ok: false,
    code: 'JSON_파싱_오류',
    message: '파일이 올바른 JSON 형식이 아닙니다. 다른 파일을 선택해 주세요.',
  });
});

test('최상위 객체와 format·version·exportedAt·results를 모두 검증한다', () => {
  const cases: Array<{ value: unknown; code: string }> = [
    { value: [], code: '백업_객체_오류' },
    { value: { format: 'other', version: 1, exportedAt, results: [] }, code: '백업_형식_불일치' },
    { value: { format: PRACTICE_RESULTS_BACKUP_FORMAT, version: 2, exportedAt, results: [] }, code: '백업_버전_미지원' },
    { value: { format: PRACTICE_RESULTS_BACKUP_FORMAT, version: 1, exportedAt: '2026-99-99', results: [] }, code: '내보내기_시각_오류' },
    { value: { format: PRACTICE_RESULTS_BACKUP_FORMAT, version: 1, exportedAt, results: {} }, code: '기록_배열_오류' },
  ];

  cases.forEach(({ value, code }) => {
    const parsed = parsePracticeResultsBackup(JSON.stringify(value));
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.code, code);
      assert.ok(parsed.message.length > 0);
    }
  });
});

test('UTF-8 기준 5MB를 넘는 파일은 JSON 파싱 전에 거절한다', () => {
  const oversizedMultibyte = '가'.repeat(Math.floor(MAX_PRACTICE_RESULTS_BACKUP_BYTES / 3) + 1);
  assert.ok(oversizedMultibyte.length < MAX_PRACTICE_RESULTS_BACKUP_BYTES);

  const parsed = parsePracticeResultsBackup(oversizedMultibyte);

  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.code, '파일_크기_초과');
});

test('잘못된 detail이 하나라도 섞이면 유효한 기록까지 포함해 전체를 거절한다', () => {
  const valid = session({ id: 'valid' });
  const invalid = { ...session({ id: 'invalid' }), detail: { nested: { value: 1 }, flag: true } };

  const parsed = parsePracticeResultsBackup(rawBackup([valid, invalid]));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.code, '기록_항목_오류');
    assert.match(parsed.message, /2번째/);
  }
  assert.equal('results' in parsed, false, '부분 가져오기 결과를 노출하지 않는다');
});

test('review 속 손상된 시도 하나라도 섞이면 파일 전체를 거절한다', () => {
  const invalidReview = {
    ...session(),
    review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts: [null], summary: {} },
  };

  const parsed = parsePracticeResultsBackup(rawBackup([invalidReview]));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.code, '기록_항목_오류');
});

test('엄격 review 검증기는 정상 일반·회전 시도를 보존한 채 통과시킨다', () => {
  const generic = reviewPayload();
  const rotation = reviewPayload([rotationAttempt()], 'rotation', {
    summary: {
      attemptedCount: 1,
      correctCount: 1,
      neutralCount: 0,
      reviewPointCount: 0,
      errorCounts: {},
      omittedDetailCount: 0,
      coverage: 'full',
    },
  });

  assert.equal(isReviewPayloadStructurallyValid(generic, 'rps'), true);
  assert.equal(isReviewPayloadStructurallyValid(rotation, 'rotation'), true);
  const genericParsed = expectSuccess(parsePracticeResultsBackup(rawBackup([{ ...session(), review: generic }])));
  const rotationParsed = expectSuccess(parsePracticeResultsBackup(rawBackup([{ ...session({ gameId: 'rotation' }), review: rotation }])));
  assert.deepEqual(genericParsed.results[0].review?.attempts[0], genericAttempt());
  assert.equal(rotationParsed.results[0].review?.attempts[0]?.kind, 'rotation');
});

test('일반 review 시도의 필수 필드 타입·길이·허용 키가 하나라도 틀리면 전체를 거절한다', () => {
  const malformedAttempts = [
    genericAttempt({ id: { nested: true } }),
    genericAttempt({ index: '0' }),
    genericAttempt({ status: 'unknown' }),
    genericAttempt({ errorCodes: [42] }),
    genericAttempt({ errorCodes: Array.from({ length: 9 }, (_, index) => `error-${index}`) }),
    genericAttempt({ title: null }),
    genericAttempt({ prompt: { text: '문제' } }),
    genericAttempt({ rtMs: '720' }),
    genericAttempt({ scored: true }),
    genericAttempt({ title: '가'.repeat(501) }),
    genericAttempt({ facts: { nested: { value: 1 } } }),
    genericAttempt({ facts: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`key-${index}`, index])) }),
    genericAttempt({ facts: { long: '가'.repeat(301) } }),
    genericAttempt({ unknownField: 'future' }),
  ];

  malformedAttempts.forEach((attempt) => expectReviewRejected(reviewPayload([attempt])));
});

test('review 전체가 24KiB를 넘으면 개별 필드가 정상이어도 전체를 거절한다', () => {
  const attempts = Array.from({ length: 60 }, (_, index) => genericAttempt({
    id: `attempt-${index}`,
    index,
    title: `시도 ${index} ${'가'.repeat(480)}`,
    prompt: '나'.repeat(500),
  }));
  const oversized = reviewPayload(attempts, 'rps', {
    summary: {
      attemptedCount: 60,
      correctCount: 0,
      neutralCount: 0,
      reviewPointCount: 60,
      errorCounts: { 'rps-loss': 60 },
      omittedDetailCount: 0,
      coverage: 'full',
    },
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength > MAX_REVIEW_BYTES);

  expectReviewRejected(oversized);
});

test('회전 review의 퍼즐·조작·이벤트 내부 손상을 모두 거절한다', () => {
  const basePuzzle = rotationAttempt().puzzle as Record<string, unknown>;
  const baseEvent = (rotationAttempt().events as Array<Record<string, unknown>>)[0];
  const invalidRotationAttempts = [
    rotationAttempt({ puzzle: { ...basePuzzle, transformId: 'future-transform' } }),
    rotationAttempt({ puzzle: { ...basePuzzle, target: [1, 0, 0] } }),
    rotationAttempt({ puzzle: { ...basePuzzle, pattern: [0, 2], letter: undefined } }),
    rotationAttempt({ submitted: ['spin'] }),
    rotationAttempt({ correction: Array.from({ length: 9 }, () => 'left') }),
    rotationAttempt({ events: [{ ...baseEvent, action: 'future-action' }] }),
    rotationAttempt({ events: [{ ...baseEvent, elapsedMs: '0' }] }),
    rotationAttempt({ events: [{ ...baseEvent, unknownField: true }] }),
    rotationAttempt({ events: Array.from({ length: MAX_ROTATION_EVENTS + 1 }, (_, index) => ({ ...baseEvent, index })) }),
    rotationAttempt({ firstInefficientEvent: 'none' }),
    rotationAttempt({ phaseEnded: false }),
  ];

  invalidRotationAttempts.forEach((attempt) => expectReviewRejected(reviewPayload([attempt], 'rotation'), 'rotation'));
});

test('현재 review 요약은 완전한 타입 구조만 허용하고 v1 빈 요약 호환은 유지한다', () => {
  const valid = reviewPayload();
  const summary = valid.summary as Record<string, unknown>;
  const missingCoverage = { ...summary };
  delete missingCoverage.coverage;
  const invalidSummaries = [
    missingCoverage,
    { ...summary, attemptedCount: '1' },
    { ...summary, errorCounts: { 'rps-loss': '1' } },
    { ...summary, coverage: 'unknown' },
    { ...summary, futureField: true },
  ];

  invalidSummaries.forEach((invalidSummary) => expectReviewRejected(reviewPayload(undefined, 'rps', { summary: invalidSummary })));
  assert.equal(isReviewPayloadStructurallyValid({ version: 1, gameId: 'rps', attempts: [], summary: {} }, 'rps'), true);
});

test('앱 상태에 review undefined 필드가 남아도 백업에서는 없는 필드로 처리한다', () => {
  const json = createPracticeResultsBackup([session({ review: undefined })], new Date(exportedAt));
  const parsed = expectSuccess(parsePracticeResultsBackup(json));

  assert.equal(Object.hasOwn(parsed.results[0], 'review'), false);
});

test('저장 상한을 넘는 101개 백업은 조용히 자르지 않고 전체를 거절한다', () => {
  const results = Array.from({ length: 101 }, (_, index) => session({ id: `session-${index}` }));
  const parsed = parsePracticeResultsBackup(rawBackup(results));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.code, '기록_개수_초과');
});

test('중복 ID는 mergeSessionResults 규칙대로 첫 기록을 유지하고 하나로 병합한다', () => {
  const first = session({ id: 'duplicate', accuracy: 91, completedAt: '2026-09-09T12:00:00.000Z' });
  const duplicate = session({ id: 'duplicate', accuracy: 12, completedAt: '2026-09-10T12:00:00.000Z' });

  const parsed = expectSuccess(parsePracticeResultsBackup(rawBackup([first, duplicate])));

  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0].accuracy, 91);
  assert.equal(parsed.results[0].completedAt, first.completedAt);
});

test('점수는 0~100으로 제한하고 반응 시간·오류는 0 이상 정수로 정규화한다', () => {
  const raw = session({
    accuracy: 140.6,
    medianRt: -22.8,
    stability: -3.4,
    errors: 2.6,
  });

  const parsed = expectSuccess(parsePracticeResultsBackup(rawBackup([raw])));

  assert.deepEqual(
    {
      accuracy: parsed.results[0].accuracy,
      medianRt: parsed.results[0].medianRt,
      stability: parsed.results[0].stability,
      errors: parsed.results[0].errors,
    },
    { accuracy: 100, medianRt: 0, stability: 0, errors: 3 },
  );
});

test('미래 review 버전이 하나라도 있으면 파일 전체를 거절한다', () => {
  const futureReview = {
    ...session({ id: 'future-review' }),
    review: { version: REVIEW_SCHEMA_VERSION + 1, gameId: 'rps', attempts: [], summary: {} },
  };

  const parsed = parsePracticeResultsBackup(rawBackup([session({ id: 'valid' }), futureReview]));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.code, '복습_버전_미지원');
    assert.match(parsed.message, /2번째/);
  }
});

test('구버전 review는 sanitizeReviewPayload로 현재 스키마로 정규화한다', () => {
  const legacyReview = {
    ...session(),
    review: { version: 1, gameId: 'rps', attempts: [], summary: {} },
  };

  const parsed = expectSuccess(parsePracticeResultsBackup(rawBackup([legacyReview])));

  assert.equal(parsed.results[0].review?.version, REVIEW_SCHEMA_VERSION);
  assert.equal(parsed.results[0].review?.gameId, 'rps');
  assert.equal(parsed.results[0].review?.summary.coverage, 'legacy-unknown');
});

test('세션과 review의 게임이 다르거나 필수 필드가 손상되면 전체를 거절한다', () => {
  const mismatchedReview = {
    ...session(),
    review: { version: REVIEW_SCHEMA_VERSION, gameId: 'nback', attempts: [], summary: {} },
  };
  const missingMetric = { ...session({ id: 'missing-metric' }), accuracy: null };

  for (const value of [mismatchedReview, missingMetric]) {
    const parsed = parsePracticeResultsBackup(rawBackup([value]));
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.code, '기록_항목_오류');
  }
});

test('잘못된 백업 생성 시각은 JSON을 만들지 않고 명시적으로 실패한다', () => {
  assert.throws(
    () => createPracticeResultsBackup([session()], new Date(Number.NaN)),
    { name: 'RangeError', message: '백업 생성 시각이 올바른 날짜가 아닙니다.' },
  );
});
