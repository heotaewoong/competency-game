import type { GameId, SessionResult } from './game-data';
import { getResultComparisonKey, getResultMode, type ResultMode } from './result-comparison.ts';
import { isRotationTransformId, type RotationMatrix, type RotationOpId, type RotationPuzzleKind, type RotationTransformId } from './rotation-game.ts';

export const REVIEW_SCHEMA_VERSION = 2 as const;
export const MAX_REVIEW_ATTEMPTS = 60;
export const MAX_ROTATION_EVENTS = 24;
export const MAX_REVIEW_BYTES = 24 * 1024;

export type ReviewStatus = 'correct' | 'error' | 'neutral';
export type ReviewFact = string | number | boolean | null | string[] | number[];

export type GenericReviewAttempt = {
  kind: 'generic';
  /** False when the item is retained only as session context, not as a scored response. */
  scored?: false;
  id: string;
  index: number;
  status: ReviewStatus;
  errorCodes: string[];
  title: string;
  prompt: string;
  expected: string;
  selected: string;
  explanation: string;
  rtMs?: number;
  facts?: Record<string, ReviewFact>;
};

export type RotationReviewAction = RotationOpId | 'start' | 'undo' | 'reset' | 'submit' | 'timeout' | 'budget';

export type RotationReviewEvent = {
  index: number;
  action: RotationReviewAction;
  elapsedMs: number;
  chargedClicks: number;
  remainingOptimal: number;
  inefficient: boolean;
};

export type RotationReviewAttempt = {
  kind: 'rotation';
  /** False when a phase boundary opened the item but the user never had a scored response. */
  scored?: false;
  id: string;
  index: number;
  status: ReviewStatus;
  errorCodes: string[];
  title: string;
  prompt: string;
  expected: string;
  selected: string;
  explanation: string;
  rtMs?: number;
  phaseEnded?: boolean;
  puzzle: {
    kind: RotationPuzzleKind;
    baseId: string;
    transformId?: RotationTransformId;
    letter?: string;
    pattern?: number[];
    target: RotationMatrix;
    optimal: RotationOpId[];
  };
  submitted: RotationOpId[];
  correction: RotationOpId[];
  events: RotationReviewEvent[];
  firstInefficientEvent: number | null;
};

export type ReviewAttempt = GenericReviewAttempt | RotationReviewAttempt;

export type ReviewSummary = {
  attemptedCount: number;
  correctCount: number;
  neutralCount: number;
  reviewPointCount: number;
  errorCounts: Record<string, number>;
  omittedDetailCount: number;
  coverage: 'full' | 'sampled' | 'legacy-unknown';
};

export type GameReviewPayload = {
  version: typeof REVIEW_SCHEMA_VERSION;
  gameId: GameId;
  attempts: ReviewAttempt[];
  summary: ReviewSummary;
};

export function hasReviewData(review: GameReviewPayload | null | undefined) {
  return Boolean(review && (review.attempts.length > 0 || review.summary.attemptedCount > 0));
}

export type ReviewErrorMeta = {
  label: string;
  tip: string;
};

const fallbackError: ReviewErrorMeta = {
  label: '추가 확인이 필요한 응답',
  tip: '문제와 선택을 나란히 보고, 다음 연습에서는 같은 조건을 한 번 더 확인하세요.',
};

export const reviewErrorCatalog: Record<GameId, Record<string, ReviewErrorMeta>> = {
  rotation: {
    'rotation-angle': { label: '회전 각도 보정 필요', tip: '기준점 하나를 잡고 정사각형↔마름모 한 칸을 45°로 세어 보세요.' },
    'rotation-reflection': { label: '반전 보정 필요', tip: '방향을 맞춘 뒤 기준점의 좌우·상하 순서가 거울상인지 확인하세요.' },
    'rotation-mixed': { label: '회전·반전 혼합 보정', tip: '회전으로 방향을 맞춘 뒤 반전을 검산하고, 단계별 상태를 한 칸씩 확인하세요.' },
    'rotation-redundant': { label: '불필요한 조작 포함', tip: '좌·우 왕복, 같은 반전 두 번, 되돌린 입력을 제출 전에 제거하세요.' },
    'rotation-editing': { label: '지움·초기화로 조작 소모', tip: '입력 전에 기준점과 변환 순서를 짧게 정한 뒤 조작하세요.' },
    'rotation-budget': { label: '20회 조작 소진', tip: '처음 2~3초는 방향과 거울상 여부를 정하는 데 쓰고, 취소 조작을 줄이세요.' },
    'rotation-phase-end': { label: '구간 종료 시 미제출', tip: '마지막 문제에서는 남은 시간을 확인하고, 완벽한 검산보다 제출 가능한 답안을 먼저 완성하세요.' },
    timeout: { label: '시간 초과', tip: '연습 모드에서 과정 미리보기를 켜고 같은 유형을 더 긴 제한시간으로 다시 풀어 보세요.' },
  },
  rps: {
    'rps-tie': { label: '비기는 패 선택', tip: '물음표가 누구의 패인지 먼저 정한 뒤 승리 관계를 한 번만 이동하세요.' },
    'rps-loss': { label: '지는 관계 선택', tip: '가위→보→바위→가위의 승리 고리를 한 방향으로 고정하세요.' },
    timeout: { label: '시간 초과', tip: '내 패 찾기와 상대 패 찾기를 분리해 충분히 익힌 뒤 혼합 속도를 올리세요.' },
  },
  appointment: {
    'appointment-not-common': { label: '세 사람 공통 항목 불일치', tip: '첫 두 사람의 교집합만 남기고 셋째 사람과 한 번 더 비교하세요.' },
    'appointment-seen-bus': { label: '이미 등장한 버스 선택', tip: '버스 문제만큼은 교집합이 아니라, 본 번호를 모두 지운 뒤 남은 번호를 고르세요.' },
    timeout: { label: '시간 초과', tip: 'AND 문제와 NOT 문제를 나눠 연습하고, 정보가 넘어갈 때 후보만 압축해 기억하세요.' },
  },
  path: {
    'path-route': { label: '차량 경로 불일치', tip: '차량마다 출발 방향에서 경로를 추적하고 실제 도착 위치를 하나씩 확인하세요.' },
    'path-fence-count': { label: '경로 성공·울타리 효율 미달', tip: '공개 자료만으로 초과 울타리의 정확한 판정식은 확정할 수 없습니다. 이 연습에서는 경로 성공과 최대득점을 분리해 기록하니, 모든 경로를 연결한 뒤 목표 수까지 따로 검산하세요.' },
    timeout: { label: '시간 초과', tip: '목표에서 마지막 진입 방향을 역추적한 뒤 굴절이 필요한 칸만 조작하세요.' },
  },
  potion: {
    'potion-evidence-opposed': { label: '누적 근거와 반대 선택', tip: '직전 결과가 아니라 같은 조합의 파랑·빨강 누적 횟수를 비교하세요.' },
    timeout: { label: '시간 초과', tip: '14개 조합을 각각 독립된 장부로 생각하고, 현재 조합의 누적 결과만 확인하세요.' },
  },
  nback: {
    'nback-miss': { label: '일치 도형 놓침', tip: '2번째 전·3번째 전 기억 칸을 분리하고 매 문제 한 칸씩만 갱신하세요.' },
    'nback-false-alarm': { label: '일치하지 않는데 선택', tip: '바로 전 도형은 무시하고 정확히 N칸 전 도형만 비교하세요.' },
    'nback-wrong-lag': { label: '2번째·3번째 전 혼동', tip: '두 기억 칸에 서로 다른 위치 이름을 붙여 비교 순서를 고정하세요.' },
    timeout: { label: '응답 누락', tip: '한 글자 암기명을 사용하고, 정답을 오래 검산하기보다 큐를 계속 갱신하세요.' },
  },
  number: {
    'number-skip': { label: '건너뛸 숫자 선택', tip: '시작 전에 건너뛰기 규칙을 한 문장으로 고정하세요.' },
    'number-double-miss': { label: '두 번 누르기 부족', tip: '두 번 숫자에서는 목표를 유지한 채 두 번째 입력까지 끝낸 뒤 이동하세요.' },
    'number-extra': { label: '두 번 누르기 초과', tip: '예외 입력이 끝나면 즉시 다음 숫자로 복귀하세요.' },
    'number-order': { label: '숫자 순서 불일치', tip: '손이 현재 숫자를 누를 때 눈은 다음 숫자 위치를 먼저 찾으세요.' },
    timeout: { label: '시간 초과', tip: '정확한 순서를 유지한 채 제한시간을 단계적으로 줄이세요.' },
  },
  count: {
    'count-side': { label: '더 적은 쪽 선택', tip: '단어를 읽지 말고 빈 공간과 밀도를 비교하고, 차이가 작으면 구역별로 세세요.' },
    timeout: { label: '응답 누락', tip: '중앙 시야를 유지하며 좌우 전체 밀도를 먼저 비교하세요.' },
  },
  mouse: {
    'mouse-miss': { label: '생쥐가 있던 칸 놓침', tip: '생쥐 위치와 대상 고양이 위치를 같은 6×6 좌표에 겹쳐 보세요.' },
    'mouse-false-alarm': { label: '빈 칸에서 찾았다고 판단', tip: '빨강과 파랑을 각각 독립적으로 기억 지도와 대조하세요.' },
    'mouse-overconfidence': { label: '오답에 높은 확신', tip: '위치 기억이 흐린 문제에서는 판단과 확신을 분리해 확신도를 낮추세요.' },
    'mouse-confidence-timeout': { label: '응답 미완료(이전 기록)', tip: '현재 화면에서는 찾았다·놓쳤다와 확신도를 한 번에 선택합니다.' },
    timeout: { label: '찾았다·놓쳤다와 확신도 응답 누락', tip: '행·열이나 구역 단위로 위치를 압축해 판단 시간을 줄이세요.' },
  },
};

const gameIds = new Set<GameId>(['rotation', 'rps', 'appointment', 'path', 'potion', 'nback', 'number', 'count', 'mouse']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStatus(value: unknown): value is ReviewStatus {
  return value === 'correct' || value === 'error' || value === 'neutral';
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 500) : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeStringArray(value: unknown, max = 8) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, max) : [];
}

function sanitizeFacts(value: unknown): Record<string, ReviewFact> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).slice(0, 12).flatMap(([key, fact]): Array<[string, ReviewFact]> => {
    const safeKey = key.slice(0, 40);
    if (typeof fact === 'string') return [[safeKey, fact.slice(0, 300)]];
    if (typeof fact === 'number' && Number.isFinite(fact)) return [[safeKey, fact]];
    if (typeof fact === 'boolean' || fact === null) return [[safeKey, fact]];
    if (Array.isArray(fact) && fact.every((item) => typeof item === 'string')) return [[safeKey, fact.slice(0, 40).map((item) => item.slice(0, 80))]];
    if (Array.isArray(fact) && fact.every((item) => typeof item === 'number' && Number.isFinite(item))) return [[safeKey, fact.slice(0, 40)]];
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function safeCount(value: unknown, fallback = 0, max = 10_000) {
  return Math.min(max, Math.max(0, Math.round(safeNumber(value, fallback))));
}

const rotationOps = new Set<RotationOpId>(['left', 'right', 'flip-x', 'flip-y']);
const rotationActions = new Set<RotationReviewAction>(['start', 'left', 'right', 'flip-x', 'flip-y', 'undo', 'reset', 'submit', 'timeout', 'budget']);

function sanitizeRotationSequence(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is RotationOpId => rotationOps.has(item as RotationOpId)).slice(0, 8) : [];
}

function sanitizeRotationMatrix(value: unknown): RotationMatrix | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return value.map((item) => Math.round(item * 10_000) / 10_000) as RotationMatrix;
}

function sanitizeGenericAttempt(value: Record<string, unknown>, fallbackIndex: number): GenericReviewAttempt | null {
  if (value.kind !== 'generic' || !isStatus(value.status)) return null;
  const facts = sanitizeFacts(value.facts);
  return {
    kind: 'generic',
    ...(value.scored === false ? { scored: false as const } : {}),
    id: safeText(value.id, `attempt-${fallbackIndex}`),
    index: Math.max(0, Math.round(safeNumber(value.index, fallbackIndex))),
    status: value.status,
    errorCodes: safeStringArray(value.errorCodes),
    title: safeText(value.title, `${fallbackIndex + 1}번 시도`),
    prompt: safeText(value.prompt),
    expected: safeText(value.expected),
    selected: safeText(value.selected),
    explanation: safeText(value.explanation),
    ...(typeof value.rtMs === 'number' && Number.isFinite(value.rtMs) ? { rtMs: Math.max(0, Math.round(value.rtMs)) } : {}),
    ...(facts ? { facts } : {}),
  };
}

function sanitizeRotationAttempt(value: Record<string, unknown>, fallbackIndex: number): RotationReviewAttempt | null {
  if (value.kind !== 'rotation' || !isStatus(value.status) || !isRecord(value.puzzle)) return null;
  const target = sanitizeRotationMatrix(value.puzzle.target);
  const puzzleKind = value.puzzle.kind;
  if (!target || (puzzleKind !== 'letter' && puzzleKind !== 'tiles')) return null;
  const events = Array.isArray(value.events) ? value.events.flatMap((eventValue, eventIndex): RotationReviewEvent[] => {
    if (!isRecord(eventValue) || !rotationActions.has(eventValue.action as RotationReviewAction)) return [];
    return [{
      index: Math.max(0, Math.round(safeNumber(eventValue.index, eventIndex))),
      action: eventValue.action as RotationReviewAction,
      elapsedMs: Math.max(0, Math.round(safeNumber(eventValue.elapsedMs))),
      chargedClicks: Math.max(0, Math.round(safeNumber(eventValue.chargedClicks))),
      remainingOptimal: Math.max(0, Math.round(safeNumber(eventValue.remainingOptimal))),
      inefficient: eventValue.inefficient === true,
    }];
  }).slice(0, MAX_ROTATION_EVENTS) : [];
  return {
    kind: 'rotation',
    ...(value.scored === false ? { scored: false as const } : {}),
    id: safeText(value.id, `rotation-${fallbackIndex}`),
    index: Math.max(0, Math.round(safeNumber(value.index, fallbackIndex))),
    status: value.status,
    errorCodes: safeStringArray(value.errorCodes),
    title: safeText(value.title, `${fallbackIndex + 1}번 시도`),
    prompt: safeText(value.prompt),
    expected: safeText(value.expected),
    selected: safeText(value.selected),
    explanation: safeText(value.explanation),
    ...(typeof value.rtMs === 'number' && Number.isFinite(value.rtMs) ? { rtMs: Math.max(0, Math.round(value.rtMs)) } : {}),
    ...(value.phaseEnded === true ? { phaseEnded: true } : {}),
    puzzle: {
      kind: puzzleKind,
      baseId: safeText(value.puzzle.baseId),
      ...(isRotationTransformId(value.puzzle.transformId) ? { transformId: value.puzzle.transformId } : {}),
      ...(typeof value.puzzle.letter === 'string' ? { letter: value.puzzle.letter.slice(0, 2) } : {}),
      ...(Array.isArray(value.puzzle.pattern) ? { pattern: value.puzzle.pattern.map((cell) => cell ? 1 : 0).slice(0, 25) } : {}),
      target,
      optimal: sanitizeRotationSequence(value.puzzle.optimal),
    },
    submitted: sanitizeRotationSequence(value.submitted),
    correction: sanitizeRotationSequence(value.correction),
    events,
    firstInefficientEvent: typeof value.firstInefficientEvent === 'number' && Number.isFinite(value.firstInefficientEvent)
      ? Math.max(0, Math.round(value.firstInefficientEvent))
      : null,
  };
}

function summarizeAttempts(attempts: readonly ReviewAttempt[], omittedDetailCount = 0, coverage: ReviewSummary['coverage'] = 'full'): ReviewSummary {
  const scoredAttempts = attempts.filter((attempt) => attempt.scored !== false);
  const errorCounts: Record<string, number> = {};
  scoredAttempts.forEach((attempt) => {
    new Set(attempt.errorCodes).forEach((code) => { errorCounts[code] = (errorCounts[code] ?? 0) + 1; });
  });
  return {
    attemptedCount: scoredAttempts.length,
    correctCount: scoredAttempts.filter((attempt) => attempt.status === 'correct').length,
    neutralCount: scoredAttempts.filter((attempt) => attempt.status === 'neutral').length,
    reviewPointCount: scoredAttempts.filter((attempt) => attempt.status !== 'correct' || attempt.errorCodes.length > 0).length,
    errorCounts,
    omittedDetailCount,
    coverage,
  };
}

function sanitizeSummary(value: unknown, attempts: readonly ReviewAttempt[], legacy: boolean): ReviewSummary {
  const fallback = summarizeAttempts(attempts, 0, legacy ? 'legacy-unknown' : 'full');
  if (!isRecord(value)) return fallback;
  const scoredAttemptCount = attempts.filter((attempt) => attempt.scored !== false).length;
  const attemptedCount = Math.max(scoredAttemptCount, safeCount(value.attemptedCount, scoredAttemptCount));
  const errorCounts = isRecord(value.errorCounts)
    ? Object.fromEntries(Object.entries(value.errorCounts).slice(0, 100).flatMap(([code, count]): Array<[string, number]> => {
      const safeCode = code.slice(0, 80);
      const safeValue = safeCount(count, 0, attemptedCount);
      return safeCode && safeValue ? [[safeCode, safeValue]] : [];
    }))
    : fallback.errorCounts;
  const rawCoverage = value.coverage;
  const coverage: ReviewSummary['coverage'] = legacy
    ? 'legacy-unknown'
    : rawCoverage === 'sampled' || rawCoverage === 'legacy-unknown' ? rawCoverage : 'full';
  const omittedDetailCount = safeCount(value.omittedDetailCount, Math.max(0, attemptedCount - scoredAttemptCount));
  // A complete payload can be derived from its attempts. Recomputing prevents stale or
  // previously misclassified summary fields from surviving a load/save cycle.
  if (coverage === 'full' && omittedDetailCount === 0) return fallback;
  return {
    attemptedCount,
    correctCount: safeCount(value.correctCount, fallback.correctCount, attemptedCount),
    neutralCount: safeCount(value.neutralCount, fallback.neutralCount, attemptedCount),
    reviewPointCount: safeCount(value.reviewPointCount, fallback.reviewPointCount, attemptedCount),
    errorCounts,
    omittedDetailCount,
    coverage,
  };
}

export function sanitizeReviewPayload(value: unknown): GameReviewPayload | undefined {
  if (!isRecord(value) || (value.version !== 1 && value.version !== REVIEW_SCHEMA_VERSION) || !gameIds.has(value.gameId as GameId) || !Array.isArray(value.attempts)) return undefined;
  const legacy = value.version === 1;
  const attempts = value.attempts.flatMap((attempt, index): ReviewAttempt[] => {
    if (!isRecord(attempt)) return [];
    const sanitized = attempt.kind === 'rotation' ? sanitizeRotationAttempt(attempt, index) : sanitizeGenericAttempt(attempt, index);
    return sanitized ? [sanitized] : [];
  }).slice(0, MAX_REVIEW_ATTEMPTS);
  return { version: REVIEW_SCHEMA_VERSION, gameId: value.gameId as GameId, attempts, summary: sanitizeSummary(value.summary, attempts, legacy) };
}

export function compactReviewPayload(gameId: GameId, attempts: readonly ReviewAttempt[]): GameReviewPayload {
  const sanitized = attempts.flatMap((attempt, index): ReviewAttempt[] => {
    const record = attempt as unknown as Record<string, unknown>;
    const restored = attempt.kind === 'rotation' ? sanitizeRotationAttempt(record, index) : sanitizeGenericAttempt(record, index);
    return restored ? [restored] : [];
  });
  const latest = [...sanitized].reverse();
  const representatives: ReviewAttempt[] = [];
  const representedCodes = new Set<string>();
  latest.forEach((attempt) => {
    if (attempt.errorCodes.some((code) => !representedCodes.has(code))) {
      representatives.push(attempt);
      attempt.errorCodes.forEach((code) => representedCodes.add(code));
    }
  });
  const seen = new Set<ReviewAttempt>(representatives);
  const candidates = [
    ...representatives,
    ...latest.filter((attempt) => !seen.has(attempt) && (attempt.status !== 'correct' || attempt.errorCodes.length > 0)),
    ...latest.filter((attempt) => !seen.has(attempt) && attempt.status === 'correct' && attempt.errorCodes.length === 0),
  ];
  const fullSummary = summarizeAttempts(sanitized);
  let selected: ReviewAttempt[] = [];
  for (const candidate of candidates) {
    if (selected.length >= MAX_REVIEW_ATTEMPTS) break;
    const next = [...selected, candidate].sort((a, b) => a.index - b.index);
    const draft: GameReviewPayload = {
      version: REVIEW_SCHEMA_VERSION,
      gameId,
      attempts: next,
      summary: {
        ...fullSummary,
        omittedDetailCount: sanitized.length - next.length,
        coverage: next.length === sanitized.length ? 'full' : 'sampled',
      },
    };
    if (reviewPayloadBytes(draft) <= MAX_REVIEW_BYTES) selected = next;
  }
  const payload: GameReviewPayload = {
    version: REVIEW_SCHEMA_VERSION,
    gameId,
    attempts: selected,
    summary: {
      ...fullSummary,
      omittedDetailCount: sanitized.length - selected.length,
      coverage: selected.length === sanitized.length ? 'full' : 'sampled',
    },
  };
  return sanitizeReviewPayload(payload) ?? payload;
}

export function reviewPayloadBytes(payload: GameReviewPayload) {
  const serialized = JSON.stringify(payload);
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(serialized).length : serialized.length * 2;
}

export function replayRotationEvents(events: readonly RotationReviewEvent[]) {
  let sequence: RotationOpId[] = [];
  return events.map((event) => {
    if (rotationOps.has(event.action as RotationOpId)) sequence = [...sequence, event.action as RotationOpId].slice(0, 8);
    else if (event.action === 'undo') sequence = sequence.slice(0, -1);
    else if (event.action === 'reset' || event.action === 'start') sequence = [];
    return [...sequence];
  });
}

export function getReviewErrorMeta(gameId: GameId, errorCode: string) {
  return reviewErrorCatalog[gameId][errorCode] ?? fallbackError;
}

export function rotationActionLabel(action: RotationReviewAction) {
  const labels: Record<RotationReviewAction, string> = {
    start: '시작',
    left: '왼쪽 45° 회전',
    right: '오른쪽 45° 회전',
    'flip-x': '좌우 반전',
    'flip-y': '상하 반전',
    undo: '마지막 조작 지움',
    reset: '전체 초기화',
    submit: '답안 제출',
    timeout: '시간 초과',
    budget: '조작 소진',
  };
  return labels[action];
}

export type ReviewErrorSummary = ReviewErrorMeta & {
  gameId: GameId;
  errorCode: string;
  count: number;
  attemptedCount: number;
  rate: number;
  sessionCount: number;
  lastSeen: string;
  contextKey: string;
  contextLabel: string;
  contextComparable: boolean;
  representativeSessionId: string;
};

type ReviewableSession = {
  id?: string;
  gameId: GameId;
  completedAt: string;
  detail?: SessionResult['detail'];
  review?: GameReviewPayload;
};

export type ReviewAggregationContext = {
  key: string;
  label: string;
  mode: ResultMode;
  comparable: boolean;
};

export function getReviewAggregationContext(session: ReviewableSession, fallbackIndex = 0): ReviewAggregationContext {
  const result = session as SessionResult;
  const mode = getResultMode(result);
  const comparisonKey = getResultComparisonKey(result);
  const modeLabel = mode === 'practice' ? '연습 모드' : mode === 'simulation' ? '실전형 연습' : '모드·설정 미상';
  if (comparisonKey) {
    return { key: `comparable:${session.gameId}:${comparisonKey}`, label: `${modeLabel} · 동일 설정`, mode, comparable: true };
  }
  const sessionKey = session.id?.trim() || `legacy-${fallbackIndex}`;
  const visibilityPauses = typeof session.detail?.visibilityPauses === 'number' ? session.detail.visibilityPauses : 0;
  const label = mode === 'unknown'
    ? '모드·설정 미상 · 이전 기록'
    : visibilityPauses > 0
      ? `${modeLabel} · 탭 이탈로 비교 제외`
      : `${modeLabel} · 설정 미상`;
  return { key: `isolated:${session.gameId}:${sessionKey}`, label, mode, comparable: false };
}

/**
 * Aggregates only one fair comparison context per game. Without an explicit
 * context, the newest scored session selects that game's active context;
 * legacy or interrupted sessions stay isolated and are never silently merged.
 */
export function aggregateReviewErrors(sessions: readonly ReviewableSession[], gameId?: GameId, contextKey?: string): ReviewErrorSummary[] {
  const prepared = sessions.flatMap((session, sessionIndex) => {
    if (gameId && session.gameId !== gameId) return [];
    const review = sanitizeReviewPayload(session.review);
    if (!review || review.gameId !== session.gameId) return [];
    return [{ session, sessionIndex, review, context: getReviewAggregationContext(session, sessionIndex) }];
  });
  const activeContextByGame = new Map<GameId, string>();
  if (!contextKey) {
    [...prepared]
      .filter(({ review }) => review.summary.attemptedCount > 0)
      .sort((left, right) => Date.parse(right.session.completedAt) - Date.parse(left.session.completedAt) || right.sessionIndex - left.sessionIndex)
      .forEach(({ session, context }) => {
        if (!activeContextByGame.has(session.gameId)) activeContextByGame.set(session.gameId, context.key);
      });
  }
  const selected = prepared.filter(({ session, context }) => contextKey ? context.key === contextKey : activeContextByGame.get(session.gameId) === context.key);
  const buckets = new Map<string, ReviewErrorSummary & { sessionIds: Set<string> }>();
  const attemptedByContext = new Map<string, number>();
  selected.forEach(({ session, sessionIndex, review, context }) => {
    const denominatorKey = `${session.gameId}:${context.key}`;
    attemptedByContext.set(denominatorKey, (attemptedByContext.get(denominatorKey) ?? 0) + review.summary.attemptedCount);
    const sessionId = session.id?.trim() || `legacy-${sessionIndex}`;
    Object.entries(review.summary.errorCounts).forEach(([errorCode, count]) => {
      if (count <= 0) return;
        const key = `${session.gameId}:${context.key}:${errorCode}`;
        const current = buckets.get(key);
        if (current) {
          current.count += count;
          current.sessionIds.add(sessionId);
          if (Date.parse(session.completedAt) > Date.parse(current.lastSeen)) {
            current.lastSeen = session.completedAt;
            current.representativeSessionId = sessionId;
          }
          return;
        }
        buckets.set(key, {
          gameId: session.gameId,
          errorCode,
          ...getReviewErrorMeta(session.gameId, errorCode),
          count,
          attemptedCount: 0,
          rate: 0,
          sessionCount: 1,
          lastSeen: session.completedAt,
          contextKey: context.key,
          contextLabel: context.label,
          contextComparable: context.comparable,
          representativeSessionId: sessionId,
          sessionIds: new Set([sessionId]),
        });
    });
  });
  return [...buckets.values()].map(({ sessionIds, ...summary }) => {
    const attemptedCount = attemptedByContext.get(`${summary.gameId}:${summary.contextKey}`) ?? 0;
    return {
      ...summary,
      attemptedCount,
      rate: attemptedCount ? Math.round((summary.count / attemptedCount) * 1000) / 10 : 0,
      sessionCount: sessionIds.size,
    };
  }).sort((a, b) => gameId
    ? b.count - a.count || b.rate - a.rate || Date.parse(b.lastSeen) - Date.parse(a.lastSeen) || a.label.localeCompare(b.label, 'ko')
    : b.sessionCount - a.sessionCount || b.rate - a.rate || b.count - a.count || Date.parse(b.lastSeen) - Date.parse(a.lastSeen) || a.label.localeCompare(b.label, 'ko'));
}
