import assert from 'node:assert/strict';
import test from 'node:test';
import { allPathPuzzles, buildPathPuzzles, validatePathPuzzle } from './path-game.ts';

test('회전·반사한 24개 경로판의 기준 해답이 모두 유효하다', () => {
  const puzzles = allPathPuzzles();
  assert.equal(puzzles.length, 24);
  for (const puzzle of puzzles) assert.deepEqual(validatePathPuzzle(puzzle), []);
});

test('같은 시드는 같은 경로판 순서를 만들고 3개 원판보다 다양한 판을 제공한다', () => {
  const first = buildPathPuzzles(12, 20260829);
  assert.deepEqual(first, buildPathPuzzles(12, 20260829));
  assert.notDeepEqual(first, buildPathPuzzles(12, 20260830));
  assert.ok(new Set(first.map((puzzle) => JSON.stringify(puzzle))).size > 3);
});

test('잘못된 문항 수와 변형 번호를 거부한다', async () => {
  assert.throws(() => buildPathPuzzles(0, 1), RangeError);
  const { transformPathPuzzle } = await import('./path-game.ts');
  assert.throws(() => transformPathPuzzle(allPathPuzzles()[0], 8), RangeError);
});
