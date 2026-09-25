import { expect, test } from '@playwright/test';

for (const action of ['escape', 'pointer', 'held-enter', 'load'] as const) {
  test(`느린 게임 로딩: ${action} 이후 초점과 진입 상태를 보존한다`, async ({ page, hasTouch }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const savedResults = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('nineflow-practice-results')));
    const opener = page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ });
    const bodyPosition = await page.locator('body').evaluate(element => element.style.position);
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
    let delayedRequests = 0;
    // Hydrate the home first; delay only scripts requested after game activation.
    await page.route('**/_next/static/**/*.js', async route => {
      delayedRequests += 1;
      await scriptsReady;
      await route.continue();
    });
    try {
      if (action === 'held-enter') {
        await opener.focus();
        await page.keyboard.down('Enter');
      } else if (hasTouch) await opener.tap();
      else await opener.click();
      const loading = page.locator('.stage-loading');
      await expect(loading).toBeVisible();
      expect(delayedRequests).toBeGreaterThan(0);
      await page.screenshot({ path: testInfo.outputPath('game-loading.png') });

      if (action === 'escape') await page.keyboard.press('Escape');
      else if (action === 'pointer') {
        const cancel = loading.getByRole('button', { name: '취소하고 게임 목록으로', exact: true });
        if (hasTouch) await cancel.tap();
        else await cancel.click();
      } else if (action === 'held-enter') {
        await expect(loading.getByRole('button', { name: '취소하고 게임 목록으로', exact: true })).toBeFocused();
        await page.keyboard.down('Enter');
        await expect(loading).toBeVisible();
        await page.keyboard.up('Enter');
        await page.keyboard.press('Enter');
      }

      if (action !== 'load') {
        await expect(loading).toHaveCount(0);
        await expect(page.locator('.site-shell')).not.toHaveClass(/is-game-open/);
        await expect(opener).toBeFocused();
        await expect.poll(() => page.locator('body').evaluate(element => element.style.position)).toBe(bodyPosition);
      }
      releaseScripts();
      await page.unrouteAll({ behavior: 'wait' });
      await page.waitForLoadState('networkidle');
      if (action !== 'load') {
        // Resolving an abandoned import must not reopen the cancelled game.
        await expect(page.locator('.stage-panel')).toHaveCount(0);
        if (hasTouch) await opener.tap();
        else await opener.click();
      }
      const stage = page.locator('section[data-game="rotation"]');
      await expect(stage).toBeVisible();
      await expect(stage.getByRole('button', { name: '게임 바꾸기' })).toBeFocused();
      await expect(page.locator('.stage-loading')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(stage).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
      expect(await page.locator('body').evaluate(element => element.style.position)).toBe(bodyPosition);
      expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('nineflow-practice-results')))).toEqual(savedResults);
      expect(errors).toEqual([]);
    } finally {
      releaseScripts();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
