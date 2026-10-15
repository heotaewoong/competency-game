import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionResult } from './game-data.ts';
import { filterResultHistory, formatResultScore, getResultHistoryDates, getResultLocalDateKey, resultErrorLabel, resultScoreLabel } from './result-display.ts';

function result(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    id: 'session-1',
    gameId: 'rps',
    accuracy: 75,
    medianRt: 520,
    stability: 80,
    errors: 1,
    completedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('새 마법약 기록은 근거 점수 이름과 판정 보류 표기를 사용한다', () => {
  const potion = result({
    gameId: 'potion',
    accuracy: 0,
    detail: { scoringVersion: 'potion-evidence-v1', evidenceTrials: 0 },
  });
  assert.equal(resultScoreLabel(potion), '근거 정렬률');
  assert.equal(resultErrorLabel(potion), '근거 반대·무응답');
  assert.equal(formatResultScore(potion), '—');
});

test('이전 마법약 기록과 길 만들기 최대득점 의미를 구분한다', () => {
  const legacyPotion = result({ gameId: 'potion', accuracy: 64 });
  const path = result({ gameId: 'path', accuracy: 80 });
  assert.equal(resultScoreLabel(legacyPotion), '결과 적중률');
  assert.equal(formatResultScore(legacyPotion), '64%');
  assert.equal(resultScoreLabel(path), '첫 제출 최대득점률');
  assert.equal(resultErrorLabel(path), '첫 제출 최대득점 미달');
});

test('기록 필터는 게임과 모드의 교집합을 읽고 원본 순서·점수를 보존한다', () => {
  const sessions = [
    result({ id: 'practice', detail: { sessionMode: 'practice' } }),
    result({ id: 'simulation', detail: { sessionMode: 'simulation' } }),
    result({ id: 'number', gameId: 'number', detail: { sessionMode: '연습 모드' } }),
    result({ id: 'legacy' }),
  ];
  const before = JSON.stringify(sessions);
  assert.deepEqual(filterResultHistory(sessions, 'all', 'all'), sessions);
  assert.deepEqual(filterResultHistory(sessions, 'rps', 'practice').map(item => item.id), ['practice']);
  assert.deepEqual(filterResultHistory(sessions, 'all', 'practice').map(item => item.id), ['practice', 'number']);
  assert.deepEqual(filterResultHistory(sessions, 'rps', 'simulation').map(item => item.id), ['simulation']);
  assert.deepEqual(filterResultHistory(sessions, 'all', 'unknown').map(item => item.id), ['legacy']);
  assert.deepEqual(filterResultHistory(sessions, 'number', 'simulation'), []);
  assert.deepEqual(filterResultHistory([], 'all', 'all'), []);
  assert.equal(JSON.stringify(sessions), before);
});

test('최근 8개 밖의 오래된 기록도 필터로 찾을 수 있다', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => result({ id: `session-${index}`, gameId: index < 8 ? 'rps' : 'number' }));
  assert.deepEqual(filterResultHistory(sessions, 'number', 'all').map(item => item.id), ['session-8', 'session-9', 'session-10', 'session-11']);
});

test('완료 날짜는 오프셋 시각을 현지 자정 기준으로 분류하고 잘못된 시각은 제외한다', () => {
  const previousTimezone = process.env.TZ;
  try {
    const completedAt = ['2026-10-14T00:30:00+09:00', '2026-10-14T00:30:00-04:00', '2026-10-13T23:30:00-04:00'];
    process.env.TZ = 'Asia/Seoul';
    assert.deepEqual(completedAt.map(completedAt => getResultLocalDateKey({ completedAt })), ['2026-10-14', '2026-10-14', '2026-10-14']);
    process.env.TZ = 'America/New_York';
    assert.deepEqual(completedAt.map(completedAt => getResultLocalDateKey({ completedAt })), ['2026-10-13', '2026-10-14', '2026-10-13']);
    assert.equal(getResultLocalDateKey({ completedAt: 'invalid' }), '');
    assert.equal(getResultLocalDateKey({ completedAt: '' }), '');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('날짜 옵션은 유효한 완료 시각 최신순으로 현지일을 중복 제거하고 옛 연도와 원본을 보존한다', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const sessions = ['0999-06-01T12:00:00.000Z', '2026-10-15T00:30:00+09:00', 'invalid', '1000-06-01T12:00:00.000Z', '2026-10-14T23:30:00-04:00', '2026-10-15T02:30:00.000Z', '2026-10-14T14:00:00.000Z', ''].map((completedAt, index) => result({ id: `date-${index}`, completedAt }));
    const before = JSON.stringify(sessions);
    assert.deepEqual(getResultHistoryDates(sessions), ['2026-10-15', '2026-10-14', '1000-06-01', '999-06-01']);
    assert.deepEqual(getResultHistoryDates([]), []);
    assert.deepEqual(getResultHistoryDates([{ completedAt: '' }, { completedAt: 'invalid' }]), []);
    assert.equal(JSON.stringify(sessions), before);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('게임·모드·완료 날짜의 교집합은 원본 순서를 보존하고 전체 날짜에는 잘못된 이전 시각도 남긴다', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Seoul';
    const sessions = [
      result({ id: 'practice-late', completedAt: '2026-10-14T04:00:00.000Z', detail: { sessionMode: 'practice' } }),
      result({ id: 'number-target', gameId: 'number', completedAt: '2026-10-14T05:00:00.000Z', detail: { sessionMode: '연습 모드' } }),
      result({ id: 'legacy-target', completedAt: '2026-10-13T16:00:00.000Z' }),
      result({ id: 'simulation-target', completedAt: '2026-10-14T00:00:00.000Z', detail: { sessionMode: 'simulation' } }),
      result({ id: 'other-date', completedAt: '2026-10-12T16:00:00.000Z', detail: { sessionMode: 'practice' } }),
      result({ id: 'practice-early', completedAt: '2026-10-13T15:00:00.000Z', detail: { sessionMode: 'practice' } }),
      result({ id: 'invalid-legacy', completedAt: 'invalid' }),
    ];
    const before = JSON.stringify(sessions);
    const matched = filterResultHistory(sessions, 'rps', 'practice', '2026-10-14');
    assert.deepEqual(matched.map(item => item.id), ['practice-late', 'practice-early']);
    assert.equal(matched[0], sessions[0]);
    assert.equal(matched[1], sessions[5]);
    assert.deepEqual(filterResultHistory(sessions, 'all', 'practice', '2026-10-14').map(item => item.id), ['practice-late', 'number-target', 'practice-early']);
    assert.deepEqual(filterResultHistory(sessions, 'rps', 'simulation', '2026-10-14').map(item => item.id), ['simulation-target']);
    assert.deepEqual(filterResultHistory(sessions, 'all', 'unknown', '2026-10-14').map(item => item.id), ['legacy-target']);
    assert.deepEqual(filterResultHistory(sessions, 'all', 'unknown', '').map(item => item.id), ['legacy-target', 'invalid-legacy']);
    assert.deepEqual(filterResultHistory(sessions, 'all', 'all', ''), sessions);
    assert.deepEqual(filterResultHistory(sessions, 'number', 'simulation', '2026-10-14'), []);
    assert.equal(JSON.stringify(sessions), before);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('완료 날짜 필터는 최근 8개 밖의 오래된 날짜도 게임·모드와 함께 찾는다', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Seoul';
    const sessions = Array.from({ length: 12 }, (_, index) => result({
      id: `session-${index}`,
      gameId: index < 8 ? 'rps' : 'number',
      completedAt: index < 8 ? '2026-10-15T03:00:00.000Z' : index === 9 ? '2026-10-13T03:00:00.000Z' : '2026-10-14T03:00:00.000Z',
      detail: { sessionMode: index === 11 ? 'simulation' : 'practice' },
    }));
    const before = JSON.stringify(sessions);
    assert.deepEqual(filterResultHistory(sessions.slice(0, 8), 'number', 'practice', '2026-10-14'), []);
    assert.deepEqual(filterResultHistory(sessions, 'number', 'practice', '2026-10-14').map(item => item.id), ['session-8', 'session-10']);
    assert.deepEqual(getResultHistoryDates(sessions), ['2026-10-15', '2026-10-14', '2026-10-13']);
    assert.equal(JSON.stringify(sessions), before);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
