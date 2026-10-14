import { expect, test, type Page } from '@playwright/test';
import { games, type GameId, type SessionResult } from '../app/lib/game-data';

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

function progressRecord(gameId: GameId, day: number, accuracy: number, extra: Record<string, string | number> = {}): SessionResult {
  const specifics: Partial<Record<GameId, Record<string, string | number>>> = {
    rotation: { rotationContent: 'letters', rotationLetters: 'F', rotationTargetIds: 'turn90', previewUsed: '숨김' },
    appointment: { appointmentRounds: '1→2→3→4' },
    potion: { evidenceHint: '표시', scoringVersion: 'potion-evidence-v1', evidenceTrials: 10 },
    nback: { nbackTask: 'n2', nbackGroupSetting: 'auto', nbackProgression: 'fixed', nbackNameLabels: '숨김', nbackMnemonics: '숨김' },
  };
  return { id: `${gameId}-${day}-${accuracy}`, gameId, completedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`, accuracy, medianRt: 720, stability: 74, errors: 2, detail: { sessionMode: 'practice', quantity: 20, paceMs: 3000, practiceFocus: 'full', guidedPacing: '제한시간 없음', accessibilityProfile: 'standard|standard|system', ...specifics[gameId], ...extra } };
}

async function installProgressRecords(page: Page, results: SessionResult[]) {
  await page.addInitScript((saved) => {
    const generation = 'progress-regression';
    window.localStorage.setItem('nineflow-practice-results-generation-v1', generation);
    window.localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results: saved }));
  }, results);
}

async function progressStorage(page: Page) {
  return page.evaluate(() => ({ generation: window.localStorage.getItem('nineflow-practice-results-generation-v1'), raw: window.localStorage.getItem('nineflow-practice-results-v4:progress-regression') }));
}

test('9게임 동일 조건 점수 변화와 최근 이력을 키보드로 열어도 기록은 바뀌지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installProgressRecords(page, games.flatMap((game) => [progressRecord(game.id, 12, 80), progressRecord(game.id, 13, 90)]));
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const snapshot = await page.locator('.record-progress').evaluateAll((panels) => panels.map((panel) => ({ label: panel.getAttribute('aria-label'), heading: panel.querySelector('h3')?.textContent, rows: Array.from(panel.querySelectorAll('tbody tr'), (row) => row.textContent), summaryHeight: panel.querySelector('summary')!.getBoundingClientRect().height })));
  console.log('RECORD_PROGRESS_ALL_GAMES', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-all-games.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  expect(snapshot).toHaveLength(9);
  for (const [index, game] of games.entries()) {
    const panel = page.getByRole('region', { name: `${game.title} 같은 조건 기록 변화`, exact: true });
    await expect(panel.getByRole('heading')).toHaveText('직전 동일 조건 대비 +10%p');
    const summary = panel.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(summary).toBeFocused();
    await expect(panel.locator('details')).toHaveAttribute('open', '');
    await expect(panel.getByRole('table')).toBeVisible();
    await expect(panel.locator('tbody tr')).toHaveCount(2);
    await expect(panel.locator('tbody td:last-child')).toHaveText(['90%', '80%']);
    await expect(panel.locator('tbody tr').first()).toContainText('2026');
    await expect(panel).toContainText('실제 역량이나 JOBDA 점수의 변화를 뜻하지 않습니다.');
    expect(snapshot[index].summaryHeight).toBeGreaterThanOrEqual(44);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (index === 0) await panel.screenshot({ path: testInfo.outputPath('record-progress-open.png') });
    await page.keyboard.press('Space');
    await expect(panel.locator('details')).not.toHaveAttribute('open');
  }
  expect(await progressStorage(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('동일 조건 최근 5회에는 다른 게임·설정·모드·탭 이탈 기록이 섞이지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const differences: Record<string, string | number>[] = [{ quantity: 30 }, { paceMs: 4000 }, { practiceFocus: 'mixed' }, { guidedPacing: '설정 제한시간 적용' }, { accessibilityProfile: 'high|large|reduced' }, { sessionMode: 'simulation', simulationPresetVersion: 'public-rules-training-v4-2026-09' }, { visibilityPauses: 1 }];
  await installProgressRecords(page, [
    ...Array.from({ length: 7 }, (_, index) => progressRecord('rps', index + 1, (index + 1) * 10)),
    ...differences.map((detail, index) => ({ ...progressRecord('rps', 6, 99, detail), id: `excluded-${index}` })),
    progressRecord('number', 6, 99),
    { ...progressRecord('rps', 6, 99), id: 'legacy', detail: undefined },
  ]);
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const panel = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await panel.locator('summary').click();
  const snapshot = await panel.evaluate((element) => ({ heading: element.querySelector('h3')?.textContent, rows: Array.from(element.querySelectorAll('tbody tr'), (row) => row.textContent), scores: Array.from(element.querySelectorAll('tbody td:last-child'), (cell) => cell.textContent), text: element.textContent }));
  console.log('RECORD_PROGRESS_FILTERED', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-filtered.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  await expect(panel.getByRole('heading')).toHaveText('직전 동일 조건 대비 +10%p');
  expect(snapshot.scores).toEqual(['70%', '60%', '50%', '40%', '30%']);
  expect(snapshot.rows).toHaveLength(5);
  await expect(panel).not.toContainText('99%');
  await panel.screenshot({ path: testInfo.outputPath('record-progress-filtered.png') });
  expect(await progressStorage(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('이전 설정 없는 기록·단일 기록·마법약 근거 없는 기록은 점수 변화와 0점 최고를 만들지 않는다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await installProgressRecords(page, [
    { ...progressRecord('rps', 13, 80), detail: undefined },
    progressRecord('number', 13, 80),
    progressRecord('potion', 12, 0, { evidenceTrials: 0 }),
    progressRecord('potion', 13, 0, { evidenceTrials: 0 }),
  ]);
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const before = await progressStorage(page);
  const snapshot = await page.locator('.record-progress').evaluateAll((panels) => panels.map((panel) => ({ label: panel.getAttribute('aria-label'), text: panel.textContent })));
  console.log('RECORD_PROGRESS_PENDING', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-pending.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  const legacy = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await expect(legacy).toContainText('설정·날짜 정보가 부족하거나 탭 이탈이 있는 기록은 비교하지 않습니다.');
  await expect(legacy.locator('summary')).toHaveCount(0);
  const single = page.getByRole('region', { name: '숫자 누르기 같은 조건 기록 변화', exact: true });
  await expect(single).toContainText('동일 조건 기록을 한 번 더 완료하면 비교할 수 있습니다.');
  await expect(single.locator('summary')).toHaveCount(0);
  const potion = page.getByRole('region', { name: '마법약 만들기 같은 조건 기록 변화', exact: true });
  await expect(potion).toContainText('비교 가능한 점수가 없어 변화는 표시하지 않습니다.');
  await potion.locator('summary').click();
  await expect(potion.getByRole('columnheader', { name: '근거 정렬률', exact: true })).toBeVisible();
  await expect(potion.locator('tbody td:last-child')).toHaveText(['—', '—']);
  const potionCard = page.locator('.game-record-grid > article').filter({ has: potion });
  await expect(potionCard.locator('dl dd')).toHaveText(['—', '—', '2회']);
  await potionCard.screenshot({ path: testInfo.outputPath('record-progress-unscored.png') });
  expect(await progressStorage(page)).toEqual(before);
  expect(errors).toEqual([]);
});
