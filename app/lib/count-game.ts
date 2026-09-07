export type CountTrial = { left: number; right: number; difficulty: number };
export type CountFocus = 'progressive' | 'foundation' | 'precision';

// 2023 공개 레거시 규칙의 의미 방해자극을 재현하되 실제 문항은
// 복제하지 않은 독자 제작 상반 의미 단어쌍이다.
export const COUNT_WORD_PAIRS = [
  ['성공', '실패'],
  ['안전', '위험'],
  ['칭찬', '비난'],
  ['기쁨', '슬픔'],
] as const;

function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildCountTrials(quantity: number, seed: number, focus: CountFocus = 'progressive'): CountTrial[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('개수 비교 문항 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  const largerSidePlan = Array.from({ length: quantity }, (_, index) => index < Math.ceil(quantity / 2));
  for (let index = largerSidePlan.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [largerSidePlan[index], largerSidePlan[swap]] = [largerSidePlan[swap], largerSidePlan[index]];
  }
  return Array.from({ length: quantity }, (_, index) => {
    const sessionProgress = quantity === 1 ? 0 : index / (quantity - 1);
    const progress = focus === 'foundation' ? sessionProgress * 0.35 : focus === 'precision' ? 0.65 + sessionProgress * 0.35 : sessionProgress;
    const lower = 10 + Math.round(progress * 10) + Math.floor(random() * 3);
    const gap = Math.max(2, 7 - Math.round(progress * 5));
    const higher = lower + gap;
    const largerOnLeft = largerSidePlan[index];
    return { left: largerOnLeft ? higher : lower, right: largerOnLeft ? lower : higher, difficulty: Math.round(progress * 100) };
  });
}
