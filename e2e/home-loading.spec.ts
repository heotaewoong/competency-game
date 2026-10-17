import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

const bundleTitles = { rotation: '도형 회전하기', appointment: '약속 정하기' } as const;
type BundleGame = keyof typeof bundleTitles;
const bundleRegion = (page: Page) => page.locator('section[aria-labelledby="training-bundle-title"]');

function watchBundleErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function captureBundle(page: Page, testInfo: TestInfo, phase: string) {
  const snapshot = await page.evaluate(() => {
    const region = document.querySelector('section[aria-labelledby="training-bundle-title"]');
    const heading = region?.querySelector('h2');
    const headingBox = heading?.getBoundingClientRect();
    const list = region?.querySelector('ol');
    const actions = region?.querySelector('.training-bundle-actions');
    const luminance = (color: string) => {
      const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels.length === 3 ? channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 : null;
    };
    const styles = Array.from(region?.querySelectorAll<HTMLElement>('p, li, label, legend, button') ?? [], element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      let painted: Element | null = element;
      while (painted && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(painted).backgroundColor)) painted = painted.parentElement;
      const paintedBackground = painted ? getComputedStyle(painted).backgroundColor : null;
      const foreground = luminance(style.color);
      const background = paintedBackground ? luminance(paintedBackground) : null;
      const contrast = foreground !== null && background !== null ? (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) : null;
      return { tag: element.tagName, text: element.textContent, font: Number.parseFloat(style.fontSize), foreground: style.color, background: style.backgroundColor, paintedBackground, contrast, width: box.width, height: box.height };
    });
    let generation: string | null = null;
    let resultsRaw: string | null = null;
    let saved: Array<{ id: string; gameId: string }> = [];
    let storageError: string | null = null;
    try {
      generation = localStorage.getItem('nineflow-practice-results-generation-v1');
      resultsRaw = generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null;
      if (resultsRaw) {
        const envelope = JSON.parse(resultsRaw) as { version: number; generation: string; results: typeof saved };
        if (envelope.version !== 4 || envelope.generation !== generation || !Array.isArray(envelope.results)) throw new Error('잘못된 결과 봉투');
        saved = envelope.results.map(({ id, gameId }) => ({ id, gameId }));
      }
    } catch (error) { storageError = String(error); }
    return {
      wall: Date.now(), ticks: performance.now(),
      status: region?.querySelector('[role="status"]')?.textContent ?? null,
      items: Array.from(region?.querySelectorAll('ol[aria-label="훈련 묶음 진행"] li') ?? [], item => item.textContent),
      buttons: Array.from(region?.querySelectorAll<HTMLButtonElement>('button') ?? [], button => ({ text: button.textContent, disabled: button.disabled, focused: button === document.activeElement })),
      headingFocused: region?.querySelector('h2') === document.activeElement,
      headingBox: headingBox ? { top: headingBox.top, bottom: headingBox.bottom, height: headingBox.height, width: headingBox.width } : null,
      scrollY: window.scrollY, viewportHeight: window.innerHeight,
      theme: { textScale: document.documentElement.dataset.textScale, contrast: document.documentElement.dataset.contrast },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      headingBeforeList: Boolean(heading && list && (heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)),
      listBeforeActions: Boolean(list && actions && (list.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING)),
      styles,
      headerRecordCount: document.querySelector('.header-status b')?.textContent ?? null,
      stageCount: document.querySelectorAll('.stage-panel').length,
      workspaceCount: document.querySelectorAll('.game-workspace').length,
      preparationCount: document.querySelectorAll('.game-preparation').length,
      resultCount: document.querySelectorAll('.stage-result').length,
      generation, resultsRaw, saved, storageError,
    };
  });
  console.log('TRAINING_BUNDLE', JSON.stringify({ project: testInfo.project.name, phase, snapshot }));
  await testInfo.attach(`training-bundle-${phase}`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`training-bundle-${phase}.png`) });
  return snapshot;
}

async function openBundleHome(page: Page) {
  // Install before navigation; let loading and focus run naturally until each session starts.
  await page.clock.install({ time: Date.UTC(2035, 0, 18) });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await expect(bundleRegion(page).getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeVisible();
}

async function selectBundle(page: Page, games: readonly BundleGame[] = ['rotation', 'appointment']) {
  const region = bundleRegion(page);
  for (const checkbox of await region.getByRole('checkbox').all()) if (await checkbox.isChecked()) await checkbox.uncheck();
  for (const game of games) await region.getByRole('checkbox', { name: bundleTitles[game], exact: true }).check();
  await region.getByRole('button', { name: '훈련 묶음 만들기', exact: true }).click();
}

async function createBundle(page: Page, games: readonly BundleGame[] = ['rotation', 'appointment']) {
  await selectBundle(page, games);
  const region = bundleRegion(page);
  await expect(region.getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeFocused();
  await expect(region.getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeInViewport();
  await expect(region.locator('[role="status"]')).toContainText(`완료 0 / ${games.length}`);
  await expect(region.getByRole('list', { name: '훈련 묶음 진행', exact: true }).getByRole('listitem')).toContainText(games.map(game => bundleTitles[game]));
  await expect(region).toContainText('이 페이지에서만 유지');
  await expect(page.locator('.stage-panel, .game-workspace, .game-preparation, .stage-result')).toHaveCount(0);
}

async function prepareBundlePractice(page: Page, game: BundleGame) {
  const stage = page.locator(`section[data-game="${game}"]`);
  await expect(stage).toBeVisible();
  const label = game === 'rotation' ? '문제 수' : '라운드당 문항';
  if (game === 'appointment') await stage.getByRole('button', { name: '2라운드 위치만 연습', exact: true }).click();
  const quantity = stage.getByLabel(`${label} 현재 값`, { exact: true });
  const initial = Number(await quantity.textContent());
  expect(Number.isInteger(initial)).toBe(true);
  expect(initial).toBeGreaterThanOrEqual(1);
  expect(initial).toBeLessThanOrEqual(game === 'rotation' ? 30 : 8);
  for (let current = initial; current > 1; current -= 1) await stage.getByRole('button', { name: `${label} 줄이기`, exact: true }).click();
  await expect(quantity).toHaveText('1');
  const untimed = stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
  if (!(await untimed.isChecked())) await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(untimed).toBeChecked();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  await runBundlePreparation(page, game);
}

async function runBundlePreparation(page: Page, game: BundleGame) {
  const began = await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }));
  for (const second of ['3', '2', '1']) {
    await expect(page.locator('.game-preparation > b')).toHaveText(second);
    await page.clock.runFor(1_000);
  }
  expect(await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }))).toEqual({ wall: began.wall + 3_000, ticks: began.ticks + 3_000 });
  await expect(page.locator(`.game-workspace.game-${game}`)).toBeVisible();
}

async function finishBundlePractice(page: Page, game: BundleGame, testInfo: TestInfo, phase: string, flushSave = true) {
  const workspace = page.locator(`.game-workspace.game-${game}`);
  if (game === 'rotation') {
    const target = await workspace.locator('.rotation-comparison article').last().getByRole('img').getAttribute('aria-label');
    const direction = target?.split('. 목표 방향은 ')[1];
    const answers: Record<string, string[]> = {
      '왼쪽 45°': ['1'], '오른쪽 45°': ['2'], '왼쪽 90°': ['1', '1'], '오른쪽 90°': ['2', '2'],
      '왼쪽 135°': ['1', '1', '1'], '오른쪽 135°': ['2', '2', '2'], '180° 점대칭': ['3', '4'],
      '좌우 거울상': ['3'], '상하 거울상': ['4'], 'L45 뒤 좌우 반전': ['1', '3'], 'L45 뒤 상하 반전': ['1', '4'],
      'R45 뒤 좌우 반전': ['2', '3'], 'R45 뒤 상하 반전': ['2', '4'], '↘축 대각선 반전 (y=-x)': ['1', '1', '4'], '↗축 대각선 반전 (y=x)': ['1', '1', '3'],
    };
    expect(direction, target ?? '목표 없음').toBeTruthy();
    expect(answers[direction!], target ?? '목표 없음').toBeDefined();
    for (const key of answers[direction!]) await workspace.getByRole('button', { name: new RegExp(`^${key}번 `) }).click();
    await workspace.getByRole('button', { name: /답안 제출/ }).click();
    await expect(workspace.locator('.rotation-review')).toContainText('모양 일치');
    await workspace.getByRole('button', { name: /결과 보기/ }).click();
  } else {
    await workspace.getByRole('button', { name: '이 라운드 시작', exact: false }).click();
    const people: string[][] = [];
    const next = workspace.locator('.appointment-stimulus .single-action');
    for (let person = 1; person <= 3; person += 1) {
      await expect(workspace.locator('.appointment-phase-meta b')).toHaveText(`${person} / 3`);
      const coordinates = await workspace.locator('.location-memory > i.selected small').allTextContents();
      expect(coordinates.length).toBeGreaterThan(0);
      expect(new Set(coordinates).size).toBe(coordinates.length);
      for (const coordinate of coordinates) expect(coordinate).toMatch(/^[1-4]-[1-4]$/);
      people.push(coordinates);
      await expect(next).toHaveAttribute('aria-disabled', 'false');
      await next.click();
      if (person < 3) await page.clock.runFor(320); // Existing native presentation-advance lock.
    }
    const common = people[0].filter(value => people[1].includes(value) && people[2].includes(value));
    expect(common).toHaveLength(1);
    const [row, column] = common[0].split('-');
    await workspace.locator('.location-choice-grid').getByRole('button', { name: new RegExp(`${row}행 ${column}열$`) }).click();
    await expect(workspace.locator('.answer-signal')).toHaveAttribute('data-feedback-tone', 'success');
    await page.clock.runFor(900); // Keep the product's final-answer display interval.
  }
  await expect(page.getByRole('heading', { name: `${bundleTitles[game]} 결과`, exact: true })).toBeVisible();
  const raw = await captureBundle(page, testInfo, phase);
  await expect(page.locator('.stage-result .result-metrics article').filter({ hasText: '정확도' }).locator('b')).toHaveText('100%');
  if (flushSave) await page.clock.runFor(500); // Existing deferred save; never a second test writer.
  return raw;
}

async function closeBundleResult(page: Page, resume = true) {
  await page.locator('.stage-result').getByRole('button', { name: /^게임 목록/ }).click();
  await expect(page.locator('.stage-panel')).toHaveCount(0);
  if (resume) await page.clock.resume();
}

test('훈련 묶음은 두 실제 게임의 완주만 순서대로 표시하고 재연습과 새로고침을 구분한다', async ({ page }, testInfo) => {
  const errors = watchBundleErrors(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await openBundleHome(page);
  await page.locator('.readiness-banner button').click();
  const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
  await readiness.getByRole('button', { name: '큰 글자', exact: true }).click();
  await readiness.getByRole('button', { name: '고대비', exact: true }).click();
  await readiness.getByRole('button', { name: '응시 준비센터 닫기', exact: true }).click();
  const selection = await captureBundle(page, testInfo, 'large-high-contrast-selection');
  expect(selection.theme).toEqual({ textScale: 'large', contrast: 'high' });
  expect(selection.horizontalOverflow).toBe(false);
  const labels = selection.styles.filter(style => style.tag === 'LABEL');
  expect(labels).toHaveLength(9);
  for (const label of labels) {
    expect(label.height).toBeGreaterThanOrEqual(44);
    expect(label.font).toBeGreaterThanOrEqual(16);
    expect(label.foreground).toMatch(/^rgba?\(/);
    expect(label.paintedBackground).toMatch(/^rgba?\(/);
    expect(label.foreground).not.toBe(label.paintedBackground);
    expect(label.contrast).toBeGreaterThanOrEqual(4.5);
  }
  await createBundle(page);
  const created = await captureBundle(page, testInfo, 'large-high-contrast-created');
  expect(created).toMatchObject({ headingBeforeList: true, listBeforeActions: true, horizontalOverflow: false });
  for (const style of created.styles) {
    expect(style.font).toBeGreaterThanOrEqual(style.tag === 'P' && style.text?.startsWith('완료 ') ? 18 : 16);
    expect(style.contrast).toBeGreaterThanOrEqual(4.5);
  }
  const region = bundleRegion(page);
  await region.getByRole('button', { name: '도형 회전하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'rotation');
  expect((await finishBundlePractice(page, 'rotation', testInfo, 'first-complete')).status).toContain('완료 1 / 2');
  await page.locator('.stage-result').getByRole('button', { name: '다시 연습', exact: true }).click();
  await runBundlePreparation(page, 'rotation');
  expect((await finishBundlePractice(page, 'rotation', testInfo, 'replayed-not-counted')).status).toContain('완료 1 / 2');
  await closeBundleResult(page);
  const next = region.getByRole('button', { name: '약속 정하기 설정 열기', exact: true });
  await expect(next).toBeFocused();
  await next.click();
  await prepareBundlePractice(page, 'appointment');
  expect((await finishBundlePractice(page, 'appointment', testInfo, 'all-complete')).status).toContain('완료 2 / 2');
  await closeBundleResult(page);
  await expect(region.getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeFocused();
  await expect(region.getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeInViewport();
  await expect(region.getByRole('button', { name: /설정 열기$/ })).toHaveCount(0);
  const beforeReload = await captureBundle(page, testInfo, 'before-reload');
  expect(beforeReload.saved.map(item => item.gameId).sort()).toEqual(['appointment', 'rotation', 'rotation']);
  expect(new Set(beforeReload.saved.map(item => item.id)).size).toBe(3);
  await page.reload();
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await captureBundle(page, testInfo, 'reloaded');
  expect(reloaded).toMatchObject({ items: [], status: null, generation: beforeReload.generation, saved: beforeReload.saved, stageCount: 0, storageError: null });
  await expect(region.getByRole('button', { name: '훈련 묶음 만들기', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const failure of ['write-denied', 'storage-blocked'] as const) {
  test(`훈련 묶음 ${failure}: 저장 실패는 두 게임의 실제 완주를 막지 않는다`, async ({ page }, testInfo) => {
    const errors = watchBundleErrors(page);
    if (failure === 'storage-blocked') await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    });
    await openBundleHome(page);
    await createBundle(page);
    const baseline = await captureBundle(page, testInfo, 'before-storage-failure');
    if (failure === 'write-denied') await page.evaluate((generation) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === `nineflow-practice-results-v4:${generation}`) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, baseline.generation);
    for (const [index, game] of (['rotation', 'appointment'] as const).entries()) {
      await bundleRegion(page).getByRole('button', { name: `${bundleTitles[game]} 설정 열기`, exact: true }).click();
      await prepareBundlePractice(page, game);
      const raw = await finishBundlePractice(page, game, testInfo, `${failure}-${game}`);
      expect(raw.status).toContain(`완료 ${index + 1} / 2`);
      await expect(page.getByRole('status').filter({ hasText: /현재 화면|브라우저 저장 공간/ })).toBeVisible();
      await closeBundleResult(page);
    }
    const completed = await captureBundle(page, testInfo, `${failure}-finished`);
    expect(completed.status).toContain('완료 2 / 2');
    expect(completed.saved).toEqual([]);
    if (failure === 'write-denied') expect(completed).toMatchObject({ generation: baseline.generation, resultsRaw: baseline.resultsRaw, storageError: null });
    else expect(completed.storageError).toContain('Storage blocked');
    expect(errors).toEqual([]);
  });
}

test('훈련 묶음은 저장소 접근 회복 뒤 다른 탭의 첫 세대 생성으로 초기화되지 않는다', async ({ page, context }, testInfo) => {
  const errors = watchBundleErrors(page);
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    (window as Window & { restoreBundleStorage?: () => void }).restoreBundleStorage = () => {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
      else Reflect.deleteProperty(window, 'localStorage');
    };
  });
  await openBundleHome(page);
  await createBundle(page);
  await bundleRegion(page).getByRole('button', { name: '도형 회전하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'rotation');
  const blocked = await finishBundlePractice(page, 'rotation', testInfo, 'recovery-first-complete');
  expect(blocked.status).toContain('완료 1 / 2');
  expect(blocked.storageError).toContain('Storage blocked');
  await closeBundleResult(page);
  await page.evaluate(() => (window as Window & { restoreBundleStorage?: () => void }).restoreBundleStorage!());
  const beforePeer = await captureBundle(page, testInfo, 'recovered-before-peer');
  expect(beforePeer).toMatchObject({ generation: null, saved: [], headerRecordCount: '1', storageError: null });
  const peer = await context.newPage();
  const peerErrors = watchBundleErrors(peer);
  try {
    await peer.goto('/');
    await expect(peer.locator('#records')).toHaveAttribute('aria-busy', 'false');
    // Wait for the original storage handler's observable adoption, not just the shared pointer write.
    await expect(page.locator('.header-status b')).toHaveText('0');
    await expect(bundleRegion(page).locator('[role="status"]')).toContainText('완료 1 / 2');
    const adopted = await captureBundle(page, testInfo, 'peer-created-first-generation');
    expect(adopted.generation).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    expect(adopted.storageError).toBeNull();
    expect(adopted).toMatchObject({ saved: [], headerRecordCount: '0' });
    expect(adopted.status).toContain('완료 1 / 2');
    await expect(bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true })).toBeVisible();
  } finally { await peer.close(); }
  await bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'appointment');
  expect((await finishBundlePractice(page, 'appointment', testInfo, 'recovered-all-complete')).status).toContain('완료 2 / 2');
  await closeBundleResult(page);
  await expect(bundleRegion(page).getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeFocused();
  await expect(bundleRegion(page).getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeInViewport();
  expect(peerErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test('훈련 묶음은 일반 진입·취소 교체·중도종료·게임 바꾸기의 완료를 가져오지 않는다', async ({ page }, testInfo) => {
  const errors = watchBundleErrors(page);
  await openBundleHome(page);
  await createBundle(page);
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  await prepareBundlePractice(page, 'rotation');
  expect((await finishBundlePractice(page, 'rotation', testInfo, 'ordinary-entry')).status).toContain('완료 0 / 2');
  await closeBundleResult(page);
  await bundleRegion(page).getByRole('button', { name: '도형 회전하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'rotation');
  expect((await finishBundlePractice(page, 'rotation', testInfo, 'old-plan-finished-before-save', false)).status).toContain('완료 1 / 2');
  await closeBundleResult(page, false);
  await bundleRegion(page).getByRole('button', { name: '묶음 취소', exact: true }).click();
  await selectBundle(page, ['appointment', 'rotation']);
  await page.clock.runFor(500);
  const replaced = await captureBundle(page, testInfo, 'old-save-after-replacement');
  expect(replaced.status).toContain('완료 0 / 2');
  expect(replaced.items[0]).toContain('약속 정하기');
  expect(replaced.saved).toHaveLength(2);
  await page.clock.resume();
  await bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'appointment');
  await page.locator('.game-workspace.game-appointment').getByRole('button', { name: '이 라운드 시작', exact: false }).click();
  await expect(page.locator('.appointment-phase-meta b')).toHaveText('1 / 3');
  await page.locator('.game-workspace').getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?', exact: true }).getByRole('button', { name: '연습창 닫기', exact: true }).click();
  await page.clock.runFor(1_000);
  expect((await captureBundle(page, testInfo, 'stopped')).status).toContain('완료 0 / 2');
  await page.clock.resume();
  await bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true }).click();
  await prepareBundlePractice(page, 'appointment');
  await page.locator('.game-workspace.game-appointment').getByRole('button', { name: '이 라운드 시작', exact: false }).click();
  await page.locator('.game-workspace.game-appointment').getByRole('button', { name: '게임 바꾸기', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '게임 선택 열기', exact: true }).click();
  await page.getByRole('dialog', { name: '다른 게임 선택', exact: true }).getByRole('button', { name: /도형 회전하기/ }).click();
  await prepareBundlePractice(page, 'rotation');
  expect((await finishBundlePractice(page, 'rotation', testInfo, 'switched-game')).status).toContain('완료 0 / 2');
  await closeBundleResult(page);
  await expect(bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('훈련 묶음은 실제 기록 삭제와 다른 탭의 확정된 세대 변경에서 초기화된다', async ({ page, context }, testInfo) => {
  const errors = watchBundleErrors(page);
  await openBundleHome(page);
  for (const origin of ['same-page', 'other-tab'] as const) {
    await createBundle(page);
    await bundleRegion(page).getByRole('button', { name: '도형 회전하기 설정 열기', exact: true }).click();
    await prepareBundlePractice(page, 'rotation');
    expect((await finishBundlePractice(page, 'rotation', testInfo, `${origin}-before-clear`)).status).toContain('완료 1 / 2');
    await closeBundleResult(page);
    const before = await captureBundle(page, testInfo, `${origin}-saved`);
    if (origin === 'other-tab') {
      await bundleRegion(page).getByRole('button', { name: '약속 정하기 설정 열기', exact: true }).click();
      await expect(page.locator('section[data-game="appointment"]')).toBeVisible();
      await expect(page.locator('.game-preparation, .game-workspace')).toHaveCount(0);
    }
    const owner = origin === 'same-page' ? page : await context.newPage();
    const peerErrors = owner === page ? [] : watchBundleErrors(owner);
    try {
      if (owner !== page) {
        await owner.goto('/');
        await expect(owner.locator('#records')).toHaveAttribute('aria-busy', 'false');
      }
      await owner.locator('.records-data-button').click();
      const dialog = owner.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
      await dialog.getByRole('button', { name: '전체 기록 삭제', exact: true }).click();
      await dialog.getByRole('button', { name: '삭제 확정', exact: true }).click();
      await expect(bundleRegion(page).locator('ol')).toHaveCount(0);
      const cleared = await captureBundle(page, testInfo, `${origin}-cleared`);
      expect(cleared).toMatchObject({ items: [], status: null, saved: [], storageError: null });
      expect(cleared.generation).toBeTruthy();
      expect(cleared.generation).not.toBe(before.generation);
      await dialog.getByRole('button', { name: '내 기록 백업·복원 닫기', exact: true }).click();
    } finally { if (owner !== page) await owner.close(); }
    if (origin === 'other-tab') {
      await page.keyboard.press('Escape');
      await expect(page.locator('.stage-panel')).toHaveCount(0);
      await expect(bundleRegion(page).getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeFocused();
      await expect(bundleRegion(page).getByRole('heading', { name: '이번 훈련 묶음', exact: true })).toBeInViewport();
    }
    expect(peerErrors).toEqual([]);
  }
  expect(errors).toEqual([]);
});

for (const textScale of ['standard', 'large'] as const) {
  test(`${textScale} 글자에서 기록이 있는 9개 게임 카드의 내용을 잘라 숨기지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((scale) => {
      localStorage.setItem('nineflow-accessibility-v1', JSON.stringify({ contrast: 'standard', textScale: scale, motion: 'reduce' }));
      const generation = 'card-responsive-layout';
      const results = ['rotation', 'rps', 'appointment', 'path', 'potion', 'nback', 'number', 'count', 'mouse'].map((gameId) => ({
        id: `responsive-${gameId}`, gameId, completedAt: '2026-10-16T22:00:00.000Z',
        accuracy: 0, medianRt: 0, stability: 0, errors: 1,
        detail: { sessionMode: '연습 모드', quantity: 9, paceMs: 4500, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' },
      }));
      localStorage.setItem('nineflow-practice-results-generation-v1', generation);
      localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
    }, textScale);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
    await expect(page.locator('.game-card')).toHaveCount(9);
    await expect(page.locator('.game-card').filter({ has: page.getByRole('heading', { name: '가위바위보', exact: true }) }).locator('.card-record dd').nth(1)).toHaveText('0%');
    await page.evaluate(() => document.fonts.ready);

    for (const width of [240, 280, 320, 350, 385, 520, 620, 621, 768, 900, 1024, 1280]) {
      await page.setViewportSize({ width, height: width === 385 ? 382 : 640 });
      const issues = await page.locator('.game-card').evaluateAll((cards) => cards.flatMap((card) => {
        const cardRect = card.getBoundingClientRect();
        return [...card.querySelectorAll<HTMLElement>('.card-copy h3, .card-copy p, .card-record dt, .card-record dd, .card-action > span, .card-action b')].flatMap((element) => {
          const rect = element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          const textOutside = [...range.getClientRects()].some((text) =>
            text.left < rect.left - 1 || text.right > rect.right + 1 ||
            text.top < rect.top - 1 || text.bottom > rect.bottom + 1);
          const clipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
          const outsideCard = rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1;
          return clipped || outsideCard || textOutside ? [{
            game: card.querySelector('h3')?.textContent,
            text: element.textContent, clipped, outsideCard, textOutside,
          }] : [];
        });
      }));
      expect(issues, `${width}px ${textScale}: 카드 내부 잘림`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      if (width === 385 || width === 621) {
        await page.screenshot({ fullPage: true, path: testInfo.outputPath(`cards-${textScale}-${width}.png`) });
      }
    }
    expect(errors).toEqual([]);
  });
}

for (const game of [
  { id: 'rotation', title: '도형 회전하기', board: '.rotation-comparison', controls: '.rotation-op-grid button, .rotation-submit-row button' },
  { id: 'potion', title: '마법약 만들기', board: '.potion-workbench', controls: '.potion-actions button' },
  { id: 'nback', title: '도형 순서 기억하기', board: '.nback-stimulus', controls: '.nback-status button' },
]) {
  for (const textScale of ['standard', 'large'] as const) {
    test(`${game.title}: ${textScale} 글자의 좁은 가로 화면에서도 문제와 조작부가 잘리지 않는다`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript((scale) => {
        localStorage.setItem('nineflow-accessibility-v1', JSON.stringify({ contrast: 'standard', textScale: scale, motion: 'reduce' }));
      }, textScale);
      await page.setViewportSize({ width: 385, height: 382 });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      await page.getByRole('button', { name: new RegExp(`${game.title}, 난이도 .+, 설정 열기`) }).click();
      const stage = page.locator(`section[data-game="${game.id}"]`);
      await stage.locator('.stage-start-practice').click();
      const workspace = stage.locator('.game-workspace');
      await expect(workspace).toBeVisible();
      await expect(page.locator('.game-preparation')).toHaveCount(0);
      if (game.id === 'nback') await expect(workspace.locator('.nback-countdown')).toHaveCount(0);
      await expect(workspace.locator(game.board)).toBeVisible();

      for (const viewport of [
        { width: 385, height: 382 }, { width: 568, height: 320 },
        { width: 768, height: 360 }, { width: 844, height: 360 }, { width: 320, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        const issues = await workspace.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return [...element.querySelectorAll<HTMLElement>('button, h3, p')].filter((item) =>
            item.getClientRects().length && !item.classList.contains('sr-only') &&
            getComputedStyle(item).visibility !== 'hidden').flatMap((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || item.scrollWidth > item.clientWidth + 2
              ? [{ text: item.textContent, className: item.className, left: rect.left, right: rect.right, bounds: [bounds.left, bounds.right] }]
              : [];
          });
        });
        expect(issues, `${game.id} ${viewport.width}×${viewport.height}: 문제·조작부 가로 잘림`).toEqual([]);
        for (const control of await workspace.locator(game.controls).all()) {
          await expect(control).toBeVisible();
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          if (await control.isEnabled()) await control.click({ trial: true });
        }
        if (viewport.width === 385 || viewport.width === 844) {
          await stage.screenshot({ path: testInfo.outputPath(`${game.id}-${textScale}-${viewport.width}.png`) });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
