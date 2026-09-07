import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPOINTMENT_FOODS,
  APPOINTMENT_KIND_ORDER,
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_WEEKDAYS,
  buildAppointmentTrials,
  validateAppointmentTrial,
} from './appointment-game.ts';

test('같은 시드는 같은 약속 문항을 만든다', () => {
  assert.deepEqual(buildAppointmentTrials(5, 20260829), buildAppointmentTrials(5, 20260829));
  assert.notDeepEqual(buildAppointmentTrials(5, 20260829), buildAppointmentTrials(5, 20260830));
});

test('실전형 네 라운드를 요일 → 위치 → 메뉴 → 버스 순서로 묶어 출제한다', () => {
  const trials = buildAppointmentTrials(5, 17);
  assert.equal(trials.length, 20);
  assert.deepEqual(trials.map((trial) => trial.kind), APPOINTMENT_KIND_ORDER.flatMap((kind) => Array(5).fill(kind)));
  assert.deepEqual(trials.map((trial) => trial.round), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
});

test('연습에서 선택한 라운드만 공식 순서로 출제한다', () => {
  const trials = buildAppointmentTrials(3, 31, ['bus', 'day']);
  assert.deepEqual(trials.map((trial) => trial.kind), ['day', 'day', 'day', 'bus', 'bus', 'bus']);
  assert.deepEqual(trials.map((trial) => trial.questionInRound), [1, 2, 3, 1, 2, 3]);
});

test('후반 문항은 첫 세 라운드에서 사람별 정보가 3개에서 4개로 증가한다', () => {
  for (const kind of ['day', 'location', 'food'] as const) {
    const trials = buildAppointmentTrials(5, 41, [kind]);
    assert.deepEqual(trials.map((trial) => trial.itemsPerPerson), [3, 3, 3, 4, 4]);
  }
});

test('요일은 7개, 위치는 4×4 전체, 메뉴는 24종 자극 풀을 사용한다', () => {
  const trials = buildAppointmentTrials(8, 51);
  assert.equal(trials.find((trial) => trial.kind === 'day')?.choices.length, APPOINTMENT_WEEKDAYS.length);
  assert.equal(trials.find((trial) => trial.kind === 'location')?.choices.length, APPOINTMENT_LOCATIONS.length);
  assert.equal(APPOINTMENT_FOODS.length, 24);
  assert.ok(trials.filter((trial) => trial.kind === 'food').every((trial) => trial.choices.length === 6));
});

test('모든 시드에서 AND·NOT 정답 불변식을 지킨다', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    for (const trial of buildAppointmentTrials(6, seed)) assert.deepEqual(validateAppointmentTrial(trial), []);
  }
});

test('버스 라운드는 각 사람에게 서로 다른 번호 두 개를 제시한다', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    for (const trial of buildAppointmentTrials(6, seed, ['bus'])) {
      assert.ok(trial.people.every((values) => new Set(values).size === 2));
    }
  }
});

test('같은 라운드에서 자극 풀을 순환하기 전에는 정답을 반복하지 않는다', () => {
  for (const kind of APPOINTMENT_KIND_ORDER) {
    const answers = buildAppointmentTrials(5, 3305, [kind]).map((trial) => trial.answer);
    assert.equal(new Set(answers).size, answers.length);
  }
});

test('여러 순환을 넘어가도 같은 정답이 연속해 나오지 않는다', () => {
  for (const kind of APPOINTMENT_KIND_ORDER) {
    const trials = buildAppointmentTrials(64, 9017, [kind]);
    const answers = trials.map((trial) => trial.answer);
    const frequencies = [...new Set(answers)].map((answer) => answers.filter((value) => value === answer).length);
    assert.ok(answers.every((answer, index) => index === 0 || answer !== answers[index - 1]));
    assert.ok(Math.max(...frequencies) - Math.min(...frequencies) <= 1);
    assert.ok(trials.every((trial) => validateAppointmentTrial(trial).length === 0));
  }
});

test('연습 최대 8문항에서도 정답 분포가 한쪽으로 쏠리지 않는다', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    for (const kind of APPOINTMENT_KIND_ORDER) {
      const trials = buildAppointmentTrials(8, seed, [kind]);
      const answers = trials.map((trial) => trial.answer);
      const frequencies = [...new Set(answers)].map((answer) => answers.filter((value) => value === answer).length);
      assert.equal(new Set(answers).size, kind === 'day' ? 7 : 8);
      assert.equal(Math.max(...frequencies), kind === 'day' ? 2 : 1);
      assert.ok(answers.every((answer, index) => index === 0 || answer !== answers[index - 1]));
      assert.ok(trials.every((trial) => validateAppointmentTrial(trial).length === 0));
    }
  }
});

test('빈 라운드와 잘못된 문항 수를 거부한다', () => {
  assert.throws(() => buildAppointmentTrials(0, 1), RangeError);
  assert.throws(() => buildAppointmentTrials(2, 1, []), RangeError);
});
