import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRpsTrials } from './rps-game.ts';

test('같은 시드는 같은 가위바위보 문항을 만든다', () => {
  assert.deepEqual(buildRpsTrials(15, 20260829), buildRpsTrials(15, 20260829));
  assert.notDeepEqual(buildRpsTrials(15, 20260829), buildRpsTrials(15, 20260830));
});

test('모든 세션에 세 패가 나오고 혼합 단계에는 두 관점이 모두 나온다', () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const trials = buildRpsTrials(15, seed);
    assert.deepEqual(new Set(trials.map((trial) => trial.shown)), new Set(['scissors', 'rock', 'paper']));
    const mixed = trials.filter((trial) => trial.phase === '관점 혼합');
    assert.deepEqual(new Set(mixed.map((trial) => trial.unknown)), new Set(['player', 'opponent']));
  }
});

test('물음표 위치에 맞는 이기는 관계를 정답으로 만든다', () => {
  const losesTo = { scissors: 'rock', rock: 'paper', paper: 'scissors' } as const;
  const beats = { scissors: 'paper', rock: 'scissors', paper: 'rock' } as const;
  for (const trial of buildRpsTrials(30, 77)) {
    assert.equal(trial.answer, trial.unknown === 'player' ? losesTo[trial.shown] : beats[trial.shown]);
  }
});

test('잘못된 문항 수를 거부한다', () => {
  assert.throws(() => buildRpsTrials(2, 1), RangeError);
});
