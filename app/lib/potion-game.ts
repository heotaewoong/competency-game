export type PotionOutcome = 'blue' | 'red';
export type PotionTrial = { combo: number[]; recipe: number; outcome: PotionOutcome };
export type PotionComboSize = 1 | 2 | 3;
export type PotionEvidenceHistory = Record<string, { red: number; blue: number }>;
export type PotionPrediction = PotionOutcome | null;

export const POTION_INGREDIENTS = [
  { id: 'sprig', code: 'A', label: '재료 A' },
  { id: 'clover', code: 'B', label: '재료 B' },
  { id: 'twin-leaf', code: 'C', label: '재료 C' },
  { id: 'herb', code: 'D', label: '재료 D' },
] as const;

export const POTION_RECIPE_COMBOS: ReadonlyArray<ReadonlyArray<number>> = [
  [0], [1], [2], [3],
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
  [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3],
];

const recipeProbabilities = [.78, .31, .69, .42, .74, .36, .63, .28, .71, .44, .66, .34, .76, .39] as const;

function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Keeps the same balanced probability profile while assigning it to different
 * recipes for every seeded session. A repeat learner therefore has to infer
 * the current session from observations instead of memorising A/B/C/D answers.
 */
export function buildPotionProbabilityMap(seed: number) {
  return shuffled(recipeProbabilities, createRandom((seed ^ 0x9e3779b9) >>> 0));
}

export type PotionPerformanceSummary = {
  evidenceAccuracy: number | null;
  evidenceErrors: number;
  outcomeAccuracy: number;
  outcomeMisses: number;
};

export function summarizePotionPerformance(input: {
  evidenceAligned: number;
  evidenceTotal: number;
  outcomeHits: number;
  trialCount: number;
}): PotionPerformanceSummary {
  const evidenceTotal = Math.max(0, Math.round(input.evidenceTotal));
  const evidenceAligned = Math.min(evidenceTotal, Math.max(0, Math.round(input.evidenceAligned)));
  const trialCount = Math.max(0, Math.round(input.trialCount));
  const outcomeHits = Math.min(trialCount, Math.max(0, Math.round(input.outcomeHits)));
  return {
    evidenceAccuracy: evidenceTotal ? Math.round((evidenceAligned / evidenceTotal) * 100) : null,
    evidenceErrors: evidenceTotal - evidenceAligned,
    outcomeAccuracy: trialCount ? Math.round((outcomeHits / trialCount) * 100) : 0,
    outcomeMisses: trialCount - outcomeHits,
  };
}

export function evaluatePotionEvidenceDecision(
  observed: { red: number; blue: number },
  prediction: PotionPrediction,
  outcome: PotionOutcome,
) {
  const preferred: PotionOutcome | null = observed.blue === observed.red ? null : observed.blue > observed.red ? 'blue' : 'red';
  const aligned = prediction !== null && preferred !== null ? prediction === preferred : null;
  return {
    preferred,
    aligned,
    opportunity: preferred !== null,
    evidenceTimeout: preferred !== null && prediction === null,
    stochasticMiss: aligned === true && prediction !== outcome,
  };
}

/**
 * Adds only outcomes the learner could actually infer from the feedback.
 * A simulation timeout reveals neither a prediction result nor the potion
 * colour, so recording that hidden outcome would contaminate later evidence.
 */
export function recordVisiblePotionOutcome(
  history: PotionEvidenceHistory,
  recipeKey: string,
  outcome: PotionOutcome,
  outcomeWasVisible: boolean,
): PotionEvidenceHistory {
  if (!outcomeWasVisible) return history;
  const observed = history[recipeKey] ?? { red: 0, blue: 0 };
  return {
    ...history,
    [recipeKey]: { ...observed, [outcome]: observed[outcome] + 1 },
  };
}

export function buildPotionTrials(quantity: number, seed: number, comboSizes: readonly PotionComboSize[] = [1, 2, 3]): PotionTrial[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('마법약 시행 수는 1 이상의 정수여야 합니다.');
  const normalizedSizes = [...new Set(comboSizes)].filter((size): size is PotionComboSize => size === 1 || size === 2 || size === 3);
  if (!normalizedSizes.length) throw new RangeError('마법약 재료 수는 1·2·3개 중 하나 이상이어야 합니다.');
  const recipePool = Array.from({ length: POTION_RECIPE_COMBOS.length }, (_, index) => index).filter((recipe) => normalizedSizes.includes(POTION_RECIPE_COMBOS[recipe].length as PotionComboSize));
  const random = createRandom(seed);
  const probabilityMap = buildPotionProbabilityMap(seed);
  const trials: PotionTrial[] = [];
  while (trials.length < quantity) {
    const recipes = shuffled(recipePool, random);
    for (const recipe of recipes) {
      const roll = ((Math.imul(seed + trials.length * 97 + 17, 1103515245) >>> 0) % 10000) / 10000;
      trials.push({ combo: [...POTION_RECIPE_COMBOS[recipe]], recipe, outcome: roll < probabilityMap[recipe] ? 'blue' : 'red' });
      if (trials.length === quantity) break;
    }
  }
  return trials;
}
