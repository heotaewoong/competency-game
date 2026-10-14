import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameId, SessionResult } from './game-data.ts';
import { SIMULATION_PRESET_VERSION, getResultComparisonKey, getResultMode, getResultProgress } from './result-comparison.ts';

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
    ...simulation, quantity: 2, paceMs: 180000, rotationContent: '알파벳 → 격자 도형', rotationLetters: '전체',
    rotationTargetIds: 'simulation-all', previewUsed: '숨김', rotationPhaseCount: 2, rotationPhaseDurationMs: 180000,
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

function progressRecord(id: string, day: number, accuracy = 80, gameId: GameId = 'rps', extra: Record<string, string | number> = {}): SessionResult {
  return { ...result(gameId, { sessionMode: 'practice', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '제한시간 없음', accessibilityProfile: 'standard|standard|system', ...extra }), id, completedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`, accuracy };
}

test('기록 변화는 입력 순서와 무관하게 최신순이며 중복 ID·미래 기록을 제외한다', () => {
  const latest = progressRecord('latest', 13, 90);
  const older = progressRecord('older', 10, 60);
  const previous = progressRecord('previous', 12, 80);
  const records = [older, progressRecord('future', 14, 99), previous, latest, previous];
  const before = JSON.stringify(records);
  const progress = getResultProgress(latest, records)!;
  assert.deepEqual(progress.history.map((item) => item.id), ['latest', 'previous', 'older']);
  assert.equal(progress.previous, previous);
  assert.equal(progress.scoreChange, 10);
  assert.equal(progress.best, 90);
  assert.equal(JSON.stringify(records), before);
});

test('다른 게임·모드·설정·표시·채점 정의와 탭 이탈은 변화 이력에 섞지 않는다', () => {
  const latest = progressRecord('latest', 13);
  const differences: Record<string, string | number>[] = [
    { sessionMode: 'simulation', simulationPresetVersion: SIMULATION_PRESET_VERSION },
    { quantity: 30 }, { paceMs: 4000 }, { practiceFocus: 'mixed' },
    { guidedPacing: '설정 제한시간 적용' }, { accessibilityProfile: 'high|large|reduced' },
    { scoringVersion: 'different' }, { visibilityPauses: 1 },
  ];
  const excluded = [
    progressRecord('other-game', 12, 99, 'number'),
    ...differences.map((detail, index) => progressRecord(`excluded-${index}`, 12, 99, 'rps', detail)),
    result('rps'),
  ];
  const progress = getResultProgress(latest, excluded)!;
  assert.deepEqual(progress.history, [latest]);
  assert.equal(progress.previous, undefined);
  assert.equal(progress.scoreChange, null);
  assert.equal(progress.best, 80);
});

test('설정 부족·탭 이탈·날짜 누락은 비교 대기이며 잘못된 이전 날짜는 제외한다', () => {
  const latest = progressRecord('latest', 13);
  assert.equal(getResultProgress(result('rps'), [latest]), null);
  assert.equal(getResultProgress({ ...latest, detail: { ...latest.detail, visibilityPauses: 1 } }, []), null);
  assert.equal(getResultProgress({ ...latest, completedAt: 'invalid' }, []), null);
  assert.deepEqual(getResultProgress(latest, [{ ...progressRecord('invalid', 12), completedAt: 'invalid' }])!.history, [latest]);
});

test('같은 완료 시각으로 앞뒤 순서를 추정하지 않는다', () => {
  const latest = progressRecord('latest', 13, 90);
  const tied = progressRecord('tied', 13, 10);
  assert.equal(getResultProgress(latest, [tied])!.previous, undefined);
  assert.equal(getResultProgress(latest, [tied])!.scoreChange, null);
  assert.equal(getResultProgress(latest, [tied, progressRecord('previous', 12, 70)])!.scoreChange, 20);
});

test('점수 차이는 증가·감소·동일·소수를 %p로 계산하며 오류 수와 섞지 않는다', () => {
  for (const [current, prior, change] of [[90, 80, 10], [70, 80, -10], [80, 80, 0], [80.3, 80.2, 0.1]]) {
    const latest = { ...progressRecord('latest', 13, current), errors: 999 };
    assert.equal(getResultProgress(latest, [progressRecord('previous', 12, prior)])!.scoreChange, change);
  }
});

test('마법약 근거가 없는 점수는 0점으로 비교하거나 직전 기록을 건너뛰지 않는다', () => {
  const detail = { evidenceHint: '표시', scoringVersion: 'potion-evidence-v1', evidenceTrials: 0 };
  const unscored = progressRecord('latest', 13, 0, 'potion', detail);
  assert.equal(getResultProgress(unscored, [])!.best, null);
  const previous = progressRecord('previous', 12, 80, 'potion', { ...detail, evidenceTrials: 10 });
  assert.equal(getResultProgress(unscored, [previous])!.scoreChange, null);
  assert.equal(getResultProgress(unscored, [previous])!.best, 80);
  const latest = { ...previous, id: 'scored-latest', completedAt: unscored.completedAt };
  const missingPrevious = { ...unscored, id: 'missing-previous', completedAt: previous.completedAt };
  const older = { ...previous, id: 'older', completedAt: progressRecord('date', 10).completedAt };
  assert.equal(getResultProgress(latest, [missingPrevious, older])!.previous, missingPrevious);
  assert.equal(getResultProgress(latest, [missingPrevious, older])!.scoreChange, null);
});

test('9게임의 필수 메타가 있는 기록을 두 모드에서 비교한다', () => {
  const practiceKeys: Record<GameId, Record<string, string | number>> = {
    rps: {}, path: {}, number: {}, count: {}, mouse: {},
    rotation: { rotationContent: 'letters', rotationLetters: 'F', rotationTargetIds: 'turn90', previewUsed: '숨김' },
    appointment: { appointmentRounds: '1→2→3→4' },
    potion: { evidenceHint: '표시', scoringVersion: 'potion-evidence-v1', evidenceTrials: 10 },
    nback: { nbackTask: 'n2', nbackGroupSetting: 'auto', nbackProgression: 'fixed', nbackNameLabels: '숨김', nbackMnemonics: '숨김' },
  };
  for (const gameId of Object.keys(practiceKeys) as GameId[]) {
    for (const mode of ['practice', 'simulation']) {
      const detail = { ...practiceKeys[gameId], sessionMode: mode, ...(mode === 'simulation' ? { simulationPresetVersion: SIMULATION_PRESET_VERSION, rotationPhaseCount: 2, rotationPhaseDurationMs: 180000 } : {}) };
      const latest = progressRecord('latest', 13, 90, gameId, detail);
      const previous = progressRecord('previous', 12, 80, gameId, detail);
      assert.equal(getResultProgress(latest, [previous])!.scoreChange, 10, `${gameId}/${mode}`);
    }
  }
});

test('잘못된 점수는 최고값·차이에 쓰지 않고 유효한 0점은 보존한다', () => {
  const latest = progressRecord('latest', 13, 0);
  assert.equal(getResultProgress(latest, [progressRecord('previous', 12, 0)])!.scoreChange, 0);
  assert.equal(getResultProgress(latest, [])!.best, 0);
  for (const accuracy of [NaN, Infinity, -1, 101]) {
    const progress = getResultProgress(latest, [progressRecord('previous', 12, accuracy)])!;
    assert.equal(progress.scoreChange, null);
    assert.equal(progress.best, 0);
  }
});
