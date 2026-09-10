import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  assessReadiness,
  normalizeAccessibilityPreferences,
  parseAccessibilityPreferences,
  resolveReadinessOverall,
  serializeAccessibilityPreferences,
} from './readiness.ts';

const readySnapshot = {
  width: 844,
  height: 360,
  online: true,
  storageAvailable: true,
  pointerAvailable: true,
  keyboardAvailable: true,
  reducedMotion: false,
} as const;

test('접근성 설정은 완전한 기본값을 제공한다', () => {
  assert.deepEqual(DEFAULT_ACCESSIBILITY_PREFERENCES, {
    contrast: 'standard',
    textScale: 'standard',
    motion: 'system',
  });
  assert.deepEqual(normalizeAccessibilityPreferences(null), DEFAULT_ACCESSIBILITY_PREFERENCES);
  assert.deepEqual(normalizeAccessibilityPreferences([]), DEFAULT_ACCESSIBILITY_PREFERENCES);
});

test('지원하는 접근성 값만 유지하고 나머지는 필드별 기본값으로 복구한다', () => {
  assert.deepEqual(
    normalizeAccessibilityPreferences({
      contrast: 'high',
      textScale: 'huge',
      motion: 'reduce',
      unknown: true,
    }),
    { contrast: 'high', textScale: 'standard', motion: 'reduce' },
  );
});

test('손상된 JSON과 비객체 JSON을 안전하게 기본값으로 복구한다', () => {
  assert.deepEqual(parseAccessibilityPreferences('{broken'), DEFAULT_ACCESSIBILITY_PREFERENCES);
  assert.deepEqual(parseAccessibilityPreferences('[]'), DEFAULT_ACCESSIBILITY_PREFERENCES);
  assert.deepEqual(parseAccessibilityPreferences('7'), DEFAULT_ACCESSIBILITY_PREFERENCES);
  assert.deepEqual(parseAccessibilityPreferences(null), DEFAULT_ACCESSIBILITY_PREFERENCES);
});

test('접근성 설정을 알려진 필드만 포함한 정규 JSON으로 직렬화한다', () => {
  const serialized = serializeAccessibilityPreferences({
    contrast: 'high',
    textScale: 'large',
    motion: 'invalid',
    extra: 'remove-me',
  });

  assert.equal(serialized, '{"contrast":"high","textScale":"large","motion":"system"}');
  assert.deepEqual(parseAccessibilityPreferences(serialized), {
    contrast: 'high',
    textScale: 'large',
    motion: 'system',
  });
});

test('지원 기준의 844×360 화면과 정상 환경은 준비 완료다', () => {
  const result = assessReadiness(readySnapshot);

  assert.equal(result.overall, 'ready');
  assert.equal(result.checks.length, 5);
  assert.ok(result.checks.every((check) => check.label && check.description && check.remedy));
  assert.equal(result.checks.find((check) => check.id === 'viewport')?.status, 'ready');
});

test('가로 또는 세로가 320px 미만이면 진행 차단이다', () => {
  for (const dimensions of [
    { width: 319, height: 800 },
    { width: 800, height: 319 },
    { width: Number.NaN, height: 800 },
  ]) {
    const result = assessReadiness({ ...readySnapshot, ...dimensions });
    assert.equal(result.overall, 'blocked');
    assert.equal(result.checks.find((check) => check.id === 'viewport')?.status, 'blocked');
  }
});

test('가로와 세로가 정확히 320px이면 지원한다', () => {
  assert.equal(assessReadiness({ ...readySnapshot, width: 320, height: 320 }).overall, 'ready');
});

test('오프라인 또는 저장소 미지원은 확인 필요 상태다', () => {
  const offline = assessReadiness({ ...readySnapshot, online: false });
  const noStorage = assessReadiness({ ...readySnapshot, storageAvailable: false });

  assert.equal(offline.overall, 'review');
  assert.equal(offline.checks.find((check) => check.id === 'network')?.status, 'review');
  assert.equal(noStorage.overall, 'review');
  assert.equal(noStorage.checks.find((check) => check.id === 'storage')?.status, 'review');
});

test('포인터와 키보드가 모두 없을 때만 입력 장치 확인을 차단한다', () => {
  const noInput = assessReadiness({
    ...readySnapshot,
    pointerAvailable: false,
    keyboardAvailable: false,
  });
  const keyboardOnly = assessReadiness({ ...readySnapshot, pointerAvailable: false });
  const pointerOnly = assessReadiness({ ...readySnapshot, keyboardAvailable: false });

  assert.equal(noInput.overall, 'blocked');
  assert.equal(noInput.checks.find((check) => check.id === 'input')?.status, 'blocked');
  assert.equal(keyboardOnly.overall, 'ready');
  assert.equal(pointerOnly.overall, 'ready');
});

test('차단 항목은 확인 필요 항목보다 overall 우선순위가 높다', () => {
  const result = assessReadiness({
    ...readySnapshot,
    width: 319,
    online: false,
    storageAvailable: false,
  });

  assert.equal(result.overall, 'blocked');
});

test('움직임 줄이기는 정보로 안내하며 overall을 낮추지 않는다', () => {
  const result = assessReadiness({ ...readySnapshot, reducedMotion: true });
  const motion = result.checks.find((check) => check.id === 'motion');

  assert.equal(result.overall, 'ready');
  assert.equal(motion?.status, 'info');
  assert.match(motion?.description ?? '', /움직임 줄이기/);
});

test('환경 차단은 현재 환경이 회복되고 자산이 정상이면 준비 완료로 회복한다', () => {
  assert.equal(resolveReadinessOverall('blocked', 'ready'), 'blocked');
  assert.equal(resolveReadinessOverall('ready', 'ready'), 'ready');
});

test('자산 확인 필요 상태는 환경만 회복돼도 준비 완료로 섣불리 올리지 않는다', () => {
  assert.equal(resolveReadinessOverall('blocked', 'review'), 'blocked');
  assert.equal(resolveReadinessOverall('ready', 'review'), 'review');
  assert.equal(resolveReadinessOverall('review', 'ready'), 'review');
});
