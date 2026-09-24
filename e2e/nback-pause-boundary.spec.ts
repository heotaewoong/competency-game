import { expect, test } from '@playwright/test';

test('N-back 빠른 이동은 일시정지 잔여시간과 겹친 만료 콜백을 한 번만 처리한다', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console.error: ${message.text()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ nback: { quantity: 3, paceMs: 3000 } }));
    localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ nback: false }));
    localStorage.setItem('nineflow-nback-preferences-v1', JSON.stringify({ task: 'n2', group: 0, progression: 'fast' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="nback"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('3');

  // Let the lazy game bundle load before freezing the session clock.
  const clockOrigin = Date.UTC(2030, 0, 7);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-nback');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.nback-countdown > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }

  const glyph = workspace.locator('.nback-stimulus').getByRole('img');
  const deadline = workspace.locator('.nback-time');
  const progress = workspace.locator('.workspace-progress > span');
  const actions = workspace.locator('.nback-actions button');
  const glyphHistory: string[] = [];
  for (let warmup = 1; warmup <= 2; warmup += 1) {
    await expect(workspace.locator('.nback-lag-map')).toHaveAttribute('aria-label', `기억 채우기 ${warmup}/2`);
    const label = await glyph.getAttribute('aria-label');
    expect(label).toBeTruthy();
    glyphHistory.push(label!);
    await expect(deadline).toHaveAttribute('data-deadline-active', 'true');
    await expect(deadline).toHaveAttribute('aria-valuemax', '3000');
    const remaining = Number(await deadline.getAttribute('aria-valuenow'));
    expect(remaining).toBeGreaterThan(0);
    await page.clock.runFor(remaining + 100);
  }

  const answerCorrectly = async () => {
    const label = await glyph.getAttribute('aria-label');
    expect(label).toBeTruthy();
    glyphHistory.push(label!);
    const answer = actions.filter({
      hasText: glyphHistory.at(-1) === glyphHistory.at(-3) ? '2번째 전과 같음' : '2번째 전과 다름',
    });
    await answer.click();
    await expect(answer).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.locator('.workspace-foot > b')).toHaveText('정답 · 응답 저장됨');
  };
  const close = workspace.getByRole('button', { name: '연습 닫기' });
  const dialog = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?' });
  const resume = dialog.getByRole('button', { name: '계속 연습' });

  await expect(progress).toContainText('1 / 3');
  await answerCorrectly();
  await page.clock.runFor(100);
  await close.click();
  await expect(dialog).toBeVisible();
  await expect(deadline.locator('.time-track i')).toHaveCSS('animation-play-state', 'paused');
  const pausedRemaining = await deadline.getAttribute('aria-valuenow');
  await page.clock.runFor(5000);
  await expect(progress).toContainText('1 / 3');
  await expect(deadline).toHaveAttribute('aria-valuenow', pausedRemaining!);
  await resume.click();
  await expect(dialog).toBeHidden();
  // The 300 ms fast timer used 100 ms; a pause must leave exactly 200 ms.
  await page.clock.runFor(199);
  await expect(progress).toContainText('1 / 3');
  await page.clock.runFor(1);
  await expect(progress).toContainText('2 / 3');
  await expect(actions.first()).toBeEnabled();

  await answerCorrectly();
  // Model a stalled event loop: both monotonic deadlines expire, while the
  // browser timeout queue stays frozen until the real close/resume flow.
  await page.evaluate(() => {
    const originalNow = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => originalNow() + 10_000 });
  });
  await close.click();
  await expect(dialog).toBeVisible();
  await page.clock.runFor(5000);
  await expect(progress).toContainText('2 / 3');
  await resume.click();
  await expect(dialog).toBeHidden();
  await page.clock.runFor(1);
  await expect(progress).toContainText('3 / 3');
  await page.clock.runFor(100);
  await expect(progress).toContainText('3 / 3');
  await expect(actions.first()).toBeEnabled();
  await expect(page.locator('.stage-result')).toHaveCount(0);

  await answerCorrectly();
  await page.clock.runFor(350);
  const result = page.locator('.stage-result');
  await expect(result).toBeVisible();
  await expect(result.locator('.result-metrics article').filter({ hasText: '정확도' }).locator('b')).toHaveText('100%');
  await expect(result.locator('.result-metrics article').filter({ hasText: '오류' }).locator('b')).toHaveText('0');
  await expect(result.locator('.nback-result-detail dl > div').filter({ hasText: '최고 연속 정답' }).locator('dd')).toHaveText('3');

  // No game timers remain. Resume real time for the lazy review dialog load.
  await page.clock.resume();
  await result.getByRole('button', { name: '문항별 복습' }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('listbox', { name: '저장된 시도 목록' }).getByRole('option')).toHaveCount(3);
  expect(runtimeErrors).toEqual([]);
});
