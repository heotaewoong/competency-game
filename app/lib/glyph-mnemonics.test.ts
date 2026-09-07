import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGlyphMnemonic, normalizeGlyphMnemonics } from './glyph-mnemonics.ts';

test('빈 암기명은 해당 칸 기본값만 복원한다', () => {
  assert.deepEqual(normalizeGlyphMnemonics(['가', '', '다'], ['세', '원', '네']), ['가', '원', '다']);
});

test('손상된 한 칸 때문에 다른 사용자 암기명을 버리지 않는다', () => {
  assert.deepEqual(normalizeGlyphMnemonics(['꽃', 3, '별'], ['세', '원', '네']), ['꽃', '원', '별']);
  assert.deepEqual(normalizeGlyphMnemonics(['하나'], ['세', '원', '네']), ['세', '원', '네']);
});

test('입력 중 빈 문자열과 여러 글자는 안전한 기본값으로 정규화한다', () => {
  assert.equal(normalizeGlyphMnemonic('', '세'), '세');
  assert.equal(normalizeGlyphMnemonic(' 별 ', '세'), '별');
  assert.equal(normalizeGlyphMnemonic('별빛', '세'), '세');
});
