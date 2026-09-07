import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROTATION_LETTERS,
  buildRotationPuzzles,
  matrixForRotationSequence,
  rotationShapeMatches,
  rotationTransformStates,
  sameRotationMatrix,
  shortestRotationSolution,
} from './rotation-game.ts';

test('회전·반전 변환군은 16개 상태로 정규화된다', () => {
  assert.equal(rotationTransformStates.length, 16);
});

test('생성한 모든 문제에는 1~8단계의 실제 최소 해답이 있다', () => {
  for (const mode of ['letters', 'tiles', 'mixed'] as const) {
    const puzzles = buildRotationPuzzles(30, 20260828, mode, ROTATION_LETTERS);
    assert.equal(puzzles.length, 30);
    for (const puzzle of puzzles) {
      assert.ok(puzzle.optimal.length >= 1 && puzzle.optimal.length <= 8);
      assert.equal(rotationShapeMatches(puzzle, puzzle.optimal), true);
      assert.deepEqual(shortestRotationSolution(puzzle, puzzle.target), puzzle.optimal);
    }
  }
});

test('알파벳 선택과 혼합 출제 규칙을 유지한다', () => {
  const selected = buildRotationPuzzles(18, 77, 'letters', ['Q']);
  assert.ok(selected.every((puzzle) => puzzle.kind === 'letter' && puzzle.letter === 'Q'));

  const mixed = buildRotationPuzzles(10, 88, 'mixed', ROTATION_LETTERS);
  assert.deepEqual(mixed.map((puzzle) => puzzle.kind), ['letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles']);
});

test('최종 모양이 같으면 최소 해답보다 긴 순서도 모양 일치로 판정한다', () => {
  const puzzle = buildRotationPuzzles(1, 13, 'letters', ['R'])[0];
  const longer = [...puzzle.optimal, 'left', 'right'] as const;
  assert.equal(rotationShapeMatches(puzzle, longer), true);
  assert.ok(longer.length > puzzle.optimal.length);
});

test('서로 취소되는 좌·우 회전은 항등 변환이다', () => {
  assert.equal(sameRotationMatrix(matrixForRotationSequence(['left', 'right']), [1, 0, 0, 1]), true);
});
