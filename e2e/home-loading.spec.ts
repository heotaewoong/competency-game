import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { games } from '../app/lib/game-data';

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
      const pageOverflow = await page.evaluate((expectedWidth) => {
        const firstWidth = document.documentElement.scrollWidth;
        if (firstWidth <= expectedWidth + 1) return { firstWidth };
        try {
          const viewport = {
            innerWidth: window.innerWidth, documentClientWidth: document.documentElement.clientWidth,
            bodyClientWidth: document.body.clientWidth, bodyScrollWidth: document.body.scrollWidth,
            visualViewportWidth: window.visualViewport?.width ?? null, fonts: document.fonts.status,
          };
          const offenders = [...document.querySelectorAll('*')].flatMap((element) => {
            const rect = element.getBoundingClientRect();
            const outsideViewport = rect.left < -1 || rect.right > viewport.innerWidth + 1;
            const internalOverflow = element.scrollWidth > element.clientWidth + 1;
            if (!outsideViewport && !internalOverflow) return [];
            const style = getComputedStyle(element);
            const clippingParents = [];
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const parentStyle = getComputedStyle(parent);
              if (!['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX)) continue;
              const parentRect = parent.getBoundingClientRect();
              clippingParents.push({
                tag: parent.tagName, id: parent.id, className: parent.getAttribute('class'),
                left: parentRect.left, right: parentRect.right, overflowX: parentStyle.overflowX,
              });
            }
            return [{
              tag: element.tagName, id: element.id, className: element.getAttribute('class'),
              text: element.textContent?.trim().slice(0, 160), left: rect.left, right: rect.right,
              clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
              outsideViewport, internalOverflow, position: style.position, overflowX: style.overflowX,
              visibility: style.visibility, ariaHidden: element.getAttribute('aria-hidden'), clippingParents,
            }];
          });
          return { firstWidth, viewport, offenders, endWidth: document.documentElement.scrollWidth };
        } catch (error) {
          return { firstWidth, diagnosticError: String(error) };
        }
      }, width);
      if (pageOverflow.firstWidth > width + 1) {
        console.log('RESPONSIVE_PAGE_OVERFLOW', JSON.stringify({
          project: testInfo.project.name, textScale, requestedViewport: page.viewportSize(), ...pageOverflow,
        }));
      }
      expect(pageOverflow.firstWidth).toBeLessThanOrEqual(width + 1);
      const recordActions = await page.locator('.game-record-grid > article').evaluateAll((articles) => {
        const order = document.querySelector<HTMLElement>('.game-order-actions');
        const groups = articles.map((article) => ({ boundary: article, row: article.querySelector<HTMLElement>('.game-record-actions') }));
        if (order) groups.push({ boundary: order, row: order });
        return {
          count: articles.length,
          orderCount: order?.querySelectorAll('button').length ?? 0,
          issues: groups.flatMap(({ boundary, row }) => {
            const boundaryRect = boundary.getBoundingClientRect();
            if (!row) return [{ text: '기록 버튼 영역 없음', textRects: 0, clipped: false, textOutside: false, outsideContainer: false, outsideViewport: false, tooSmall: false }];
            return [row, ...row.querySelectorAll<HTMLElement>('button, span')].flatMap((element) => {
              const rect = element.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(element);
              const textRects = [...range.getClientRects()].filter((text) => text.width > 0 && text.height > 0);
              const textOutside = textRects.some((text) => text.left < rect.left - 1 || text.right > rect.right + 1 || text.top < rect.top - 1 || text.bottom > rect.bottom + 1);
              const clipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
              const outsideContainer = rect.left < boundaryRect.left - 1 || rect.right > boundaryRect.right + 1;
              const outsideViewport = rect.left < -1 || rect.right > window.innerWidth + 1;
              const tooSmall = element.tagName === 'BUTTON' && (rect.width < 44 || rect.height < 44);
              if (textRects.length === 0 || clipped || textOutside || outsideContainer || outsideViewport || tooSmall) {
                const style = getComputedStyle(element);
                return [{
                  text: element.textContent ?? '', textRects: textRects.length, clipped, textOutside, outsideContainer, outsideViewport, tooSmall,
                  box: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
                  client: { width: element.clientWidth, height: element.clientHeight },
                  scroll: { width: element.scrollWidth, height: element.scrollHeight },
                  textBounds: textRects.map((text) => ({ left: text.left, right: text.right, top: text.top, bottom: text.bottom, width: text.width, height: text.height })),
                  style: {
                    display: style.display, gridTemplateColumns: style.gridTemplateColumns, font: style.font,
                    lineHeight: style.lineHeight, padding: style.padding, whiteSpace: style.whiteSpace,
                    overflowX: style.overflowX, overflowY: style.overflowY,
                  },
                }];
              }
              return [];
            });
          }),
        };
      });
      expect(recordActions.count).toBe(9);
      expect(recordActions.orderCount).toBe(2);
      expect(recordActions.issues, `${width}px ${textScale}: 기록·정렬 버튼 잘림`).toEqual([]);
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
              ? [{ text: item.textContent, className: item.className, left: rect.left, right: rect.right, bounds: [bounds.left, bounds.right],
                clientWidth: item.clientWidth, scrollWidth: item.scrollWidth,
                font: getComputedStyle(item).font, whiteSpace: getComputedStyle(item).whiteSpace }]
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
          const textLayout = await control.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(button);
            const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
            return {
              rectCount: rects.length, clientWidth: button.clientWidth, scrollWidth: button.scrollWidth,
              font: getComputedStyle(button).font,
              outside: rects.filter((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1 ||
                rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
                .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
            };
          });
          expect(textLayout.rectCount).toBeGreaterThan(0);
          expect(textLayout.outside, `${game.id} ${viewport.width}px: 버튼 내용 ${JSON.stringify(textLayout)}`).toEqual([]);
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

async function captureCountCloudLayout(page: Page, testInfo: TestInfo, textScale: string, phase: string, errors: readonly string[], phaseRoot?: Locator) {
  const readSnapshot = () => {
    const epsilon = 1;
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    const outside = (rect: ReturnType<typeof box>, boundary: ReturnType<typeof box>) => ({
      x: rect.left < boundary.left - epsilon || rect.right > boundary.right + epsilon,
      y: rect.top < boundary.top - epsilon || rect.bottom > boundary.bottom + epsilon,
    });
    const readText = (element: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].map(box), bounds = box(range.getBoundingClientRect());
      const style = getComputedStyle(element);
      return { text: element.textContent?.trim() ?? '', box: box(element.getBoundingClientRect()), range: bounds, rects,
        nonzero: bounds.width > 0 && bounds.height > 0 && rects.length > 0 && rects.every((rect) => rect.width > 0 && rect.height > 0),
        fontSize: style.fontSize, lineHeight: style.lineHeight, display: style.display, visibility: style.visibility };
    };
    const frame = document.querySelector<HTMLElement>('.game-count');
    const body = frame?.querySelector<HTMLElement>('.workspace-body');
    const bodyBox = body ? box(body.getBoundingClientRect()) : null;
    const board = frame?.querySelector<HTMLElement>('.count-board');
    const deadline = frame?.querySelector<HTMLElement>('.count-wrap > .time-strip');
    const deadlineText = deadline?.querySelector<HTMLElement>('.deadline-text');
    const clouds = [...(frame?.querySelectorAll<HTMLElement>('.word-cloud') ?? [])].map((cloud, side) => {
      const button = cloud.closest('button');
      const cloudBox = box(cloud.getBoundingClientRect()), buttonBox = button ? box(button.getBoundingClientRect()) : null;
      const clippers: {
        tag: string; className: string; overflowX: string; overflowY: string; afterScrollableY: boolean;
        box: ReturnType<typeof box>; clipBox: ReturnType<typeof box>;
        clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number;
        scrollLeft: number; scrollTop: number;
      }[] = [];
      let afterScrollableY = false;
      for (let node: HTMLElement | null = cloud; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        if (!['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) && !['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) continue;
        clippers.push({
          tag: node.tagName, className: node.className, overflowX: style.overflowX, overflowY: style.overflowY, afterScrollableY,
          box: box(rect), clipBox: { left: rect.left + node.clientLeft, right: rect.left + node.clientLeft + node.clientWidth,
            top: rect.top + node.clientTop, bottom: rect.top + node.clientTop + node.clientHeight,
            width: node.clientWidth, height: node.clientHeight },
          clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
          scrollLeft: node.scrollLeft, scrollTop: node.scrollTop,
        });
        if (['auto', 'scroll'].includes(style.overflowY)) afterScrollableY = true;
      }
      const words = [...cloud.querySelectorAll<HTMLElement>('span')].map((word, index) => {
        const range = document.createRange(), style = getComputedStyle(word);
        range.selectNodeContents(word);
        const bounds = box(range.getBoundingClientRect()), rects = [...range.getClientRects()].map(box);
        const ancestors = clippers.map((clipper, clipperIndex) => {
          const axes = outside(bounds, clipper.clipBox);
          return { clipperIndex, axes, afterScrollableY: clipper.afterScrollableY,
            hardX: ['hidden', 'clip'].includes(clipper.overflowX) && axes.x,
            hardY: ['hidden', 'clip'].includes(clipper.overflowY) && axes.y && !clipper.afterScrollableY,
            outerHiddenY: ['hidden', 'clip'].includes(clipper.overflowY) && axes.y && clipper.afterScrollableY,
            scrollX: ['auto', 'scroll'].includes(clipper.overflowX) && axes.x,
            scrollY: ['auto', 'scroll'].includes(clipper.overflowY) && axes.y };
        });
        return { index, text: word.textContent ?? '', box: box(word.getBoundingClientRect()), range: bounds, rects,
          nonzero: bounds.width > 0 && bounds.height > 0 && rects.length > 0 && rects.every((rect) => rect.width > 0 && rect.height > 0),
          font: { size: style.fontSize, family: style.fontFamily, weight: style.fontWeight, lineHeight: style.lineHeight, whiteSpace: style.whiteSpace },
          left: word.style.left, top: word.style.top,
          ownCloudOutside: outside(bounds, cloudBox), ownButtonOutside: buttonBox ? outside(bounds, buttonBox) : { x: true, y: true }, ancestors };
      });
      return { side: side === 0 ? 'left' : 'right', box: cloudBox,
        clientWidth: cloud.clientWidth, scrollWidth: cloud.scrollWidth, clientHeight: cloud.clientHeight, scrollHeight: cloud.scrollHeight,
        label: button?.getAttribute('aria-label'), buttonBox,
        words, clippers };
    });
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const resultsRaw = generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null;
    const controls = [...(frame?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map((button) => ({
      text: button.textContent, label: button.getAttribute('aria-label'), disabled: button.disabled, box: box(button.getBoundingClientRect()),
    }));
    return { capturedAt: new Date().toISOString(), epsilon, phase: frame?.querySelector('.count-wrap')?.className ?? null,
      progress: frame?.querySelector('.workspace-progress span')?.textContent ?? null,
      textScale: document.documentElement.dataset.textScale, fonts: document.fonts.status,
      guidedNote: frame?.querySelector('.guided-pacing-note')?.textContent ?? null,
      live: [...(frame?.querySelectorAll('[aria-live]') ?? [])].map((node) => node.textContent),
      viewport: { innerWidth, innerHeight, documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, scrollX, scrollY },
      mediaCount: document.querySelectorAll('audio,video').length, storage: { generation, resultsRaw }, controls, clouds,
      progressValue: frame?.querySelector('.workspace-progress > i[role="progressbar"]')?.getAttribute('aria-valuenow') ?? null,
      progressMax: frame?.querySelector('.workspace-progress > i[role="progressbar"]')?.getAttribute('aria-valuemax') ?? null,
      workspace: frame && body && bodyBox ? {
        box: box(frame.getBoundingClientRect()),
        body: { box: bodyBox, clipBox: {
          left: bodyBox.left + body.clientLeft,
          right: bodyBox.left + body.clientLeft + body.clientWidth,
          top: bodyBox.top + body.clientTop,
          bottom: bodyBox.top + body.clientTop + body.clientHeight,
          width: body.clientWidth, height: body.clientHeight },
          clientWidth: body.clientWidth, clientHeight: body.clientHeight, scrollWidth: body.scrollWidth,
          scrollHeight: body.scrollHeight, scrollTop: body.scrollTop, scrollLeft: body.scrollLeft },
      } : null,
      board: board ? { box: box(board.getBoundingClientRect()),
        buttons: [...board.querySelectorAll<HTMLButtonElement>(':scope > button')].map((button) => ({
          label: button.getAttribute('aria-label'), disabled: button.disabled, box: box(button.getBoundingClientRect()),
        })) } : null,
      statuses: [...(frame?.querySelectorAll<HTMLElement>('.stage-sequence > span') ?? [])].map((element) => ({
        ...readText(element), active: element.classList.contains('active'),
      })),
      answerLabels: [...(frame?.querySelectorAll<HTMLElement>('.count-wrap.phase-answer > .count-board > button > span') ?? [])].map(readText),
      deadline: deadline ? { box: box(deadline.getBoundingClientRect()), label: deadline.getAttribute('aria-label'),
        duration: deadline.getAttribute('aria-valuemax'), remaining: deadline.getAttribute('aria-valuenow'),
        active: deadline.getAttribute('data-deadline-active'), text: deadlineText ? readText(deadlineText) : null } : null };
  };
  const snapshot = phaseRoot ? await phaseRoot.evaluate(readSnapshot) : await page.evaluate(readSnapshot);
  await testInfo.attach('count-cloud-' + textScale + '-' + phase, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  let resultsCount: number | null = null, storageParseError: string | null = null;
  try { resultsCount = snapshot.storage.resultsRaw === null ? null : JSON.parse(snapshot.storage.resultsRaw).results.length; }
  catch (error) { storageParseError = String(error); }
  const issues = snapshot.clouds.flatMap((cloud) => cloud.words.flatMap((word) => [
    ...(!word.nonzero || word.ownCloudOutside.x || word.ownCloudOutside.y || word.ownButtonOutside.x || word.ownButtonOutside.y
      ? [{ side: cloud.side, index: word.index, kind: 'word', nonzero: word.nonzero, cloud: word.ownCloudOutside, button: word.ownButtonOutside }] : []),
    ...word.ancestors.filter((ancestor) => ancestor.hardX || ancestor.hardY || ancestor.scrollX)
      .map((ancestor) => ({ side: cloud.side, index: word.index, kind: 'ancestor', ...ancestor })),
  ]));
  const summary = {
    scope: 'Count cloud/button XY; clipping-ancestor X; hidden/clip Y before first auto/scroll-Y viewport only. Outer hidden Y is observed, not a shared GameFrame accessibility proof.',
    project: testInfo.project.name, textScale, phase, viewport: { width: snapshot.viewport.innerWidth, height: snapshot.viewport.innerHeight }, progress: snapshot.progress,
    clouds: snapshot.clouds.map((cloud) => ({ side: cloud.side, count: cloud.words.length, label: cloud.label,
      minMargin: cloud.words.length ? {
        x: Math.min(...cloud.words.map((word) => Math.min(word.range.left - cloud.box.left, cloud.box.right - word.range.right))),
        y: Math.min(...cloud.words.map((word) => Math.min(word.range.top - cloud.box.top, cloud.box.bottom - word.range.bottom))),
      } : null,
      scrollYObservations: cloud.words.flatMap((word) => word.ancestors.filter((ancestor) => ancestor.scrollY)
        .map((ancestor) => ({ index: word.index, clipperIndex: ancestor.clipperIndex, afterScrollableY: ancestor.afterScrollableY }))),
      outerHiddenYObservations: cloud.words.flatMap((word) => word.ancestors.filter((ancestor) => ancestor.outerHiddenY)
        .map((ancestor) => ({ index: word.index, clipperIndex: ancestor.clipperIndex, afterScrollableY: ancestor.afterScrollableY, outerHiddenY: ancestor.outerHiddenY }))),
    })),
    documentX: { client: snapshot.viewport.documentClientWidth, document: snapshot.viewport.documentScrollWidth, body: snapshot.viewport.bodyScrollWidth },
    controlsBelow44: snapshot.controls.filter((control) => control.box.width < 44 || control.box.height < 44).map((control) => control.label ?? control.text),
    issues, generation: snapshot.storage.generation, resultsCount, storageParseError, errors: [...errors],
    workspace: snapshot.workspace, board: snapshot.board, statuses: snapshot.statuses,
    answerLabels: snapshot.answerLabels, deadline: snapshot.deadline,
    progressValue: snapshot.progressValue, progressMax: snapshot.progressMax,
  };
  console.log('COUNT_CLOUD_LAYOUT', JSON.stringify(summary));
  return snapshot;
}

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }] as const) {
  for (const textScale of ['standard', 'large'] as const) {
    test('개수 비교하기: ' + viewport.width + '×' + viewport.height + ' ' + textScale + ' 글자에서 제시 단어 자체와 가로 경계가 잘리지 않는다', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript((scale) => {
        localStorage.setItem('nineflow-accessibility-v1', JSON.stringify({ contrast: 'standard', textScale: scale, motion: 'reduce' }));
      }, textScale);
      await page.setViewportSize(viewport);
      const panel = page.locator('.stage-panel[data-game="count"]');
      let failed = false;
      let baseline: { generation: string | null; resultsRaw: string | null } | null = null;
      try {
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
        await page.evaluate(() => document.fonts.ready);
        await page.getByRole('button', { name: '개수 비교하기, 난이도 하, 설정 열기', exact: true }).click();
        await expect(panel).toBeVisible();
        await panel.getByRole('radio', { name: /연습 모드/ }).click();
        const quantity = panel.locator('output[aria-label="문제 수 현재 값"]');
        for (let step = 0; step < 9; step += 1) {
          const value = Number(await quantity.textContent());
          expect(Number.isInteger(value) && value >= 5 && value <= 50 && value % 5 === 0).toBe(true);
          if (value === 5) break;
          await panel.getByRole('button', { name: '문제 수 줄이기', exact: true }).click();
          await expect(quantity).toHaveText(String(value - 5));
        }
        await expect(quantity).toHaveText('5');
        const pacing = panel.locator('label.accessible-pacing-setting');
        if (!await pacing.locator('input[type="checkbox"]').isChecked()) await pacing.click();
        await expect(pacing.locator('input[type="checkbox"]')).toBeChecked();
        baseline = await page.evaluate(() => {
          const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
          return { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null };
        });
        expect(baseline.generation).not.toBeNull();
        expect(baseline.resultsRaw).not.toBeNull();
        expect(JSON.parse(baseline.resultsRaw!).results).toEqual([]);
        await panel.locator('.stage-start-practice').click();
        for (let index = 0; index < 5; index += 1) {
          await expect(panel.locator('.game-count .count-wrap.phase-show')).toBeVisible();
          await expect(panel.locator('.game-count .workspace-progress span')).toContainText((index + 1) + ' / 5');
          const raw = await captureCountCloudLayout(page, testInfo, textScale, 'show-' + (index + 1), errors);
          if ([0, 2, 4].includes(index)) await page.screenshot({ path: testInfo.outputPath('count-cloud-' + textScale + '-show-' + (index + 1) + '.png') });
          expect(raw.storage).toEqual(baseline);
          expect(raw.textScale).toBe(textScale);
          expect(raw.mediaCount).toBe(0);
          expect(raw.guidedNote).toContain('제시 제한시간 없음');
          expect(raw.viewport.documentScrollWidth).toBeLessThanOrEqual(raw.viewport.documentClientWidth + 1);
          expect(raw.viewport.bodyScrollWidth).toBeLessThanOrEqual(raw.viewport.documentClientWidth + 1);
          expect(raw.clouds).toHaveLength(2);
          expect(raw.controls.length).toBeGreaterThan(0);
          for (const control of raw.controls) {
            expect(control.box.width).toBeGreaterThanOrEqual(44);
            expect(control.box.height).toBeGreaterThanOrEqual(44);
          }
          for (const cloud of raw.clouds) {
            expect(cloud.words.length).toBeGreaterThan(0);
            expect(cloud.buttonBox).not.toBeNull();
            const label = (cloud.side === 'left' ? '왼쪽' : '오른쪽') + ' 자극: ' + cloud.words.map((word) => word.text).join(' ');
            expect(cloud.label).toBe(label);
            expect(new Set(cloud.words.map((word) => word.text)).size).toBe(1);
            for (const word of cloud.words) {
              expect(word.nonzero).toBe(true);
              expect(word.ownCloudOutside).toEqual({ x: false, y: false });
              expect(word.ownButtonOutside).toEqual({ x: false, y: false });
              expect(word.ancestors.filter((ancestor) => ancestor.hardX || ancestor.hardY)).toEqual([]);
              expect(word.ancestors.filter((ancestor) => ancestor.scrollX)).toEqual([]);
              // Outer hidden-Y and scroll-Y crossings remain diagnostic; this is not a shared GameFrame accessibility proof.
            }
          }
          const counts = raw.clouds.map((cloud) => cloud.words.length);
          expect(counts[0]).not.toBe(counts[1]);
          expect(raw.clouds[0].words[0].text).not.toBe(raw.clouds[1].words[0].text);
          if (index === 4) break;
          await panel.locator('.accessible-next-action').click();
          await expect(panel.locator('.count-wrap.phase-answer')).toBeVisible();
          await panel.getByRole('button', { name: counts[0] > counts[1] ? '왼쪽 선택' : '오른쪽 선택', exact: true }).click();
          // The product's unchanged feedback and blank intervals lead to the next stable guided show.
        }
      } catch (error) {
        failed = true;
        await page.content().then((body) => testInfo.attach('count-cloud-' + textScale + '-first-failure.html', { body, contentType: 'text/html' }))
          .catch((captureError) => console.log('COUNT_CLOUD_DOM_CAPTURE_ERROR', String(captureError)));
        await page.screenshot({ path: testInfo.outputPath('count-cloud-' + textScale + '-first-failure.png') })
          .catch((captureError) => console.log('COUNT_CLOUD_CAPTURE_ERROR', String(captureError)));
        throw error;
      } finally {
        console.log('COUNT_CLOUD_ERRORS', JSON.stringify({ project: testInfo.project.name, textScale, errors }));
        try {
          if (!failed) await expect(panel.locator('.game-count')).toHaveCount(1);
          if (await panel.locator('.game-count').count()) {
            await panel.locator('.game-count').getByRole('button', { name: '연습 닫기', exact: true }).click();
            const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?', exact: true });
            await expect(confirmation).toBeVisible();
            await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
            await expect(page.locator('.stage-panel')).toHaveCount(0);
            const closed = await captureCountCloudLayout(page, testInfo, textScale, 'closed-without-result', errors);
            expect(closed.storage).toEqual(baseline);
          }
        } catch (closeError) {
          if (!failed) throw closeError;
          console.log('COUNT_CLOUD_CLOSE_ERROR', String(closeError));
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

for (const viewport of [{ width: 320, height: 568 }, { width: 385, height: 640 }, { width: 568, height: 320 }, { width: 768, height: 360 }, { width: 844, height: 320 }] as const) {
  for (const textScale of ['standard', 'large'] as const) {
    test('개수 비교하기: ' + viewport.width + '×' + viewport.height + ' ' + textScale + ' 글자의 기본 제한시간 제시와 응답 보드가 스크롤 없이 보인다', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript((scale) => {
        localStorage.setItem('nineflow-accessibility-v1', JSON.stringify({ contrast: 'standard', textScale: scale, motion: 'reduce' }));
      }, textScale);
      await page.setViewportSize(viewport);
      const panel = page.locator('.stage-panel[data-game="count"]');
      const firstFrame = panel.locator('.game-count:has(.workspace-progress > i[role="progressbar"][aria-valuenow="1"][aria-valuemax="5"])');
      let failed = false, closedNormally = false;
      let baseline: { generation: string | null; resultsRaw: string | null } | null = null;
      try {
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
        await page.evaluate(() => document.fonts.ready);
        await page.getByRole('button', { name: '개수 비교하기, 난이도 하, 설정 열기', exact: true }).click();
        await expect(panel).toBeVisible();
        await panel.getByRole('radio', { name: /연습 모드/ }).click();
        const quantity = panel.locator('output[aria-label="문제 수 현재 값"]');
        for (let step = 0; step < 9; step += 1) {
          const value = Number(await quantity.textContent());
          expect(Number.isInteger(value) && value >= 5 && value <= 50 && value % 5 === 0).toBe(true);
          if (value === 5) break;
          await panel.getByRole('button', { name: '문제 수 줄이기', exact: true }).click();
          await expect(quantity).toHaveText(String(value - 5));
        }
        await expect(quantity).toHaveText('5');
        await expect(panel.locator('output[aria-label="단어 제시 현재 값"]')).toHaveText('1초');
        const pacing = panel.locator('label.accessible-pacing-setting');
        if (await pacing.locator('input[type="checkbox"]').isChecked()) await pacing.click();
        await expect(pacing.locator('input[type="checkbox"]')).not.toBeChecked();
        baseline = await page.evaluate(() => {
          const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
          return { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null };
        });
        expect(baseline.generation).not.toBeNull();
        expect(baseline.resultsRaw).not.toBeNull();
        const initialResults = JSON.parse(baseline.resultsRaw!);
        expect(initialResults).toMatchObject({ version: 4, generation: baseline.generation });
        expect(initialResults.results).toEqual([]);
        await panel.locator('.stage-start-practice').click();

        // One read per natural phase: never retry a snapshot whose recorded phase is already late.
        const shown = await captureCountCloudLayout(page, testInfo, textScale, 'timed-first-show', errors, firstFrame.locator('.count-wrap.phase-show'));
        expect(shown.phase).toBe('count-wrap phase-show');
        expect(shown.progressValue).toBe('1');
        expect(shown.clouds).toHaveLength(2);
        const counts = shown.clouds.map((cloud) => cloud.words.length);
        expect(counts.every((count) => count > 0) && counts[0] !== counts[1]).toBe(true);
        const answerRoot = firstFrame.locator('.count-wrap.phase-answer');
        const answered = await captureCountCloudLayout(page, testInfo, textScale, 'timed-first-answer', errors, answerRoot);
        expect(answered.phase).toBe('count-wrap phase-answer');
        expect(answered.progressValue).toBe('1');
        // The first-question guard prevents a late native click from answering question two.
        await answerRoot.getByRole('button', { name: counts[0] > counts[1] ? '왼쪽 선택' : '오른쪽 선택', exact: true }).click();
        await expect(panel.locator('.game-count .workspace-progress > i[role="progressbar"]')).toHaveAttribute('aria-valuenow', '2');
        const next = await captureCountCloudLayout(page, testInfo, textScale, 'timed-next-2-of-5', errors);
        expect(next.progressValue).toBe('2');
        await panel.locator('.game-count').getByRole('button', { name: '연습 닫기', exact: true }).click();
        const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?', exact: true });
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
        await expect(panel).toHaveCount(0);
        closedNormally = true;
        const closed = await captureCountCloudLayout(page, testInfo, textScale, 'timed-closed-without-result', errors);

        const outside = (rect: { left: number; right: number; top: number; bottom: number }, boundary: { left: number; right: number; top: number; bottom: number }) => ({
          x: rect.left < boundary.left - 1 || rect.right > boundary.right + 1,
          y: rect.top < boundary.top - 1 || rect.bottom > boundary.bottom + 1,
        });
        for (const [phase, raw] of [['show', shown], ['answer', answered]] as const) {
          expect(raw.storage).toEqual(baseline);
          expect(raw.textScale).toBe(textScale);
          expect(raw.mediaCount).toBe(0);
          expect(raw.guidedNote).toBeNull();
          expect(raw.progressMax).toBe('5');
          expect(raw.workspace).not.toBeNull();
          expect(raw.board).not.toBeNull();
          expect(raw.deadline).not.toBeNull();
          const workspace = raw.workspace!, board = raw.board!, deadline = raw.deadline!;
          const visibleViewport = { left: 0, right: raw.viewport.innerWidth, top: 0, bottom: raw.viewport.innerHeight };
          expect(raw.viewport.innerWidth).toBe(viewport.width);
          expect(raw.viewport.innerHeight).toBe(viewport.height);
          expect(raw.viewport.documentScrollWidth).toBeLessThanOrEqual(raw.viewport.documentClientWidth + 1);
          expect(workspace.body.scrollWidth).toBeLessThanOrEqual(workspace.body.clientWidth + 1);
          expect(workspace.body.scrollHeight).toBeLessThanOrEqual(workspace.body.clientHeight + 1);
          expect(outside(board.box, workspace.body.clipBox), phase + ': board/body').toEqual({ x: false, y: false });
          expect(outside(board.box, workspace.box), phase + ': board/workspace').toEqual({ x: false, y: false });
          expect(outside(board.box, visibleViewport), phase + ': board/viewport').toEqual({ x: false, y: false });
          expect(board.buttons).toHaveLength(2);
          for (const button of board.buttons) {
            expect(button.box.width).toBeGreaterThanOrEqual(44);
            expect(button.box.height).toBeGreaterThanOrEqual(44);
            expect(button.disabled).toBe(phase === 'show');
            expect(outside(button.box, board.box), phase + ': button/board').toEqual({ x: false, y: false });
          }
          for (const control of raw.controls) {
            expect(control.box.width).toBeGreaterThanOrEqual(44);
            expect(control.box.height).toBeGreaterThanOrEqual(44);
          }
          expect(raw.statuses.map((status) => status.text)).toEqual(['준비', '제시', '응답']);
          expect(raw.statuses.filter((status) => status.active).map((status) => status.text)).toEqual([phase === 'show' ? '제시' : '응답']);
          expect(deadline.label).toBe(phase === 'show' ? '단어 제시시간' : '응답 제한시간');
          expect(deadline.duration).toBe(phase === 'show' ? '1000' : '3000');
          expect(deadline.active).toBe('true');
          expect(deadline.text).not.toBeNull();
          expect(outside(deadline.box, workspace.body.clipBox), phase + ': deadline/body').toEqual({ x: false, y: false });
          for (const text of [...raw.statuses, deadline.text!, ...raw.answerLabels]) {
            expect(text.nonzero).toBe(true);
            expect(text.display).not.toBe('none');
            expect(text.visibility).not.toBe('hidden');
            expect(outside(text.range, text.box), phase + ': text/own').toEqual({ x: false, y: false });
            expect(outside(text.range, workspace.body.clipBox), phase + ': text/body').toEqual({ x: false, y: false });
            expect(outside(text.range, visibleViewport), phase + ': text/viewport').toEqual({ x: false, y: false });
          }
          if (phase === 'show') {
            expect(raw.clouds).toHaveLength(2);
            for (const cloud of raw.clouds) {
              const label = (cloud.side === 'left' ? '왼쪽' : '오른쪽') + ' 자극: ' + cloud.words.map((word) => word.text).join(' ');
              expect(cloud.label).toBe(label);
              expect(cloud.words.length).toBeGreaterThan(0);
              for (const word of cloud.words) {
                expect(word.nonzero).toBe(true);
                expect(word.ownCloudOutside).toEqual({ x: false, y: false });
                expect(word.ownButtonOutside).toEqual({ x: false, y: false });
                // Timed stimuli must fit every clipping viewport, including outerHiddenY and scrollY.
                expect(word.ancestors.filter((ancestor) => ancestor.axes.x || ancestor.axes.y)).toEqual([]);
                expect(outside(word.range, workspace.body.clipBox)).toEqual({ x: false, y: false });
                expect(outside(word.range, visibleViewport)).toEqual({ x: false, y: false });
              }
            }
            expect(raw.answerLabels).toEqual([]);
          } else {
            expect(raw.clouds).toEqual([]);
            expect(board.buttons.map((button) => button.label)).toEqual(['왼쪽 선택', '오른쪽 선택']);
            expect(raw.answerLabels.map((label) => label.text)).toEqual(['← 왼쪽', '오른쪽 →']);
          }
        }
        expect(next.storage).toEqual(baseline);
        expect(next.progressMax).toBe('5');
        expect(closed.storage).toEqual(baseline);
        await expect(page.locator('.stage-result')).toHaveCount(0);
      } catch (error) {
        failed = true;
        console.log('COUNT_TIMED_FAILURE_CONTEXT', JSON.stringify({ project: testInfo.project.name, viewport, textScale, closedNormally, error: String(error) }));
        await page.content().then((body) => testInfo.attach('count-timed-' + textScale + '-first-failure.html', { body, contentType: 'text/html' }))
          .catch((captureError) => console.log('COUNT_TIMED_DOM_CAPTURE_ERROR', String(captureError)));
        await page.screenshot({ path: testInfo.outputPath('count-timed-' + textScale + '-first-failure.png') })
          .catch((captureError) => console.log('COUNT_TIMED_CAPTURE_ERROR', String(captureError)));
        throw error;
      } finally {
        console.log('COUNT_TIMED_ERRORS', JSON.stringify({ project: testInfo.project.name, viewport, textScale, errors }));
        try {
          if (!closedNormally) {
            if (!failed) await expect(panel.locator('.game-count')).toHaveCount(1);
            const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?', exact: true });
            if (!await confirmation.count() && await panel.locator('.game-count').count()) {
              await panel.locator('.game-count').getByRole('button', { name: '연습 닫기', exact: true }).click();
            }
            if (await confirmation.count()) await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
          }
        } catch (closeError) {
          if (!failed) throw closeError;
          console.log('COUNT_TIMED_CLOSE_ERROR', String(closeError));
        }
      }
      expect(errors).toEqual([]);
    });
  }
}


async function captureCommonWorkspaceHeader(page: Page, testInfo: TestInfo, gameId: string, textScale: string) {
  const raw = await page.locator('.game-workspace.game-' + gameId).evaluate((frame) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const header = frame.querySelector<HTMLElement>('.workspace-head')!;
    const actions = header.querySelector<HTMLElement>('.workspace-actions')!;
    const viewport = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: innerHeight };
    const outside = (rect: ReturnType<typeof box>, clip: { left: number; right: number; top: number; bottom: number }) => ({
      x: rect.left < clip.left - 1 || rect.right > clip.right + 1,
      y: rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1,
    });
    const buttons = [...actions.querySelectorAll<HTMLButtonElement>(':scope > button')].map((button) => {
      const bounds = box(button), style = getComputedStyle(button), pseudo = getComputedStyle(button, '::before');
      const clippingAncestors = [];
      for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
        const axes = outside(bounds, { left: rect.left + ancestor.clientLeft, right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
          top: rect.top + ancestor.clientTop, bottom: rect.top + ancestor.clientTop + ancestor.clientHeight });
        if ((['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowX) && axes.x) ||
          (['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowY) && axes.y)) {
          clippingAncestors.push({ tag: ancestor.tagName, className: ancestor.className, axes,
            overflowX: css.overflowX, overflowY: css.overflowY, box: box(ancestor),
            clientWidth: ancestor.clientWidth, clientHeight: ancestor.clientHeight, scrollWidth: ancestor.scrollWidth, scrollHeight: ancestor.scrollHeight });
        }
      }
      return { className: button.className, text: button.textContent?.trim(), label: button.getAttribute('aria-label'), disabled: button.disabled,
        box: bounds, clientWidth: button.clientWidth, clientHeight: button.clientHeight, scrollWidth: button.scrollWidth, scrollHeight: button.scrollHeight,
        fontSize: style.fontSize, lineHeight: style.lineHeight, display: style.display, visibility: style.visibility,
        pseudo: { content: pseudo.content, fontSize: pseudo.fontSize, lineHeight: pseudo.lineHeight, display: pseudo.display, visibility: pseudo.visibility },
        outsideViewport: outside(bounds, viewport), outsideHeader: outside(bounds, box(header)), outsideActions: outside(bounds, box(actions)), clippingAncestors };
    });
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { capturedAt: new Date().toISOString(), scope: 'Common GameFrame header only; preparation may still be active, not nine active-board coverage.',
      frameClass: frame.className, preparationVisible: Boolean(frame.querySelector('.game-preparation')), progress: frame.querySelector('.workspace-progress span')?.textContent,
      textScale: document.documentElement.dataset.textScale, fonts: document.fonts.status,
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth },
      header: box(header), actions: box(actions), buttons,
      storage: { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null } };
  });
  await testInfo.attach('common-header-' + gameId + '-' + textScale, { body: JSON.stringify(raw), contentType: 'application/json' });
  console.log('COMMON_HEADER_LAYOUT', JSON.stringify({ project: testInfo.project.name, gameId, textScale, viewport: raw.viewport,
    preparationVisible: raw.preparationVisible, progress: raw.progress,
    buttons: raw.buttons.map((button) => ({ label: button.label, width: button.box.width, height: button.box.height, font: button.fontSize,
      pseudo: button.pseudo, viewport: button.outsideViewport, header: button.outsideHeader, actions: button.outsideActions, clipping: button.clippingAncestors.length })),
    generation: raw.storage.generation, resultsCount: raw.storage.resultsRaw ? JSON.parse(raw.storage.resultsRaw).results.length : null }));
  return raw;
}

async function closeCommonHeaderSession(page: Page, workspace: Locator, withKeyboard: boolean) {
  const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?', exact: true });
  if (!await confirmation.count()) {
    const close = workspace.getByRole('button', { name: '연습 닫기', exact: true });
    if (withKeyboard) {
      // Explicit native-control focus checks Enter activation, not the complete Tab order.
      await close.focus();
      await expect(close).toBeFocused();
      await close.press('Enter');
    } else await close.click();
  }
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '연습창 닫기', exact: true }).click();
  await expect(page.locator('.stage-panel')).toHaveCount(0);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }] as const) {
  for (const textScale of ['standard', 'large'] as const) {
    test('공통 게임 헤더: ' + viewport.width + '×' + viewport.height + ' ' + textScale + ' 글자에서 9게임의 축약 이름과 닫기를 유지한다', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.setViewportSize(viewport);
      const readStorage = () => page.evaluate(() => {
        const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
        return { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null };
      });
      let failed = false, activeGame: string | null = null;
      try {
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        await page.getByRole('navigation', { name: '빠른 메뉴', exact: true }).getByRole('button', { name: '준비', exact: true }).click();
        const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
        await readiness.getByRole('button', { name: textScale === 'large' ? '큰 글자' : '기본 크기', exact: true }).click();
        await readiness.getByRole('button', { name: '설정 저장하고 닫기', exact: true }).click();
        await expect(readiness).toHaveCount(0);
        await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
        await page.evaluate(() => document.fonts.ready);
        const baseline = await readStorage();
        expect(baseline.generation).not.toBeNull();
        expect(baseline.resultsRaw).not.toBeNull();
        expect(JSON.parse(baseline.resultsRaw!).results).toEqual([]);
        expect(games).toHaveLength(9);
        expect(new Set(games.map((game) => game.id)).size).toBe(9);
        const completed: string[] = [];
        for (const game of games) {
          activeGame = game.id;
          await page.getByRole('button', { name: game.title + ', 난이도 ' + game.difficulty + ', 설정 열기', exact: true }).click();
          const panel = page.locator('.stage-panel[data-game="' + game.id + '"]');
          await expect(panel).toBeVisible();
          await panel.getByRole('radio', { name: /연습 모드/ }).click();
          await panel.locator('.stage-start-practice').click();
          const workspace = panel.locator('.game-workspace.game-' + game.id);
          await expect(workspace).toBeVisible();
          // GamePreparation reuses this exact header, so no artificial three-second wait is needed.
          const raw = await captureCommonWorkspaceHeader(page, testInfo, game.id, textScale);
          expect(raw.viewport).toMatchObject(viewport);
          expect(raw.textScale).toBe(textScale);
          expect(raw.fonts).toBe('loaded');
          expect(raw.buttons).toHaveLength(3);
          expect(raw.storage).toEqual(baseline);
          const labels = ['게임 바꾸기', '문제 신고', '연습 닫기'];
          const contents = ['"게임"', '"신고"'];
          for (let index = 0; index < 3; index += 1) {
            const button = raw.buttons[index], control = workspace.locator('.workspace-actions > button').nth(index);
            await expect(control).toHaveAccessibleName(labels[index]);
            await expect(control).toBeEnabled();
            expect(button.label).toBe(labels[index]);
            expect(button.disabled).toBe(false);
            expect(button.box.width).toBeGreaterThanOrEqual(44);
            expect(button.box.height).toBeGreaterThanOrEqual(44);
            expect(button.display).not.toBe('none');
            expect(button.visibility).toBe('visible');
            expect(button.outsideViewport).toEqual({ x: false, y: false });
            expect(button.outsideHeader).toEqual({ x: false, y: false });
            expect(button.outsideActions).toEqual({ x: false, y: false });
            expect(button.clippingAncestors).toEqual([]);
            expect(button.fontSize).toBe(index === 2 ? '20px' : '0px');
            if (index < 2) {
              // Generated text has no DOM Range; retain full ARIA and inspect its computed line box.
              expect(button.text).toBe(labels[index]);
              expect(button.pseudo.content).toBe(contents[index]);
              expect(button.pseudo.fontSize).toBe(textScale === 'large' ? '14px' : '9px');
              expect(button.pseudo.display).not.toBe('none');
              expect(button.pseudo.visibility).toBe('visible');
              const lineHeight = Number.parseFloat(button.pseudo.lineHeight);
              expect(Number.isFinite(lineHeight)).toBe(true);
              expect(lineHeight).toBeGreaterThan(0);
              expect(lineHeight).toBeLessThanOrEqual(button.clientHeight);
            } else expect(button.text).toBe('×');
          }
          // Keep the frame open through all assertions; failure evidence is captured before finally closes it.
          await closeCommonHeaderSession(page, workspace, true);
          expect(await readStorage()).toEqual(baseline);
          await expect(page.locator('.stage-result')).toHaveCount(0);
          completed.push(game.id);
          activeGame = null;
        }
        expect(completed).toEqual(games.map((game) => game.id));
      } catch (error) {
        failed = true;
        console.log('COMMON_HEADER_FAILURE', JSON.stringify({ project: testInfo.project.name, viewport, textScale, activeGame, error: String(error) }));
        await page.content().then((body) => testInfo.attach('common-header-first-failure.html', { body, contentType: 'text/html' }))
          .catch((captureError) => console.log('COMMON_HEADER_DOM_CAPTURE_ERROR', String(captureError)));
        await page.screenshot({ path: testInfo.outputPath('common-header-first-failure.png') })
          .catch((captureError) => console.log('COMMON_HEADER_CAPTURE_ERROR', String(captureError)));
        throw error;
      } finally {
        console.log('COMMON_HEADER_ERRORS', JSON.stringify({ project: testInfo.project.name, viewport, textScale, activeGame, errors }));
        try {
          if (activeGame) {
            const workspace = page.locator('.game-workspace.game-' + activeGame);
            if (await workspace.count()) await closeCommonHeaderSession(page, workspace, false);
          }
        } catch (closeError) {
          if (!failed) throw closeError;
          console.log('COMMON_HEADER_CLOSE_ERROR', String(closeError));
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

async function captureNumberRpsFirstBoard(firstFrame: Locator, gameId: 'number' | 'rps') {
  return firstFrame.evaluate((frame, id) => {
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height });
    type Bounds = ReturnType<typeof box>;
    const outside = (rect: Bounds, boundary: Pick<Bounds, 'left' | 'right' | 'top' | 'bottom'>) => ({
      x: rect.left < boundary.left - 1 || rect.right > boundary.right + 1,
      y: rect.top < boundary.top - 1 || rect.bottom > boundary.bottom + 1,
    });
    const body = frame.querySelector<HTMLElement>('.workspace-body')!;
    const bodyBox = box(body.getBoundingClientRect());
    const viewport = { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: innerHeight };
    const geometry = (element: HTMLElement, withText: boolean) => {
      const bounds = box(element.getBoundingClientRect()), style = getComputedStyle(element);
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRects = withText ? [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map(box) : [];
      type Clip = { tag: string; className: string; overflowX: string; overflowY: string; clipBox: Bounds;
        clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number; scrollLeft: number; scrollTop: number;
        elementOutside: { x: boolean; y: boolean }; textOutside: { x: boolean; y: boolean } };
      const clippingAncestors: Clip[] = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowX);
        const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowY);
        if (!clipsX && !clipsY) continue;
        const rect = ancestor.getBoundingClientRect();
        const clipBox = { left: rect.left + ancestor.clientLeft, right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
          top: rect.top + ancestor.clientTop, bottom: rect.top + ancestor.clientTop + ancestor.clientHeight,
          width: ancestor.clientWidth, height: ancestor.clientHeight };
        const elementAxes = outside(bounds, clipBox), textAxes = textRects.map((text) => outside(text, clipBox));
        clippingAncestors.push({ tag: ancestor.tagName, className: ancestor.className, overflowX: css.overflowX, overflowY: css.overflowY, clipBox,
          clientWidth: ancestor.clientWidth, clientHeight: ancestor.clientHeight, scrollWidth: ancestor.scrollWidth, scrollHeight: ancestor.scrollHeight,
          scrollLeft: ancestor.scrollLeft, scrollTop: ancestor.scrollTop,
          elementOutside: { x: clipsX && elementAxes.x, y: clipsY && elementAxes.y },
          textOutside: { x: clipsX && textAxes.some((axes) => axes.x), y: clipsY && textAxes.some((axes) => axes.y) } });
      }
      const button = element.closest('button');
      const buttonBox = button ? box(button.getBoundingClientRect()) : null;
      const hit = document.elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
      return { tag: element.tagName, className: element.className, text: element.textContent?.trim() ?? '', box: bounds,
        font: style.font, lineHeight: style.lineHeight, display: style.display, visibility: style.visibility,
        clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
        textRects, textOutsideSelf: textRects.some((text) => { const axes = outside(text, bounds); return axes.x || axes.y; }),
        textOutsideButton: buttonBox ? textRects.some((text) => { const axes = outside(text, buttonBox); return axes.x || axes.y; }) : false,
        outsideBody: outside(bounds, bodyBox), outsideViewport: outside(bounds, viewport), clippingAncestors,
        centerHit: Boolean(hit && (hit === element || element.contains(hit))), focused: document.activeElement === element };
    };
    const board = frame.querySelector<HTMLElement>(id === 'number' ? '.number-board-pro' : '.rps-board')!;
    const buttons = [...frame.querySelectorAll<HTMLButtonElement>(id === 'number' ? '.number-board-pro > button' : '.rps-actions > button')];
    const responseButtons = buttons.map((button) => ({ ...geometry(button, id === 'number'), disabled: button.disabled,
      label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current'), target: button.classList.contains('target'),
      labels: (id === 'number' ? [button] : [...button.querySelectorAll<HTMLElement>(':scope > span, :scope > b')])
        .map((label) => geometry(label, true)) }));
    const labelSelector = id === 'number'
      ? '.number-round-banner > span, .number-round-banner > b, .number-round-banner > em, .number-rule > span, .number-rule > em'
      : '.round-label > span, .round-label > b, .rps-board article > span, .rps-board > div > b, .rps-question';
    // The RPS relationship subtitle is intentionally display:none at these widths; real board names and choice labels remain required.
    const labels = [...frame.querySelectorAll<HTMLElement>(labelSelector)].map((label) => geometry(label, true));
    const deadline = frame.querySelector<HTMLElement>('.time-strip')!;
    const progress = frame.querySelector<HTMLElement>('.workspace-progress > i[role="progressbar"]')!;
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const active = document.activeElement;
    return { capturedAt: new Date().toISOString(), gameId: id, mode: frame.getAttribute('data-mode'), preparationCount: frame.querySelectorAll('.game-preparation').length,
      resultCount: document.querySelectorAll('.stage-result').length, guidedCount: frame.querySelectorAll('.guided-pacing-note').length,
      progress: { current: progress.getAttribute('aria-valuenow'), total: progress.getAttribute('aria-valuemax'),
        text: frame.querySelector('.workspace-progress span')?.textContent ?? null },
      number: { banner: frame.querySelector('.number-round-banner')?.getAttribute('aria-label') ?? null,
        round: frame.querySelector('.number-round-banner > span')?.textContent ?? null, counter: frame.querySelector('.number-rule > em')?.textContent ?? null },
      rps: { round: frame.querySelector('.round-label > span')?.textContent ?? null, phase: frame.querySelector('.round-label > b')?.textContent ?? null,
        questions: frame.querySelectorAll('.rps-question').length,
        images: [...board.querySelectorAll<HTMLImageElement>('img')].map((image) => ({ ...geometry(image, false),
          alt: image.alt, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })) },
      deadline: { ...geometry(deadline, false), duration: deadline.getAttribute('aria-valuemax'), remaining: deadline.getAttribute('aria-valuenow'),
        active: deadline.getAttribute('data-deadline-active'), label: deadline.getAttribute('aria-label'),
        visibleText: geometry(deadline.querySelector<HTMLElement>('.deadline-text')!, true) },
      feedback: frame.querySelector('.workspace-foot > b')?.textContent ?? null,
      live: [...frame.querySelectorAll('[aria-live]')].map((node) => node.textContent),
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, scrollX, scrollY },
      body: { box: bodyBox, clientWidth: body.clientWidth, clientHeight: body.clientHeight, scrollWidth: body.scrollWidth,
        scrollHeight: body.scrollHeight, scrollLeft: body.scrollLeft, scrollTop: body.scrollTop },
      board: geometry(board, false), responseButtons, labels,
      focus: { tag: active?.tagName ?? null, className: active?.getAttribute('class') ?? null, label: active?.getAttribute('aria-label') ?? null,
        text: active?.textContent?.trim().slice(0, 100) ?? null },
      textScale: document.documentElement.dataset.textScale, fonts: document.fonts.status, mediaCount: document.querySelectorAll('audio,video').length,
      storage: { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null } };
  }, gameId);
}

for (const game of [{ id: 'number', title: '숫자 누르기', quantity: '10', pace: '20초', total: '5', duration: '20000', responses: 9 },
  { id: 'rps', title: '가위바위보', quantity: '15', pace: '4.5초', total: '15', duration: '4500', responses: 3 }] as const) {
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }] as const) {
    for (const textScale of ['standard', 'large'] as const) {
      test(game.title + ': ' + viewport.width + '×' + viewport.height + ' ' + textScale + ' 글자에서 첫 실제 보드와 응답 이름표를 자르지 않는다', async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.setViewportSize(viewport);
        const readStorage = () => page.evaluate(() => {
          const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
          return { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null };
        });
        const panel = page.locator('.stage-panel[data-game="' + game.id + '"]');
        // Closing must not depend on progress=1: the unchanged RPS timer may advance while the first PNG is written.
        const workspace = panel.locator('.game-workspace.game-' + game.id);
        let failed = false, closedNormally = false;
        try {
          await page.goto('/');
          await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
          await page.getByRole('navigation', { name: '빠른 메뉴', exact: true }).getByRole('button', { name: '준비', exact: true }).click();
          const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
          await readiness.getByRole('button', { name: textScale === 'large' ? '큰 글자' : '기본 크기', exact: true }).click();
          await readiness.getByRole('button', { name: '설정 저장하고 닫기', exact: true }).click();
          await expect(readiness).toHaveCount(0);
          await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
          await page.evaluate(() => document.fonts.ready);
          await page.getByRole('button', { name: game.title + ', 난이도 하, 설정 열기', exact: true }).click();
          await expect(panel).toBeVisible();
          await panel.getByRole('radio', { name: /연습 모드/ }).click();
          await expect(panel.locator('output[aria-label="문제 수 현재 값"]')).toHaveText(game.quantity);
          await expect(panel.locator('output[aria-label="문제 제한 현재 값"]')).toHaveText(game.pace);
          const pacing = panel.locator('label.accessible-pacing-setting');
          if (await pacing.locator('input[type="checkbox"]').isChecked()) await pacing.click();
          await expect(pacing.locator('input[type="checkbox"]')).not.toBeChecked();
          const baseline = await readStorage();
          expect(baseline.generation).not.toBeNull();
          expect(baseline.resultsRaw).not.toBeNull();
          expect(JSON.parse(baseline.resultsRaw!).results).toEqual([]);
          await panel.locator('.stage-start-practice').click();
          const boardSelector = game.id === 'number' ? '.number-board-pro' : '.rps-board';
          const firstFrame = panel.locator('.game-workspace.game-' + game.id + '[data-mode="practice"]:has(.workspace-progress > i[role="progressbar"][aria-valuenow="1"][aria-valuemax="' + game.total + '"]):has(' + boardSelector + ')');
          // Exactly one synchronous first-board read; natural preparation and the default deadline are not replaced.
          const raw = await captureNumberRpsFirstBoard(firstFrame, game.id);
          await testInfo.attach('number-rps-first-board.json', { body: JSON.stringify({ project: testInfo.project.name, requestedViewport: viewport, requestedTextScale: textScale, errorsAtCapture: [...errors], ...raw }, null, 2), contentType: 'application/json' });
          console.log('NUMBER_RPS_FIRST_BOARD', JSON.stringify({ project: testInfo.project.name, gameId: game.id, viewport, textScale,
            capturedAt: raw.capturedAt, progress: raw.progress, number: raw.number, rps: { round: raw.rps.round, phase: raw.rps.phase },
            deadline: { active: raw.deadline.active, remaining: raw.deadline.remaining, duration: raw.deadline.duration },
            body: raw.body, generation: raw.storage.generation, nativeGameAnswers: 0 }));
          expect(raw.progress).toMatchObject({ current: '1', total: game.total });
          expect(raw.preparationCount).toBe(0);
          expect(raw.responseButtons).toHaveLength(game.responses);
          expect(raw.responseButtons.every((button) => !button.disabled)).toBe(true);
          expect(raw.deadline.active).toBe('true');
          expect(raw.deadline.duration).toBe(game.duration);
          expect(Number(raw.deadline.remaining)).toBeGreaterThan(0);
          if (game.id === 'number') {
            expect(raw.number.round).toBe('ROUND 1 / 2');
            expect(raw.number.counter).toBe('입력 0 / 1');
            expect(raw.responseButtons.filter((button) => button.target)).toHaveLength(1);
            expect(raw.responseButtons.filter((button) => button.current === 'step')).toHaveLength(1);
          } else {
            expect(raw.rps.round).toBe('라운드 1 / 3');
            expect(raw.rps.phase).toBe('내 패 찾기');
            expect(raw.rps.questions).toBe(1);
            expect(raw.rps.images).toHaveLength(1);
            expect(raw.rps.images[0].complete).toBe(true);
            expect(raw.rps.images[0].naturalWidth).toBeGreaterThan(0);
          }
          await page.screenshot({ path: testInfo.outputPath('number-rps-first-board.png') });
          const afterPNG = await workspace.evaluate((frame) => ({ capturedAt: new Date().toISOString(),
            progress: frame.querySelector('.workspace-progress > i[role="progressbar"]')?.getAttribute('aria-valuenow'),
            total: frame.querySelector('.workspace-progress > i[role="progressbar"]')?.getAttribute('aria-valuemax'),
            numberRound: frame.querySelector('.number-round-banner')?.getAttribute('aria-label') ?? null,
            rpsRound: frame.querySelector('.round-label > span')?.textContent ?? null,
            rpsPhase: frame.querySelector('.round-label > b')?.textContent ?? null,
            deadlineActive: frame.querySelector('.time-strip')?.getAttribute('data-deadline-active') ?? null,
            numberCounter: frame.querySelector('.number-rule > em')?.textContent ?? null,
            feedback: frame.querySelector('.workspace-foot > b')?.textContent ?? null,
            disabled: [...frame.querySelectorAll<HTMLButtonElement>('.number-board-pro > button, .rps-actions > button')].map((button) => button.disabled) }));
          await testInfo.attach('number-rps-after-first-png.json', { body: JSON.stringify(afterPNG), contentType: 'application/json' });
          console.log('NUMBER_RPS_FIRST_PNG_PROVENANCE', JSON.stringify({ project: testInfo.project.name, gameId: game.id, viewport, textScale,
            first: { capturedAt: raw.capturedAt, progress: raw.progress, number: raw.number, rpsRound: raw.rps.round, rpsPhase: raw.rps.phase },
            afterPNG, sameActiveFirstBoardAfterPNG: afterPNG.progress === '1' && afterPNG.total === game.total && afterPNG.deadlineActive === 'true'
              && afterPNG.numberCounter === raw.number.counter && afterPNG.rpsRound === raw.rps.round && afterPNG.rpsPhase === raw.rps.phase
              && afterPNG.disabled.length === game.responses && afterPNG.disabled.every((disabled) => !disabled) }));
          await closeCommonHeaderSession(page, workspace, false);
          closedNormally = true;
          expect(await readStorage()).toEqual(baseline);
          await expect(page.locator('.stage-result')).toHaveCount(0);
          expect(raw.storage).toEqual(baseline);
          expect(raw.mode).toBe('practice');
          expect(raw.resultCount).toBe(0);
          expect(raw.guidedCount).toBe(0);
          expect(raw.textScale).toBe(textScale);
          expect(raw.fonts).toBe('loaded');
          expect(raw.mediaCount).toBe(0);
          expect(raw.viewport).toMatchObject(viewport);
          expect(raw.viewport.documentWidth).toBeLessThanOrEqual(raw.viewport.clientWidth + 1);
          expect(raw.viewport.bodyWidth).toBeLessThanOrEqual(raw.viewport.clientWidth + 1);
          expect(raw.body.scrollLeft).toBe(0);
          expect(raw.feedback?.trim() ?? '').toBe('');
          const elements = [raw.board, raw.deadline, raw.deadline.visibleText, ...raw.labels, ...raw.responseButtons,
            ...raw.responseButtons.flatMap((button) => button.labels), ...raw.rps.images];
          for (const element of elements) {
            expect(element.box.width, element.text).toBeGreaterThan(0);
            expect(element.box.height, element.text).toBeGreaterThan(0);
            expect(element.display, element.text).not.toBe('none');
            expect(element.visibility, element.text).toBe('visible');
            expect(element.outsideBody, element.text).toEqual({ x: false, y: false });
            expect(element.outsideViewport, element.text).toEqual({ x: false, y: false });
            expect(element.clippingAncestors.filter((clip) => clip.elementOutside.x || clip.elementOutside.y || clip.textOutside.x || clip.textOutside.y), element.text).toEqual([]);
          }
          for (const label of [raw.deadline.visibleText, ...raw.labels, ...raw.responseButtons.flatMap((button) => button.labels)]) {
            expect(label.text.length).toBeGreaterThan(0);
            expect(label.textRects.length, label.text).toBeGreaterThan(0);
            expect(label.textOutsideSelf, label.text).toBe(false);
            expect(label.textOutsideButton, label.text).toBe(false);
          }
          for (const button of raw.responseButtons) {
            expect(button.box.width).toBeGreaterThanOrEqual(44);
            expect(button.box.height).toBeGreaterThanOrEqual(44);
            expect(button.centerHit, button.text).toBe(true);
            expect(button.labels).toHaveLength(game.id === 'number' ? 1 : 2);
          }
          if (game.id === 'number') {
            expect(raw.responseButtons.map((button) => Number(button.text)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
            const target = raw.responseButtons.find((button) => button.target)!;
            expect(target.current).toBe('step');
            expect(target.label).toBe(target.text + ', 현재 목표');
            expect(raw.number.banner).toBe('1라운드 점등 숫자, 5문제 중 1번째');
          } else {
            expect(raw.responseButtons.map((button) => button.labels.map((label) => label.text))).toEqual([['←', '가위'], ['↓', '바위'], ['→', '보']]);
            expect(['가위', '바위', '보']).toContain(raw.rps.images[0].alt);
          }
        } catch (error) {
          failed = true;
          console.log('NUMBER_RPS_FIRST_BOARD_FAILURE', JSON.stringify({ project: testInfo.project.name, gameId: game.id, viewport, textScale, closedNormally, error: String(error) }));
          // Geometry checks use the preserved first raw after closing; this failure PNG can be HOME, unlike the first-board PNG.
          await page.content().then((body) => testInfo.attach('number-rps-first-failure.html', { body, contentType: 'text/html' }))
            .catch((captureError) => console.log('NUMBER_RPS_DOM_CAPTURE_ERROR', String(captureError)));
          await page.screenshot({ path: testInfo.outputPath('number-rps-first-failure.png') })
            .catch((captureError) => console.log('NUMBER_RPS_CAPTURE_ERROR', String(captureError)));
          throw error;
        } finally {
          console.log('NUMBER_RPS_FIRST_BOARD_ERRORS', JSON.stringify({ project: testInfo.project.name, gameId: game.id, viewport, textScale, errors }));
          try {
            if (!closedNormally && await workspace.count()) await closeCommonHeaderSession(page, workspace, false);
          } catch (closeError) {
            if (!failed) throw closeError;
            console.log('NUMBER_RPS_CLOSE_ERROR', String(closeError));
          }
        }
        expect(errors).toEqual([]);
      });
    }
  }
}

async function capturePathInitialVisibility(page: Page, testInfo: TestInfo, phase: string) {
  const raw = await page.locator('.game-workspace.game-path').evaluate((frame) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const outside = (rect: ReturnType<typeof box>, clip: { left: number; right: number; top: number; bottom: number }) => ({
      x: rect.left < clip.left - 1 || rect.right > clip.right + 1,
      y: rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1,
    });
    const body = frame.querySelector<HTMLElement>('.workspace-body')!;
    const shell = body.querySelector<HTMLElement>('.path-shell')!;
    const grid = shell.querySelector<HTMLElement>('.path-grid')!;
    const panel = frame.closest<HTMLElement>('.stage-panel')!;
    const backdrop = panel.closest<HTMLElement>('.stage-backdrop')!;
    const bodyBox = box(body), shellBox = box(shell), gridBox = box(grid);
    const port = { left: bodyBox.left + body.clientLeft, right: bodyBox.left + body.clientLeft + body.clientWidth,
      top: bodyBox.top + body.clientTop, bottom: bodyBox.top + body.clientTop + body.clientHeight };
    const viewport = { left: 0, right: document.documentElement.clientWidth, top: 0, bottom: innerHeight };
    const visiblePort = { left: Math.max(port.left, viewport.left), right: Math.min(port.right, viewport.right),
      top: Math.max(port.top, viewport.top), bottom: Math.min(port.bottom, viewport.bottom) };
    for (let ancestor = body.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
        visiblePort.left = Math.max(visiblePort.left, bounds.left + ancestor.clientLeft);
        visiblePort.right = Math.min(visiblePort.right, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
      }
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
        visiblePort.top = Math.max(visiblePort.top, bounds.top + ancestor.clientTop);
        visiblePort.bottom = Math.min(visiblePort.bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
      }
      // The fixed backdrop uses the viewport, not the locked background body's shifted box.
      if (ancestor === backdrop) break;
    }
    const deadline = frame.querySelector<HTMLElement>('.workspace-body > .time-strip');
    const deadlineStyle = deadline ? getComputedStyle(deadline) : null;
    const deadlineState = deadline && deadlineStyle ? { box: box(deadline), position: deadlineStyle.position, top: deadlineStyle.top,
      marginBottom: deadlineStyle.marginBottom, display: deadlineStyle.display, visibility: deadlineStyle.visibility } : null;
    const usablePort = { ...visiblePort };
    if (deadlineState?.position === 'sticky' && deadlineState.box.height > 0 && deadlineState.box.top < visiblePort.bottom &&
      deadlineState.box.bottom > visiblePort.top) {
      usablePort.top = Math.max(usablePort.top, deadlineState.box.bottom + Math.max(0, Number.parseFloat(deadlineState.marginBottom) || 0));
    }
    const inspect = (element: HTMLElement) => {
      const bounds = box(element), style = getComputedStyle(element);
      const hit = document.elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
      return { box: bounds, outsideUsablePort: outside(bounds, usablePort), outsideViewport: outside(bounds, viewport),
        centerHit: Boolean(hit && (element === hit || element.contains(hit))),
        hit: hit ? { tag: hit.tagName, className: hit.className } : null,
        fontSize: style.fontSize, display: style.display, visibility: style.visibility };
    };
    const cells = [...grid.querySelectorAll<HTMLElement>('.path-cell')].map((cell, index) => {
      const cellBox = box(cell);
      const controls = [...cell.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.getClientRects().length && getComputedStyle(button).display !== 'none').map((button) => {
        const geometry = inspect(button), range = document.createRange();
        range.selectNodeContents(button);
        const textRects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }));
        const clippingAncestors = [];
        for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
          const axes = outside(geometry.box, { left: bounds.left + ancestor.clientLeft, right: bounds.left + ancestor.clientLeft + ancestor.clientWidth,
            top: bounds.top + ancestor.clientTop, bottom: bounds.top + ancestor.clientTop + ancestor.clientHeight });
          const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowX);
          const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(css.overflowY);
          if ((clipsX && axes.x) || (clipsY && axes.y)) clippingAncestors.push({ className: ancestor.className,
            beforeBody: ancestor !== body && body.contains(ancestor), axes,
            clipsX, clipsY, overflowX: css.overflowX, overflowY: css.overflowY, box: box(ancestor),
            clientWidth: ancestor.clientWidth, clientHeight: ancestor.clientHeight, scrollTop: ancestor.scrollTop, scrollHeight: ancestor.scrollHeight });
          if (ancestor === backdrop) break;
        }
        return { ...geometry, label: button.getAttribute('aria-label'), cycleCell: button.getAttribute('data-cycle-cell'), focused: document.activeElement === button,
          outsideCell: outside(geometry.box, cellBox), outsideGrid: outside(geometry.box, gridBox), textRects,
          textOutsideButton: textRects.filter((rect) => { const axes = outside(rect, geometry.box); return axes.x || axes.y; }), clippingAncestors };
      });
      return { index, fence: cell.getAttribute('data-fence'), box: cellBox, outsideGrid: outside(cellBox, gridBox), controls };
    });
    const markers = [...shell.querySelectorAll<HTMLElement>('.edge-marker > span')].map((marker) => ({
      ...inspect(marker), text: marker.textContent, parts: [marker, ...marker.querySelectorAll<HTMLElement>('*')].map((part) => ({
        box: box(part), outsideUsablePort: outside(box(part), usablePort), outsideViewport: outside(box(part), viewport),
      })),
    }));
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { capturedAt: new Date().toISOString(), scope: 'Path initial visibility in the sticky-deadline-excluded usable area and native recovery; not simultaneous fit of every control or resize recovery.',
      viewport: { width: innerWidth, height: innerHeight }, textScale: document.documentElement.dataset.textScale, fonts: document.fonts.status,
      preparation: Boolean(frame.querySelector('.game-preparation')), progress: frame.querySelector('.workspace-progress span')?.textContent,
      actions: frame.querySelector('.path-toolbar > span b')?.textContent, cells, markers, shell: shellBox, grid: gridBox,
      shellOutsideUsablePort: outside(shellBox, usablePort), body: { box: bodyBox, port, visiblePort, usablePort, clientWidth: body.clientWidth, clientHeight: body.clientHeight,
        scrollTop: body.scrollTop, scrollLeft: body.scrollLeft, scrollHeight: body.scrollHeight },
      fits: shellBox.width <= usablePort.right - usablePort.left + 1 && shellBox.height <= usablePort.bottom - usablePort.top + 1,
      deadline: deadlineState,
      active: active ? { label: active.getAttribute('aria-label') ?? active.textContent?.trim(), cycleCell: active.getAttribute('data-cycle-cell'), ...inspect(active) } : null,
      external: { windowX: scrollX, windowY: scrollY, rootTop: document.documentElement.scrollTop, rootLeft: document.documentElement.scrollLeft,
        panelTop: panel.scrollTop, panelLeft: panel.scrollLeft, backdropTop: backdrop.scrollTop, backdropLeft: backdrop.scrollLeft,
        frameTop: (frame as HTMLElement).scrollTop, frameLeft: (frame as HTMLElement).scrollLeft, fixedTop: document.body.style.top, fixedLeft: document.body.style.left },
      storage: { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null } };
  });
  await testInfo.attach('path-initial-' + phase, { body: JSON.stringify(raw), contentType: 'application/json' });
  console.log('PATH_INITIAL_VISIBILITY', JSON.stringify({ project: testInfo.project.name, phase, viewport: raw.viewport, textScale: raw.textScale,
    progress: raw.progress, actions: raw.actions, fits: raw.fits, shell: raw.shell, body: raw.body, deadline: raw.deadline, active: raw.active,
    external: raw.external, cells: raw.cells.length, ownIssues: raw.cells.flatMap((cell) => cell.controls.filter((control) =>
      control.box.width < 44 || control.box.height < 44 || control.outsideCell.x || control.outsideCell.y || control.outsideGrid.x || control.outsideGrid.y ||
      control.textOutsideButton.length || control.clippingAncestors.some((ancestor) => ancestor.clipsX && ancestor.axes.x) ||
      control.clippingAncestors.some((ancestor) => ancestor.beforeBody && ['hidden', 'clip'].includes(ancestor.overflowY) && ancestor.axes.y)).map((control) => ({ index: cell.index, box: control.box,
        cell: control.outsideCell, grid: control.outsideGrid, text: control.textOutsideButton.length, clipping: control.clippingAncestors }))),
    firstRow: raw.cells.slice(0, 5).map((cell) => cell.controls.map((control) => ({ visible: control.outsideUsablePort, hit: control.centerHit }))),
    lastRow: raw.cells.slice(-5).map((cell) => cell.controls.map((control) => ({ visible: control.outsideUsablePort, hit: control.centerHit }))),
    generation: raw.storage.generation, resultsCount: raw.storage.resultsRaw ? JSON.parse(raw.storage.resultsRaw).results.length : null }));
  return raw;
}

for (const viewport of [{ width: 320, height: 568 }, { width: 385, height: 640 }, { width: 568, height: 320 }, { width: 844, height: 360 }] as const) {
  for (const textScale of ['standard', 'large'] as const) {
    test('길 만들기 첫 퍼즐: ' + viewport.width + '×' + viewport.height + ' ' + textScale + ' 글자에서 격자·키보드·본문 스크롤을 유지한다', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.setViewportSize(viewport);
      const readStorage = () => page.evaluate(() => {
        const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
        return { generation, resultsRaw: generation ? localStorage.getItem('nineflow-practice-results-v4:' + generation) : null };
      });
      let failed = false;
      try {
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        const opener = page.getByRole('button', { name: '길 만들기, 난이도 상, 설정 열기', exact: true });
        // Establish the actual home position after the native card has been brought into view.
        await opener.scrollIntoViewIfNeeded();
        const home = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        await opener.click();
        const panel = page.locator('.stage-panel[data-game="path"]');
        await panel.getByRole('button', { name: '응시 준비센터 열기', exact: true }).click();
        const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
        await readiness.getByRole('button', { name: textScale === 'large' ? '큰 글자' : '기본 크기', exact: true }).click();
        await readiness.getByRole('button', { name: '설정 저장하고 닫기', exact: true }).click();
        await expect(readiness).toHaveCount(0);
        await expect(page.locator('html')).toHaveAttribute('data-text-scale', textScale);
        await page.evaluate(() => document.fonts.ready);
        await panel.getByRole('radio', { name: /연습 모드/ }).click();
        const settings = panel.getByRole('region', { name: '연습 세션 설정', exact: true });
        await panel.getByRole('button', { name: /내 연습 설정 바로가기/ }).click();
        await settings.getByRole('button', { name: '기본값', exact: true }).click();
        await expect(settings.getByLabel('문제 수 현재 값', { exact: true })).toHaveText('3');
        await expect(settings.getByLabel('문제 제한 현재 값', { exact: true })).toHaveText('60초');
        await expect(settings.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).not.toBeChecked();
        const baseline = await readStorage();
        expect(baseline.generation).not.toBeNull();
        expect(baseline.resultsRaw).not.toBeNull();
        expect(JSON.parse(baseline.resultsRaw!).results).toEqual([]);
        await panel.locator('.stage-start-practice').click();
        const workspace = panel.locator('.game-workspace.game-path');
        await expect(workspace.locator('.path-grid')).toBeVisible();
        // First play geometry is recorded before focus waits, hover, wheel or any test scroll.
        const initial = await capturePathInitialVisibility(page, testInfo, 'initial');
        await page.screenshot({ path: testInfo.outputPath('path-initial-raw-before-assert.png') });
        const check = (raw: typeof initial) => {
          expect(raw.viewport).toEqual(viewport);
          expect(raw.textScale).toBe(textScale);
          expect(raw.fonts).toBe('loaded');
          expect(raw.preparation).toBe(false);
          expect(raw.progress).toMatch(/^1 \/ 3/);
          expect(raw.actions).toBe('0');
          expect(raw.cells).toHaveLength(25);
          expect(raw.cells.map((cell) => cell.fence)).toEqual(Array(25).fill('empty'));
          expect(raw.storage).toEqual(baseline);
          expect(raw.external).toEqual(initial.external);
          for (const cell of raw.cells) {
            expect(cell.outsideGrid).toEqual({ x: false, y: false });
            expect(cell.controls).toHaveLength(1);
            for (const control of cell.controls) {
              expect(control.box.width).toBeGreaterThanOrEqual(44);
              expect(control.box.height).toBeGreaterThanOrEqual(44);
              expect(control.outsideCell).toEqual({ x: false, y: false });
              expect(control.outsideGrid).toEqual({ x: false, y: false });
              expect(control.textRects.length).toBeGreaterThan(0);
              expect(control.textOutsideButton).toEqual([]);
              expect(control.clippingAncestors.filter((ancestor) => ancestor.clipsX && ancestor.axes.x)).toEqual([]);
              expect(control.clippingAncestors.filter((ancestor) => ancestor.beforeBody && ['hidden', 'clip'].includes(ancestor.overflowY) && ancestor.axes.y)).toEqual([]);
              expect(control.outsideViewport.x).toBe(false);
            }
          }
        };
        const rowVisible = (raw: typeof initial, start: number) => {
          for (const cell of raw.cells.slice(start, start + 5)) for (const control of cell.controls) {
            expect(control.outsideUsablePort).toEqual({ x: false, y: false });
            expect(control.outsideViewport).toEqual({ x: false, y: false });
            expect(control.centerHit, '제한시간 막대 등 겹침으로 실제 칸 중앙이 가려지지 않는다').toBe(true);
            if (raw.deadline?.position === 'sticky') expect(control.box.top).toBeGreaterThanOrEqual(raw.body.usablePort.top - 1);
          }
        };
        // Local cell/grid clipping and 44px are always checked; oversized rows may require native body scrolling.
        check(initial);
        rowVisible(initial, 0);
        if (initial.fits) {
          expect(initial.shellOutsideUsablePort).toEqual({ x: false, y: false });
          for (const marker of initial.markers) for (const part of marker.parts) {
            expect(part.outsideUsablePort).toEqual({ x: false, y: false });
            expect(part.outsideViewport).toEqual({ x: false, y: false });
          }
          for (let row = 0; row < 25; row += 5) rowVisible(initial, row);
        }
        const first = workspace.locator('.path-fence-cycle[data-cycle-cell="0"]');
        await expect(first).toBeFocused();
        if (!initial.fits) {
          const body = workspace.locator('.workspace-body');
          await body.hover();
          await page.mouse.wheel(0, Math.ceil(initial.body.scrollHeight + initial.body.clientHeight));
          await expect(workspace.locator('.path-fence-cycle[data-cycle-cell="24"]')).toBeInViewport({ ratio: 1 });
          const last = await capturePathInitialVisibility(page, testInfo, 'native-wheel-last-row');
          check(last);
          expect(last.body.scrollTop).toBeGreaterThan(initial.body.scrollTop);
          rowVisible(last, 20);
          await page.screenshot({ path: testInfo.outputPath('path-native-wheel-last-row.png') });
          await page.keyboard.press('Control+End');
          await expect(workspace.locator('.path-fence-cycle[data-cycle-cell="24"]')).toBeFocused();
          await page.keyboard.press('Control+Home');
          await expect(first).toBeFocused();
          await expect(first).toBeInViewport({ ratio: 1 });
          const restored = await capturePathInitialVisibility(page, testInfo, 'native-home-first-row');
          check(restored);
          rowVisible(restored, 0);
        }
        for (const [key, name] of [['Shift+Tab', '경로 확인'], ['Shift+Tab', '전체 초기화'], ['Tab', '경로 확인']] as const) {
          await page.keyboard.press(key);
          await expect(workspace.getByRole('button', { name, exact: true })).toBeFocused();
          const focused = await capturePathInitialVisibility(page, testInfo, key + '-' + name);
          check(focused);
          expect(focused.active?.label).toBe(name);
          expect(focused.active?.outsideUsablePort).toEqual({ x: false, y: false });
          expect(focused.active?.outsideViewport).toEqual({ x: false, y: false });
          expect(focused.active?.centerHit).toBe(true);
        }
        await page.keyboard.press('Tab');
        await expect(first).toBeFocused();
        const returned = await capturePathInitialVisibility(page, testInfo, 'native-tab-grid-return');
        check(returned);
        rowVisible(returned, 0);
        await closeCommonHeaderSession(page, workspace, true);
        expect(await readStorage()).toEqual(baseline);
        await expect(page.locator('.stage-result')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(home);
        await testInfo.attach('path-initial-closed', { body: JSON.stringify({ viewport, textScale, home, storage: await readStorage(), errors }), contentType: 'application/json' });
      } catch (error) {
        failed = true;
        console.log('PATH_INITIAL_FAILURE', JSON.stringify({ project: testInfo.project.name, viewport, textScale, error: String(error) }));
        await page.content().then((body) => testInfo.attach('path-initial-first-failure-dom', { body, contentType: 'text/html' }))
          .catch((captureError) => console.log('PATH_INITIAL_DOM_CAPTURE_ERROR', String(captureError)));
        await page.screenshot({ path: testInfo.outputPath('path-initial-first-failure.png') })
          .catch((captureError) => console.log('PATH_INITIAL_CAPTURE_ERROR', String(captureError)));
        throw error;
      } finally {
        console.log('PATH_INITIAL_ERRORS', JSON.stringify({ project: testInfo.project.name, viewport, textScale, errors }));
        try {
          const workspace = page.locator('.game-workspace.game-path');
          if (await workspace.count()) await closeCommonHeaderSession(page, workspace, false);
        } catch (closeError) {
          if (!failed) throw closeError;
          console.log('PATH_INITIAL_CLOSE_ERROR', String(closeError));
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
