export type MouseTrial = {
  mice: number[];
  cats: number[];
  red: number;
  blue: number;
  redCaught: boolean;
  blueCaught: boolean;
};

type MouseTemplate = Omit<MouseTrial, 'redCaught' | 'blueCaught'>;

const templates: readonly MouseTemplate[] = [
  { mice:[0,7,13,20,28,35,4,31], red:13, blue:11, cats:[2,5,14,22,30,33] },
  { mice:[2,8,15,21,27,33,5,30], red:19, blue:27, cats:[0,6,12,24,32,35] },
  { mice:[1,6,14,22,29,34,11,25], red:11, blue:18, cats:[3,8,15,21,27,32] },
  { mice:[3,9,16,23,26,32,12,35], red:16, blue:30, cats:[1,7,14,22,27,35] },
  { mice:[0,8,12,19,24,31,17,35], red:10, blue:31, cats:[2,6,14,20,27,34] },
];

const outcomes = [
  { redCaught: false, blueCaught: false },
  { redCaught: false, blueCaught: true },
  { redCaught: true, blueCaught: false },
  { redCaught: true, blueCaught: true },
] as const;

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

function applyOutcome(template: MouseTemplate, redCaught: boolean, blueCaught: boolean, itemCount: number, random: () => number): MouseTrial {
  const targets = [
    ...(redCaught ? [template.red] : []),
    ...(blueCaught ? [template.blue] : []),
  ];
  const originalFillers = template.mice.filter((cell) => cell !== template.red && cell !== template.blue);
  const everyOtherCell = Array.from({ length: 36 }, (_, cell) => cell)
    .filter((cell) => cell !== template.red && cell !== template.blue && !originalFillers.includes(cell));
  const fillerPool = [...shuffled(originalFillers, random), ...shuffled(everyOtherCell, random)];
  const mice = [...targets, ...fillerPool.slice(0, itemCount - targets.length)];
  const originalCats = template.cats.filter((cell) => cell !== template.red && cell !== template.blue);
  const otherCatCells = Array.from({ length: 36 }, (_, cell) => cell)
    .filter((cell) => cell !== template.red && cell !== template.blue && !originalCats.includes(cell));
  const cats = [...shuffled(originalCats, random), ...shuffled(otherCatCells, random)].slice(0, itemCount - 2);
  return { ...template, mice, cats, redCaught, blueCaught };
}

export function buildMouseTrials(quantity: number, seed: number): MouseTrial[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('고양이 라운드 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  const templatePlan = balancedSequence(templates, quantity, random);
  const outcomePlan = balancedSequence(outcomes, quantity, random);
  return templatePlan.map((template, index) => {
    const progress = quantity === 1 ? 0 : index / (quantity - 1);
    const itemCount = 6 + Math.round(progress * 4);
    return applyOutcome(template, outcomePlan[index].redCaught, outcomePlan[index].blueCaught, itemCount, random);
  });
}

export function validateMouseTrials(trials: readonly MouseTrial[]) {
  const errors: string[] = [];
  for (const [index, trial] of trials.entries()) {
    if (trial.mice.length < 6 || trial.mice.length > 10 || new Set(trial.mice).size !== trial.mice.length) errors.push(`${index + 1}번 라운드의 생쥐 위치 수가 6~10개 고유 칸이 아닙니다.`);
    if (trial.cats.length + 2 !== trial.mice.length || new Set([trial.red, trial.blue, ...trial.cats]).size !== trial.cats.length + 2) errors.push(`${index + 1}번 라운드의 고양이 수 또는 위치가 잘못되었습니다.`);
    if (trial.mice.includes(trial.red) !== trial.redCaught) errors.push(`${index + 1}번 라운드의 빨간 고양이 정답이 위치와 다릅니다.`);
    if (trial.mice.includes(trial.blue) !== trial.blueCaught) errors.push(`${index + 1}번 라운드의 파란 고양이 정답이 위치와 다릅니다.`);
  }
  return errors;
}
