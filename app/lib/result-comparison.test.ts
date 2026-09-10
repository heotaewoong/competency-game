import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameId, SessionResult } from './game-data.ts';
import { SIMULATION_PRESET_VERSION, getResultComparisonKey, getResultMode } from './result-comparison.ts';

function result(gameId: GameId, detail?: Record<string, string | number>): SessionResult {
  return { id: 'session', gameId, completedAt: '2026-08-31T00:00:00.000Z', accuracy: 80, medianRt: 900, stability: 70, errors: 2, detail };
}

test('모드가 없거나 알 수 없는 이전 기록은 비교하지 않는다', () => {
  assert.equal(getResultMode(result('rps')), 'unknown');
  assert.equal(getResultComparisonKey(result('rps')), null);
});

test('연습 모드라도 분량·속도·게임별 집중 설정이 없으면 비교하지 않는다', () => {
  assert.equal(getResultComparisonKey(result('rps', { sessionMode: '연습 모드' })), null);
  assert.equal(getResultComparisonKey(result('rps', { sessionMode: '연습 모드', quantity: 20, paceMs: 3000 })), null);
});

test('필수 설정이 완전한 연습 기록만 안정적인 비교 키를 만든다', () => {
  const detail = { sessionMode: '연습 모드', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' };
  const first = getResultComparisonKey(result('rps', detail));
  const same = getResultComparisonKey(result('rps', { ...detail }));
  const different = getResultComparisonKey(result('rps', { ...detail, practiceFocus: 'mixed' }));
  assert.equal(first, same);
  assert.notEqual(first, different);
});

test('시간 제한 설정이 다르거나 탭 이탈이 있으면 동일 조건 기록으로 비교하지 않는다', () => {
  const detail = { sessionMode: '연습 모드', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' };
  const timed = getResultComparisonKey(result('rps', detail));
  const untimed = getResultComparisonKey(result('rps', { ...detail, guidedPacing: '제한시간 없음' }));
  const interrupted = getResultComparisonKey(result('rps', { ...detail, visibilityPauses: 1 }));
  assert.notEqual(timed, untimed);
  assert.equal(interrupted, null);
});

test('접근성 표시 프로필이 다르면 같은 게임 설정이어도 별도 기록으로 비교한다', () => {
  const detail = { sessionMode: '연습 모드', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' };
  const standard = getResultComparisonKey(result('rps', { ...detail, accessibilityProfile: 'standard|standard|system' }));
  const highContrast = getResultComparisonKey(result('rps', { ...detail, accessibilityProfile: 'high|standard|system' }));
  const legacy = getResultComparisonKey(result('rps', detail));
  assert.notEqual(standard, highContrast);
  assert.notEqual(standard, legacy);
});

test('고정 실전형은 게임별로 필요한 프리셋 메타를 검증한다', () => {
  const simulation = { sessionMode: '실전형 연습', quantity: 30, paceMs: 4500, simulationPresetVersion: SIMULATION_PRESET_VERSION };
  assert.equal(getResultComparisonKey(result('rps', { sessionMode: '실전형 연습' })), null);
  assert.notEqual(getResultComparisonKey(result('rps', simulation)), null);
  assert.equal(getResultComparisonKey(result('rotation', { sessionMode: '실전형 연습' })), null);
  assert.notEqual(getResultComparisonKey(result('rotation', {
    ...simulation, rotationContent: '알파벳 → 격자 도형', rotationLetters: '전체',
    rotationTargetIds: 'simulation-all', previewUsed: '숨김',
  })), null);
  assert.notEqual(getResultComparisonKey(result('rps', simulation)), getResultComparisonKey(result('rps', { ...simulation, simulationPresetVersion: 'legacy-training-v3' })));
});

test('마법약은 점수 정의가 같은 기록끼리만 비교한다', () => {
  const practice = { sessionMode: '연습 모드', quantity: 28, paceMs: 12000, practiceFocus: '전체 14개 조합', evidenceHint: '표시', guidedPacing: '설정 제한시간 적용' };
  assert.equal(getResultComparisonKey(result('potion', practice)), null);
  assert.notEqual(getResultComparisonKey(result('potion', { ...practice, scoringVersion: 'potion-evidence-v1' })), null);
  const simulation = { sessionMode: '실전형 연습', quantity: 42, paceMs: 7000, simulationPresetVersion: SIMULATION_PRESET_VERSION };
  assert.equal(getResultComparisonKey(result('potion', { sessionMode: '실전형 연습' })), null);
  assert.notEqual(getResultComparisonKey(result('potion', { ...simulation, scoringVersion: 'potion-evidence-v1' })), null);
});
