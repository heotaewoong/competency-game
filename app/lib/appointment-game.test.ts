import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppointmentTrials, validateAppointmentTrial } from './appointment-game.ts';

test('같은 시드는 같은 약속 문항을 만든다', () => {
  assert.deepEqual(buildAppointmentTrials(20, 20260829), buildAppointmentTrials(20, 20260829));
  assert.notDeepEqual(buildAppointmentTrials(20, 20260829), buildAppointmentTrials(20, 20260830));
});

test('네 유형을 균형 출제하고 모든 정답 불변식을 지킨다', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const trials = buildAppointmentTrials(40, seed);
    const counts = new Map<string, number>();
    for (const trial of trials) {
      counts.set(trial.kind, (counts.get(trial.kind) ?? 0) + 1);
      assert.deepEqual(validateAppointmentTrial(trial), []);
    }
    assert.deepEqual([...counts.values()].sort((a, b) => a - b), [10, 10, 10, 10]);
  }
});

test('반복 유형에서도 정답 값을 바꿔 답 암기를 막는다', () => {
  const trials = buildAppointmentTrials(40, 17);
  for (const kind of ['day','location','food','bus'] as const) {
    assert.ok(new Set(trials.filter((trial) => trial.kind === kind).map((trial) => trial.answer)).size > 1);
  }
});

test('잘못된 세트 수를 거부한다', () => {
  assert.throws(() => buildAppointmentTrials(0, 1), RangeError);
});
