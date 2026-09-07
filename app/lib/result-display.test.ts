import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionResult } from './game-data.ts';
import { formatResultScore, resultErrorLabel, resultScoreLabel } from './result-display.ts';

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
