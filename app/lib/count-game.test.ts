import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNT_WORD_PAIRS, buildCountTrials } from './count-game.ts';

test('의미 방해자극은 공식 문항을 복제하지 않은 독자 상반어 네 쌍이다', () => {
  assert.deepEqual(COUNT_WORD_PAIRS, [
    ['성공', '실패'],
    ['안전', '위험'],
    ['칭찬', '비난'],
    ['기쁨', '슬픔'],
  ]);
  assert.equal(new Set(COUNT_WORD_PAIRS.flat()).size, COUNT_WORD_PAIRS.length * 2);
});

test('같은 시드는 같은 개수 비교 문항을 만든다', () => {
  assert.deepEqual(buildCountTrials(20, 20260829), buildCountTrials(20, 20260829));
  assert.notDeepEqual(buildCountTrials(20, 20260829), buildCountTrials(20, 20260830));
});

test('뒤로 갈수록 개수는 늘고 차이는 가까워진다', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const trials = buildCountTrials(20, seed);
    const early = trials.slice(0, 5);
    const late = trials.slice(-5);
    const meanTotal = (items: typeof trials) => items.reduce((sum, trial) => sum + trial.left + trial.right, 0) / items.length;
    const meanGap = (items: typeof trials) => items.reduce((sum, trial) => sum + Math.abs(trial.left - trial.right), 0) / items.length;
    assert.ok(meanTotal(late) > meanTotal(early));
    assert.ok(meanGap(late) < meanGap(early));
    assert.ok(trials.every((trial) => trial.left !== trial.right));
  }
});

test('잘못된 문항 수를 거부한다', () => {
  assert.throws(() => buildCountTrials(0, 1), RangeError);
});

test('기초 집중은 개수 차이가 크고 정밀 집중은 차이가 작다', () => {
  const foundation = buildCountTrials(30, 44, 'foundation');
  const precision = buildCountTrials(30, 44, 'precision');
  const meanGap = (items: typeof foundation) => items.reduce((sum, trial) => sum + Math.abs(trial.left - trial.right), 0) / items.length;
  assert.ok(meanGap(foundation) > meanGap(precision));
  assert.ok(Math.max(...precision.map((trial) => Math.abs(trial.left - trial.right))) <= 4);
});

test('정답 방향은 모든 시드에서 좌우 차이가 최대 1문항이다', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    for (const quantity of [1, 2, 3, 10, 39, 40]) {
      const trials = buildCountTrials(quantity, seed);
      const left = trials.filter((trial) => trial.left > trial.right).length;
      assert.ok(Math.abs(left - (quantity - left)) <= 1, `seed=${seed}, quantity=${quantity}`);
    }
  }
});
