import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPotionProbabilityMap, buildPotionTrials, evaluatePotionEvidenceDecision, POTION_INGREDIENTS, POTION_RECIPE_COMBOS, recordVisiblePotionOutcome, summarizePotionPerformance } from './potion-game.ts';

test('같은 시드는 같은 마법약 시행을 만든다', () => {
  assert.deepEqual(buildPotionTrials(42, 33), buildPotionTrials(42, 33));
});

test('확률 프로필은 유지하되 세션 시드마다 레시피 배치를 바꾼다', () => {
  const first = buildPotionProbabilityMap(33);
  const same = buildPotionProbabilityMap(33);
  const different = buildPotionProbabilityMap(34);
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, different);
  assert.deepEqual(first.toSorted((a, b) => a - b), different.toSorted((a, b) => a - b));
});

test('주 점수는 실제 색 운이 아니라 누적 근거 정렬을 요약한다', () => {
  assert.deepEqual(summarizePotionPerformance({ evidenceAligned: 8, evidenceTotal: 10, outcomeHits: 4, trialCount: 10 }), {
    evidenceAccuracy: 80,
    evidenceErrors: 2,
    outcomeAccuracy: 40,
    outcomeMisses: 6,
  });
  assert.deepEqual(summarizePotionPerformance({ evidenceAligned: 0, evidenceTotal: 0, outcomeHits: 0, trialCount: 0 }), {
    evidenceAccuracy: null,
    evidenceErrors: 0,
    outcomeAccuracy: 0,
    outcomeMisses: 0,
  });
});

test('사용자에게 공개하지 않은 시간 초과 결과는 이후 근거 이력에 넣지 않는다', () => {
  const history = { '0-1': { red: 1, blue: 2 } };
  const hidden = recordVisiblePotionOutcome(history, '0-1', 'red', false);
  assert.strictEqual(hidden, history);
  assert.deepEqual(hidden, { '0-1': { red: 1, blue: 2 } });

  const visible = recordVisiblePotionOutcome(history, '0-1', 'red', true);
  assert.notStrictEqual(visible, history);
  assert.deepEqual(visible, { '0-1': { red: 2, blue: 2 } });
  assert.deepEqual(history, { '0-1': { red: 1, blue: 2 } });
});

test('누적 근거가 있는 시간 초과는 근거 판단 분모에 남고 정렬 성공으로 계산되지 않는다', () => {
  const decision = evaluatePotionEvidenceDecision({ blue: 3, red: 1 }, null, 'blue');
  assert.equal(decision.preferred, 'blue');
  assert.equal(decision.opportunity, true);
  assert.equal(decision.aligned, null);
  assert.equal(decision.evidenceTimeout, true);
  assert.equal(decision.stochasticMiss, false);
});

test('관찰 동률의 시간 초과는 아직 근거 판단 기회로 과대 계산하지 않는다', () => {
  const decision = evaluatePotionEvidenceDecision({ blue: 1, red: 1 }, null, 'red');
  assert.equal(decision.preferred, null);
  assert.equal(decision.opportunity, false);
  assert.equal(decision.evidenceTimeout, false);
});

test('14개 레시피 블록마다 각 레시피를 정확히 한 번 출제한다', () => {
  const trials = buildPotionTrials(42, 71);
  for (let offset = 0; offset < trials.length; offset += 14) {
    const recipes = trials.slice(offset, offset + 14).map((trial) => trial.recipe).toSorted((a, b) => a - b);
    assert.deepEqual(recipes, Array.from({ length: POTION_RECIPE_COMBOS.length }, (_, index) => index));
  }
});

test('레시피 번호와 재료 조합이 항상 일치한다', () => {
  for (const trial of buildPotionTrials(84, 2026)) assert.deepEqual(trial.combo, POTION_RECIPE_COMBOS[trial.recipe]);
});

test('4개 재료로 중복 없는 14개 조합을 구성한다', () => {
  assert.equal(POTION_INGREDIENTS.length, 4);
  assert.equal(POTION_RECIPE_COMBOS.length, 14);
  assert.equal(new Set(POTION_RECIPE_COMBOS.map((combo) => combo.join('-'))).size, 14);
  assert.deepEqual(
    POTION_RECIPE_COMBOS.reduce((counts, combo) => {
      counts[combo.length] = (counts[combo.length] ?? 0) + 1;
      return counts;
    }, {} as Record<number, number>),
    { 1: 4, 2: 6, 3: 4 },
  );
  assert.deepEqual(
    [...new Set(POTION_RECIPE_COMBOS.flat())].toSorted((a, b) => a - b),
    POTION_INGREDIENTS.map((_, index) => index),
  );
});

test('고정 세션에는 파란약과 빨간약 결과가 모두 포함된다', () => {
  const outcomes = new Set(buildPotionTrials(42, 2026).map((trial) => trial.outcome));
  assert.deepEqual([...outcomes].toSorted(), ['blue', 'red']);
});

test('잘못된 시행 수를 거부한다', () => {
  assert.throws(() => buildPotionTrials(0, 1), RangeError);
  assert.throws(() => buildPotionTrials(1.5, 1), RangeError);
  assert.throws(() => buildPotionTrials(10, 1, []), RangeError);
});

test('연습에서는 원하는 재료 수 조합만 집중 출제한다', () => {
  for (const size of [1, 2, 3] as const) {
    const trials = buildPotionTrials(24, 81, [size]);
    assert.ok(trials.every((trial) => trial.combo.length === size));
    assert.equal(new Set(trials.map((trial) => trial.recipe)).size, POTION_RECIPE_COMBOS.filter((combo) => combo.length === size).length);
  }
});

test('작은 레시피 풀도 블록마다 독립적인 셔플 흐름을 사용한다', () => {
  let repeatedAdjacentBlocks = 0;
  let adjacentPairs = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const recipes = buildPotionTrials(28, seed, [1]).map((trial) => trial.recipe);
    const blocks = Array.from({ length: 7 }, (_, index) => recipes.slice(index * 4, index * 4 + 4).join(','));
    for (let index = 1; index < blocks.length; index += 1) {
      adjacentPairs += 1;
      if (blocks[index] === blocks[index - 1]) repeatedAdjacentBlocks += 1;
    }
  }
  assert.ok(repeatedAdjacentBlocks / adjacentPairs < 0.08);
});
