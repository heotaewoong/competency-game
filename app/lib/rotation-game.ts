export type RotationMatrix = [number, number, number, number];
export type RotationOpId = 'left' | 'right' | 'flip-x' | 'flip-y';
export type RotationContentMode = 'letters' | 'tiles' | 'mixed';
export type RotationPuzzleKind = 'letter' | 'tiles';

export type RotationOperation = {
  id: RotationOpId;
  label: string;
  short: string;
  key: string;
  matrix: RotationMatrix;
};

export type RotationPuzzle = {
  id: string;
  kind: RotationPuzzleKind;
  baseId: string;
  letter?: string;
  pattern?: number[];
  target: RotationMatrix;
  optimal: RotationOpId[];
};

type RotationBase = Omit<RotationPuzzle, 'id' | 'target' | 'optimal'>;

export const ROTATION_LETTERS = ['F', 'G', 'J', 'L', 'P', 'R', 'Q'] as const;
export const IDENTITY_MATRIX: RotationMatrix = [1, 0, 0, 1];
const ROOT_HALF = Math.SQRT1_2;

export const rotationOperations: RotationOperation[] = [
  { id: 'left', label: '왼쪽 45° 회전', short: '↺', key: '1', matrix: [ROOT_HALF, -ROOT_HALF, ROOT_HALF, ROOT_HALF] },
  { id: 'right', label: '오른쪽 45° 회전', short: '↻', key: '2', matrix: [ROOT_HALF, ROOT_HALF, -ROOT_HALF, ROOT_HALF] },
  { id: 'flip-x', label: '좌우 반전', short: '↔', key: '3', matrix: [-1, 0, 0, 1] },
  { id: 'flip-y', label: '상하 반전', short: '↕', key: '4', matrix: [1, 0, 0, -1] },
];

const tilePatterns: Array<{ id: string; pattern: number[] }> = [
  { id: 'tile-a', pattern: [1,0,0,1, 1,0,1,0, 0,1,1,0, 1,0,0,1] },
  { id: 'tile-b', pattern: [1,0,1,0, 0,1,0,0, 1,1,0,1, 0,1,1,0] },
  { id: 'tile-c', pattern: [0,1,0,1, 1,1,0,0, 0,1,0,0, 1,0,1,1] },
  { id: 'tile-d', pattern: [1,1,0,0, 0,1,1,0, 1,0,0,0, 0,1,0,1] },
  { id: 'tile-e', pattern: [0,1,1,0, 1,0,0,0, 1,1,0,1, 0,0,1,0] },
  { id: 'tile-f', pattern: [1,0,1,1, 0,0,1,0, 1,0,0,1, 0,1,0,0] },
  { id: 'tile-g', pattern: [0,0,1,0, 1,1,0,1, 0,1,0,0, 1,0,1,0] },
  { id: 'tile-h', pattern: [1,0,0,0, 0,1,1,0, 1,0,1,1, 0,1,0,0] },
];

export function multiplyRotationMatrix(left: RotationMatrix, right: RotationMatrix): RotationMatrix {
  const [a, b, c, d] = left;
  const [e, f, g, h] = right;
  return [
    a * e + c * f,
    b * e + d * f,
    a * g + c * h,
    b * g + d * h,
  ].map((value) => Math.round(value * 10000) / 10000) as RotationMatrix;
}

export function matrixForRotationSequence(sequence: readonly RotationOpId[]) {
  return sequence.reduce<RotationMatrix>((current, id) => {
    const operation = rotationOperations.find((item) => item.id === id);
    return operation ? multiplyRotationMatrix(operation.matrix, current) : current;
  }, IDENTITY_MATRIX);
}

export function sameRotationMatrix(a: RotationMatrix, b: RotationMatrix) {
  return a.every((value, index) => Math.abs(value - b[index]) < 0.001);
}

export function rotationMatrixKey(matrix: RotationMatrix) {
  return matrix.map((value) => Math.round(value * 1000) / 1000).join(',');
}

export function rotationCssMatrix(matrix: RotationMatrix) {
  return `matrix(${matrix.join(',')},0,0)`;
}

function pointKey(prefix: string, x: number, y: number) {
  return `${prefix}:${Math.round(x * 1000) / 1000}:${Math.round(y * 1000) / 1000}`;
}

function transformPoint(matrix: RotationMatrix, x: number, y: number) {
  const [a, b, c, d] = matrix;
  return [a * x + c * y, b * x + d * y] as const;
}

export function rotationVisualSignature(puzzle: Pick<RotationPuzzle, 'kind' | 'pattern' | 'letter'>, matrix: RotationMatrix) {
  if (puzzle.kind === 'letter') return `letter:${puzzle.letter}:${rotationMatrixKey(matrix)}`;

  const filled = (puzzle.pattern ?? []).flatMap((cell, index) => {
    if (!cell) return [];
    const x = (index % 4) - 1.5;
    const y = Math.floor(index / 4) - 1.5;
    const [nextX, nextY] = transformPoint(matrix, x, y);
    return [pointKey('fill', nextX, nextY)];
  });
  const frame = [[-2,-2], [2,-2], [2,2], [-2,2]].map(([x, y]) => {
    const [nextX, nextY] = transformPoint(matrix, x, y);
    return pointKey('frame', nextX, nextY);
  });
  return [...filled, ...frame].sort().join('|');
}

export function rotationShapeMatches(puzzle: RotationPuzzle, sequence: readonly RotationOpId[]) {
  return rotationVisualSignature(puzzle, matrixForRotationSequence(sequence)) === rotationVisualSignature(puzzle, puzzle.target);
}

export function shortestRotationSolution(base: RotationBase, target: RotationMatrix, maxDepth = 8) {
  const targetSignature = rotationVisualSignature(base, target);
  const queue: Array<{ matrix: RotationMatrix; sequence: RotationOpId[] }> = [{ matrix: IDENTITY_MATRIX, sequence: [] }];
  const seen = new Set([rotationVisualSignature(base, IDENTITY_MATRIX)]);

  while (queue.length) {
    const current = queue.shift()!;
    if (rotationVisualSignature(base, current.matrix) === targetSignature) return current.sequence;
    if (current.sequence.length >= maxDepth) continue;
    for (const operation of rotationOperations) {
      const nextMatrix = multiplyRotationMatrix(operation.matrix, current.matrix);
      const signature = rotationVisualSignature(base, nextMatrix);
      if (seen.has(signature)) continue;
      seen.add(signature);
      queue.push({ matrix: nextMatrix, sequence: [...current.sequence, operation.id] });
    }
  }
  return [];
}

function nextRandom(seed: number) {
  return (Math.imul(seed || 1, 1664525) + 1013904223) >>> 0;
}

function transformStates() {
  const queue: Array<{ matrix: RotationMatrix; sequence: RotationOpId[] }> = [{ matrix: IDENTITY_MATRIX, sequence: [] }];
  const states: Array<{ matrix: RotationMatrix; sequence: RotationOpId[] }> = [];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    const key = rotationMatrixKey(current.matrix);
    if (seen.has(key)) continue;
    seen.add(key);
    states.push(current);
    for (const operation of rotationOperations) {
      queue.push({ matrix: multiplyRotationMatrix(operation.matrix, current.matrix), sequence: [...current.sequence, operation.id] });
    }
  }
  return states;
}

export const rotationTransformStates = transformStates();

function baseFor(kind: RotationPuzzleKind, seed: number, selectedLetters: readonly string[]): RotationBase {
  if (kind === 'letter') {
    const available = selectedLetters.length ? selectedLetters : ROTATION_LETTERS;
    const letter = available[seed % available.length];
    return { kind, baseId: `letter-${letter}`, letter };
  }
  const tile = tilePatterns[seed % tilePatterns.length];
  return { kind, baseId: tile.id, pattern: [...tile.pattern] };
}

function kindFor(index: number, mode: RotationContentMode): RotationPuzzleKind {
  if (mode === 'letters') return 'letter';
  if (mode === 'tiles') return 'tiles';
  return index % 2 === 0 ? 'letter' : 'tiles';
}

export function buildRotationPuzzles(count: number, seed: number, mode: RotationContentMode, selectedLetters: readonly string[] = ROTATION_LETTERS) {
  const puzzles: RotationPuzzle[] = [];
  const used = new Set<string>();
  let state = seed || 1;

  for (let index = 0; index < count; index += 1) {
    const kind = kindFor(index, mode);
    let puzzle: RotationPuzzle | null = null;
    for (let attempt = 0; attempt < 40 && !puzzle; attempt += 1) {
      state = nextRandom(state + index + attempt);
      const base = baseFor(kind, state, selectedLetters);
      const targetState = rotationTransformStates[1 + (state % Math.max(1, rotationTransformStates.length - 1))];
      const optimal = shortestRotationSolution(base, targetState.matrix);
      const uniqueKey = `${base.baseId}:${rotationVisualSignature(base, targetState.matrix)}`;
      if (!optimal.length || used.has(uniqueKey)) continue;
      used.add(uniqueKey);
      puzzle = { ...base, id: `${uniqueKey}:${index}`, target: targetState.matrix, optimal };
    }
    if (!puzzle) {
      const base = baseFor(kind, state + index, selectedLetters);
      const targetState = rotationTransformStates[1 + (index % Math.max(1, rotationTransformStates.length - 1))];
      puzzle = { ...base, id: `${base.baseId}:fallback:${index}`, target: targetState.matrix, optimal: shortestRotationSolution(base, targetState.matrix) };
    }
    puzzles.push(puzzle);
  }
  return puzzles;
}

export function rotationOperation(id: RotationOpId) {
  return rotationOperations.find((operation) => operation.id === id)!;
}

