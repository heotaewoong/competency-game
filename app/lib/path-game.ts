export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Direction = 'up' | 'right' | 'down' | 'left';
export type Fence = 'slash' | 'backslash';
export type Vehicle = {
  id: string;
  icon: string;
  color: string;
  start: { side: Side; index: number };
  goal: { side: Side; index: number };
};
export type PathInteraction = 'base' | 'shared' | 'detour';
export type PathComposition = 'crossing-only' | 'parallel-only' | 'mixed';
export type PathOrderHint = 'free' | 'parallel-first';
export type PathFocus =
  | 'all'
  | 'base'
  | 'shared'
  | 'detour'
  | 'crossing-only'
  | 'parallel-only'
  | 'mixed-pairs'
  | 'parallel-first';
export type PathPuzzle = {
  id: string;
  target: number;
  correct: Record<string, Fence>;
  vehicles: Vehicle[];
  orderHint?: PathOrderHint;
};
export type PathPuzzleMeta = {
  interaction: PathInteraction;
  composition: PathComposition;
  crossingCount: number;
  parallelCount: number;
  straightCount: number;
  baseFenceCount: number;
  orderHint: PathOrderHint;
};

const vehicleStyles = [
  { icon: '🚗', color: '#f3a52b' },
  { icon: '🚌', color: '#3977e7' },
  { icon: '🛵', color: '#e95f69' },
] as const;

function vehicles(routes: Array<[Side, number, Side, number]>): Vehicle[] {
  return routes.map(([startSide, startIndex, goalSide, goalIndex], index) => ({
    id: String.fromCharCode(65 + index),
    ...vehicleStyles[index],
    start: { side: startSide, index: startIndex },
    goal: { side: goalSide, index: goalIndex },
  }));
}

// 공개된 교차·평행·공유·우회 원리만 사용해 새로 만든 독자 문항이다.
// 각 target은 5×5 모든 울타리 배치를 target-1개까지 전수 탐색해 최소값임을 확인했다.
const basePuzzles: readonly PathPuzzle[] = [
  {
    id: 'base-crossing-3', target: 3,
    correct: { '0-3': 'slash', '2-0': 'slash', '3-0': 'backslash' },
    vehicles: vehicles([['left', 2, 'top', 0], ['top', 3, 'left', 0], ['left', 3, 'bottom', 0]]),
  },
  {
    id: 'base-parallel-2', target: 4,
    correct: { '0-0': 'slash', '1-0': 'slash', '2-0': 'slash', '3-0': 'slash' },
    vehicles: vehicles([['right', 2, 'left', 3], ['right', 0, 'left', 1]]),
  },
  {
    id: 'base-mixed-c2p1', target: 4,
    correct: { '0-0': 'slash', '0-1': 'slash', '0-3': 'backslash', '4-0': 'slash' },
    vehicles: vehicles([['right', 4, 'bottom', 0], ['left', 4, 'top', 1], ['bottom', 3, 'bottom', 1]]),
  },
  {
    id: 'base-mixed-c1p2', target: 5,
    correct: { '4-1': 'backslash', '3-4': 'slash', '2-3': 'backslash', '3-2': 'slash', '3-1': 'backslash' },
    vehicles: vehicles([['right', 4, 'left', 3], ['bottom', 3, 'left', 2], ['bottom', 2, 'top', 4]]),
  },
  {
    id: 'shared-crossing-2', target: 1,
    correct: { '2-4': 'slash' },
    vehicles: vehicles([['left', 2, 'top', 4], ['bottom', 4, 'right', 2]]),
  },
  {
    id: 'shared-parallel-2', target: 3,
    correct: { '0-0': 'slash', '1-0': 'slash', '2-0': 'backslash' },
    vehicles: vehicles([['right', 2, 'right', 1], ['right', 0, 'left', 1]]),
  },
  {
    id: 'shared-mixed-c2p1', target: 2,
    correct: { '4-0': 'slash', '4-3': 'backslash' },
    vehicles: vehicles([['right', 4, 'top', 3], ['left', 4, 'top', 0], ['bottom', 3, 'bottom', 0]]),
  },
  {
    id: 'shared-mixed-c2p1-one-save', target: 3,
    correct: { '2-1': 'slash', '4-4': 'backslash', '2-2': 'slash' },
    vehicles: vehicles([['right', 2, 'bottom', 2], ['right', 4, 'top', 4], ['top', 2, 'bottom', 1]]),
  },
  {
    id: 'shared-mixed-c1p2', target: 3,
    correct: { '0-0': 'slash', '4-0': 'slash', '4-3': 'backslash' },
    vehicles: vehicles([['right', 4, 'top', 3], ['left', 4, 'right', 0], ['bottom', 3, 'bottom', 0]]),
  },
  {
    id: 'shared-parallel-3', target: 4,
    correct: { '0-0': 'slash', '1-3': 'slash', '4-0': 'slash', '4-3': 'backslash' },
    vehicles: vehicles([['right', 4, 'right', 1], ['left', 4, 'right', 0], ['bottom', 3, 'bottom', 0]]),
  },
  {
    id: 'shared-parallel-3-one-save', target: 5,
    correct: { '4-2': 'slash', '0-1': 'backslash', '1-0': 'slash', '3-0': 'slash', '4-1': 'slash' },
    vehicles: vehicles([['bottom', 1, 'top', 2], ['left', 3, 'right', 1], ['left', 0, 'left', 4]]),
  },
  {
    id: 'detour-crossing-2', target: 3,
    correct: { '2-0': 'slash', '2-1': 'slash', '3-0': 'slash' },
    vehicles: vehicles([['left', 3, 'top', 1], ['right', 2, 'bottom', 1]]),
  },
  {
    id: 'detour-parallel-2', target: 5,
    correct: { '0-0': 'backslash', '0-1': 'slash', '2-0': 'backslash', '3-0': 'backslash', '3-1': 'slash' },
    vehicles: vehicles([['right', 2, 'left', 0], ['right', 0, 'left', 2]]),
  },
  {
    id: 'detour-mixed-c1p1', target: 4, orderHint: 'parallel-first',
    correct: { '0-0': 'slash', '0-1': 'backslash', '2-0': 'slash', '3-1': 'slash' },
    vehicles: vehicles([['left', 3, 'left', 2], ['right', 2, 'bottom', 0]]),
  },
  {
    id: 'detour-mixed-c1p1-extra-2', target: 5, orderHint: 'parallel-first',
    correct: { '0-0': 'backslash', '0-2': 'backslash', '0-3': 'slash', '1-0': 'slash', '1-3': 'slash' },
    vehicles: vehicles([['right', 0, 'bottom', 0], ['bottom', 2, 'top', 0]]),
  },
  {
    id: 'detour-mixed-c2p1', target: 5, orderHint: 'parallel-first',
    correct: { '0-0': 'slash', '0-1': 'slash', '0-2': 'slash', '0-3': 'backslash', '4-0': 'slash' },
    vehicles: vehicles([['right', 4, 'bottom', 0], ['left', 4, 'top', 1], ['bottom', 3, 'bottom', 2]]),
  },
];

const directionDelta: Record<Direction, [number, number]> = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
const slashTurn: Record<Direction, Direction> = { up: 'right', right: 'up', down: 'left', left: 'down' };
const backslashTurn: Record<Direction, Direction> = { up: 'left', left: 'up', down: 'right', right: 'down' };
const oppositeSide: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function enterFrom(start: Vehicle['start']) {
  if (start.side === 'top') return { row: 0, col: start.index, direction: 'down' as Direction };
  if (start.side === 'bottom') return { row: 4, col: start.index, direction: 'up' as Direction };
  if (start.side === 'left') return { row: start.index, col: 0, direction: 'right' as Direction };
  return { row: start.index, col: 4, direction: 'left' as Direction };
}

export function simulatePath(start: Vehicle['start'], fences: Record<string, Fence>): Vehicle['goal'] | null {
  let { row, col, direction } = enterFrom(start);
  for (let step = 0; step < 80; step += 1) {
    const fence = fences[`${row}-${col}`];
    if (fence === 'slash') direction = slashTurn[direction];
    if (fence === 'backslash') direction = backslashTurn[direction];
    const [dr, dc] = directionDelta[direction];
    row += dr;
    col += dc;
    if (row < 0) return { side: 'top', index: col };
    if (row > 4) return { side: 'bottom', index: col };
    if (col < 0) return { side: 'left', index: row };
    if (col > 4) return { side: 'right', index: row };
  }
  return null;
}

export function pathRelation(start: Vehicle['start'], goal: Vehicle['goal']): 'straight' | 'crossing' | 'parallel' {
  if (oppositeSide[start.side] === goal.side && start.index === goal.index) return 'straight';
  const startVertical = start.side === 'top' || start.side === 'bottom';
  const goalVertical = goal.side === 'top' || goal.side === 'bottom';
  return startVertical !== goalVertical ? 'crossing' : 'parallel';
}

export function pathPuzzleMeta(puzzle: PathPuzzle): PathPuzzleMeta {
  const relations = puzzle.vehicles.map((vehicle) => pathRelation(vehicle.start, vehicle.goal));
  const crossingCount = relations.filter((relation) => relation === 'crossing').length;
  const parallelCount = relations.filter((relation) => relation === 'parallel').length;
  const straightCount = relations.filter((relation) => relation === 'straight').length;
  const baseFenceCount = crossingCount + parallelCount * 2;
  const interaction: PathInteraction = puzzle.target < baseFenceCount ? 'shared' : puzzle.target > baseFenceCount ? 'detour' : 'base';
  const composition: PathComposition = crossingCount > 0 && parallelCount > 0 ? 'mixed' : crossingCount > 0 ? 'crossing-only' : 'parallel-only';
  return { interaction, composition, crossingCount, parallelCount, straightCount, baseFenceCount, orderHint: puzzle.orderHint ?? 'free' };
}

export function nextFenceValue(current: Fence | undefined, requested: Fence): Fence | undefined {
  return current === requested ? undefined : requested;
}

type Coordinate = { row: number; col: number };

function transformCoordinate(coordinate: Coordinate, variant: number): Coordinate {
  let { row, col } = coordinate;
  const mirrored = variant >= 4;
  const rotations = variant % 4;
  if (mirrored) col = 4 - col;
  for (let turn = 0; turn < rotations; turn += 1) [row, col] = [col, 4 - row];
  return { row, col };
}

function markerCoordinate(marker: Vehicle['start']): Coordinate {
  if (marker.side === 'top') return { row: -1, col: marker.index };
  if (marker.side === 'bottom') return { row: 5, col: marker.index };
  if (marker.side === 'left') return { row: marker.index, col: -1 };
  return { row: marker.index, col: 5 };
}

function coordinateMarker({ row, col }: Coordinate): Vehicle['start'] {
  if (row === -1) return { side: 'top', index: col };
  if (row === 5) return { side: 'bottom', index: col };
  if (col === -1) return { side: 'left', index: row };
  if (col === 5) return { side: 'right', index: row };
  throw new Error(`보드 경계 좌표가 아닙니다: ${row},${col}`);
}

export function transformPathPuzzle(puzzle: PathPuzzle, variant: number): PathPuzzle {
  if (!Number.isInteger(variant) || variant < 0 || variant > 7) throw new RangeError('경로 변형은 0~7의 정수여야 합니다.');
  const mirrored = variant >= 4;
  const rotations = variant % 4;
  const swapFence = mirrored !== (rotations % 2 === 1);
  const correct = Object.fromEntries(Object.entries(puzzle.correct).map(([key, fence]) => {
    const [row, col] = key.split('-').map(Number);
    const next = transformCoordinate({ row, col }, variant);
    const nextFence: Fence = swapFence ? fence === 'slash' ? 'backslash' : 'slash' : fence;
    return [`${next.row}-${next.col}`, nextFence];
  }));
  const nextVehicles = puzzle.vehicles.map((vehicle) => ({
    ...vehicle,
    start: coordinateMarker(transformCoordinate(markerCoordinate(vehicle.start), variant)),
    goal: coordinateMarker(transformCoordinate(markerCoordinate(vehicle.goal), variant)),
  }));
  return { ...puzzle, id: `${puzzle.id}-v${variant}`, correct, vehicles: nextVehicles };
}

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

export function allPathPuzzles() {
  return basePuzzles.flatMap((puzzle) => Array.from({ length: 8 }, (_, variant) => transformPathPuzzle(puzzle, variant)));
}

export function pathDifficultyRank(puzzle: PathPuzzle) {
  const meta = pathPuzzleMeta(puzzle);
  const interactionRank: Record<PathInteraction, number> = { base: 0, shared: 1, detour: 2 };
  const compositionRank: Record<PathComposition, number> = { 'crossing-only': 0, 'parallel-only': 1, mixed: 2 };
  return puzzle.vehicles.length * 100
    + interactionRank[meta.interaction] * 20
    + compositionRank[meta.composition] * 5
    + (meta.orderHint === 'parallel-first' ? 3 : 0)
    + puzzle.target;
}

function matchesPathFocus(puzzle: PathPuzzle, focus: PathFocus) {
  if (focus === 'all') return true;
  const meta = pathPuzzleMeta(puzzle);
  if (focus === 'base' || focus === 'shared' || focus === 'detour') return meta.interaction === focus;
  if (focus === 'crossing-only' || focus === 'parallel-only') return meta.composition === focus;
  if (focus === 'mixed-pairs') return meta.composition === 'mixed';
  return meta.orderHint === 'parallel-first';
}

export function buildPathPuzzles(quantity: number, seed: number, focus: PathFocus = 'all'): PathPuzzle[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('길 만들기 문항 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  const pool = allPathPuzzles().filter((puzzle) => matchesPathFocus(puzzle, focus));
  if (!pool.length) throw new Error(`선택한 길 만들기 집중 유형에 출제 가능한 문항이 없습니다: ${focus}`);
  const result: PathPuzzle[] = [];
  while (result.length < quantity) result.push(...shuffled(pool, random));
  return result.slice(0, quantity).sort((left, right) => pathDifficultyRank(left) - pathDifficultyRank(right));
}

function markerKey(marker: Vehicle['start']) {
  return `${marker.side}-${marker.index}`;
}

export function validatePathPuzzle(puzzle: PathPuzzle) {
  const errors: string[] = [];
  if (Object.keys(puzzle.correct).length !== puzzle.target) errors.push('기준 울타리 수와 목표 수가 다릅니다.');
  const markers = puzzle.vehicles.flatMap((vehicle) => [markerKey(vehicle.start), markerKey(vehicle.goal)]);
  if (new Set(markers).size !== markers.length) errors.push('차량과 손님의 경계 위치가 서로 겹칩니다.');
  for (const vehicle of puzzle.vehicles) {
    const exit = simulatePath(vehicle.start, puzzle.correct);
    if (exit?.side !== vehicle.goal.side || exit.index !== vehicle.goal.index) errors.push(`${vehicle.id} 차량이 목표 출구로 가지 않습니다.`);
  }
  return errors;
}

export type PathSessionScore = {
  correct: number;
  errors: number;
  rts: number[];
  attemptErrors: number;
  clicks: number;
  functionalCompleted: number;
  correctedAfterRetry: number;
};

export function createPathSessionScore(): PathSessionScore {
  return { correct: 0, errors: 0, rts: [], attemptErrors: 0, clicks: 0, functionalCompleted: 0, correctedAfterRetry: 0 };
}

export function finalizePathTrialScore(
  score: PathSessionScore,
  trial: {
    success: boolean;
    hadError: boolean;
    functionalReached: boolean;
    functionalRtMs: number | null;
    responseTimeMs: number;
    clicks: number;
  },
): PathSessionScore {
  const firstTrySuccess = trial.success && !trial.hadError;
  const functionalSuccess = trial.success || trial.functionalReached;
  const functionalResponseTime = trial.functionalRtMs ?? trial.responseTimeMs;
  return {
    ...score,
    correct: score.correct + (firstTrySuccess ? 1 : 0),
    errors: score.errors + (firstTrySuccess ? 0 : 1),
    rts: functionalSuccess ? [...score.rts, functionalResponseTime] : score.rts,
    clicks: trial.clicks,
    functionalCompleted: score.functionalCompleted + (functionalSuccess ? 1 : 0),
    correctedAfterRetry: score.correctedAfterRetry + (trial.success && trial.hadError ? 1 : 0),
  };
}
