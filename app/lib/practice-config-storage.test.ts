import assert from 'node:assert/strict';
import test from 'node:test';
import { readStoredBooleanField, upsertPracticeConfig, upsertStoredObjectField } from './practice-config-storage.ts';

test('손상된 JSON도 현재 게임 설정으로 복구한다', () => {
  const stored = JSON.parse(upsertPracticeConfig('{bad', 'rotation', { quantity: 12, paceMs: 18000 }));
  assert.deepEqual(stored, { rotation: { quantity: 12, paceMs: 18000 } });
});

test('다른 게임의 정상 설정은 유지하며 현재 게임만 갱신한다', () => {
  const raw = JSON.stringify({ rps: { quantity: 30, paceMs: 4500 }, rotation: { quantity: 8, paceMs: 20000 } });
  const stored = JSON.parse(upsertPracticeConfig(raw, 'rotation', { quantity: 10, paceMs: 15000 }));
  assert.deepEqual(stored, {
    rps: { quantity: 30, paceMs: 4500 },
    rotation: { quantity: 10, paceMs: 15000 },
  });
});

test('배열이나 원시값은 설정 사전으로 취급하지 않는다', () => {
  assert.deepEqual(JSON.parse(upsertPracticeConfig('[]', 'nback', { quantity: 40, paceMs: 3000 })), {
    nback: { quantity: 40, paceMs: 3000 },
  });
  assert.deepEqual(JSON.parse(upsertPracticeConfig('7', 'count', { quantity: 20, paceMs: 900 })), {
    count: { quantity: 20, paceMs: 900 },
  });
});

test('서로 다른 탭의 게임별 변경은 최신 스냅샷에 한 필드씩 병합할 수 있다', () => {
  const afterRps = upsertStoredObjectField(null, 'rps', 'player');
  const afterCount = upsertStoredObjectField(afterRps, 'count', 'precision');
  assert.deepEqual(JSON.parse(afterCount), { rps: 'player', count: 'precision' });
});

test('시간 제한 없는 연습 설정은 게임별 실제 boolean만 복원한다', () => {
  const raw = JSON.stringify({ rps: true, nback: false, count: 'true' });
  assert.equal(readStoredBooleanField(raw, 'rps'), true);
  assert.equal(readStoredBooleanField(raw, 'nback', true), false);
  assert.equal(readStoredBooleanField(raw, 'count'), false);
  assert.equal(readStoredBooleanField('{bad', 'rps', true), true);
  assert.equal(readStoredBooleanField('[]', 'rps'), false);
  assert.equal(readStoredBooleanField('7', 'rps'), false);
});
