import { expect, test, type Page } from '@playwright/test';

const APPOINTMENT_KEY = 'nineflow-appointment-preferences-v1';
const ACCESSIBILITY_KEY = 'nineflow-accessibility-v1';
const FOOD_ATLAS = '/assets/appointment/food-sprite-v1.webp';

async function openAppointment(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="appointment"]')).toBeVisible();
}

async function openRotation(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="rotation"]')).toBeVisible();
}

test('모바일 첫 화면은 게임 코드를 미리 받지 않고 실제 의도 신호에서 준비한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const scripts = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'script' && request.url().includes('/_next/static/chunks/')) scripts.add(request.url());
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const initialScriptCount = scripts.size;
  expect(initialScriptCount).toBeGreaterThan(0);
  await page.waitForTimeout(750);
  expect(scripts.size).toBe(initialScriptCount);

  const start = page.locator('.hero-primary');
  await start.focus();
  await expect.poll(() => scripts.size).toBeGreaterThan(initialScriptCount);
  await start.click();
  await expect(page.locator('.stage-panel')).toBeVisible({ timeout: 8_000 });
});

test('홈 준비 점검은 선택하지 않은 게임의 대용량 자산을 내려받지 않는다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto('/');
  await page.getByRole('button', { name: /준비 점검 시작/ }).click();
  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '다시 점검' })).toBeEnabled();

  expect(requested.some((url) => url.includes(FOOD_ATLAS))).toBe(false);
});

test('약속에서 메뉴를 제외하면 음식 자산을 받지 않는다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, JSON.stringify({ selectedRounds: ['day'] }));
  }, { key: APPOINTMENT_KEY });

  await openAppointment(page);
  await page.locator('section[data-game="appointment"]').getByRole('button', { name: /^설명·연습 시작/ }).click();
  await expect(page.locator('.game-workspace.game-appointment')).toBeVisible({ timeout: 8_000 });
  expect(requested.some((url) => url.includes(FOOD_ATLAS))).toBe(false);
});

test('약속에서 메뉴를 고르면 음식 자산을 시작 전에 준비한다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, JSON.stringify({ selectedRounds: ['food'] }));
  }, { key: APPOINTMENT_KEY });

  await openAppointment(page);
  const stage = page.locator('section[data-game="appointment"]');
  await expect(stage.locator('.appointment-practice-options > p')).toContainText('선택: 메뉴');
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).focus();
  await expect.poll(() => requested.some((url) => url.includes(FOOD_ATLAS))).toBe(true);
});

test('맞춤 설정 바로가기는 작은 화면에서도 약속 유형 선택으로 이동하고 포커스를 알린다', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 360 }]) {
    await page.setViewportSize(viewport);
    await openAppointment(page);

    const shortcut = page.getByRole('button', { name: /내 연습 설정 바로가기/ });
    await expect(shortcut).toBeVisible();
    await shortcut.focus();
    await shortcut.press('Enter');

    const options = page.locator('.appointment-practice-options');
    await expect(options).toBeFocused();
    await expect.poll(() => options.evaluate((element) => window.getComputedStyle(element).outlineWidth)).toBe('3px');
    await expect(options.getByText('연습할 게임 선택', { exact: true })).toBeVisible();
    const box = await options.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y ?? viewport.height).toBeLessThan(viewport.height);
  }
});

test('설정 바로가기는 일반 연습과 실전형의 실제 설정 영역으로 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRotation(page);

  const stage = page.locator('section[data-game="rotation"]');
  const shortcut = stage.getByRole('button', { name: /내 연습 설정 바로가기/ });
  await shortcut.click();
  await expect(stage.locator('.session-settings')).toBeFocused();

  await stage.getByRole('radio', { name: /실전형 연습/ }).click();
  await shortcut.click();
  await expect(stage.locator('.simulation-preset')).toBeFocused();
});

test('큰 글자 모드는 주요 본문을 축소하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const heroBody = page.locator('.hero-copy > p:not(.eyebrow)');
  await expect(heroBody).toBeVisible();
  const standardSize = await heroBody.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));

  await page.evaluate(({ key }) => {
    window.localStorage.setItem(key, JSON.stringify({ contrast: 'standard', textScale: 'large', motion: 'reduce' }));
  }, { key: ACCESSIBILITY_KEY });
  await page.reload();

  const largeSize = await heroBody.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
  expect(largeSize).toBeGreaterThanOrEqual(standardSize);
});

test('큰 글자는 설정 핵심 설명을 12px 이상으로 키우고 320px 가로 넘침을 만들지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(({ accessibilityKey, appointmentKey }) => {
    window.localStorage.setItem(accessibilityKey, JSON.stringify({ contrast: 'standard', textScale: 'large', motion: 'reduce' }));
    window.localStorage.setItem(appointmentKey, JSON.stringify({ selectedRounds: ['day', 'location', 'food', 'bus'] }));
  }, { accessibilityKey: ACCESSIBILITY_KEY, appointmentKey: APPOINTMENT_KEY });

  await openAppointment(page);
  const stage = page.locator('section[data-game="appointment"]');
  await stage.getByRole('button', { name: /내 연습 설정 바로가기/ }).click();

  const copy = [
    stage.locator('.appointment-practice-options > header small'),
    stage.locator('.appointment-practice-options > p > span > small'),
    stage.locator('.intro-start-options .stage-start-practice > small'),
    stage.locator('.mode-options button > small').first(),
  ];
  for (const item of copy) {
    await expect(item).toBeVisible();
    const fontSize = await item.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(12);
  }

  const overflow = await stage.locator('.stage-intro').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
