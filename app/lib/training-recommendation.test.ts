import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameId, SessionResult } from './game-data.ts';
import { chooseTrainingRecommendation, onboardingGameOrder } from './training-recommendation.ts';

function result(gameId: GameId, completedAt: string): SessionResult {
  return { id: `${gameId}-${completedAt}`, gameId, completedAt, accuracy: 80, medianRt: 900, stability: 70, errors: 1 };
}

test('첫 방문과 미연습 게임은 쉬운 조작 순서로 추천한다', () => {
  assert.deepEqual(chooseTrainingRecommendation([], []), { gameId: 'rps', reason: 'first-session' });
  assert.deepEqual(chooseTrainingRecommendation([result('rps', '2026-09-01T00:00:00.000Z')], []), { gameId: 'number', reason: 'unpracticed' });
});

test('모든 게임을 해본 뒤에는 두 세션 이상 반복된 오류를 우선한다', () => {
  const results = onboardingGameOrder.map((gameId, index) => result(gameId, `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`));
  const recommendation = chooseTrainingRecommendation(results, [{ gameId: 'nback', label: '간격 혼동', count: 3, sessionCount: 2 }]);
  assert.equal(recommendation.gameId, 'nback');
  assert.equal(recommendation.reason, 'recurring-error');
  assert.equal(recommendation.error?.label, '간격 혼동');
});

test('한 세션의 오류는 약점으로 단정하지 않고 가장 오래 쉰 게임을 고른다', () => {
  const results = onboardingGameOrder.map((gameId, index) => result(gameId, `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`));
  const recommendation = chooseTrainingRecommendation(results, [{ gameId: 'nback', label: '간격 혼동', count: 1, sessionCount: 1 }]);
  assert.deepEqual(recommendation, { gameId: 'rps', reason: 'least-recent' });
});
