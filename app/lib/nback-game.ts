export const NBACK_GLYPH_COUNT = 15;
export const NBACK_GLYPHS_PER_GROUP = 3;
export const NBACK_GROUP_COUNT = NBACK_GLYPH_COUNT / NBACK_GLYPHS_PER_GROUP;
export const NBACK_REAL_N2_PROBLEM_COUNT = 23;
export const NBACK_REAL_N23_PROBLEM_COUNT = 24;

export type NBackTask = 'n2' | 'n23';
export type NBackSessionMode = NBackTask | 'real';
export type NBackDecision = 'second' | 'third' | 'neither';
export type NBackClassification = NBackDecision | 'ambiguous' | null;

export type NBackTrial = {
  id: string;
  variant: number;
  group: number;
  round: 1 | 2;
  task: NBackTask;
  position: number;
  scoredIndex: number | null;
  warmup: boolean;
  matchesSecond: boolean;
  matchesThird: boolean;
  answer: NBackDecision | null;
};

export type NBackSessionOptions = {
  mode: NBackSessionMode;
  group: number;
  round2Group?: number;
  seed: number;
  problemCount?: number;
};

export type NBackTrialOutcome =
  | 'warmup'
  | 'hit'
  | 'correct-rejection'
  | 'miss'
  | 'false-alarm'
  | 'wrong-lag'
  | 'omission';

export type NBackTrialScore = {
  scored: boolean;
  correct: boolean;
  outcome: NBackTrialOutcome;
  responseTimeMs: number | null;
};

type RandomSource = () => number;

const N2_WARMUP_COUNT = 2;
const N23_WARMUP_COUNT = 3;

export function selectNBackGroup(seed: number, preferredGroup: number | null) {
  if (preferredGroup !== null) {
    if (!Number.isInteger(preferredGroup) || preferredGroup < 0 || preferredGroup >= NBACK_GROUP_COUNT) {
      throw new RangeError(`preferredGroup은 0~${NBACK_GROUP_COUNT - 1}의 정수 또는 null이어야 합니다.`);
    }
    return preferredGroup;
  }
  return (seed >>> 0) % NBACK_GROUP_COUNT;
}

function createRandom(seed: number): RandomSource {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function selectNBackRoundGroups(seed: number, preferredGroup: number | null, independentlyByRound: boolean) {
  if (preferredGroup !== null || !independentlyByRound) {
    const group = selectNBackGroup(seed, preferredGroup);
    return [group, group] as const;
  }
  const random = createRandom(seed);
  return [
    Math.floor(random() * NBACK_GROUP_COUNT),
    Math.floor(random() * NBACK_GROUP_COUNT),
  ] as const;
}

function shuffled<T>(items: readonly T[], random: RandomSource) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function balancedPlan(answers: readonly NBackDecision[], length: number, random: RandomSource) {
  return shuffled(Array.from({ length }, (_, index) => answers[index % answers.length]), random);
}

function pick<T>(items: readonly T[], random: RandomSource) {
  return items[Math.floor(random() * items.length)];
}

function glyphCandidates(group: number) {
  const first = group * NBACK_GLYPHS_PER_GROUP;
  return [first, first + 1, first + 2];
}

function assertOptions({ mode, group, round2Group, problemCount }: NBackSessionOptions) {
  if (!Number.isInteger(group) || group < 0 || group >= NBACK_GROUP_COUNT) {
    throw new RangeError(`group은 0~${NBACK_GROUP_COUNT - 1}의 정수여야 합니다.`);
  }
  if (round2Group !== undefined && (!Number.isInteger(round2Group) || round2Group < 0 || round2Group >= NBACK_GROUP_COUNT)) {
    throw new RangeError(`round2Group은 0~${NBACK_GROUP_COUNT - 1}의 정수여야 합니다.`);
  }
  if (mode !== 'real' && (!Number.isInteger(problemCount) || (problemCount ?? 0) < 1)) {
    throw new RangeError('연습 모드의 problemCount는 1 이상의 정수여야 합니다.');
  }
}

export function inspectNBackMatch(sequence: readonly number[], index: number) {
  return {
    matchesSecond: index >= 2 && sequence[index] === sequence[index - 2],
    matchesThird: index >= 3 && sequence[index] === sequence[index - 3],
  };
}

export function classifyNBackDecision(sequence: readonly number[], index: number, task: NBackTask): NBackClassification {
  const warmupCount = task === 'n2' ? N2_WARMUP_COUNT : N23_WARMUP_COUNT;
  if (index < warmupCount) return null;

  const { matchesSecond, matchesThird } = inspectNBackMatch(sequence, index);
  if (task === 'n2') return matchesSecond ? 'second' : 'neither';
  if (matchesSecond && matchesThird) return 'ambiguous';
  if (matchesSecond) return 'second';
  if (matchesThird) return 'third';
  return 'neither';
}

function buildN2Sequence(group: number, problemCount: number, random: RandomSource) {
  const glyphs = glyphCandidates(group);
  const sequence = shuffled(glyphs, random).slice(0, N2_WARMUP_COUNT);
  const plan = balancedPlan(['second', 'neither'], problemCount, random);

  for (const answer of plan) {
    const index = sequence.length;
    if (answer === 'second') sequence.push(sequence[index - 2]);
    else sequence.push(pick(glyphs.filter((glyph) => glyph !== sequence[index - 2]), random));
  }
  return sequence;
}

function buildN23Sequence(group: number, problemCount: number, random: RandomSource) {
  const glyphs = glyphCandidates(group);
  const sequence = shuffled(glyphs, random).slice(0, N23_WARMUP_COUNT);
  const remaining: Record<NBackDecision, number> = { second: 0, third: 0, neither: 0 };
  for (const answer of balancedPlan(['second', 'third', 'neither'], problemCount, random)) remaining[answer] += 1;
  const deadEnds = new Set<string>();

  function solve(): boolean {
    if (remaining.second + remaining.third + remaining.neither === 0) return true;
    const stateKey = `${sequence.slice(-3).join(',')}:${remaining.second},${remaining.third},${remaining.neither}`;
    if (deadEnds.has(stateKey)) return false;

    for (const glyph of shuffled(glyphs, random)) {
      sequence.push(glyph);
      const decision = classifyNBackDecision(sequence, sequence.length - 1, 'n23');
      if (decision && decision !== 'ambiguous' && remaining[decision] > 0) {
        remaining[decision] -= 1;
        if (solve()) return true;
        remaining[decision] += 1;
      }
      sequence.pop();
    }
    deadEnds.add(stateKey);
    return false;
  }

  if (!solve()) throw new Error('2·3-back 시퀀스를 안전하게 생성하지 못했습니다.');
  return sequence;
}

function buildRound(task: NBackTask, group: number, problemCount: number, round: 1 | 2, random: RandomSource) {
  const warmupCount = task === 'n2' ? N2_WARMUP_COUNT : N23_WARMUP_COUNT;
  const sequence = task === 'n2'
    ? buildN2Sequence(group, problemCount, random)
    : buildN23Sequence(group, problemCount, random);

  return sequence.map((variant, position): NBackTrial => {
    const { matchesSecond, matchesThird } = inspectNBackMatch(sequence, position);
    const answer = classifyNBackDecision(sequence, position, task);
    if (answer === 'ambiguous') throw new Error(`정답이 중복된 N-back 문항입니다: round=${round}, position=${position}`);
    return {
      id: `nback-${round}-${position}`,
      variant,
      group,
      round,
      task,
      position,
      scoredIndex: position < warmupCount ? null : position - warmupCount,
      warmup: position < warmupCount,
      matchesSecond,
      matchesThird,
      answer,
    };
  });
}

export function buildNBackSession(options: NBackSessionOptions) {
  assertOptions(options);
  const random = createRandom(options.seed);
  if (options.mode === 'real') {
    return [
      ...buildRound('n2', options.group, NBACK_REAL_N2_PROBLEM_COUNT, 1, random),
      ...buildRound('n23', options.round2Group ?? options.group, NBACK_REAL_N23_PROBLEM_COUNT, 2, random),
    ];
  }
  return buildRound(options.mode, options.group, options.problemCount!, options.mode === 'n2' ? 1 : 2, random);
}

export function scoreNBackResponse(trial: NBackTrial, response: NBackDecision | null, responseTimeMs: number | null): NBackTrialScore {
  if (trial.warmup || trial.answer === null) {
    return { scored: false, correct: false, outcome: 'warmup', responseTimeMs: null };
  }
  if (response === null) {
    return { scored: true, correct: false, outcome: 'omission', responseTimeMs: null };
  }
  const normalizedTime = responseTimeMs === null ? null : Math.max(0, Math.round(responseTimeMs));
  if (response === trial.answer) {
    return {
      scored: true,
      correct: true,
      outcome: trial.answer === 'neither' ? 'correct-rejection' : 'hit',
      responseTimeMs: normalizedTime,
    };
  }
  if (trial.answer === 'neither') {
    return { scored: true, correct: false, outcome: 'false-alarm', responseTimeMs: normalizedTime };
  }
  if (response === 'neither') {
    return { scored: true, correct: false, outcome: 'miss', responseTimeMs: normalizedTime };
  }
  return { scored: true, correct: false, outcome: 'wrong-lag', responseTimeMs: normalizedTime };
}

export function validateNBackSession(trials: readonly NBackTrial[]) {
  const errors: string[] = [];
  const rounds = new Map<number, NBackTrial[]>();
  for (const trial of trials) {
    const roundTrials = rounds.get(trial.round) ?? [];
    roundTrials.push(trial);
    rounds.set(trial.round, roundTrials);
  }

  for (const [round, roundTrials] of rounds) {
    const ordered = [...roundTrials].sort((left, right) => left.position - right.position);
    const sequence = ordered.map((trial) => trial.variant);
    const group = ordered[0]?.group;
    for (const trial of ordered) {
      if (trial.group !== group || Math.floor(trial.variant / NBACK_GLYPHS_PER_GROUP) !== group) {
        errors.push(`round ${round}: 선택한 3개 도형 세트 밖의 자극이 섞였습니다.`);
      }
      const expected = classifyNBackDecision(sequence, trial.position, trial.task);
      if (expected === 'ambiguous') errors.push(`round ${round}, position ${trial.position}: 2-back·3-back 정답이 중복됩니다.`);
      else if (expected !== trial.answer) errors.push(`round ${round}, position ${trial.position}: 정답 데이터가 시퀀스와 다릅니다.`);
    }
  }
  return errors;
}
