import { expect, test } from '@playwright/test';

for (const outcome of ['ready', 'review'] as const) {
  test(`준비센터 점검 중 안내는 완료와 구분되고 ${outcome} 결과로 바뀐다`, async ({ page }, testInfo) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/assets/mori-coach-hero-v2-800.webp', async (route) => {
      await held;
      if (outcome === 'review') await route.fulfill({ status: 404, body: 'missing' });
      else await route.continue();
    });
    await page.goto('/');
    await page.locator('.readiness-banner button').click();
    const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
    const summary = dialog.locator('.readiness-summary');
    try {
      await expect(summary).toContainText('환경을 확인하고 있습니다');
      await page.screenshot({ path: testInfo.outputPath('checking.png') });
      await expect(summary).toHaveAttribute('aria-busy', 'true');
      await expect(summary).toHaveClass(/is-checking/);
      await expect(summary).not.toContainText('필수 환경이 확인되었습니다');
      await expect(summary.locator(':scope > span')).toHaveText('…');
    } finally { release(); }
    await expect(summary).toHaveAttribute('aria-busy', 'false');
    await expect(summary).toHaveClass(new RegExp(`is-${outcome}`));
    await expect(summary).toContainText(outcome === 'ready' ? '연습 준비 완료' : '시작 전 확인 필요');
    await expect(summary.getByRole('button', { name: '다시 점검' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('보기 설정 저장 실패를 알리고 현재 화면 적용과 다시 저장을 구분한다', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'nineflow-accessibility-v1') throw new DOMException('Storage full', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
    (window as Window & { allowPreferenceSave?: () => void }).allowPreferenceSave = () => { Storage.prototype.setItem = originalSet; };
  });
  await page.goto('/');
  await page.locator('.readiness-banner button').click();
  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await dialog.getByRole('button', { name: '큰 글자', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  expect(await page.evaluate(() => localStorage.getItem('nineflow-accessibility-v1'))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('settings-save-failure.png') });
  await expect(dialog.getByRole('status')).toContainText('현재 화면에만 적용');
  await expect(dialog.getByRole('button', { name: '설정 저장하고 닫기', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'standard');
  await page.locator('.readiness-banner button').click();
  await dialog.getByRole('button', { name: '고대비', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('현재 화면에만 적용');
  await page.evaluate(() => (window as Window & { allowPreferenceSave?: () => void }).allowPreferenceSave!());
  await dialog.getByRole('button', { name: '고대비', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '설정 저장하고 닫기', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
});

test('준비센터의 예약된 첫 초점이 사용자가 고른 설정 버튼을 빼앗지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const nativeRequest = window.requestAnimationFrame;
    const nativeCancel = window.cancelAnimationFrame;
    const pending = new Map<number, FrameRequestCallback>();
    let nextHandle = -1;
    window.requestAnimationFrame = (callback) => { const id = nextHandle--; pending.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { if (!pending.delete(id)) nativeCancel.call(window, id); };
    (window as Window & { releaseReadinessFrame?: () => void }).releaseReadinessFrame = () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      for (const callback of pending.values()) callback(performance.now());
      pending.clear();
    };
  });
  const opener = page.locator('.readiness-banner button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  const preference = dialog.getByRole('button', { name: '고대비', exact: true });
  await preference.focus();
  await expect(preference).toBeFocused();
  await page.evaluate(() => (window as Window & { releaseReadinessFrame?: () => void }).releaseReadinessFrame!());
  await expect(preference).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
