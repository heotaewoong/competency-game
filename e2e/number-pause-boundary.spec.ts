import { expect, test, type Page } from '@playwright/test';

async function setDocumentVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((nextState) => {
    const target = document as Document & { __numberPauseVisibility?: DocumentVisibilityState };
    target.__numberPauseVisibility = nextState;
    if (!Object.prototype.hasOwnProperty.call(document, 'visibilityState')) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => target.__numberPauseVisibility ?? 'visible',
      });
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('숫자 누르기 2라운드 전환은 탭 이탈 동안 멈추고 남은 시간만 이어 간다', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console.error: ${message.text()}`); });
  await page.goto('/');
  await page.getByRole('button', { name: /숫자 누르기, 난이도 하, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="number"]');
  await expect(stage).toBeVisible();
  const clockOrigin = Date.UTC(2036, 0, 1);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  const preparation = page.locator('.game-preparation');
  for (const second of ['3', '2', '1']) {
    await expect(preparation.locator('> b')).toHaveText(second);
    await page.clock.runFor(1_050);
  }

  const workspace = page.locator('.game-workspace.game-number');
  const banner = workspace.locator('.number-round-banner');
  for (let question = 1; question <= 6; question += 1) {
    await expect(banner.locator('span')).toHaveText('ROUND 1 / 2');
    await expect(banner.locator('em')).toHaveText(`${question} / 6 문제`);
    await workspace.locator('.number-board-pro button.target').click();
    // Stop at the last feedback deadline so no transition time is consumed.
    await page.clock.runFor(question === 6 ? 360 : 400);
  }

  const transition = workspace.locator('.number-round-transition');
  const countdown = transition.locator('.number-transition-countdown b');
  await expect(transition.locator('> span')).toHaveText('ROUND 2 / 2');
  await expect(countdown).toHaveText('3');
  await page.clock.runFor(1_100);
  await expect(countdown).toHaveText('2');

  await setDocumentVisibility(page, 'hidden');
  const pauseDialog = page.getByRole('alertdialog', { name: '연습을 잠시 멈췄습니다' });
  await expect(pauseDialog).toBeVisible();
  await page.clock.runFor(5_000);
  await expect(transition).toBeVisible();
  await expect(countdown).toHaveText('2');

  await setDocumentVisibility(page, 'visible');
  await expect(pauseDialog).toBeVisible();
  await page.clock.runFor(3_000);
  await expect(transition).toBeVisible();
  await expect(countdown).toHaveText('2');

  await pauseDialog.getByRole('button', { name: '준비됐어요 · 계속하기' }).click();
  await expect(pauseDialog).toBeHidden();
  // The 3 s transition used 1.1 s before the pause: exactly 1.9 s remains.
  await page.clock.runFor(1_899);
  await expect(transition).toBeVisible();
  await expect(countdown).toHaveText('1');
  await page.clock.runFor(1);

  await expect(transition).toHaveCount(0);
  await expect(workspace.locator('.number-layout')).toHaveCount(1);
  await expect(banner.locator('span')).toHaveText('ROUND 2 / 2');
  await expect(banner.locator('em')).toHaveText('1 / 6 문제');
  await expect(workspace.locator('.number-board-pro button')).toHaveCount(9);

  await page.clock.runFor(3_100);
  await expect(transition).toHaveCount(0);
  await expect(workspace.locator('.number-layout')).toHaveCount(1);
  await expect(banner.locator('em')).toHaveText('1 / 6 문제');
  expect(runtimeErrors).toEqual([]);
});
