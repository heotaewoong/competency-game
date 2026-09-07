import assert from 'node:assert/strict';
import test from 'node:test';
import { games } from './game-data.ts';
import { strategyGuides } from './strategy-guide.ts';

test('9개 게임은 각각 하나의 완성된 전략 가이드를 가진다', () => {
  assert.equal(strategyGuides.length, games.length);
  assert.deepEqual(new Set(strategyGuides.map((guide) => guide.gameId)), new Set(games.map((game) => game.id)));
  assert.equal(new Set(strategyGuides.map((guide) => guide.gameId)).size, strategyGuides.length);
});

test('모든 가이드는 판단 순서·예시·팁·실수·3단계 훈련을 포함한다', () => {
  for (const guide of strategyGuides) {
    assert.ok(guide.oneLine.trim().length > 0, `${guide.gameId}: 한 줄 전략`);
    assert.ok(guide.decisionOrder.length >= 3, `${guide.gameId}: 판단 순서`);
    assert.ok(guide.example.title.trim().length > 0, `${guide.gameId}: 예시 제목`);
    assert.ok(guide.example.situation.trim().length > 0, `${guide.gameId}: 예시 상황`);
    assert.ok(guide.example.answer.trim().length > 0, `${guide.gameId}: 예시 정답`);
    assert.ok(guide.example.reason.trim().length > 0, `${guide.gameId}: 예시 근거`);
    assert.ok(guide.tips.length >= 3, `${guide.gameId}: 핵심 팁`);
    assert.ok(guide.mistakes.length >= 2, `${guide.gameId}: 흔한 실수`);
    assert.equal(guide.drills.length, 3, `${guide.gameId}: 훈련 3단계`);
    for (const item of [...guide.tips, ...guide.mistakes, ...guide.drills]) {
      assert.ok(item.title.trim().length > 0 && item.body.trim().length > 0, `${guide.gameId}: 빈 가이드 항목 금지`);
    }
  }
});
