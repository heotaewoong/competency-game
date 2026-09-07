export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Direction = 'up' | 'right' | 'down' | 'left';
export type Fence = 'slash' | 'backslash';
export type Vehicle = { id: string; icon: string; color: string; start: { side: Side; index: number }; goal: { side: Side; index: number } };
export type PathPuzzle = { target: number; correct: Record<string, Fence>; vehicles: Vehicle[] };

const basePuzzles: readonly PathPuzzle[] = [
  { target: 2, correct: { '3-2': 'slash', '1-1': 'slash' }, vehicles: [
    { id: 'A', icon: '🚗', color: '#f3a52b', start: { side: 'left', index: 3 }, goal: { side: 'top', index: 2 } },
    { id: 'B', icon: '🚌', color: '#3977e7', start: { side: 'bottom', index: 1 }, goal: { side: 'right', index: 1 } },
  ] },
  { target: 2, correct: { '3-1': 'slash', '2-3': 'slash' }, vehicles: [
    { id: 'A', icon: '🛵', color: '#e95f69', start: { side: 'top', index: 1 }, goal: { side: 'left', index: 3 } },
    { id: 'B', icon: '🚕', color: '#3bae79', start: { side: 'right', index: 2 }, goal: { side: 'bottom', index: 3 } },
  ] },
  { target: 3, correct: { '4-2': 'slash', '1-2': 'backslash', '2-4': 'backslash' }, vehicles: [
    { id: 'A', icon: '🚙', color: '#906ee8', start: { side: 'left', index: 4 }, goal: { side: 'left', index: 1 } },
    { id: 'B', icon: '🚐', color: '#19a6a6', start: { side: 'top', index: 4 }, goal: { side: 'right', index: 2 } },
  ] },
];

const directionDelta: Record<Direction, [number, number]> = { up: [-1,0], right: [0,1], down: [1,0], left: [0,-1] };
const slashTurn: Record<Direction, Direction> = { up: 'right', right: 'up', down: 'left', left: 'down' };
const backslashTurn: Record<Direction, Direction> = { up: 'left', left: 'up', down: 'right', right: 'down' };

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
    const [dr, dc] = directionDelta[direction]; row += dr; col += dc;
    if (row < 0) return { side: 'top', index: col };
    if (row > 4) return { side: 'bottom', index: col };
    if (col < 0) return { side: 'left', index: row };
    if (col > 4) return { side: 'right', index: row };
  }
  return null;
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
  const vehicles = puzzle.vehicles.map((vehicle) => ({
    ...vehicle,
    start: coordinateMarker(transformCoordinate(markerCoordinate(vehicle.start), variant)),
    goal: coordinateMarker(transformCoordinate(markerCoordinate(vehicle.goal), variant)),
  }));
  return { target: puzzle.target, correct, vehicles };
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

export function buildPathPuzzles(quantity: number, seed: number): PathPuzzle[] {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('길 만들기 문항 수는 1 이상의 정수여야 합니다.');
  const random = createRandom(seed);
  const pool = allPathPuzzles();
  const result: PathPuzzle[] = [];
  while (result.length < quantity) result.push(...shuffled(pool, random));
  return result.slice(0, quantity);
}

export function validatePathPuzzle(puzzle: PathPuzzle) {
  const errors: string[] = [];
  if (Object.keys(puzzle.correct).length !== puzzle.target) errors.push('기준 울타리 수와 목표 수가 다릅니다.');
  for (const vehicle of puzzle.vehicles) {
    const exit = simulatePath(vehicle.start, puzzle.correct);
    if (exit?.side !== vehicle.goal.side || exit.index !== vehicle.goal.index) errors.push(`${vehicle.id} 차량이 목표 출구로 가지 않습니다.`);
  }
  return errors;
}
