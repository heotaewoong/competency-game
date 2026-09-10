import assert from 'node:assert/strict';
import test from 'node:test';
import { games } from './game-data.ts';
import { evaluateRuleCheck, hasCompletedRuleCheck, RULE_CHECK_VERSION, ruleChecksByGame, upsertRuleCheckCompletion } from './game-onboarding.ts';

test('9개 게임마다 서로 다른 무점수 규칙 확인 문항 2개를 제공한다', () => {
  assert.deepEqual(Object.keys(ruleChecksByGame).sort(), games.map((game) => game.id).sort());
  const ids = new Set<string>();
  for (const game of games) {
    const items = ruleChecksByGame[game.id];
    assert.equal(items.length, 2, game.id);
    for (const item of items) {
      assert.equal(item.choices.length, 3);
      assert.ok(item.correctIndex >= 0 && item.correctIndex < item.choices.length);
      assert.ok(item.explanation.length >= 15);
      assert.equal(ids.has(item.id), false, item.id);
      ids.add(item.id);
    }
  }
});

test('규칙 확인 채점은 공개된 정답 인덱스만 통과시킨다', () => {
  for (const items of Object.values(ruleChecksByGame)) {
    for (const item of items) {
      item.choices.forEach((_, index) => {
        assert.equal(evaluateRuleCheck(item, index), index === item.correctIndex);
      });
    }
  }
});

test('완료 기록은 현재 버전과 유효한 날짜가 모두 있을 때만 인정한다', () => {
  const completedAt = '2026-09-10T01:02:03.000Z';
  const raw = upsertRuleCheckCompletion('{"other":{"keep":true}}', 'rps', completedAt);
  assert.equal(hasCompletedRuleCheck(raw, 'rps'), true);
  assert.equal(hasCompletedRuleCheck(raw, 'rotation'), false);
  assert.deepEqual(JSON.parse(raw), {
    other: { keep: true },
    rps: { version: RULE_CHECK_VERSION, completedAt },
  });
  assert.equal(hasCompletedRuleCheck('{bad json', 'rps'), false);
  assert.equal(hasCompletedRuleCheck(JSON.stringify({ rps: { version: 'old', completedAt } }), 'rps'), false);
  assert.equal(hasCompletedRuleCheck(JSON.stringify({ rps: { version: RULE_CHECK_VERSION, completedAt: 'invalid' } }), 'rps'), false);
});
