import assert from 'node:assert/strict';
import test from 'node:test';
import { games } from './game-data.ts';
import { rotationGuideExamples, rotationGuideTips } from './rotation-guide.ts';
import { strategyGuides } from './strategy-guide.ts';

test('9개 게임은 각각 하나의 완성된 전략 가이드를 가진다', () => {
  assert.equal(strategyGuides.length, games.length);
  assert.deepEqual(new Set(strategyGuides.map((guide) => guide.gameId)), new Set(games.map((game) => game.id)));
  assert.equal(new Set(strategyGuides.map((guide) => guide.gameId)).size, strategyGuides.length);
});

test('모든 가이드는 판단 순서·예시·팁·실수·3단계 훈련을 포함한다', () => {
  for (const guide of strategyGuides) {
    assert.ok(guide.oneLine.trim().length > 0, `${guide.gameId}: 한 줄 전략`);
    assert.ok(guide.decisionOrder.length >= 3, `${guide.gameId}: 판단 순서`);
    assert.ok(guide.example.title.trim().length > 0, `${guide.gameId}: 예시 제목`);
    assert.ok(guide.example.situation.trim().length > 0, `${guide.gameId}: 예시 상황`);
    assert.ok(guide.example.answer.trim().length > 0, `${guide.gameId}: 예시 정답`);
    assert.ok(guide.example.reason.trim().length > 0, `${guide.gameId}: 예시 근거`);
    assert.ok(guide.tips.length >= 3, `${guide.gameId}: 핵심 팁`);
    assert.ok(guide.mistakes.length >= 2, `${guide.gameId}: 흔한 실수`);
    assert.equal(guide.drills.length, 3, `${guide.gameId}: 훈련 3단계`);
    for (const item of [...guide.tips, ...guide.mistakes, ...guide.drills]) {
      assert.ok(item.title.trim().length > 0 && item.body.trim().length > 0, `${guide.gameId}: 빈 가이드 항목 금지`);
    }
  }
});

test('도형 회전 가이드는 135° 묶음과 두 대각선 축 샌드위치 공식을 명시한다', () => {
  const rotationGuide = strategyGuides.find((guide) => guide.gameId === 'rotation');
  assert.ok(rotationGuide);
  const tips = rotationGuide.tips.map((tip) => `${tip.title} ${tip.body}`).join(' ');

  for (const token of ['45° 세 칸 = 135°', 'y=x(↗축 대칭)', '좌45° → 좌우 반전 → 우45°', 'y=-x(↘축 대칭)', '좌45° → 상하 반전 → 우45°']) {
    assert.ok(tips.includes(token), `도형 회전 팁에 ${token} 포함`);
  }
});

test('도형 회전 가이드의 격자 예시는 실제 게임과 같은 4×4다', () => {
  const tileExamples = rotationGuideExamples.filter((example) => example.kind === 'tiles');
  assert.ok(tileExamples.length > 0);
  assert.ok(tileExamples.every((example) => example.pattern?.length === 16));
});

test('도형 회전 상세 팁도 수학 좌표 축과 입력 공식을 같은 방향으로 안내한다', () => {
  const detailedTips = rotationGuideTips.map((tip) => `${tip.title} ${tip.criterion} ${tip.steps} ${tip.example}`).join(' ');
  for (const token of ['L135 = L45×3', 'R135 = R45×3', 'y=x(↗)', 'L45→LR→R45', 'y=-x(↘)', 'L45→UD→R45']) {
    assert.ok(detailedTips.includes(token), `도형 회전 상세 팁에 ${token} 포함`);
  }
});
