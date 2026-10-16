import test from 'node:test';
import assert from 'node:assert/strict';
import { games, type GameId } from './game-data.ts';
import {
  createTrainingBundle,
  launchTrainingBundle,
  completeTrainingBundle,
  clearTrainingBundleLaunch,
} from './training-bundle.ts';

function makeBundle(id = 1, selected: readonly GameId[] = ['rps', 'number']) {
  const bundle = createTrainingBundle(id, selected);
  assert.ok(bundle);
  return bundle;
}

test('묶음은 유효한 2~3개 게임의 선택 순서를 복사한다', () => {
  const selected: GameId[] = ['number', 'rps'];
  const bundle = makeBundle(1, selected);
  assert.deepEqual(bundle, { id: 1, games: ['number', 'rps'], completed: 0, launch: null });
  assert.notEqual(bundle.games, selected);
  selected.reverse();
  assert.deepEqual(bundle.games, ['number', 'rps']);
  assert.deepEqual(makeBundle(2, ['mouse', 'path', 'count']).games, ['mouse', 'path', 'count']);
  for (const game of games) {
    const partner: GameId = game.id === 'rps' ? 'number' : 'rps';
    assert.deepEqual(makeBundle(3, [game.id, partner]).games, [game.id, partner]);
  }
  assert.equal(makeBundle(Number.MAX_SAFE_INTEGER).id, Number.MAX_SAFE_INTEGER);
});

test('잘못된 묶음 ID·게임 수·중복·알 수 없는 게임은 거절한다', () => {
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(createTrainingBundle(id, ['rps', 'number']), null);
  }
  const sparse = new Array<GameId>(2);
  sparse[1] = 'rps';
  for (const selected of [
    [], ['rps'], ['rps', 'number', 'count', 'mouse'],
    ['rps', 'rps'], ['rps', 'number', 'rps'], ['rps', 'unknown'],
    sparse,
  ]) {
    assert.equal(createTrainingBundle(1, selected as GameId[]), null);
  }
  assert.equal(createTrainingBundle(1, null as unknown as GameId[]), null);
});

test('실행은 다음 순서의 ticket만 발급하고 진행을 집계하지 않는다', () => {
  const bundle = makeBundle();
  for (const launchId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(launchTrainingBundle(bundle, launchId), bundle);
  }
  const launched = launchTrainingBundle(bundle, 10);
  assert.deepEqual(launched.launch, { plan: 1, launch: 10, index: 0, gameId: 'rps' });
  assert.equal(launched.completed, 0);
  assert.equal(bundle.launch, null);
  assert.equal(launchTrainingBundle(launched, 11), launched);
});

test('현재 ticket의 완료는 복사된 값으로도 정확히 한 번만 수락한다', () => {
  const launched = launchTrainingBundle(makeBundle(), 10);
  assert.ok(launched.launch);
  const ticket = { ...launched.launch };
  const completed = completeTrainingBundle(launched, ticket);
  assert.deepEqual(completed, { id: 1, games: ['rps', 'number'], completed: 1, launch: null });
  assert.equal(completeTrainingBundle(completed, ticket), completed);
  assert.equal(launched.completed, 0);
  assert.deepEqual(launched.launch, ticket);
});

test('다른 계획·실행·순서·게임의 완료는 현재 상태를 바꾸지 않는다', () => {
  const launched = launchTrainingBundle(makeBundle(), 10);
  assert.ok(launched.launch);
  for (const mismatch of [{ plan: 2 }, { launch: 11 }, { index: 1 }, { gameId: 'number' as GameId }]) {
    assert.equal(completeTrainingBundle(launched, { ...launched.launch, ...mismatch }), launched);
  }
});

test('새 계획과 실행 취소는 옛 ticket을 무시하고 새 실행만 수락한다', () => {
  const first = launchTrainingBundle(makeBundle(), 10);
  assert.ok(first.launch);
  const oldTicket = first.launch;
  const freshPlan = makeBundle(2);
  assert.equal(completeTrainingBundle(freshPlan, oldTicket), freshPlan);
  const newPlan = launchTrainingBundle(freshPlan, 11);
  assert.equal(completeTrainingBundle(newPlan, oldTicket), newPlan);

  const progressed = completeTrainingBundle(first, oldTicket);
  const second = launchTrainingBundle(progressed, 12);
  assert.deepEqual(second.launch, { plan: 1, launch: 12, index: 1, gameId: 'number' });
  assert.ok(second.launch);
  const canceledTicket = second.launch;
  const canceled = clearTrainingBundleLaunch(second);
  assert.equal(canceled.completed, 1);
  assert.equal(canceled.games, second.games);
  assert.equal(canceled.launch, null);
  assert.equal(clearTrainingBundleLaunch(canceled), canceled);
  assert.equal(completeTrainingBundle(canceled, canceledTicket), canceled);

  const relaunched = launchTrainingBundle(canceled, 13);
  assert.ok(relaunched.launch);
  assert.equal(completeTrainingBundle(relaunched, canceledTicket), relaunched);
  assert.equal(completeTrainingBundle(relaunched, oldTicket), relaunched);
  assert.equal(completeTrainingBundle(relaunched, relaunched.launch).completed, 2);
});

test('마지막 완료 뒤에는 다시 실행하거나 재연습 ticket으로 진행할 수 없다', () => {
  let bundle = makeBundle(1, ['mouse', 'number', 'rps']);
  for (let index = 0; index < 3; index += 1) {
    const launched = launchTrainingBundle(bundle, index + 1);
    assert.ok(launched.launch);
    assert.equal(launched.launch.index, index);
    assert.equal(launched.launch.gameId, bundle.games[index]);
    const ticket = launched.launch;
    bundle = completeTrainingBundle(launched, ticket);
    assert.equal(bundle.completed, index + 1);
    assert.equal(completeTrainingBundle(bundle, ticket), bundle);
  }
  assert.equal(bundle.launch, null);
  assert.equal(launchTrainingBundle(bundle, 4), bundle);
  assert.equal(clearTrainingBundleLaunch(bundle), bundle);
});
