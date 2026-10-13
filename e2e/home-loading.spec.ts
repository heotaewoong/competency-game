import { expect, test } from '@playwright/test';

for (const timezone of ['Asia/Seoul', 'America/New_York']) {
  test.describe(`훈련 활동 ${timezone}`, () => {
    test.use({ timezoneId: timezone });
    for (const width of [390, 1280]) {
      test(`${width}px: 현지 날짜 7일의 활동을 읽고 새로고침해도 저장값은 그대로다`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => {
          const now = new Date();
          const generation = 'training-activity-regression';
          const results = [0, 0, -1, -6, -7, 1].map((offset, index) => ({
            id: `activity-${index}`, gameId: 'rps',
            completedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, offset === -1 ? 23 : offset < 0 ? 12 : 0, offset === -1 ? 59 : 0).toISOString(),
            accuracy: 80, medianRt: 720, stability: 74, errors: 2,
          }));
          localStorage.setItem('nineflow-practice-results-generation-v1', generation);
          localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
        });
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        const saved = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'));
        const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
        const snapshot = await activity.evaluate(element => ({
          status: element.querySelector('[role="status"]')?.textContent,
          days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
        }));
        console.log('TRAINING_ACTIVITY', JSON.stringify({ timezone, width, ...snapshot }));
        const expectedDates = await page.evaluate(() => {
          const now = new Date();
          return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          });
        });
        expect(snapshot.days.map(day => day.date)).toEqual(expectedDates);
        expect(snapshot.days.map(day => day.count)).toEqual(['1회', '0회', '0회', '0회', '0회', '1회', '2회']);
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        await expect(activity).toContainText('브라우저 현지 날짜 기준');
        await expect(activity).toContainText('점수·실력 향상 지표가 아닙니다.');
        const refresh = activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true });
        await refresh.focus();
        await page.keyboard.press('Enter');
        await expect(refresh).toBeFocused();
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        expect(await activity.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))).toEqual(expectedDates);
        expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'))).toBe(saved);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await activity.screenshot({ path: testInfo.outputPath(`activity-${width}-${timezone.replace('/', '-')}.png`) });
        await page.screenshot({ path: testInfo.outputPath(`activity-page-${width}-${timezone.replace('/', '-')}.png`), fullPage: true });
        expect(errors).toEqual([]);
      });
    }
  });
}

test('첫 화면은 Tailwind 빌드 컴파일러를 내려받지 않는다', async ({ page }) => {
  const scripts: import('@playwright/test').Response[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/_next/static/') && response.request().resourceType() === 'script') scripts.push(response);
  });
  await page.goto('/');
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const path = new URL(script.url()).pathname;
    expect(script.ok(), path).toBe(true);
    expect((await script.text()).includes('__unstable__loadDesignSystem'), path).toBe(false);
  }
});

for (const savedCount of [0, 1]) {
  test(`기록 ${savedCount}개: 느린 첫 로딩에서는 빈 기록으로 단정하지 않고 복원 후 표시한다`, async ({ page }, testInfo) => {
    await page.setViewportSize(savedCount ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((count) => {
      const generation = 'loading-regression';
      window.localStorage.setItem('nineflow-practice-results-generation-v1', generation);
      window.localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({
        version: 4, generation,
        results: count ? [{ id: 'saved-before-loading', gameId: 'rps', completedAt: '2026-09-24T03:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2 }] : [],
      }));
    }, savedCount);
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
    await page.route('**/_next/static/**/*.js', async (route) => {
      await scriptsReady;
      await route.continue();
    });
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await expect(page.locator('.header-status')).toHaveAccessibleName('연습 기록 확인 중, 기록으로 이동');
      await expect(page.locator('.header-status b')).toHaveText('—');
      await expect(page.locator('.card-record[aria-busy="true"]')).toHaveCount(9);
      await expect(page.locator('.game-grid .thumb-scene')).toHaveCount(9);
      await expect(page.locator('.card-record dd').filter({ hasText: /^0회$/ })).toHaveCount(0);
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('#records')).toContainText('연습 기록을 불러오고 있어요.');
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toHaveCount(0);
      await expect(page.locator('.hero-primary')).toBeDisabled();
      await expect(page.locator('.records-data-button')).toBeDisabled();
      await expect(page.locator('#coach-title')).toHaveText('연습 기록을 확인하고 있어요.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      // WebKit's fonts.ready can wait for the scripts held here, so capture DOM now and pixels after release.
      await testInfo.attach('loading-home.html', { body: await page.content(), contentType: 'text/html' });
    } finally {
      releaseScripts();
    }
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.header-status')).toHaveAccessibleName(`완료한 연습 ${savedCount}회, 기록으로 이동`);
    await expect(page.locator('.hero-primary')).toBeEnabled();
    await expect(page.locator('.records-data-button')).toBeEnabled();
    // Selective hydration must preserve every server-rendered game preview.
    const thumbnails = page.locator('.game-grid .thumb-scene');
    await expect(thumbnails).toHaveCount(9);
    for (const thumbnail of await thumbnails.all()) await expect(thumbnail).toBeVisible();
    if (savedCount) {
      await expect(page.locator('.record-summary')).toContainText('1회');
      await expect(page.locator('.game-record-grid')).toContainText('80%');
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('첫 기록을 만들어 볼까요?', { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('ready-home.png') });
    await page.locator('#records').screenshot({ path: testInfo.outputPath('ready-records.png') });
    await page.locator('.records-data-button').click();
    const backup = page.getByRole('dialog', { name: '내 기록 백업·복원' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: '닫기', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test('기본 스크롤로 이동한 백업 버튼이 고정 메뉴에 가려지지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const trigger = page.locator('.records-data-button');
  await trigger.evaluate((button) => button.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const position = await trigger.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const header = document.querySelector('.topbar')!.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, headerBottom: header.bottom, hitIsButton: hit === button || button.contains(hit) };
  });
  expect(position.top).toBeGreaterThanOrEqual(position.headerBottom);
  expect(position.hitIsButton).toBe(true);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('저장소 접근이 차단돼도 기록 로딩이 끝나고 게임 설정을 열 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.hero-primary')).toBeEnabled();
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="rps"]')).toBeVisible();
});
