import { expect, test, type Page } from '@playwright/test';

async function startRps(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 2500 } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  // Keep host/browser delays from consuming the 2.5 s question before the
  // deadline-before-callback condition is injected below.
  const clockOrigin = Date.UTC(2030, 0, 5);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-rps');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.rps-board')).toBeVisible({ timeout: 8000 });
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9');
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
  await page.clock.runFor(1400);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 3500 });
  await expect(workspace.locator('.rps-actions button').first()).toBeEnabled();
  // A second pause must not replay the already completed first-question timer.
  await workspace.getByRole('button', { name: '연습 닫기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '계속 연습' }).click();
  await page.clock.runFor(150);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9');
});

test('만료 직전에 처리되지 못한 피드백 전환은 일시정지 후 재개해 다음 문제로 이동한다', async ({ page }) => {
  const workspace = await startRps(page);
  await workspace.locator('.rps-actions button').first().click();
  await expect(workspace.locator('.rps-actions button').first()).toBeDisabled();
  await pauseAfterDeadlineBeforeCallback(page);
  await page.clock.runFor(400);
  await expect(workspace.locator('.workspace-progress span')).toContainText('2 / 9', { timeout: 2000 });
  await expect(workspace.locator('.rps-actions button').first()).toBeEnabled();
});

test('회전 과정 재생은 수동 정지와 닫기 모달 후 남은 단계 시간을 이어 간다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-accessibility-v1', JSON.stringify({ contrast: 'standard', textScale: 'standard', motion: 'system' }));
    localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ rotation: true }));
    localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({
      contentMode: 'letters',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: true,
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rotation"]');
  await expect(stage).toBeVisible();
  const clockOrigin = Date.UTC(2030, 0, 4);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-rotation');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  for (let step = 0; step < 3; step += 1) {
    await workspace.getByRole('button', { name: '1번 왼쪽 45° 회전', exact: true }).click();
  }
  const preview = workspace.locator('.rotation-process-preview');
  const status = preview.locator('.rotation-process-status');
  const play = preview.locator('.is-play');
  await preview.getByRole('button', { name: '처음', exact: true }).click();
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(500);
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(5000);
  await expect(status).toContainText('0 / 3');

  // A 700 ms step paused after 500 ms must have exactly 200 ms left.
  await play.click();
  await page.clock.runFor(199);
  await expect(status).toContainText('0 / 3');
  await page.clock.runFor(1);
  await expect(status).toContainText('1 / 3');

  // The shared session pause must preserve the next step independently.
  await page.clock.runFor(250);
  await workspace.getByRole('button', { name: '연습 닫기', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?' });
  await expect(confirmation).toBeVisible();
  await page.clock.runFor(5000);
  await expect(status).toContainText('1 / 3');
  await confirmation.getByRole('button', { name: '계속 연습', exact: true }).click();
  await page.clock.runFor(449);
  await expect(status).toContainText('1 / 3');
  await page.clock.runFor(1);
  await expect(status).toContainText('2 / 3');
});
