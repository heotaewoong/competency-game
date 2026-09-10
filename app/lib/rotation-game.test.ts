import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROTATION_LETTERS,
  ROTATION_PHASE_END_MIN_EXPOSURE_MS,
  ROTATION_TRANSFORM_IDS,
  buildRotationPuzzles,
  canonicalRotationLetters,
  canonicalRotationTransformIds,
  matrixForRotationSequence,
  rotationMatrixDescription,
  rotationSequenceFrames,
  rotationShapeMatches,
  rotationTransformDefinition,
  rotationTransformDefinitions,
  rotationTransformGroups,
  rotationTransformStates,
  sameRotationMatrix,
  shortestRotationCorrection,
  shortestRotationSolution,
  shouldScoreRotationPhaseEnd,
} from './rotation-game.ts';

test('회전·반전 변환군은 16개 상태로 정규화된다', () => {
  assert.equal(rotationTransformStates.length, 16);
});

test('실전형 구간 종료는 충분히 노출된 미응답 문제만 점수에 포함한다', () => {
  assert.equal(shouldScoreRotationPhaseEnd(ROTATION_PHASE_END_MIN_EXPOSURE_MS - 1), false);
  assert.equal(shouldScoreRotationPhaseEnd(ROTATION_PHASE_END_MIN_EXPOSURE_MS), true);
  assert.equal(shouldScoreRotationPhaseEnd(179_000), true);
  assert.equal(shouldScoreRotationPhaseEnd(Number.NaN), false);
});

test('저장된 알파벳·변환 선택은 공식 순서로 중복과 잘못된 값을 제거한다', () => {
  assert.deepEqual(canonicalRotationLetters(['R', 'F', 'F', 'X', null]), ['F', 'R']);
  const transform = ROTATION_TRANSFORM_IDS[2];
  assert.deepEqual(canonicalRotationTransformIds(['bad', transform, transform]), [transform]);
});

test('모든 회전 상태는 스크린리더용 한국어 설명을 제공한다', () => {
  assert.equal(rotationMatrixDescription([1, 0, 0, 1]), '회전과 반전이 없는 정방향');
  for (const definition of rotationTransformDefinitions) {
    assert.equal(rotationMatrixDescription(definition.matrix), definition.label, definition.id);
  }
});

test('항등을 뺀 15개 목표 상태를 8개 훈련군으로 중복 없이 분류한다', () => {
  assert.equal(ROTATION_TRANSFORM_IDS.length, 15);
  assert.equal(new Set(ROTATION_TRANSFORM_IDS).size, 15);
  assert.equal(rotationTransformGroups.length, 8);
  assert.equal(new Set(rotationTransformDefinitions.map((definition) => definition.groupId)).size, 8);
  assert.equal(new Set(rotationTransformDefinitions.map((definition) => definition.matrix.join(','))).size, 15);
  assert.deepEqual(
    Object.fromEntries(rotationTransformGroups.map((group) => [group.id, rotationTransformDefinitions.filter((definition) => definition.groupId === group.id).length])),
    { 'turn-45': 2, 'turn-90': 2, 'turn-135': 2, 'turn-180': 1, 'mirror-lr': 1, 'mirror-ud': 1, 'mirror-oblique': 4, 'mirror-diagonal': 2 },
  );
});

test('15개 유형의 공식은 목표 행렬과 일치하고 실제 최소 3클릭 이내다', () => {
  for (const definition of rotationTransformDefinitions) {
    assert.equal(sameRotationMatrix(matrixForRotationSequence(definition.sequence), definition.matrix), true, definition.id);
    assert.ok(definition.sequence.length >= 1 && definition.sequence.length <= 3, definition.id);
    assert.equal(rotationTransformStates.some((state) => sameRotationMatrix(state.matrix, definition.matrix)), true, definition.id);
  }
});

test('P형·b형으로 중복되던 샌드위치 공식은 두 대각선 상태로만 정규화된다', () => {
  assert.equal(
    sameRotationMatrix(matrixForRotationSequence(['left', 'flip-x', 'right']), matrixForRotationSequence(['left', 'left', 'flip-x'])),
    true,
  );
  assert.equal(
    sameRotationMatrix(matrixForRotationSequence(['left', 'flip-y', 'right']), matrixForRotationSequence(['left', 'left', 'flip-y'])),
    true,
  );
  assert.equal(
    sameRotationMatrix(matrixForRotationSequence(['left', 'flip-x', 'right']), matrixForRotationSequence(['left', 'flip-y', 'right'])),
    false,
  );
  assert.equal(sameRotationMatrix(rotationTransformDefinition('mirror-diagonal-up').matrix, [0, -1, -1, 0]), true);
  assert.equal(sameRotationMatrix(rotationTransformDefinition('mirror-diagonal-down').matrix, [0, 1, 1, 0]), true);
});

test('수학 좌표 y=x·y=-x 축대칭은 좌45° 샌드위치 공식과 정확히 일치한다', () => {
  const yEqualsX = matrixForRotationSequence(['left', 'flip-x', 'right']);
  const yEqualsNegativeX = matrixForRotationSequence(['left', 'flip-y', 'right']);

  // CSS 행렬은 화면의 아래쪽이 +y이므로 ↗축 y=x가 [0,-1,-1,0]으로 렌더링된다.
  assert.equal(sameRotationMatrix(yEqualsX, [0, -1, -1, 0]), true);
  assert.equal(sameRotationMatrix(yEqualsX, rotationTransformDefinition('mirror-diagonal-up').matrix), true);
  assert.equal(rotationTransformDefinition('mirror-diagonal-up').alternateFormula, 'L45 → LR → R45');

  assert.equal(sameRotationMatrix(yEqualsNegativeX, [0, 1, 1, 0]), true);
  assert.equal(sameRotationMatrix(yEqualsNegativeX, rotationTransformDefinition('mirror-diagonal-down').matrix), true);
  assert.equal(rotationTransformDefinition('mirror-diagonal-down').alternateFormula, 'L45 → UD → R45');
});

test('같은 방향 45° 세 번은 해당 방향 135° 목표와 일치한다', () => {
  assert.equal(sameRotationMatrix(matrixForRotationSequence(['left', 'left', 'left']), rotationTransformDefinition('turn-left-135').matrix), true);
  assert.equal(sameRotationMatrix(matrixForRotationSequence(['right', 'right', 'right']), rotationTransformDefinition('turn-right-135').matrix), true);
});

test('생성한 모든 문제에는 1~3단계의 실제 최소 해답이 있다', () => {
  for (const mode of ['letters', 'tiles', 'mixed'] as const) {
    const puzzles = buildRotationPuzzles(30, 20260828, mode, ROTATION_LETTERS);
    assert.equal(puzzles.length, 30);
    for (const puzzle of puzzles) {
      assert.ok(puzzle.optimal.length >= 1 && puzzle.optimal.length <= 3);
      if (puzzle.kind === 'tiles') assert.equal(puzzle.pattern?.length, 16);
      assert.equal(rotationShapeMatches(puzzle, puzzle.optimal), true);
      assert.equal(shortestRotationSolution(puzzle, puzzle.target).length, puzzle.optimal.length);
      assert.deepEqual(puzzle.optimal, rotationTransformDefinition(puzzle.transformId).sequence);
    }
  }
});

test('알파벳 선택과 혼합 출제 규칙을 유지한다', () => {
  const selected = buildRotationPuzzles(18, 77, 'letters', ['Q']);
  assert.ok(selected.every((puzzle) => puzzle.kind === 'letter' && puzzle.letter === 'Q'));

  const mixed = buildRotationPuzzles(10, 88, 'mixed', ROTATION_LETTERS);
  assert.deepEqual(mixed.map((puzzle) => puzzle.kind), ['letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles']);
});

test('선택한 변환만 출제하고 첫 순환에서 선택 유형을 한 번씩 모두 다룬다', () => {
  const selected = ['turn-left-45', 'turn-180', 'mirror-diagonal-up'] as const;
  const puzzles = buildRotationPuzzles(selected.length * 2, 20260830, 'letters', ROTATION_LETTERS, selected);
  assert.ok(puzzles.every((puzzle) => selected.includes(puzzle.transformId as typeof selected[number])));
  assert.deepEqual(new Set(puzzles.slice(0, selected.length).map((puzzle) => puzzle.transformId)), new Set(selected));
  assert.deepEqual(new Set(puzzles.slice(selected.length).map((puzzle) => puzzle.transformId)), new Set(selected));
});

test('혼합 모드는 선택한 모든 변환을 알파벳과 격자 양쪽에서 한 번씩 출제한다', () => {
  const selected = ['mirror-lr', 'mirror-ud', 'mirror-diagonal-up', 'turn-right-135'] as const;
  const puzzles = buildRotationPuzzles(selected.length * 2, 20260830, 'mixed', ROTATION_LETTERS, selected);
  assert.deepEqual(puzzles.map((puzzle) => puzzle.kind), ['letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles', 'letter', 'tiles']);
  for (const transformId of selected) {
    const matching = puzzles.filter((puzzle) => puzzle.transformId === transformId);
    assert.deepEqual(new Set(matching.map((puzzle) => puzzle.kind)), new Set(['letter', 'tiles']), transformId);
  }
});

test('빈 변환 선택은 안전하게 전체 15유형으로 복구한다', () => {
  const puzzles = buildRotationPuzzles(15, 11, 'letters', ['R'], []);
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.transformId)).size, 15);
});

test('알파벳과 격자 도형 모두 전체 15개 변환을 빠짐없이 출제한다', () => {
  for (const mode of ['letters', 'tiles'] as const) {
    const puzzles = buildRotationPuzzles(15, 315, mode);
    assert.equal(new Set(puzzles.map((puzzle) => puzzle.transformId)).size, 15, mode);
    assert.ok(puzzles.every((puzzle) => puzzle.kind === (mode === 'letters' ? 'letter' : 'tiles')));
  }
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

test('과정 미리보기 프레임은 시작 상태와 각 조작의 누적 상태를 순서대로 담는다', () => {
  const sequence = ['right', 'flip-x', 'left'] as const;
  const frames = rotationSequenceFrames(sequence);

  assert.equal(frames.length, sequence.length + 1);
  assert.equal(sameRotationMatrix(frames[0], [1, 0, 0, 1]), true);
  sequence.forEach((_, index) => {
    assert.equal(sameRotationMatrix(frames[index + 1], matrixForRotationSequence(sequence.slice(0, index + 1))), true);
  });
});

test('빈 입력과 취소 조작의 과정 프레임이 항등 상태를 보존한다', () => {
  assert.deepEqual(rotationSequenceFrames([]), [[1, 0, 0, 1]]);
  for (const sequence of [
    ['left', 'right'],
    ['flip-x', 'flip-x'],
    ['flip-y', 'flip-y'],
  ] as const) {
    const frames = rotationSequenceFrames(sequence);
    assert.equal(sameRotationMatrix(frames.at(-1)!, [1, 0, 0, 1]), true);
  }
});

test('현재 상태에서 목표까지의 최소 보정 경로를 계산한다', () => {
  const puzzle = buildRotationPuzzles(1, 413, 'letters', ['R'])[0];
  const partial = puzzle.optimal.slice(0, Math.max(0, puzzle.optimal.length - 1));
  const correction = shortestRotationCorrection(puzzle, matrixForRotationSequence(partial), puzzle.target);
  assert.equal(rotationShapeMatches(puzzle, [...partial, ...correction]), true);
  assert.ok(correction.length <= puzzle.optimal.length);
});

test('이미 목표와 같은 대체 풀이에는 보정 조작이 필요 없다', () => {
  const puzzle = buildRotationPuzzles(1, 92, 'tiles')[0];
  const alternative = [...puzzle.optimal, 'left', 'right'] as const;
  const correction = shortestRotationCorrection(puzzle, matrixForRotationSequence(alternative), puzzle.target);
  assert.deepEqual(correction, []);
});
