import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCountTrials } from './count-game.ts';

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
