export type RpsChoice = 'scissors' | 'rock' | 'paper';
export type RpsPerspective = 'player' | 'opponent';

export type RpsTrial = {
  shown: RpsChoice;
  unknown: RpsPerspective;
  answer: RpsChoice;
  phase: '내 패 찾기' | '상대 패 찾기' | '관점 혼합';
};

const choices: readonly RpsChoice[] = ['scissors', 'rock', 'paper'];
const losesTo: Record<RpsChoice, RpsChoice> = { scissors: 'rock', rock: 'paper', paper: 'scissors' };
const beats: Record<RpsChoice, RpsChoice> = { scissors: 'paper', rock: 'scissors', paper: 'rock' };

function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function balancedSequence<T>(items: readonly T[], length: number, random: () => number) {
  const result: T[] = [];
  while (result.length < length) result.push(...shuffled(items, random));
  return result.slice(0, length);
}

export function buildRpsTrials(quantity: number, seed: number): RpsTrial[] {
  if (!Number.isInteger(quantity) || quantity < 3) throw new RangeError('가위바위보 문항 수는 3 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  const phaseIndexes = Array.from({ length: quantity }, (_, index) => Math.min(2, Math.floor((index * 3) / quantity)));
  const shownByPhase = [0, 1, 2].map((phase) => balancedSequence(choices, phaseIndexes.filter((value) => value === phase).length, random));
  const mixedCount = phaseIndexes.filter((value) => value === 2).length;
  const mixedPerspectives = balancedSequence<RpsPerspective>(['player', 'opponent'], mixedCount, random);
  const phaseOffsets = [0, 0, 0];
  let mixedOffset = 0;

  return phaseIndexes.map((phaseIndex) => {
    const shown = shownByPhase[phaseIndex][phaseOffsets[phaseIndex]++];
    const unknown: RpsPerspective = phaseIndex === 0 ? 'player' : phaseIndex === 1 ? 'opponent' : mixedPerspectives[mixedOffset++];
    return {
      shown,
      unknown,
      answer: unknown === 'player' ? losesTo[shown] : beats[shown],
      phase: phaseIndex === 0 ? '내 패 찾기' : phaseIndex === 1 ? '상대 패 찾기' : '관점 혼합',
    };
  });
}
