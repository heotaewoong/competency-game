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
  const error = { gameId: 'nback' as const, label: '간격 혼동', count: 3, sessionCount: 2, errorCode: 'wrong-lag', representativeSessionId: 'nback:latest[error]' };
  const recommendation = chooseTrainingRecommendation(results, [error]);
  assert.equal(recommendation.gameId, 'nback');
  assert.equal(recommendation.reason, 'recurring-error');
  assert.equal(recommendation.error?.label, '간격 혼동');
  assert.equal(recommendation.error, error);
  assert.equal(recommendation.error?.errorCode, 'wrong-lag');
  assert.equal(recommendation.error?.representativeSessionId, 'nback:latest[error]');
});

test('한 세션의 오류는 약점으로 단정하지 않고 가장 오래 쉰 게임을 고른다', () => {
  const results = onboardingGameOrder.map((gameId, index) => result(gameId, `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`));
  const recommendation = chooseTrainingRecommendation(results, [{ gameId: 'nback', label: '간격 혼동', count: 1, sessionCount: 1, errorCode: 'wrong-lag', representativeSessionId: 'single-session' }]);
  assert.deepEqual(recommendation, { gameId: 'rps', reason: 'least-recent' });
});

test('반복 오류가 있어도 미연습 게임 추천에는 다른 세션의 복습 대상을 붙이지 않는다', () => {
  const recommendation = chooseTrainingRecommendation([result('rps', '2026-09-01T00:00:00.000Z')], [{
    gameId: 'rps', label: '관점 혼동', count: 3, sessionCount: 2, errorCode: 'perspective', representativeSessionId: 'rps-recurring',
  }]);
  assert.deepEqual(recommendation, { gameId: 'number', reason: 'unpracticed' });
});
