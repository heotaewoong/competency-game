import { expect, test } from '@playwright/test';

test('게임 내부 준비센터 포인터 종료는 실제 버튼에 초점을 복귀한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const homeGameOpener = page.locator('.game-card-hitarea[aria-describedby="rps-summary"]');
  await homeGameOpener.click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toHaveAttribute('role', 'dialog');
  await expect(stage.getByRole('button', { name: '게임 바꾸기', exact: true })).toBeFocused();
  const opener = stage.getByRole('button', { name: '응시 준비센터 열기', exact: true });
  await expect(opener).not.toBeFocused();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '응시 준비센터 닫기', exact: true })).toBeFocused();
  await expect(stage.locator('.stage-content')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(stage).toHaveAttribute('role', 'dialog');
  await expect(stage.locator('.stage-content')).not.toHaveAttribute('inert', '');
  await testInfo.attach('after-nested-escape', { body: JSON.stringify(await page.evaluate(() => ({
    active: document.activeElement?.outerHTML,
    dialogs: document.querySelectorAll('dialog[open]').length,
    stagePresent: Boolean(document.querySelector('section[data-game="rps"]')),
  }))), contentType: 'application/json' });
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '응시 준비센터 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('nested-focus-return.png') });
  await page.keyboard.press('Escape');
  await expect(stage).toHaveCount(0);
  await expect(homeGameOpener).toBeFocused();
  expect(errors).toEqual([]);
});


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

for (const entry of [
  { region: '주요 메뉴', name: '준비센터', width: 1280 },
  { region: 'banner', name: '준비 점검 시작', width: 1280 },
  { region: 'footer', name: '응시 준비센터', width: 1280 },
  { region: '빠른 메뉴', name: '준비', width: 390 },
]) {
  test(`준비센터 포인터 종료는 실제 ${entry.region} 버튼으로 초점을 돌린다`, async ({ page }) => {
    await page.setViewportSize({ width: entry.width, height: 844 });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const region = entry.region === 'banner' ? page.locator('.readiness-banner')
      : entry.region === 'footer' ? page.locator('.footer-links')
        : page.getByRole('navigation', { name: entry.region, exact: true });
    const opener = entry.region === 'banner' ? region.getByRole('button') : region.getByRole('button', { name: entry.name });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '응시 준비센터 닫기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

for (const savedBefore of [false, true]) {
  test(`저장 실패 설정은 준비센터 재개방 후에도 일치한다: 기존 저장 ${savedBefore}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((hasSaved) => {
      const originalSet = Storage.prototype.setItem;
      if (hasSaved && !localStorage.getItem('nineflow-accessibility-v1')) {
        originalSet.call(localStorage, 'nineflow-accessibility-v1', JSON.stringify({ contrast: 'high', textScale: 'standard', motion: 'system' }));
      }
      Storage.prototype.setItem = function (key, value) {
        if (key === 'nineflow-accessibility-v1') throw new DOMException('Storage full', 'QuotaExceededError');
        return originalSet.call(this, key, value);
      };
      (window as Window & { allowPreferenceSave?: () => void }).allowPreferenceSave = () => { Storage.prototype.setItem = originalSet; };
    }, savedBefore);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const initialStored = await page.evaluate(() => localStorage.getItem('nineflow-accessibility-v1'));
    const opener = page.locator('.readiness-banner button');
    const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
    await opener.click();
    for (const name of ['기본 명암', '큰 글자', '움직임 줄이기']) await dialog.getByRole('button', { name, exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('현재 화면에만 적용');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    for (const name of ['기본 명암', '큰 글자', '움직임 줄이기']) await expect(dialog.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'standard');
    await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await expect(dialog.getByRole('status')).toContainText('현재 화면에만 적용');
    await expect(dialog.getByRole('button', { name: '현재 설정으로 닫기', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('nineflow-accessibility-v1'))).toBe(initialStored);
    await page.screenshot({ path: testInfo.outputPath('unsaved-reopened.png') });

    // A later single-setting edit must not reset the other unsaved choices.
    await dialog.getByRole('button', { name: '고대비', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    await page.evaluate(() => (window as Window & { allowPreferenceSave?: () => void }).allowPreferenceSave!());
    await dialog.getByRole('button', { name: '고대비', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    expect(await page.locator('html').getAttribute('data-unsaved-accessibility')).toBeNull();
    await page.keyboard.press('Escape');
    await opener.click();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '설정 저장하고 닫기', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    expect(errors).toEqual([]);
  });
}
