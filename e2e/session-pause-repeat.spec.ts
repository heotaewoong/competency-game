import { expect, test, type Page } from '@playwright/test';

async function startTimedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 2500 } }));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  const origin = Date.UTC(2030, 0, 8);
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rps');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.rps-board')).toBeVisible();
  return workspace;
}

for (const trigger of ['연습 닫기', '게임 바꾸기', '문제 신고', 'Escape'] as const) {
  test(`${trigger}: 유지된 키는 종료 확인창을 취소하지 않고 새 입력만 재개한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const workspace = await startTimedSession(page);
    const key = trigger === 'Escape' ? 'Escape' : 'Enter';
    if (trigger === 'Escape') await workspace.focus();
    else await workspace.getByRole('button', { name: trigger, exact: true }).focus();
    await page.keyboard.down(key);
    const confirmation = page.locator('.session-confirm[role="alertdialog"]');
    await expect(confirmation).toBeVisible();
    await page.clock.runFor(20);
    await expect(confirmation.getByRole('button', { name: '계속 연습' })).toBeFocused();
    await page.keyboard.down(key);
    await expect(confirmation).toBeVisible();
    await page.clock.runFor(5000);
    await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
    await page.screenshot({ path: testInfo.outputPath('held-key-paused.png') });
    await page.keyboard.up(key);
    await page.keyboard.down(key);
    await expect(confirmation).toHaveCount(0);
    await page.clock.runFor(20);
    // Holding the fresh Escape that resumed must not reopen the confirmation.
    if (key === 'Escape') {
      await page.keyboard.down(key);
      await expect(confirmation).toHaveCount(0);
    }
    await page.keyboard.up(key);
    await page.clock.runFor(4000);
    await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
    await workspace.getByRole('button', { name: '연습 닫기', exact: true }).click();
    await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
    await expect(page.locator('.stage-panel')).toHaveCount(0);
    await expect(page.locator('.record-summary')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('탭 이탈 일시정지도 유지된 Enter로 자동 재개되지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const workspace = await startTimedSession(page);
  await workspace.focus();
  await page.keyboard.down('Enter');
  // Model the browser visibility event; the key events remain native inputs.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pause = page.getByRole('alertdialog', { name: '연습을 잠시 멈췄습니다' });
  await expect(pause).toBeVisible();
  await page.clock.runFor(20);
  await expect(pause.getByRole('button', { name: '준비됐어요 · 계속하기' })).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.down('Enter');
  await expect(pause).toBeVisible();
  await page.clock.runFor(5000);
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
  await page.screenshot({ path: testInfo.outputPath('visibility-held-enter.png') });
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  await expect(pause).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
  expect(errors).toEqual([]);
});
