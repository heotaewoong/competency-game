import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allPathPuzzles,
  buildPathPuzzles,
  createPathSessionScore,
  finalizePathTrialScore,
  nextFenceValue,
  pathDifficultyRank,
  pathPuzzleMeta,
  simulatePath,
  transformPathPuzzle,
  validatePathPuzzle,
  type Fence,
  type PathFocus,
  type PathPuzzle,
} from './path-game.ts';

test('16개 원본을 회전·반사한 128개 경로판의 기준 해답이 모두 유효하다', () => {
  const puzzles = allPathPuzzles();
  assert.equal(puzzles.length, 128);
  for (const puzzle of puzzles) assert.deepEqual(validatePathPuzzle(puzzle), [], puzzle.id);
});

test('같은 시드는 같은 경로판 순서를 만들고 16개 원판보다 다양한 판을 제공한다', () => {
  const first = buildPathPuzzles(24, 20260829);
  assert.deepEqual(first, buildPathPuzzles(24, 20260829));
  assert.notDeepEqual(first, buildPathPuzzles(24, 20260830));
  assert.ok(new Set(first.map((puzzle) => puzzle.id)).size > 16);
});

test('잘못된 문항 수와 변형 번호를 거부한다', () => {
  assert.throws(() => buildPathPuzzles(0, 1), RangeError);
  assert.throws(() => transformPathPuzzle(allPathPuzzles()[0], 8), RangeError);
});

test('T와 B 비교, 교차·평행 조합, 평행 우선 유형이 모두 출제된다', () => {
  const metas = allPathPuzzles().map(pathPuzzleMeta);
  for (const interaction of ['base', 'shared', 'detour'] as const) {
    for (const composition of ['crossing-only', 'parallel-only', 'mixed'] as const) {
      assert.ok(metas.some((meta) => meta.interaction === interaction && meta.composition === composition), `${interaction}/${composition}`);
    }
  }
  assert.ok(metas.some((meta) => meta.orderHint === 'parallel-first'));
});

test('비공식 개인 공략의 12개 대표 조합을 독자 문항으로 모두 포함한다', () => {
  const originals = allPathPuzzles().filter((puzzle) => puzzle.id.endsWith('-v0'));
  const signature = (puzzle: PathPuzzle) => {
    const meta = pathPuzzleMeta(puzzle);
    return `${meta.interaction}:C${meta.crossingCount}P${meta.parallelCount}:T${puzzle.target}:${meta.orderHint}`;
  };
  const actual = new Set(originals.map(signature));
  const expected = [
    'base:C3P0:T3:free',
    'base:C0P2:T4:free',
    'shared:C2P1:T2:free',
    'base:C1P2:T5:free',
    'base:C2P1:T4:free',
    'shared:C2P1:T3:free',
    'shared:C0P3:T5:free',
    'shared:C1P2:T3:free',
    'detour:C2P0:T3:free',
    'detour:C0P2:T5:free',
    'detour:C1P1:T5:parallel-first',
    'detour:C1P1:T4:parallel-first',
  ];
  for (const item of expected) assert.ok(actual.has(item), item);
});

test('연습 집중 유형은 선택한 조건의 문항만 반환한다', () => {
  const checks: Array<[PathFocus, (puzzle: PathPuzzle) => boolean]> = [
    ['base', (puzzle) => pathPuzzleMeta(puzzle).interaction === 'base'],
    ['shared', (puzzle) => pathPuzzleMeta(puzzle).interaction === 'shared'],
    ['detour', (puzzle) => pathPuzzleMeta(puzzle).interaction === 'detour'],
    ['crossing-only', (puzzle) => pathPuzzleMeta(puzzle).composition === 'crossing-only'],
    ['parallel-only', (puzzle) => pathPuzzleMeta(puzzle).composition === 'parallel-only'],
    ['mixed-pairs', (puzzle) => pathPuzzleMeta(puzzle).composition === 'mixed'],
    ['parallel-first', (puzzle) => pathPuzzleMeta(puzzle).orderHint === 'parallel-first'],
  ];
  for (const [focus, predicate] of checks) assert.ok(buildPathPuzzles(16, 8, focus).every(predicate), focus);
});

test('세션 안에서는 차량 수와 상호작용 난이도가 뒤로 갈수록 낮아지지 않는다', () => {
  const focuses: PathFocus[] = ['all', 'base', 'shared', 'detour', 'crossing-only', 'parallel-only', 'mixed-pairs', 'parallel-first'];
  for (let seed = 1; seed <= 50; seed += 1) {
    for (const focus of focuses) {
      const ranks = buildPathPuzzles(24, seed, focus).map(pathDifficultyRank);
      assert.ok(ranks.every((rank, index) => index === 0 || ranks[index - 1] <= rank), `${focus}/seed ${seed}`);
    }
  }
});

test('울타리는 방향을 직접 선택하며 같은 방향을 다시 고르면 제거된다', () => {
  assert.equal(nextFenceValue(undefined, 'slash'), 'slash');
  assert.equal(nextFenceValue('slash', 'slash'), undefined);
  assert.equal(nextFenceValue('slash', 'backslash'), 'backslash');
  assert.equal(nextFenceValue('backslash', 'slash'), 'slash');
});

function routesMatch(puzzle: PathPuzzle, fences: Record<string, Fence>) {
  return puzzle.vehicles.every((vehicle) => {
    const exit = simulatePath(vehicle.start, fences);
    return exit?.side === vehicle.goal.side && exit.index === vehicle.goal.index;
  });
}

function hasSolutionWithExactly(puzzle: PathPuzzle, count: number) {
  const fences: Record<string, Fence> = {};
  let found = false;
  function search(fromCell: number, remaining: number) {
    if (found) return;
    if (remaining === 0) {
      found = routesMatch(puzzle, fences);
      return;
    }
    for (let cell = fromCell; cell <= 25 - remaining; cell += 1) {
      const key = `${Math.floor(cell / 5)}-${cell % 5}`;
      fences[key] = 'slash';
      search(cell + 1, remaining - 1);
      if (found) return;
      fences[key] = 'backslash';
      search(cell + 1, remaining - 1);
      if (found) return;
      delete fences[key];
    }
  }
  search(0, count);
  return found;
}

test('16개 원본의 목표 울타리 수보다 적은 해답은 존재하지 않는다', { timeout: 30_000 }, () => {
  const originals = allPathPuzzles().filter((puzzle) => puzzle.id.endsWith('-v0'));
  assert.equal(originals.length, 16);
  for (const puzzle of originals) {
    for (let count = 0; count < puzzle.target; count += 1) {
      assert.equal(hasSolutionWithExactly(puzzle, count), false, `${puzzle.id}: ${count}개 울타리 해답이 발견됨`);
    }
  }
});

test('경로를 연결하지 못한 실패 제출은 연결 시간과 완료 수에 섞이지 않는다', () => {
  const score = finalizePathTrialScore(createPathSessionScore(), {
    success: false,
    hadError: false,
    functionalReached: false,
    functionalRtMs: null,
    responseTimeMs: 8_200,
    clicks: 4,
  });
  assert.deepEqual(score.rts, []);
  assert.equal(score.functionalCompleted, 0);
  assert.equal(score.errors, 1);
});

test('경로 연결 뒤 울타리 수를 고치지 못하고 시간초과해도 최초 연결 기록은 보존한다', () => {
  const score = finalizePathTrialScore(createPathSessionScore(), {
    success: false,
    hadError: true,
    functionalReached: true,
    functionalRtMs: 4_100,
    responseTimeMs: 30_000,
    clicks: 7,
  });
  assert.deepEqual(score.rts, [4_100]);
  assert.equal(score.functionalCompleted, 1);
  assert.equal(score.correct, 0);
  assert.equal(score.correctedAfterRetry, 0);
});

test('오답 제출 뒤 완전 해결하면 첫 제출 점수와 수정 완료를 분리한다', () => {
  const score = finalizePathTrialScore(createPathSessionScore(), {
    success: true,
    hadError: true,
    functionalReached: true,
    functionalRtMs: 5_200,
    responseTimeMs: 7_800,
    clicks: 9,
  });
  assert.deepEqual(score.rts, [5_200]);
  assert.equal(score.correct, 0);
  assert.equal(score.errors, 1);
  assert.equal(score.functionalCompleted, 1);
  assert.equal(score.correctedAfterRetry, 1);
});
