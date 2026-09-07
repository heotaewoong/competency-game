import assert from 'node:assert/strict';
import test from 'node:test';
import { MOUSE_DECISION_OPTIONS, buildMouseTrials, validateMouseTrials } from './mouse-game.ts';

test('1~8 응답키는 놓쳤다에서 찾았다 방향으로 대칭적인 확신도를 가진다', () => {
  assert.deepEqual(MOUSE_DECISION_OPTIONS.map(({ key }) => key), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(MOUSE_DECISION_OPTIONS.map(({ caught }) => caught), [false, false, false, false, true, true, true, true]);
  assert.deepEqual(MOUSE_DECISION_OPTIONS.map(({ confidence }) => confidence), [4, 3, 2, 1, 1, 2, 3, 4]);
});

test('같은 시드는 같은 고양이 라운드를 만든다', () => {
  assert.deepEqual(buildMouseTrials(20, 20260829), buildMouseTrials(20, 20260829));
  assert.notDeepEqual(buildMouseTrials(20, 20260829), buildMouseTrials(20, 20260830));
});

test('빨강·파랑 정답 네 조합을 균형 있게 출제한다', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const trials = buildMouseTrials(20, seed);
    const counts = new Map<string, number>();
    for (const trial of trials) {
      const key = `${trial.redCaught}-${trial.blueCaught}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.deepEqual([...counts.values()].sort((a, b) => a - b), [5, 5, 5, 5]);
    assert.deepEqual(validateMouseTrials(trials), []);
  }
});

test('진행할수록 생쥐와 고양이 수가 함께 늘어난다', () => {
  const trials = buildMouseTrials(20, 51);
  assert.equal(trials[0].mice.length, 6);
  assert.equal(trials.at(-1)?.mice.length, 10);
  assert.ok(trials.every((trial, index) => index === 0 || trial.mice.length >= trials[index - 1].mice.length));
  assert.ok(trials.every((trial) => trial.cats.length + 2 === trial.mice.length));
});

test('빨강의 반대가 항상 파랑 정답인 누출 패턴을 제거한다', () => {
  const trials = buildMouseTrials(40, 91);
  assert.ok(trials.some((trial) => trial.redCaught === trial.blueCaught));
  assert.ok(trials.some((trial) => trial.redCaught !== trial.blueCaught));
});

test('잘못된 라운드 수를 거부한다', () => {
  assert.throws(() => buildMouseTrials(0, 1), RangeError);
});

test('연습 부하 설정은 기초 6~7개와 고부하 9~10개로 나눈다', () => {
  const foundation = buildMouseTrials(20, 28, 'foundation');
  const challenge = buildMouseTrials(20, 28, 'challenge');
  assert.ok(foundation.every((trial) => trial.mice.length >= 6 && trial.mice.length <= 7));
  assert.ok(challenge.every((trial) => trial.mice.length >= 9 && trial.mice.length <= 10));
  assert.deepEqual(validateMouseTrials(foundation), []);
  assert.deepEqual(validateMouseTrials(challenge), []);
});
