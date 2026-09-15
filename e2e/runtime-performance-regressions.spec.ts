import { expect, test } from '@playwright/test';

test('게임을 열면 뒤 화면 페인트와 전체 화면 블러를 중지한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="rotation"]')).toBeVisible();

  await expect(page.locator('.site-shell')).toHaveClass(/is-game-open/);
  await expect.poll(() => page.locator('.topbar').evaluate((element) => window.getComputedStyle(element).opacity)).toBe('0');
  await expect.poll(() => page.locator('.topbar').evaluate((element) => window.getComputedStyle(element).pointerEvents)).toBe('none');
  await expect.poll(() => page.locator('.mori-hero').evaluate((element) => window.getComputedStyle(element).animationPlayState)).toBe('paused');
  await expect.poll(() => page.locator('.stage-backdrop').evaluate((element) => window.getComputedStyle(element).backdropFilter)).toBe('none');
});

test('연속 resize 이벤트는 준비 상태 저장소를 한 번만 다시 점검한다', async ({ page }) => {
  await page.addInitScript(({ readinessKey, probeKey }) => {
    window.localStorage.setItem(readinessKey, JSON.stringify({
      version: 1,
      overall: 'ready',
      checkedAt: new Date().toISOString(),
      assetStatus: 'ready',
    }));
    const originalSetItem = Storage.prototype.setItem;
    Object.defineProperty(window, '__readinessProbeWrites', { value: 0, writable: true, configurable: true });
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === probeKey) {
        (window as typeof window & { __readinessProbeWrites: number }).__readinessProbeWrites += 1;
      }
      return originalSetItem.call(this, key, value);
    };
  }, {
    readinessKey: 'nineflow-readiness-check-v1',
    probeKey: '__nineflow_readiness_probe__',
  });

  await page.goto('/');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    (window as typeof window & { __readinessProbeWrites: number }).__readinessProbeWrites = 0;
    for (let index = 0; index < 40; index += 1) window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as typeof window & { __readinessProbeWrites: number }).__readinessProbeWrites)).toBe(1);
});
