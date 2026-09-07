export type CountTrial = { left: number; right: number; difficulty: number };

function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildCountTrials(quantity: number, seed: number): CountTrial[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('개수 비교 문항 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  return Array.from({ length: quantity }, (_, index) => {
    const progress = quantity === 1 ? 0 : index / (quantity - 1);
    const lower = 10 + Math.round(progress * 10) + Math.floor(random() * 3);
    const gap = Math.max(2, 7 - Math.round(progress * 5));
    const higher = lower + gap;
    const largerOnLeft = random() < 0.5;
    return { left: largerOnLeft ? higher : lower, right: largerOnLeft ? lower : higher, difficulty: Math.round(progress * 100) };
  });
}
