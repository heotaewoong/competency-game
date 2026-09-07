import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NBACK_SIMULATION_N2_PROBLEM_COUNT,
  NBACK_SIMULATION_N23_PROBLEM_COUNT,
  buildNBackSession,
  classifyNBackDecision,
  scoreNBackResponse,
  selectNBackGroup,
  selectNBackRoundGroups,
  validateNBackSession,
} from './nback-game.ts';

test('자동 선택은 5개 고정 묶음 중 하나를 고르고 직접 선택은 그대로 유지한다', () => {
  assert.equal(selectNBackGroup(0, null), 0);
  assert.equal(selectNBackGroup(7, null), 2);
  assert.equal(selectNBackGroup(99, null), 4);
  assert.equal(selectNBackGroup(99, 1), 1);
  assert.throws(() => selectNBackGroup(1, 5), RangeError);
});

test('공개 흐름에 쓰는 자동 선택은 두 라운드에서 같은 3도형 묶음을 유지한다', () => {
  const fixed = selectNBackRoundGroups(20260829, null, false);
  assert.deepEqual(fixed, selectNBackRoundGroups(20260829, null, false));
  assert.ok(fixed.every((group) => Number.isInteger(group) && group >= 0 && group < 5));
  for (let seed = 0; seed < 1_000; seed += 1) {
    const [first, second] = selectNBackRoundGroups(seed, null, false);
    assert.equal(first, second, `seed=${seed}`);
  }
  assert.deepEqual(selectNBackRoundGroups(9, 3, true), [3, 3]);
  assert.deepEqual(selectNBackRoundGroups(9, null, false), [4, 4]);
});

test('독립 묶음 선택은 명시적인 훈련 변형으로만 사용할 수 있다', () => {
  assert.ok(Array.from({ length: 30 }, (_, seed) => selectNBackRoundGroups(seed, null, true)).some(([first, second]) => first !== second));
});

test('같은 시드와 설정은 같은 문항을 만든다', () => {
  const options = { mode: 'n23' as const, group: 4, problemCount: 24, seed: 20260829 };
  assert.deepEqual(buildNBackSession(options), buildNBackSession(options));
  assert.notDeepEqual(
    buildNBackSession(options).map((trial) => trial.variant),
    buildNBackSession({ ...options, seed: 20260830 }).map((trial) => trial.variant),
  );
});

test('연습 n2는 선택한 한 묶음으로 warmup 2개와 설정한 채점 문항을 만든다', () => {
  const trials = buildNBackSession({ mode: 'n2', group: 2, problemCount: 17, seed: 5 });
  assert.equal(trials.length, 19);
  assert.equal(trials.filter((trial) => trial.warmup).length, 2);
  assert.equal(trials.filter((trial) => !trial.warmup).length, 17);
  assert.ok(trials.every((trial) => trial.round === 1 && trial.task === 'n2' && trial.group === 2));
  assert.ok(trials.every((trial) => trial.variant >= 6 && trial.variant <= 8));
  assert.ok(trials.every((trial) => trial.answer !== 'third'));
});

test('연습 n23은 선택한 한 묶음으로 warmup 3개와 설정한 채점 문항을 만든다', () => {
  const trials = buildNBackSession({ mode: 'n23', group: 0, problemCount: 12, seed: 7 });
  assert.equal(trials.length, 15);
  assert.equal(trials.filter((trial) => trial.warmup).length, 3);
  assert.equal(trials.filter((trial) => !trial.warmup).length, 12);
  assert.ok(trials.every((trial) => trial.round === 2 && trial.task === 'n23' && trial.group === 0));
  assert.ok(trials.every((trial) => trial.variant >= 0 && trial.variant <= 2));
});

test('짧은 연습도 특정 정답 유형에 고정되지 않고 시드에 따라 모든 유형을 출제한다', () => {
  const n2Answers = new Set(Array.from({ length: 200 }, (_, index) => buildNBackSession({
    mode: 'n2', group: index % 5, problemCount: 1, seed: index + 1,
  }).find((trial) => !trial.warmup)?.answer));
  assert.deepEqual(n2Answers, new Set(['second', 'neither']));

  const n23Answers = new Set(Array.from({ length: 300 }, (_, index) => buildNBackSession({
    mode: 'n23', group: index % 5, problemCount: 1, seed: index + 1,
  }).find((trial) => !trial.warmup)?.answer));
  assert.deepEqual(n23Answers, new Set(['second', 'third', 'neither']));
});

test('연습 문항 수가 유형 수의 배수가 아니어도 정답 유형 수 차이는 최대 1이다', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    for (const mode of ['n2', 'n23'] as const) {
      const counts = new Map<string, number>();
      for (const trial of buildNBackSession({ mode, group: seed % 5, problemCount: 17, seed })) {
        if (!trial.warmup && trial.answer) counts.set(trial.answer, (counts.get(trial.answer) ?? 0) + 1);
      }
      const values = [...counts.values()];
      assert.equal(values.length, mode === 'n2' ? 2 : 3);
      assert.ok(Math.max(...values) - Math.min(...values) <= 1, `${mode}/seed ${seed}`);
    }
  }
});

test('실전형은 라운드별 3도형 묶음으로 n2 23문항 뒤 n23 24문항을 진행한다', () => {
  const trials = buildNBackSession({ mode: 'real', group: 0, round2Group: 4, seed: 31 });
  const roundOne = trials.filter((trial) => trial.round === 1);
  const roundTwo = trials.filter((trial) => trial.round === 2);

  assert.equal(roundOne.filter((trial) => !trial.warmup).length, NBACK_SIMULATION_N2_PROBLEM_COUNT);
  assert.equal(roundTwo.filter((trial) => !trial.warmup).length, NBACK_SIMULATION_N23_PROBLEM_COUNT);
  assert.equal(roundOne.length, NBACK_SIMULATION_N2_PROBLEM_COUNT + 2);
  assert.equal(roundTwo.length, NBACK_SIMULATION_N23_PROBLEM_COUNT + 3);
  assert.ok(roundOne.every((trial) => trial.task === 'n2'));
  assert.ok(roundTwo.every((trial) => trial.task === 'n23'));
  assert.ok(roundOne.every((trial) => trial.group === 0 && trial.variant >= 0 && trial.variant <= 2));
  assert.ok(roundTwo.every((trial) => trial.group === 4 && trial.variant >= 12 && trial.variant <= 14));
});

test('실전형 n23 24문항은 세 정답 유형을 8개씩 균형 출제한다', () => {
  const scored = buildNBackSession({ mode: 'real', group: 1, seed: 77 })
    .filter((trial) => trial.round === 2 && !trial.warmup);
  for (const answer of ['second', 'third', 'neither'] as const) {
    assert.equal(scored.filter((trial) => trial.answer === answer).length, 8);
  }
});

test('2·3-back 실전형에는 바로 전 도형 반복 유인도 포함되며 N-2·N-3가 아니면 다름이다', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const round = buildNBackSession({ mode: 'real', group: seed % 5, seed })
      .filter((trial) => trial.round === 2);
    const adjacentTrap = round.find((trial, index) => index > 0
      && !trial.warmup
      && trial.variant === round[index - 1].variant
      && trial.answer === 'neither');
    assert.ok(adjacentTrap, `seed ${seed}에 바로 전 반복 유인이 없습니다.`);
  }
});

test('2·3-back은 둘 다 같은 모호한 문항을 만들지 않는다', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const trials = buildNBackSession({ mode: 'real', group: seed % 5, seed });
    const mixed = trials.filter((trial) => trial.task === 'n23' && !trial.warmup);
    assert.ok(mixed.every((trial) => !(trial.matchesSecond && trial.matchesThird)));
    assert.deepEqual(validateNBackSession(trials), []);
  }
});

test('라운드가 바뀌면 기억 큐를 초기화한다', () => {
  const trials = buildNBackSession({ mode: 'real', group: 4, seed: 3 });
  const roundTwo = trials.filter((trial) => trial.round === 2);
  assert.deepEqual(roundTwo.slice(0, 3).map((trial) => trial.answer), [null, null, null]);
  assert.ok(roundTwo.slice(0, 3).every((trial) => trial.warmup));
});

test('분류기는 2-back, 3-back, 둘 다 다름, 모호 상태를 구분한다', () => {
  assert.equal(classifyNBackDecision([0, 1, 0], 2, 'n2'), 'second');
  assert.equal(classifyNBackDecision([0, 1, 2, 0], 3, 'n23'), 'third');
  assert.equal(classifyNBackDecision([0, 1, 2, 1], 3, 'n23'), 'second');
  assert.equal(classifyNBackDecision([0, 1, 2, 3], 3, 'n23'), 'neither');
  assert.equal(classifyNBackDecision([0, 0, 1, 0], 3, 'n23'), 'ambiguous');
});

test('채점은 정답, 정답 거절, 누락, 오경보, lag 혼동을 분리한다', () => {
  const trials = buildNBackSession({ mode: 'real', group: 2, seed: 109 });
  const hit = trials.find((trial) => trial.answer === 'second' && !trial.warmup)!;
  const rejection = trials.find((trial) => trial.answer === 'neither' && !trial.warmup)!;
  const third = trials.find((trial) => trial.answer === 'third' && !trial.warmup)!;

  assert.equal(scoreNBackResponse(hit, 'second', 421).outcome, 'hit');
  assert.equal(scoreNBackResponse(rejection, 'neither', 388).outcome, 'correct-rejection');
  assert.equal(scoreNBackResponse(hit, null, null).outcome, 'omission');
  assert.equal(scoreNBackResponse(rejection, 'second', 510).outcome, 'false-alarm');
  assert.equal(scoreNBackResponse(third, 'second', 632).outcome, 'wrong-lag');
  assert.equal(scoreNBackResponse(hit, 'neither', 700).outcome, 'miss');
});

test('잘못된 도형 묶음과 연습 문항 수를 거부한다', () => {
  assert.throws(() => buildNBackSession({ mode: 'n2', group: 5, problemCount: 10, seed: 1 }), RangeError);
  assert.throws(() => buildNBackSession({ mode: 'n23', group: 0, problemCount: 0, seed: 1 }), RangeError);
});
