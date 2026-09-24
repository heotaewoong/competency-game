import { expect, test, type Page } from '@playwright/test';

async function startRps(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 2500 } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  await page.locator('section[data-game="rps"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rps');
  await expect(workspace.locator('.rps-board')).toBeVisible({ timeout: 8000 });
  return workspace;
}

async function pauseAfterDeadlineBeforeCallback(page: Page) {
  // A busy/throttled browser can process a pause after the monotonic deadline
  // but before the queued timeout. Advance only that clock, leaving the timer
  // queue pending, then use the real close-confirmation flow to pause it.
  await page.evaluate(() => {
    const originalNow = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => originalNow() + 10_000 });
    document.querySelector<HTMLButtonElement>('.game-workspace .session-close')!.click();
  });
  const dialog = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '계속 연습' }).click();
  await expect(dialog).toBeHidden();
}

test('만료 직전에 처리되지 못한 문제 타이머는 일시정지 후 재개할 때 한 번 완료된다', async ({ page }) => {
  const workspace = await startRps(page);
  await pauseAfterDeadlineBeforeCallback(page);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 3500 });
  await expect(workspace.locator('.rps-actions button').first()).toBeEnabled();
  // A second pause must not replay the already completed first-question timer.
  await workspace.getByRole('button', { name: '연습 닫기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '계속 연습' }).click();
  await page.waitForTimeout(150);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
});

test('만료 직전에 처리되지 못한 피드백 전환은 일시정지 후 재개해 다음 문제로 이동한다', async ({ page }) => {
  const workspace = await startRps(page);
  await workspace.locator('.rps-actions button').first().click();
  await expect(workspace.locator('.rps-actions button').first()).toBeDisabled();
  await pauseAfterDeadlineBeforeCallback(page);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 2000 });
  await expect(workspace.locator('.rps-actions button').first()).toBeEnabled();
});
