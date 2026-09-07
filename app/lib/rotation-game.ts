export type RotationMatrix = [number, number, number, number];
export type RotationOpId = 'left' | 'right' | 'flip-x' | 'flip-y';
export type RotationContentMode = 'letters' | 'tiles' | 'mixed';
export type RotationPuzzleKind = 'letter' | 'tiles';
export const ROTATION_PHASE_END_MIN_EXPOSURE_MS = 1000;

export function shouldScoreRotationPhaseEnd(exposureMs: number) {
  return Number.isFinite(exposureMs) && exposureMs >= ROTATION_PHASE_END_MIN_EXPOSURE_MS;
}
export type RotationTransformGroupId =
  | 'turn-45'
  | 'turn-90'
  | 'turn-135'
  | 'turn-180'
  | 'mirror-lr'
  | 'mirror-ud'
  | 'mirror-oblique'
  | 'mirror-diagonal';
export type RotationTransformId =
  | 'turn-left-45'
  | 'turn-right-45'
  | 'turn-left-90'
  | 'turn-right-90'
  | 'turn-left-135'
  | 'turn-right-135'
  | 'turn-180'
  | 'mirror-lr'
  | 'mirror-ud'
  | 'mirror-oblique-left-lr'
  | 'mirror-oblique-left-ud'
  | 'mirror-oblique-right-lr'
  | 'mirror-oblique-right-ud'
  | 'mirror-diagonal-down'
  | 'mirror-diagonal-up';

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
  transformId: RotationTransformId;
  target: RotationMatrix;
  optimal: RotationOpId[];
};

export type RotationTransformDefinition = {
  id: RotationTransformId;
  groupId: RotationTransformGroupId;
  label: string;
  compact: string;
  formula: string;
  alternateFormula?: string;
  sequence: readonly RotationOpId[];
  matrix: RotationMatrix;
};

export type RotationTransformGroup = {
  id: RotationTransformGroupId;
  label: string;
  compact: string;
  description: string;
  tip: string;
};

type RotationBase = Omit<RotationPuzzle, 'id' | 'transformId' | 'target' | 'optimal'>;

export const ROTATION_LETTERS = ['F', 'G', 'J', 'L', 'P', 'R', 'Q'] as const;
// The developer-published 2023 walkthrough shows a 4 x 4 tile board in round 2.
// Keep the training patterns original, but preserve that publicly visible board size.
export const ROTATION_TILE_GRID_SIZE = 4;
export const IDENTITY_MATRIX: RotationMatrix = [1, 0, 0, 1];
const ROOT_HALF = Math.SQRT1_2;

export const rotationOperations: RotationOperation[] = [
  { id: 'left', label: '왼쪽 45° 회전', short: '↺', key: '1', matrix: [ROOT_HALF, -ROOT_HALF, ROOT_HALF, ROOT_HALF] },
  { id: 'right', label: '오른쪽 45° 회전', short: '↻', key: '2', matrix: [ROOT_HALF, ROOT_HALF, -ROOT_HALF, ROOT_HALF] },
  { id: 'flip-x', label: '좌우 반전', short: '↔', key: '3', matrix: [-1, 0, 0, 1] },
  { id: 'flip-y', label: '상하 반전', short: '↕', key: '4', matrix: [1, 0, 0, -1] },
];

const tilePatterns: Array<{ id: string; pattern: number[] }> = [
  { id: 'tile-a', pattern: [1,0,0,1, 1,1,0,0, 0,1,1,0, 1,0,0,0] },
  { id: 'tile-b', pattern: [1,0,1,0, 0,1,0,0, 1,1,0,1, 0,0,1,0] },
  { id: 'tile-c', pattern: [0,1,0,1, 1,1,0,0, 0,1,0,0, 1,0,1,1] },
  { id: 'tile-d', pattern: [1,1,0,0, 0,1,1,0, 1,0,0,0, 0,1,0,1] },
  { id: 'tile-e', pattern: [0,1,1,0, 1,0,0,1, 1,1,0,0, 0,0,1,0] },
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

export const rotationTransformGroups: readonly RotationTransformGroup[] = [
  { id: 'turn-45', label: '45° 회전', compact: '±45°', description: '정사각형과 마름모 방향이 한 칸 차이', tip: '기준점이 옮겨 간 방향으로 한 번만 회전합니다.' },
  { id: 'turn-90', label: '90° 회전', compact: '±90°', description: '45° 회전 버튼을 같은 방향으로 두 번', tip: '왼쪽·오른쪽 중 목표까지 짧은 방향을 고릅니다.' },
  { id: 'turn-135', label: '135° 회전', compact: '±135°', description: '45° 눈금 세 칸을 같은 방향으로 이동', tip: '반대 방향 225° 대신 같은 방향 세 번으로 압축합니다.' },
  { id: 'turn-180', label: '180° 회전', compact: '180°', description: '점대칭 관계를 반전 두 번으로 완성', tip: '좌우 반전과 상하 반전을 한 번씩 사용합니다.' },
  { id: 'mirror-lr', label: '좌우 반전', compact: 'LR', description: '세로축을 기준으로 거울상', tip: '위아래 위치는 유지되고 좌우 순서만 바뀌는지 봅니다.' },
  { id: 'mirror-ud', label: '상하 반전', compact: 'UD', description: '가로축을 기준으로 거울상', tip: '좌우 위치는 유지되고 위아래 순서만 바뀌는지 봅니다.' },
  { id: 'mirror-oblique', label: '기울어진 반전', compact: '45°+반전', description: '45° 회전 뒤 좌우·상하 반전하는 네 상태', tip: '화면 기준 22.5°·67.5°·112.5°·157.5° 축입니다. 45° 기울기를 맞춘 뒤 남은 거울상을 고릅니다.' },
  { id: 'mirror-diagonal', label: '대각선 반전', compact: '90°+반전', description: '두 대각선 축에 대한 거울상 두 상태', tip: '90° 회전+반전 또는 45°-반전-역45° 샌드위치를 씁니다.' },
] as const;

const rotationTransformBlueprints: ReadonlyArray<Omit<RotationTransformDefinition, 'matrix'>> = [
  { id: 'turn-left-45', groupId: 'turn-45', label: '왼쪽 45°', compact: 'L45', formula: 'L45', sequence: ['left'] },
  { id: 'turn-right-45', groupId: 'turn-45', label: '오른쪽 45°', compact: 'R45', formula: 'R45', sequence: ['right'] },
  { id: 'turn-left-90', groupId: 'turn-90', label: '왼쪽 90°', compact: 'L90', formula: 'L45 → L45', sequence: ['left', 'left'] },
  { id: 'turn-right-90', groupId: 'turn-90', label: '오른쪽 90°', compact: 'R90', formula: 'R45 → R45', sequence: ['right', 'right'] },
  { id: 'turn-left-135', groupId: 'turn-135', label: '왼쪽 135°', compact: 'L135', formula: 'L45 → L45 → L45', sequence: ['left', 'left', 'left'] },
  { id: 'turn-right-135', groupId: 'turn-135', label: '오른쪽 135°', compact: 'R135', formula: 'R45 → R45 → R45', sequence: ['right', 'right', 'right'] },
  { id: 'turn-180', groupId: 'turn-180', label: '180° 점대칭', compact: '180', formula: 'LR → UD', alternateFormula: 'UD → LR', sequence: ['flip-x', 'flip-y'] },
  { id: 'mirror-lr', groupId: 'mirror-lr', label: '좌우 거울상', compact: 'LR', formula: 'LR', sequence: ['flip-x'] },
  { id: 'mirror-ud', groupId: 'mirror-ud', label: '상하 거울상', compact: 'UD', formula: 'UD', sequence: ['flip-y'] },
  { id: 'mirror-oblique-left-lr', groupId: 'mirror-oblique', label: 'L45 뒤 좌우 반전', compact: 'L45·LR', formula: 'L45 → LR', sequence: ['left', 'flip-x'] },
  { id: 'mirror-oblique-left-ud', groupId: 'mirror-oblique', label: 'L45 뒤 상하 반전', compact: 'L45·UD', formula: 'L45 → UD', sequence: ['left', 'flip-y'] },
  { id: 'mirror-oblique-right-lr', groupId: 'mirror-oblique', label: 'R45 뒤 좌우 반전', compact: 'R45·LR', formula: 'R45 → LR', sequence: ['right', 'flip-x'] },
  { id: 'mirror-oblique-right-ud', groupId: 'mirror-oblique', label: 'R45 뒤 상하 반전', compact: 'R45·UD', formula: 'R45 → UD', sequence: ['right', 'flip-y'] },
  { id: 'mirror-diagonal-down', groupId: 'mirror-diagonal', label: '↘축 대각선 반전', compact: '↘ 대칭', formula: 'L45 → L45 → UD', alternateFormula: 'L45 → UD → R45', sequence: ['left', 'left', 'flip-y'] },
  { id: 'mirror-diagonal-up', groupId: 'mirror-diagonal', label: '↗축 대각선 반전', compact: '↗ 대칭', formula: 'L45 → L45 → LR', alternateFormula: 'L45 → LR → R45', sequence: ['left', 'left', 'flip-x'] },
];

export const rotationTransformDefinitions: readonly RotationTransformDefinition[] = rotationTransformBlueprints.map((definition) => ({
  ...definition,
  matrix: matrixForRotationSequence(definition.sequence),
}));

export const ROTATION_TRANSFORM_IDS: readonly RotationTransformId[] = rotationTransformDefinitions.map((definition) => definition.id);
const rotationTransformIdSet = new Set<RotationTransformId>(ROTATION_TRANSFORM_IDS);

export function isRotationTransformId(value: unknown): value is RotationTransformId {
  return typeof value === 'string' && rotationTransformIdSet.has(value as RotationTransformId);
}

export function canonicalRotationLetters(values: readonly unknown[]) {
  return ROTATION_LETTERS.filter((letter) => values.includes(letter));
}

export function canonicalRotationTransformIds(values: readonly unknown[]) {
  return ROTATION_TRANSFORM_IDS.filter((id) => values.includes(id));
}

export function rotationTransformDefinition(id: RotationTransformId) {
  return rotationTransformDefinitions.find((definition) => definition.id === id)!;
}

export function rotationTransformGroup(id: RotationTransformGroupId) {
  return rotationTransformGroups.find((group) => group.id === id)!;
}

export function rotationSequenceFrames(sequence: readonly RotationOpId[]) {
  const frames: RotationMatrix[] = [IDENTITY_MATRIX];
  for (const id of sequence) {
    const operation = rotationOperations.find((item) => item.id === id);
    frames.push(operation ? multiplyRotationMatrix(operation.matrix, frames.at(-1)!) : frames.at(-1)!);
  }
  return frames;
}

export function sameRotationMatrix(a: RotationMatrix, b: RotationMatrix) {
  return a.every((value, index) => Math.abs(value - b[index]) < 0.001);
}

export function rotationMatrixDescription(matrix: RotationMatrix) {
  if (sameRotationMatrix(matrix, IDENTITY_MATRIX)) return '회전과 반전이 없는 정방향';
  return rotationTransformDefinitions.find((definition) => sameRotationMatrix(definition.matrix, matrix))?.label ?? '복합 변환 상태';
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

  const gridSize = Math.round(Math.sqrt(puzzle.pattern?.length ?? ROTATION_TILE_GRID_SIZE ** 2)) || ROTATION_TILE_GRID_SIZE;
  const centerOffset = (gridSize - 1) / 2;
  const filled = (puzzle.pattern ?? []).flatMap((cell, index) => {
    if (!cell) return [];
    const x = (index % gridSize) - centerOffset;
    const y = Math.floor(index / gridSize) - centerOffset;
    const [nextX, nextY] = transformPoint(matrix, x, y);
    return [pointKey('fill', nextX, nextY)];
  });
  const edge = gridSize / 2;
  const frame = [[-edge,-edge], [edge,-edge], [edge,edge], [-edge,edge]].map(([x, y]) => {
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

export function shortestRotationCorrection(
  base: Pick<RotationPuzzle, 'kind' | 'pattern' | 'letter'>,
  from: RotationMatrix,
  target: RotationMatrix,
  maxDepth = 8,
) {
  const targetSignature = rotationVisualSignature(base, target);
  const queue: Array<{ matrix: RotationMatrix; sequence: RotationOpId[] }> = [{ matrix: from, sequence: [] }];
  const seen = new Set([rotationVisualSignature(base, from)]);

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

function shuffledRotationTransforms(transforms: readonly RotationTransformDefinition[], seed: number) {
  const shuffled = [...transforms];
  let state = seed || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = nextRandom(state + index);
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function buildRotationPuzzles(
  count: number,
  seed: number,
  mode: RotationContentMode,
  selectedLetters: readonly string[] = ROTATION_LETTERS,
  selectedTransforms: readonly RotationTransformId[] = ROTATION_TRANSFORM_IDS,
) {
  const puzzles: RotationPuzzle[] = [];
  const used = new Set<string>();
  let state = seed || 1;
  const transformPool = [...new Set(selectedTransforms)].filter(isRotationTransformId).map(rotationTransformDefinition);
  const availableTransforms = shuffledRotationTransforms(transformPool.length ? transformPool : rotationTransformDefinitions, seed);

  for (let index = 0; index < count; index += 1) {
    const kind = kindFor(index, mode);
    // 혼합 모드에서는 같은 변환을 알파벳과 격자에 연속 배정한다.
    // 선택 유형 수가 짝수여도 특정 변환이 한 콘텐츠에만 고정되지 않는다.
    const transformIndex = mode === 'mixed' ? Math.floor(index / 2) : index;
    const targetState = availableTransforms[transformIndex % availableTransforms.length];
    let puzzle: RotationPuzzle | null = null;
    for (let attempt = 0; attempt < 40 && !puzzle; attempt += 1) {
      state = nextRandom(state + index + attempt);
      const base = baseFor(kind, state, selectedLetters);
      const shortest = shortestRotationSolution(base, targetState.matrix);
      const optimal = [...targetState.sequence];
      const uniqueKey = `${base.baseId}:${rotationVisualSignature(base, targetState.matrix)}`;
      if (!shortest.length || shortest.length !== optimal.length || used.has(uniqueKey)) continue;
      used.add(uniqueKey);
      puzzle = { ...base, id: `${uniqueKey}:${index}`, transformId: targetState.id, target: targetState.matrix, optimal };
    }
    if (!puzzle) {
      const base = baseFor(kind, state + index, selectedLetters);
      puzzle = { ...base, id: `${base.baseId}:fallback:${index}`, transformId: targetState.id, target: targetState.matrix, optimal: [...targetState.sequence] };
    }
    puzzles.push(puzzle);
  }
  return puzzles;
}

export function rotationOperation(id: RotationOpId) {
  return rotationOperations.find((operation) => operation.id === id)!;
}
