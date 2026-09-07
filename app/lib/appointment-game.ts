export type AppointmentKind = 'day' | 'location' | 'food' | 'bus';
export type AppointmentTrial = { kind: AppointmentKind; title: string; people: string[][]; choices: string[]; answer: string };

const baseTrials: readonly AppointmentTrial[] = [
  { kind: 'day', title: '세 사람이 모두 가능한 요일', people: [['월','수','금'],['화','수','토'],['수','금','일']], choices: ['월','수','금','토','일'], answer: '수' },
  { kind: 'location', title: '세 사람이 모두 선호한 장소', people: [['A1','B2','D4'],['B2','C1','C4'],['A4','B2','D1']], choices: ['A1','B2','C4','D1'], answer: 'B2' },
  { kind: 'food', title: '세 사람이 모두 선호한 메뉴', people: [['우동','탕수육','초밥'],['장어','탕수육','돈가스'],['탕수육','만두','회']], choices: ['우동','탕수육','돈가스','만두','회'], answer: '탕수육' },
  { kind: 'bus', title: '아무도 탑승하지 않은 버스', people: [['81','549'],['25','73'],['9','48']], choices: ['81','324','73','9','48'], answer: '324' },
];

const domains: Record<AppointmentKind, string[]> = {
  day: ['월','화','수','목','금','토','일'],
  location: Array.from({ length: 16 }, (_, index) => `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`),
  food: ['우동','탕수육','초밥','장어','돈가스','만두','회'],
  bus: ['12','27','34','48','63','75','91','104','208','316','427','539','642','781','905'],
};

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

function remapTrial(trial: AppointmentTrial, random: () => number): AppointmentTrial {
  const sourceValues = [...new Set([...trial.people.flat(), ...trial.choices, trial.answer])];
  const targetValues = shuffled(domains[trial.kind], random).slice(0, sourceValues.length);
  const mapping = new Map(sourceValues.map((value, index) => [value, targetValues[index]]));
  const mapValue = (value: string) => mapping.get(value)!;
  return {
    ...trial,
    people: trial.people.map((values) => values.map(mapValue)),
    choices: shuffled(trial.choices.map(mapValue), random),
    answer: mapValue(trial.answer),
  };
}

export function buildAppointmentTrials(quantity: number, seed: number): AppointmentTrial[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('약속 세트 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  return balancedSequence(baseTrials, quantity, random).map((trial) => remapTrial(trial, random));
}

export function validateAppointmentTrial(trial: AppointmentTrial) {
  const errors: string[] = [];
  if (!trial.choices.includes(trial.answer)) errors.push('정답이 선택지에 없습니다.');
  if (trial.kind === 'bus') {
    if (trial.people.flat().includes(trial.answer)) errors.push('NOT 정답을 누군가 이미 보았습니다.');
  } else {
    const common = trial.people[0].filter((value) => trial.people.slice(1).every((values) => values.includes(value)));
    if (common.length !== 1 || common[0] !== trial.answer) errors.push('세 사람의 유일한 교집합과 정답이 다릅니다.');
  }
  return errors;
}
