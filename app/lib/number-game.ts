export type NumberFocus = 'full' | 'flash' | 'rules';
export type NumberRound =
  | { mode: 'flash'; board: number[]; target: number; skip: null; double: [] }
  | { mode: 'rules'; board: number[]; target: null; skip: number; double: number[] };

export type NumberRoundPosition = {
  round: 1 | 2;
  index: number;
  total: number;
  startsRound: boolean;
  endsRound: boolean;
};

function shuffled<T>(items: readonly T[], seed: number) {
  const result = [...items];
  let state = seed >>> 0 || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function numberExpected(round: NumberRound) {
  return round.mode === 'flash' ? [round.target] : Array.from({ length: 9 }, (_, index) => index + 1).flatMap((value) => value === round.skip ? [] : round.double.includes(value) ? [value, value] : [value]);
}

export type NumberInputError = 'number-skip' | 'number-double-miss' | 'number-extra' | 'number-order';

export function classifyNumberInputError(round: NumberRound, expected: readonly number[], position: number, value: number): NumberInputError {
  if (round.mode === 'rules' && value === round.skip) return 'number-skip';
  if (position > 0 && expected[position] === expected[position - 1]) return 'number-double-miss';
  const repeatedCompletedDouble = position > 1
    && value === expected[position - 1]
    && expected[position - 1] === expected[position - 2]
    && expected[position] !== value;
  return repeatedCompletedDouble ? 'number-extra' : 'number-order';
}

export function numberRoundPosition(rounds: readonly NumberRound[], attemptIndex: number): NumberRoundPosition {
  const current = rounds[attemptIndex];
  if (!current) throw new RangeError('숫자 누르기 문제 위치가 전체 문제 수를 벗어났습니다.');
  const indices = rounds.flatMap((round, index) => round.mode === current.mode ? [index] : []);
  const indexInRound = indices.indexOf(attemptIndex);
  return {
    round: current.mode === 'flash' ? 1 : 2,
    index: indexInRound + 1,
    total: indices.length,
    startsRound: indexInRound === 0,
    endsRound: indexInRound === indices.length - 1,
  };
}

export function buildNumberRounds(quantity: number, seed: number, focus: NumberFocus = 'full'): NumberRound[] {
  const minimum = focus === 'full' ? 2 : 1;
  if (!Number.isInteger(quantity) || quantity < minimum) throw new RangeError(`숫자 누르기 문항 수는 ${minimum} 이상의 정수여야 합니다.`);
  const flashCount = focus === 'flash' ? quantity : focus === 'rules' ? 0 : Math.max(1, Math.floor(quantity / 2));
  const flashTargets = Array.from({ length: Math.ceil(flashCount / 9) }, (_, cycle) =>
    shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], seed + cycle * 97 + 5),
  ).flat().slice(0, flashCount);
  return Array.from({ length: quantity }, (_, index): NumberRound => {
    if (index < flashCount) {
      const board = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], seed + index * 3);
      return { mode: 'flash', board, target: flashTargets[index], skip: null, double: [] };
    }
    const board = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], seed + index * 3);
    const exceptions = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], seed + index * 11);
    return { mode: 'rules', board, target: null, skip: exceptions[0], double: exceptions.slice(1, 3) };
  });
}
