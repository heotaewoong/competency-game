import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNumberRounds, classifyNumberInputError, numberExpected, type NumberRound } from './number-game.ts';

test('같은 시드는 같은 숫자 라운드를 만든다', () => {
  assert.deepEqual(buildNumberRounds(10, 91), buildNumberRounds(10, 91));
});

test('전반은 강조 숫자, 후반은 건너뛰기·두 번 누르기로 구성한다', () => {
  const rounds = buildNumberRounds(10, 17);
  assert.ok(rounds.slice(0, 5).every((round) => round.mode === 'flash'));
  assert.ok(rounds.slice(5).every((round) => round.mode === 'rules' && round.skip !== null && round.double.length === 2));
});

test('1라운드는 매 문항 숫자판을 섞고 점등 숫자 하나만 누르게 한다', () => {
  const rounds = buildNumberRounds(10, 17).filter((round) => round.mode === 'flash');
  assert.ok(rounds.every((round) => numberExpected(round).length === 1 && numberExpected(round)[0] === round.target));
  assert.ok(rounds.every((round) => round.board.toSorted((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9'));
  assert.ok(rounds.some((round) => round.board.join(',') !== '1,2,3,4,5,6,7,8,9'));
});

test('짧은 점등 세션에서는 같은 목표 숫자를 반복하지 않는다', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const targets = buildNumberRounds(6, seed, 'flash').map((round) => round.target);
    assert.equal(new Set(targets).size, targets.length);
  }
});

test('긴 점등 세션에서도 숫자별 출현 횟수 차이는 하나 이하다', () => {
  const targets = buildNumberRounds(20, 38464, 'flash').map((round) => round.target);
  const counts = Array.from({ length: 9 }, (_, index) => targets.filter((target) => target === index + 1).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('연습 집중 유형은 선택한 라운드만 만든다', () => {
  assert.ok(buildNumberRounds(5, 8, 'flash').every((round) => round.mode === 'flash'));
  assert.ok(buildNumberRounds(5, 8, 'rules').every((round) => round.mode === 'rules'));
});

test('건너뛸 숫자는 빠지고 두 번 누를 숫자는 정확히 두 번 나온다', () => {
  for (const round of buildNumberRounds(10, 37).filter((item) => item.mode === 'rules')) {
    const expected = numberExpected(round);
    assert.equal(expected.includes(round.skip!), false);
    for (const value of round.double) assert.equal(expected.filter((item) => item === value).length, 2);
  }
});

test('잘못된 라운드 수를 거부한다', () => {
  assert.throws(() => buildNumberRounds(1, 1), RangeError);
  assert.throws(() => buildNumberRounds(2.5, 1), RangeError);
  assert.equal(buildNumberRounds(1, 1, 'flash').length, 1);
});

test('일반 숫자 반복 오답을 두 번 누르기 초과로 잘못 분류하지 않는다', () => {
  const round: NumberRound = { mode: 'rules', board: [1, 2, 3, 4, 5, 6, 7, 8, 9], target: null, skip: 9, double: [2, 7] };
  const expected = numberExpected(round);
  assert.equal(classifyNumberInputError(round, expected, 1, 1), 'number-order');
  assert.equal(classifyNumberInputError(round, expected, 3, 2), 'number-extra');
  assert.equal(classifyNumberInputError(round, expected, 2, 3), 'number-double-miss');
  assert.equal(classifyNumberInputError(round, expected, 0, 9), 'number-skip');
});
