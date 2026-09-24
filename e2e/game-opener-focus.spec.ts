import { expect, test, type Page } from '@playwright/test';

// Same single-attempt fixture as critical-flows.spec.ts; no game completion is
// needed to exercise the home record button and the review-to-game handoff.
const savedRotationReview = {
  id: 'e2e-opener-rotation-review',
  gameId: 'rotation',
  completedAt: '2026-09-24T03:00:00.000Z',
  accuracy: 0,
  medianRt: 1800,
  stability: 0,
  errors: 1,
  detail: { sessionMode: '연습 모드', quantity: 1, paceMs: 30000 },
  review: {
    version: 2,
    gameId: 'rotation',
    attempts: [{
      kind: 'rotation',
      id: 'rot-a1',
      index: 0,
      status: 'error',
      errorCodes: ['rotation-angle'],
      title: '1번 · 알파벳 F',
      prompt: '시작 모양을 목표 모양으로 변환',
      expected: 'L45',
      selected: 'R45',
      explanation: '회전 방향을 반대로 선택했습니다.',
      rtMs: 1800,
      puzzle: {
        kind: 'letter', baseId: 'letter-F', transformId: 'turn-left-45',
        letter: 'F', target: [0.7071, -0.7071, 0.7071, 0.7071], optimal: ['left'],
      },
      submitted: ['right'],
      correction: ['left', 'left'],
      events: [
        { index: 0, action: 'start', elapsedMs: 0, chargedClicks: 0, remainingOptimal: 1, inefficient: false },
        { index: 1, action: 'right', elapsedMs: 900, chargedClicks: 1, remainingOptimal: 2, inefficient: true },
        { index: 2, action: 'submit', elapsedMs: 1800, chargedClicks: 1, remainingOptimal: 2, inefficient: true },
      ],
      firstInefficientEvent: 1,
    }],
    summary: {
      attemptedCount: 1, correctCount: 0, neutralCount: 0, reviewPointCount: 1,
      errorCounts: { 'rotation-angle': 1 }, omittedDetailCount: 0, coverage: 'full',
    },
  },
};

async function seedSavedReview(page: Page) {
  await page.addInitScript((result) => {
    const generation = 'e2e-opener-focus';
    window.localStorage.setItem('nineflow-practice-results-generation-v1', generation);
    window.localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({
      version: 4, generation, results: [result],
    }));
  }, savedRotationReview);
}

const directOpeners = [
  { name: '상단 추천', selector: '.hero-primary', gameId: 'rps', hasRecord: false, closeWithEscape: true },
  { name: '추천 요약', selector: '.continue-start', gameId: 'rps', hasRecord: false, closeWithEscape: false },
  { name: '게임 카드', selector: '.game-card-hitarea[aria-describedby="nback-summary"]', gameId: 'nback', hasRecord: false, closeWithEscape: true },
  { name: '기록 다시 연습', selector: '.game-record-actions button[aria-label="도형 회전하기 다시 연습"]', gameId: 'rotation', hasRecord: true, closeWithEscape: false },
  { name: '빈 기록 추천', selector: '.records-empty button', gameId: 'rps', hasRecord: false, closeWithEscape: true },
] as const;

for (const scenario of directOpeners) {
  test(`${scenario.name} 포인터로 연 게임을 닫으면 원래 버튼에 초점이 복귀한다`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 900 });
    if (scenario.hasRecord) await seedSavedReview(page);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');

    const opener = page.locator(scenario.selector);
    await expect(opener).toBeEnabled();
    // Do not focus/press the opener first: WebKit pointer clicks must exercise
    // the application's focus normalization, not a test-created focus state.
    await expect(opener).not.toBeFocused();
    await opener.click();
    const stage = page.locator(`section[data-game="${scenario.gameId}"]`);
    await expect(stage).toHaveAttribute('role', 'dialog');
    await expect(stage.getByRole('button', { name: '게임 바꾸기' })).toBeFocused();
    await expect.poll(() => opener.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true);

    if (scenario.closeWithEscape) await page.keyboard.press('Escape');
    else await stage.getByRole('button', { name: '연습 닫기' }).click();
    await expect(stage).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
    expect(await opener.evaluate((element) => Boolean(element.closest('[inert], [aria-hidden="true"]')))).toBe(false);
    expect(runtimeErrors).toEqual([]);
  });
}

const handoffs = [
  { name: '가이드', selector: '.hero-guide', dialogName: '전략게임 가이드', action: /^이 게임 연습하기/, gameId: 'rps', hasRecord: false },
  { name: '복습', selector: '.game-record-actions button[aria-label="도형 회전하기 최근 세션 복습"]', dialogName: '내 실수 복습', action: /^이 게임 다시 연습/, gameId: 'rotation', hasRecord: true },
] as const;

for (const scenario of handoffs) {
  test(`키보드로 연 ${scenario.name}에서 게임으로 이동해도 홈 진입 초점이 보존된다`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 900 });
    if (scenario.hasRecord) await seedSavedReview(page);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');

    const opener = page.locator(scenario.selector);
    await expect(opener).toBeEnabled();
    // This controls the existing dialog origin only. Its disappearing game CTA
    // must not replace the home button as the final focus-return target.
    await opener.press('Enter');
    const dialog = page.getByRole('dialog', { name: scenario.dialogName, exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => opener.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true);
    await dialog.getByRole('button', { name: scenario.action }).click();

    await expect(dialog).toHaveCount(0);
    const stage = page.locator(`section[data-game="${scenario.gameId}"]`);
    await expect(stage).toHaveAttribute('role', 'dialog');
    await expect(stage.getByRole('button', { name: '게임 바꾸기' })).toBeFocused();
    await expect.poll(() => opener.evaluate((element) => Boolean(element.closest('[inert]')))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(stage).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
    expect(await opener.evaluate((element) => Boolean(element.closest('[inert], [aria-hidden="true"]')))).toBe(false);
    expect(runtimeErrors).toEqual([]);
  });
}
