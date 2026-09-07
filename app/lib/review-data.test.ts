import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_REVIEW_ATTEMPTS,
  MAX_REVIEW_BYTES,
  aggregateReviewErrors,
  compactReviewPayload,
  getReviewAggregationContext,
  hasReviewData,
  replayRotationEvents,
  reviewPayloadBytes,
  rotationActionLabel,
  sanitizeReviewPayload,
  type GenericReviewAttempt,
  type RotationReviewAttempt,
} from './review-data.ts';
import { SIMULATION_PRESET_VERSION } from './result-comparison.ts';

test('채점 응답이 없어도 열린 문제 상세가 있으면 복습 가능한 기록이다', () => {
  const payload = compactReviewPayload('rotation', [{
    kind: 'rotation', scored: false, id: 'phase-end', index: 0, status: 'neutral', errorCodes: [],
    title: '구간 종료 문제', prompt: '제출 전 종료', expected: '목표', selected: '미제출', explanation: '구간 종료',
    phaseEnded: true,
    puzzle: { kind: 'letter', baseId: 'phase-end', letter: 'F', target: [1, 0, 0, 1], optimal: [] },
    submitted: [], correction: [], events: [], firstInefficientEvent: null,
  }]);
  assert.equal(payload.summary.attemptedCount, 0);
  assert.equal(payload.attempts.length, 1);
  assert.equal(hasReviewData(payload), true);
});

function generic(index: number, errorCodes: string[]): GenericReviewAttempt {
  return {
    kind: 'generic',
    id: `attempt-${index}`,
    index,
    status: errorCodes.length ? 'error' : 'correct',
    errorCodes,
    title: `${index + 1}번`,
    prompt: '문제',
    expected: '정답',
    selected: errorCodes.length ? '오답' : '정답',
    explanation: '판정 근거',
  };
}

const simulationDetail = { sessionMode: '실전형 연습', quantity: 40, paceMs: 1000, simulationPresetVersion: SIMULATION_PRESET_VERSION } as const;
const nbackSimulationDetail = { ...simulationDetail, nbackTask: '2-back → 2·3-back', nbackGroupSetting: 'simulation-preset', nbackProgression: '고정' } as const;

test('구버전·손상된 복습 데이터는 조용히 무시한다', () => {
  assert.equal(sanitizeReviewPayload(undefined), undefined);
  assert.equal(sanitizeReviewPayload({ version: 0, gameId: 'rps', attempts: [] }), undefined);
  assert.equal(sanitizeReviewPayload({ version: 1, gameId: 'unknown', attempts: [] }), undefined);
});

test('복습 시도 수를 제한해 브라우저 저장량을 통제한다', () => {
  const payload = compactReviewPayload('rps', Array.from({ length: MAX_REVIEW_ATTEMPTS + 12 }, (_, index) => generic(index, [])));
  assert.equal(payload.attempts.length, MAX_REVIEW_ATTEMPTS);
  assert.equal(payload.attempts[0]?.index, 12);
  assert.equal(payload.attempts.at(-1)?.index, MAX_REVIEW_ATTEMPTS + 11);
  assert.equal(payload.summary.attemptedCount, MAX_REVIEW_ATTEMPTS + 12);
  assert.equal(payload.summary.omittedDetailCount, 12);
});

test('상세를 잘라도 전체 오류 집계와 24KiB 상한은 유지한다', () => {
  const attempts = Array.from({ length: 100 }, (_, index) => ({
    ...generic(index, ['nback-wrong-lag']),
    explanation: `긴 복습 설명 ${index} `.repeat(80),
  }));
  const payload = compactReviewPayload('nback', attempts);
  assert.ok(reviewPayloadBytes(payload) <= MAX_REVIEW_BYTES);
  assert.ok(payload.attempts.length < attempts.length);
  assert.equal(payload.summary.errorCounts['nback-wrong-lag'], 100);
  assert.equal(payload.summary.reviewPointCount, 100);
  assert.equal(payload.summary.coverage, 'sampled');
});

test('반복 오류는 횟수·세션 수·최근 시각 순으로 집계한다', () => {
  const sessions = [
    { id: 'nback-1', gameId: 'nback' as const, completedAt: '2026-08-28T10:00:00.000Z', detail: nbackSimulationDetail, review: compactReviewPayload('nback', [generic(0, ['nback-wrong-lag']), generic(1, ['nback-miss'])]) },
    { id: 'nback-2', gameId: 'nback' as const, completedAt: '2026-08-29T10:00:00.000Z', detail: nbackSimulationDetail, review: compactReviewPayload('nback', [generic(0, ['nback-wrong-lag']), generic(1, ['nback-wrong-lag'])]) },
    { id: 'count-1', gameId: 'count' as const, completedAt: '2026-08-29T11:00:00.000Z', detail: simulationDetail, review: compactReviewPayload('count', [generic(0, ['count-side'])]) },
  ];
  const summaries = aggregateReviewErrors(sessions);
  assert.equal(summaries[0].errorCode, 'nback-wrong-lag');
  assert.equal(summaries[0].count, 3);
  assert.equal(summaries[0].attemptedCount, 4);
  assert.equal(summaries[0].rate, 75);
  assert.equal(summaries[0].sessionCount, 2);
  assert.equal(summaries[0].lastSeen, '2026-08-29T10:00:00.000Z');
  assert.deepEqual(aggregateReviewErrors(sessions, 'count').map((item) => item.errorCode), ['count-side']);
});

test('게임 간 반복 오류는 단순 문항 수보다 반복 세션과 오류율을 우선한다', () => {
  const manyNbackAttempts = Array.from({ length: 100 }, (_, index) => generic(index, index < 10 ? ['nback-miss'] : []));
  const sessions = [
    { id: 'nback-1', gameId: 'nback' as const, completedAt: '2026-08-30T10:00:00.000Z', detail: nbackSimulationDetail, review: compactReviewPayload('nback', manyNbackAttempts) },
    { id: 'count-1', gameId: 'count' as const, completedAt: '2026-08-30T11:00:00.000Z', detail: simulationDetail, review: compactReviewPayload('count', [generic(0, ['count-side']), generic(1, [])]) },
    { id: 'count-2', gameId: 'count' as const, completedAt: '2026-08-31T11:00:00.000Z', detail: simulationDetail, review: compactReviewPayload('count', [generic(0, ['count-side']), generic(1, [])]) },
  ];
  const summaries = aggregateReviewErrors(sessions);
  assert.equal(summaries[0].errorCode, 'count-side');
  assert.equal(summaries[0].sessionCount, 2);
  assert.equal(summaries[0].attemptedCount, 4);
  assert.equal(summaries[0].rate, 50);
  assert.equal(summaries[1].errorCode, 'nback-miss');
  assert.equal(summaries[1].attemptedCount, 100);
  assert.equal(summaries[1].rate, 10);
});

test('한 시도에 중복된 오류 코드는 집계에서 한 번만 센다', () => {
  const sessions = [{
    id: 'mouse-1',
    gameId: 'mouse' as const,
    completedAt: '2026-08-29T10:00:00.000Z',
    detail: simulationDetail,
    review: compactReviewPayload('mouse', [generic(0, ['mouse-miss', 'mouse-miss', 'mouse-overconfidence'])]),
  }];
  const summaries = aggregateReviewErrors(sessions);
  assert.equal(summaries.find((item) => item.errorCode === 'mouse-miss')?.count, 1);
  assert.equal(summaries.find((item) => item.errorCode === 'mouse-overconfidence')?.count, 1);
});

test('기본 집계는 게임별 최신 비교 문맥만 사용한다', () => {
  const sessions = [
    { id: 'practice-old', gameId: 'count' as const, completedAt: '2026-08-30T10:00:00.000Z', detail: { sessionMode: '연습 모드', quantity: 20, paceMs: 1000, practiceFocus: 'foundation', guidedPacing: '설정 제한시간 적용' }, review: compactReviewPayload('count', [generic(0, ['count-side'])]) },
    { id: 'simulation-new', gameId: 'count' as const, completedAt: '2026-08-31T10:00:00.000Z', detail: simulationDetail, review: compactReviewPayload('count', [generic(0, ['count-side']), generic(1, [])]) },
  ];
  const summaries = aggregateReviewErrors(sessions);
  assert.equal(summaries[0]?.count, 1);
  assert.equal(summaries[0]?.attemptedCount, 2);
  assert.equal(summaries[0]?.representativeSessionId, 'simulation-new');
  assert.match(summaries[0]?.contextLabel ?? '', /실전형/);
});

test('동일 연습 설정은 합치고 속도나 집중 유형이 다른 기록은 분리한다', () => {
  const base = { sessionMode: '연습 모드', quantity: 20, paceMs: 1000, practiceFocus: 'foundation', guidedPacing: '설정 제한시간 적용' };
  const sessions = [
    { id: 'same-1', gameId: 'count' as const, completedAt: '2026-08-29T10:00:00.000Z', detail: base, review: compactReviewPayload('count', [generic(0, ['count-side']), generic(1, [])]) },
    { id: 'other', gameId: 'count' as const, completedAt: '2026-08-30T10:00:00.000Z', detail: { ...base, paceMs: 1500 }, review: compactReviewPayload('count', [generic(0, ['count-side'])]) },
    { id: 'same-2', gameId: 'count' as const, completedAt: '2026-08-31T10:00:00.000Z', detail: base, review: compactReviewPayload('count', [generic(0, ['count-side']), generic(1, [])]) },
  ];
  const summaries = aggregateReviewErrors(sessions, 'count');
  assert.equal(summaries[0]?.count, 2);
  assert.equal(summaries[0]?.attemptedCount, 4);
  assert.equal(summaries[0]?.sessionCount, 2);
});

test('설정이 없는 이전 기록과 탭 이탈 기록은 서로 합치지 않는다', () => {
  const legacyA = { id: 'legacy-a', gameId: 'rps' as const, completedAt: '2026-08-29T10:00:00.000Z', review: compactReviewPayload('rps', [generic(0, ['rps-loss'])]) };
  const legacyB = { id: 'legacy-b', gameId: 'rps' as const, completedAt: '2026-08-30T10:00:00.000Z', review: compactReviewPayload('rps', [generic(0, ['rps-loss'])]) };
  const interrupted = { id: 'paused', gameId: 'rps' as const, completedAt: '2026-08-31T10:00:00.000Z', detail: { sessionMode: '연습 모드', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용', visibilityPauses: 1 }, review: compactReviewPayload('rps', [generic(0, ['rps-loss'])]) };
  assert.notEqual(getReviewAggregationContext(legacyA).key, getReviewAggregationContext(legacyB).key);
  assert.equal(getReviewAggregationContext(interrupted).comparable, false);
  const summaries = aggregateReviewErrors([legacyA, legacyB, interrupted], 'rps');
  assert.equal(summaries[0]?.count, 1);
  assert.match(summaries[0]?.contextLabel ?? '', /비교 제외/);
});

test('도형 회전은 undo·reset을 포함한 클릭별 상태를 보존한다', () => {
  const attempt: RotationReviewAttempt = {
    kind: 'rotation',
    id: 'rotation-1',
    index: 0,
    status: 'error',
    errorCodes: ['rotation-editing'],
    title: '1번 시도',
    prompt: '알파벳 R',
    expected: '↻',
    selected: '입력 없음',
    explanation: '초기화 뒤 답안을 제출했습니다.',
    puzzle: { kind: 'letter', baseId: 'letter-R', transformId: 'turn-right-90', letter: 'R', target: [0, 1, -1, 0], optimal: ['right', 'right'] },
    submitted: [],
    correction: ['right', 'right'],
    firstInefficientEvent: 2,
    events: [
      { index: 0, action: 'start', elapsedMs: 0, chargedClicks: 0, remainingOptimal: 2, inefficient: false },
      { index: 1, action: 'right', elapsedMs: 300, chargedClicks: 1, remainingOptimal: 1, inefficient: false },
      { index: 2, action: 'undo', elapsedMs: 600, chargedClicks: 2, remainingOptimal: 2, inefficient: true },
      { index: 3, action: 'reset', elapsedMs: 800, chargedClicks: 3, remainingOptimal: 2, inefficient: true },
    ],
  };
  const restored = sanitizeReviewPayload(compactReviewPayload('rotation', [attempt]));
  assert.equal(restored?.attempts[0].kind, 'rotation');
  if (restored?.attempts[0].kind !== 'rotation') throw new Error('회전 복습 데이터가 아닙니다.');
  assert.deepEqual(restored.attempts[0].events.map((event) => event.action), ['start', 'right', 'undo', 'reset']);
  assert.equal(restored.attempts[0].puzzle.transformId, 'turn-right-90');
  assert.deepEqual(replayRotationEvents(restored.attempts[0].events), [[], ['right'], [], []]);
  assert.equal(rotationActionLabel(restored.attempts[0].events[2].action), '마지막 조작 지움');

  const phaseEndPayload = sanitizeReviewPayload(compactReviewPayload('rotation', [{
    ...attempt,
    id: 'rotation-phase-end',
    status: 'neutral',
    errorCodes: [],
    phaseEnded: true,
    scored: false,
  }]));
  assert.equal(phaseEndPayload?.attempts[0].kind === 'rotation' && phaseEndPayload.attempts[0].phaseEnded, true);
  assert.equal(phaseEndPayload?.attempts[0].scored, false);
  assert.equal(phaseEndPayload?.summary.attemptedCount, 0);
  assert.equal(phaseEndPayload?.summary.neutralCount, 0);
  assert.equal(phaseEndPayload?.summary.reviewPointCount, 0);
  assert.deepEqual(phaseEndPayload?.summary.errorCounts, {});

  const scoredPhaseEndPayload = sanitizeReviewPayload(compactReviewPayload('rotation', [{
    ...attempt,
    id: 'rotation-phase-end-timeout',
    status: 'error',
    errorCodes: ['timeout'],
    phaseEnded: true,
  }]));
  assert.equal(scoredPhaseEndPayload?.attempts[0].kind === 'rotation' && scoredPhaseEndPayload.attempts[0].phaseEnded, true);
  assert.equal(scoredPhaseEndPayload?.attempts[0].scored, undefined);
  assert.equal(scoredPhaseEndPayload?.summary.attemptedCount, 1);
  assert.equal(scoredPhaseEndPayload?.summary.reviewPointCount, 1);
  assert.deepEqual(scoredPhaseEndPayload?.summary.errorCounts, { timeout: 1 });
});

test('복습 전용 문맥은 상세에는 남지만 정답률·오류율 분모에는 포함하지 않는다', () => {
  const contextualAttempt: GenericReviewAttempt = {
    ...generic(1, ['timeout']),
    id: 'context-only',
    scored: false,
    status: 'neutral',
  };
  const payload = compactReviewPayload('rps', [generic(0, ['rps-loss']), contextualAttempt]);
  assert.equal(payload.attempts.length, 2);
  assert.equal(payload.summary.attemptedCount, 1);
  assert.equal(payload.summary.reviewPointCount, 1);
  assert.deepEqual(payload.summary.errorCounts, { 'rps-loss': 1 });
});
