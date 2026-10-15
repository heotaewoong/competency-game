import { expect, test } from '@playwright/test';

for (const nested of [false, true]) {
  for (const kind of ['준비센터', '의견창'] as const) {
    test(`${nested ? '게임 설정 큰 글자' : '홈'} ${kind}에서 문의 경로 안내를 키보드로 읽고 닫아도 기록과 초점을 보존한다`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const githubRequests: string[] = [];
      const popups: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/(^|\.)(github\.com|githubusercontent\.com)$/.test(new URL(request.url()).hostname)) githubRequests.push(request.url()); });
      page.on('popup', popup => popups.push(popup.url()));
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      if (nested) {
        await page.locator('.readiness-banner button').click();
        const preparation = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
        await preparation.getByRole('button', { name: '고대비', exact: true }).click();
        await preparation.getByRole('button', { name: '큰 글자', exact: true }).click();
        await page.keyboard.press('Escape');
        await expect(preparation).toHaveCount(0);
      }
      const homeGameOpener = page.locator('.game-card-hitarea[aria-describedby="rps-summary"]');
      const stage = page.locator('section[data-game="rps"]');
      if (nested) await homeGameOpener.click();
      const opener = nested
        ? stage.getByRole('button', { name: kind === '준비센터' ? '응시 준비센터 열기' : '문제 신고', exact: true })
        : kind === '준비센터' ? page.locator('.readiness-banner button') : page.locator('#feedback').getByRole('button', { name: '개선 의견 보내기', exact: true });
      const resultStorage = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('nineflow-practice-results')).sort().map(key => [key, localStorage.getItem(key)])));
      const before = await resultStorage();
      await opener.click();
      const dialog = page.getByRole('dialog', { name: kind === '준비센터' ? '응시 준비센터' : '의견 보내기', exact: true });
      const guide = dialog.locator('.support-guide');
      const summary = guide.locator('summary');
      await expect(guide).not.toHaveAttribute('open');
      await expect(guide.locator('dl')).toBeHidden();
      if (kind === '의견창') {
        await expect(dialog.locator('#feedback-public-notice')).toBeFocused();
        await expect(dialog.locator('#feedback-public-notice')).toContainText('건강·진단 정보·초대장·계정 정보');
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: '의견 보내기 닫기', exact: true })).toBeFocused();
      } else {
        await dialog.getByRole('button', { name: '움직임 줄이기', exact: true }).focus();
      }
      await page.keyboard.press('Tab');
      await expect(summary).toBeFocused();
      await page.keyboard.press('Enter');
      const opened = await guide.evaluate(element => ({
        open: (element as HTMLDetailsElement).open,
        labels: Array.from(element.querySelectorAll('dt'), item => item.textContent),
        fonts: Array.from(element.querySelectorAll('summary, dt, dd, p'), item => getComputedStyle(item).fontSize),
        targetHeight: element.querySelector('summary')!.getBoundingClientRect().height,
        fits: element.scrollWidth <= element.clientWidth,
      }));
      console.log('SUPPORT_GUIDE_OPEN', JSON.stringify({ nested, kind, ...opened, savedUnchanged: JSON.stringify(await resultStorage()) === JSON.stringify(before) }));
      await testInfo.attach('support-guide-open', { body: JSON.stringify(opened), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('support-guide-open.png') });
      expect(opened.open).toBe(true);
      expect(opened.labels).toEqual(['HeoBrain 오류·기능 의견', '실제 응시 기한·결과', '편의지원·대체 절차']);
      expect(opened.fonts.every(font => parseFloat(font) >= (nested ? 14 : 13))).toBe(true);
      expect(opened.targetHeight).toBeGreaterThanOrEqual(44);
      expect(opened.fits).toBe(true);
      for (const text of ['초대 메일이나 회사 채용 안내', '응시 전에 초대장이나 응시 기관', '실제 평가에 적용되지 않습니다', '조회하거나 변경하지 않습니다']) await expect(guide).toContainText(text);
      await expect(guide.locator('dl')).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(kind === '의견창' ? dialog.getByLabel('의견 유형', { exact: true }) : dialog.getByRole('button', { name: '설정 저장하고 닫기', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(summary).toBeFocused();
      await page.keyboard.press('Space');
      await expect(guide).not.toHaveAttribute('open');
      await expect(guide.locator('dl')).toBeHidden();
      await page.setViewportSize({ width: 844, height: 360 });
      await summary.click();
      const landscape = await guide.evaluate(element => ({ open: (element as HTMLDetailsElement).open, fits: element.scrollWidth <= element.clientWidth, targetHeight: element.querySelector('summary')!.getBoundingClientRect().height }));
      console.log('SUPPORT_GUIDE_LANDSCAPE', JSON.stringify({ nested, kind, ...landscape, savedUnchanged: JSON.stringify(await resultStorage()) === JSON.stringify(before) }));
      await page.screenshot({ path: testInfo.outputPath('support-guide-landscape.png') });
      expect(landscape.open).toBe(true);
      expect(landscape.fits).toBe(true);
      expect(landscape.targetHeight).toBeGreaterThanOrEqual(44);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await resultStorage()).toEqual(before);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      if (nested) {
        await expect(stage).toHaveAttribute('role', 'dialog');
        await expect(stage.locator('.stage-content')).not.toHaveAttribute('inert', '');
        await page.keyboard.press('Escape');
        await expect(stage).toHaveCount(0);
        await expect(homeGameOpener).toBeFocused();
      }
      expect(githubRequests).toEqual([]);
      expect(popups).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

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
