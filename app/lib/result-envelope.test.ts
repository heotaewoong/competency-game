import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESULTS_ENVELOPE_VERSION,
  RESULTS_STORAGE_PREFIX,
  createResultsGeneration,
  parseLegacyV3ResultsEnvelope,
  parseResultsEnvelope,
  resultsStorageKey,
  serializeResultsEnvelope,
} from './result-envelope.ts';

test('세대와 기록을 하나의 v4 봉투로 직렬화한다', () => {
  const raw = serializeResultsEnvelope('generation-a', [{ id: 'one' }]);
  assert.deepEqual(JSON.parse(raw), {
    version: RESULTS_ENVELOPE_VERSION,
    generation: 'generation-a',
    results: [{ id: 'one' }],
  });
  const parsed = parseResultsEnvelope(raw, 'generation-a');
  assert.equal(parsed.ok, true);
});

test('손상된 JSON과 잘못된 봉투 구조를 구분해 거절한다', () => {
  assert.deepEqual(parseResultsEnvelope('{'), { ok: false, reason: 'json' });
  assert.deepEqual(parseResultsEnvelope(JSON.stringify({ version: RESULTS_ENVELOPE_VERSION, generation: 'g', results: {} })), { ok: false, reason: 'shape' });
  assert.deepEqual(parseResultsEnvelope(JSON.stringify({ version: RESULTS_ENVELOPE_VERSION, generation: '../escape', results: [] })), { ok: false, reason: 'shape' });
});

test('삭제 세대와 다른 지연 쓰기 봉투는 읽지 않는다', () => {
  const raw = serializeResultsEnvelope('old-generation', [{ id: 'stale' }]);
  assert.deepEqual(parseResultsEnvelope(raw, 'new-generation'), { ok: false, reason: 'generation-mismatch' });
});

test('저장 세대 값은 고정 시각에서도 entropy에 따라 구분된다', () => {
  assert.notEqual(createResultsGeneration(1_000, 0.1), createResultsGeneration(1_000, 0.2));
  assert.match(createResultsGeneration(1_000, 0.1), /^[a-z0-9]+-[a-z0-9]+$/);
});

test('세대별 저장 키는 현재 세대만 가리키고 잘못된 세대값을 거절한다', () => {
  assert.equal(resultsStorageKey('generation-a'), `${RESULTS_STORAGE_PREFIX}generation-a`);
  assert.throws(() => resultsStorageKey('generation:a'));
  assert.throws(() => serializeResultsEnvelope('', []));
});

test('고정 키 v3 봉투는 v4 마이그레이션 입력으로만 읽는다', () => {
  const parsed = parseLegacyV3ResultsEnvelope(JSON.stringify({
    version: 3,
    generation: 'legacy-generation',
    results: [{ id: 'legacy' }],
  }));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.envelope.version, RESULTS_ENVELOPE_VERSION);
    assert.equal(parsed.envelope.generation, 'legacy-generation');
  }
  assert.deepEqual(parseLegacyV3ResultsEnvelope(JSON.stringify({
    version: RESULTS_ENVELOPE_VERSION,
    generation: 'legacy-generation',
    results: [],
  })), { ok: false, reason: 'shape' });
});
