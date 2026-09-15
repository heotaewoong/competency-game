export type AppointmentKind = 'day' | 'location' | 'food' | 'bus';
export type AppointmentRoundNumber = 1 | 2 | 3 | 4;

export type AppointmentRound = {
  number: AppointmentRoundNumber;
  kind: AppointmentKind;
  label: string;
  shortLabel: string;
  instruction: string;
  answerRule: 'common' | 'unseen';
};

export type AppointmentTrial = {
  kind: AppointmentKind;
  round: AppointmentRoundNumber;
  roundLabel: string;
  title: string;
  people: string[][];
  choices: string[];
  answer: string;
  itemsPerPerson: number | null;
  questionInRound: number;
  questionsInRound: number;
};

export const APPOINTMENT_ROUNDS: readonly AppointmentRound[] = [
  { number: 1, kind: 'day', label: '공통 선호 요일', shortLabel: '요일', instruction: '세 사람 모두가 가능한 요일을 고르세요.', answerRule: 'common' },
  { number: 2, kind: 'location', label: '공통 선호 위치', shortLabel: '위치', instruction: '세 사람의 공통 위치를 고르세요.', answerRule: 'common' },
  { number: 3, kind: 'food', label: '공통 선호 메뉴', shortLabel: '메뉴', instruction: '세 사람 모두가 고른 메뉴를 찾으세요.', answerRule: 'common' },
  { number: 4, kind: 'bus', label: '미탑승 버스', shortLabel: '버스', instruction: '세 사람이 한 번도 이용하지 않은 버스 번호를 고르세요.', answerRule: 'unseen' },
] as const;

export const APPOINTMENT_KIND_ORDER = APPOINTMENT_ROUNDS.map((round) => round.kind);
export const APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND = 10;
export const APPOINTMENT_SIMULATION_TOTAL_QUESTIONS = APPOINTMENT_ROUNDS.length * APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND;

export const APPOINTMENT_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const APPOINTMENT_LOCATIONS = Array.from({ length: 16 }, (_, index) => `${String.fromCharCode(65 + Math.floor(index / 4))}${(index % 4) + 1}`);
export const APPOINTMENT_LOCATION_LABELS = [
  '공원', '카페', '학교', '병원',
  '서점', '극장', '시장', '역',
  '은행', '식당', '체육관', '우체국',
  '도서관', '호텔', '약국', '광장',
] as const;
export const APPOINTMENT_FOODS = [
  '우동', '탕', '김밥', '스테이크', '빵', '탕수육',
  '전', '장어', '볶음밥', '돈까스', '떡볶이', '순대',
  '곱창', '햄버거', '초밥', '국', '치킨', '짜장',
  '만두', '짬뽕', '피자', '족발', '생선', '회',
] as const;

const BUS_NUMBERS = ['1', '5', '9', '12', '19', '25', '48', '57', '61', '73', '81', '87', '104', '208', '316', '427', '530', '642', '791', '905'];

const domains: Record<Exclude<AppointmentKind, 'bus'>, readonly string[]> = {
  day: APPOINTMENT_WEEKDAYS,
  location: APPOINTMENT_LOCATIONS,
  food: APPOINTMENT_FOODS,
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

function buildAnswerSchedule(domain: readonly string[], count: number, random: () => number) {
  const answers: string[] = [];
  while (answers.length < count) {
    const nextCycle = shuffled(domain, random);
    if (answers.length > 0 && nextCycle.length > 1 && answers.at(-1) === nextCycle[0]) {
      nextCycle.push(nextCycle.shift()!);
    }
    answers.push(...nextCycle.slice(0, count - answers.length));
  }
  return answers;
}

function uniqueCommon(values: string[][]) {
  return values[0].filter((value) => values.slice(1).every((items) => items.includes(value)));
}

function buildCommonPeople(domain: readonly string[], answer: string, itemCount: number, random: () => number) {
  const decoys = domain.filter((value) => value !== answer);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const people = Array.from({ length: 3 }, () => shuffled(decoys, random).slice(0, itemCount - 1).concat(answer));
    if (uniqueCommon(people).length === 1) return people.map((items) => shuffled(items, random));
  }
  throw new Error('유일한 교집합을 가진 약속 문항을 만들 수 없습니다.');
}

function buildCommonTrial(round: AppointmentRound, questionInRound: number, questionsInRound: number, answer: string, random: () => number): AppointmentTrial {
  if (round.kind === 'bus') throw new Error('버스 라운드는 미탑승 규칙으로 생성해야 합니다.');
  const domain = domains[round.kind];
  // The official public explanation says only "early" 3 and "later" 4.
  // The exact boundary is unpublished, so this trainer uses the second half.
  const harderFrom = Math.max(1, Math.ceil(questionsInRound / 2));
  const itemsPerPerson = questionInRound > harderFrom ? 4 : 3;
  const people = buildCommonPeople(domain, answer, itemsPerPerson, random);
  let choices: string[];
  if (round.kind === 'day') choices = [...APPOINTMENT_WEEKDAYS];
  else if (round.kind === 'location') choices = [...APPOINTMENT_LOCATIONS];
  else {
    const shownDecoys = [...new Set(people.flat())].filter((value) => value !== answer);
    const fallback = domain.filter((value) => value !== answer && !shownDecoys.includes(value));
    choices = shuffled([answer, ...shuffled(shownDecoys, random).slice(0, 5), ...shuffled(fallback, random)], random).slice(0, 6);
    if (!choices.includes(answer)) choices[0] = answer;
  }
  return {
    kind: round.kind,
    round: round.number,
    roundLabel: round.label,
    title: round.instruction,
    people,
    choices,
    answer,
    itemsPerPerson,
    questionInRound,
    questionsInRound,
  };
}

function buildBusTrial(round: AppointmentRound, questionInRound: number, questionsInRound: number, answer: string, random: () => number): AppointmentTrial {
  // The 2·1·2 distribution is visible in one public legacy example, not
  // published as a universal rule. We repeat it only as this trainer profile.
  const seenPool = shuffled(BUS_NUMBERS.filter((value) => value !== answer), random).slice(0, 5);
  const choices = [answer, ...seenPool.slice(0, 4)];
  const seen = shuffled(seenPool, random);
  const people = [
    [seen[0], seen[1]],
    [seen[2]],
    [seen[3], seen[4]],
  ].map((items) => shuffled(items, random));
  return {
    kind: 'bus',
    round: round.number,
    roundLabel: round.label,
    title: round.instruction,
    people,
    choices: shuffled(choices, random),
    answer,
    itemsPerPerson: null,
    questionInRound,
    questionsInRound,
  };
}

export function buildAppointmentTrials(questionsPerRound: number, seed: number, selectedRounds: readonly AppointmentKind[] = APPOINTMENT_KIND_ORDER): AppointmentTrial[] {
  if (!Number.isInteger(questionsPerRound) || questionsPerRound < 1) throw new RangeError('라운드당 문항 수는 1 이상의 정수여야 합니다.');
  const selected = new Set(selectedRounds);
  if (!selected.size || [...selected].some((kind) => !APPOINTMENT_KIND_ORDER.includes(kind))) throw new RangeError('연습할 라운드를 하나 이상 올바르게 선택해야 합니다.');
  const random = createRandom(seed);
  return APPOINTMENT_ROUNDS
    .filter((round) => selected.has(round.kind))
    .flatMap((round) => {
      const domain = round.kind === 'bus' ? BUS_NUMBERS : domains[round.kind];
      const answers = buildAnswerSchedule(domain, questionsPerRound, random);
      return Array.from({ length: questionsPerRound }, (_, index) => {
      const questionInRound = index + 1;
      return round.kind === 'bus'
        ? buildBusTrial(round, questionInRound, questionsPerRound, answers[index], random)
        : buildCommonTrial(round, questionInRound, questionsPerRound, answers[index], random);
      });
    });
}

export function buildAppointmentSimulationTrials(seed: number): AppointmentTrial[] {
  return buildAppointmentTrials(APPOINTMENT_SIMULATION_QUESTIONS_PER_ROUND, seed);
}

export function validateAppointmentTrial(trial: AppointmentTrial) {
  const errors: string[] = [];
  if (!trial.choices.includes(trial.answer)) errors.push('정답이 선택지에 없습니다.');
  if (trial.people.length !== 3) errors.push('세 사람의 정보가 모두 필요합니다.');
  if (trial.itemsPerPerson !== null && trial.people.some((values) => values.length !== trial.itemsPerPerson)) errors.push('사람별 제시 항목 수가 난도 정보와 다릅니다.');
  if (trial.kind === 'bus') {
    if (trial.choices.length !== 5) errors.push('버스 선택지는 2023 공개 튜토리얼처럼 5개여야 합니다.');
    if (trial.people.map((values) => values.length).join(',') !== '2,1,2') errors.push('버스 제시 수는 공개 예시를 반복한 훈련값 2·1·2여야 합니다.');
    if (trial.people.some((values) => new Set(values).size !== values.length)) errors.push('한 사람에게 같은 버스가 중복 제시되었습니다.');
    if (trial.people.flat().includes(trial.answer)) errors.push('NOT 정답을 누군가 이미 이용했습니다.');
    const unseenChoices = trial.choices.filter((value) => !trial.people.flat().includes(value));
    if (unseenChoices.length !== 1 || unseenChoices[0] !== trial.answer) errors.push('선택지 중 미탑승 버스가 하나가 아닙니다.');
  } else {
    const common = uniqueCommon(trial.people);
    if (common.length !== 1 || common[0] !== trial.answer) errors.push('세 사람의 유일한 교집합과 정답이 다릅니다.');
  }
  if (trial.kind === 'day' && trial.choices.join(',') !== APPOINTMENT_WEEKDAYS.join(',')) errors.push('요일 선택지는 월요일부터 일요일까지 고정 순서여야 합니다.');
  if (trial.kind === 'location' && trial.choices.join(',') !== APPOINTMENT_LOCATIONS.join(',')) errors.push('위치 선택지는 4×4 전체 격자여야 합니다.');
  return errors;
}
