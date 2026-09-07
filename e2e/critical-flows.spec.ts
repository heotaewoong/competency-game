import { expect, test, type Page } from '@playwright/test';
import { REVIEW_SCHEMA_VERSION } from '../app/lib/review-data';

const RESULTS_KEY = 'nineflow-practice-results-v2';
const FUTURE_REVIEW_BACKUP_KEY = 'nineflow-practice-results-future-backup';
const CONFIG_KEY = 'nineflow-practice-config-v1';
const PACING_KEY = 'nineflow-practice-pacing-v1';
const ROTATION_KEY = 'nineflow-rotation-preferences-v1';
const APPOINTMENT_KEY = 'nineflow-appointment-preferences-v1';

const rotationReviewFixture = [{
  id: 'e2e-rotation-review',
  gameId: 'rotation',
  completedAt: '2026-08-31T00:00:00.000Z',
  accuracy: 0,
  medianRt: 1800,
  stability: 0,
  errors: 1,
  detail: {
    sessionMode: '연습 모드',
    quantity: 1,
    paceMs: 30000,
    rotationContent: 'letters',
    rotationLetters: 'F',
    rotationTargetIds: 'turn-left-45',
    previewUsed: '사용',
  },
  review: {
    version: 2,
    gameId: 'rotation',
    attempts: [{
      kind: 'rotation',
      id: 'rot-a1',
      index: 0,
      status: 'error',
      errorCodes: ['rotation-angle'],
      title: '1번 · 알파벳 F',
      prompt: '시작 모양을 목표 모양으로 변환',
      expected: 'L45',
      selected: 'R45',
      explanation: '회전 방향을 반대로 선택했습니다.',
      rtMs: 1800,
      puzzle: {
        kind: 'letter',
        baseId: 'letter-F',
        transformId: 'turn-left-45',
        letter: 'F',
        target: [0.7071, -0.7071, 0.7071, 0.7071],
        optimal: ['left'],
      },
      submitted: ['right'],
      correction: ['left', 'left'],
      events: [
        { index: 0, action: 'start', elapsedMs: 0, chargedClicks: 0, remainingOptimal: 1, inefficient: false },
        { index: 1, action: 'right', elapsedMs: 900, chargedClicks: 1, remainingOptimal: 2, inefficient: true },
        { index: 2, action: 'submit', elapsedMs: 1800, chargedClicks: 1, remainingOptimal: 2, inefficient: true },
      ],
      firstInefficientEvent: 1,
    }],
    summary: {
      attemptedCount: 1,
      correctCount: 0,
      neutralCount: 0,
      reviewPointCount: 1,
      errorCounts: { 'rotation-angle': 1 },
      omittedDetailCount: 0,
      coverage: 'full',
    },
  },
}];

async function seedFocusedGameSettings(page: Page) {
  await page.addInitScript(({ configKey, rotationKey, appointmentKey }) => {
    window.localStorage.setItem(configKey, JSON.stringify({
      rotation: { quantity: 1, paceMs: 90000 },
      appointment: { quantity: 1, paceMs: 6000 },
    }));
    window.localStorage.setItem(rotationKey, JSON.stringify({
      contentMode: 'letters',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: false,
    }));
    window.localStorage.setItem(appointmentKey, JSON.stringify({ selectedRounds: ['day'] }));
  }, { configKey: CONFIG_KEY, rotationKey: ROTATION_KEY, appointmentKey: APPOINTMENT_KEY });
}

async function openRotation(page: Page) {
  await page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rotation"]');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('1');
  await stage.getByRole('button', { name: /^연습 시작/ }).click();
  await expect(page.locator('.game-workspace.game-rotation')).toBeVisible({ timeout: 8_000 });
  return stage;
}

async function assertNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))).toEqual({ document: 0, body: 0 });
}

test('짧은 가로 화면에서 전략 탭과 중첩 모달 포커스가 정확히 복구된다', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');

  const card = page.getByRole('button', { name: /도형 회전하기, 난이도 중, 설정 열기/ });
  await card.click();
  const stage = page.locator('section[data-game="rotation"]');
  const opener = stage.getByRole('button', { name: '도형 회전하기 공략 보기' });
  await opener.click();

  const guide = page.getByRole('dialog', { name: '전략게임 가이드' });
  const tabs = guide.getByRole('tablist', { name: '가이드를 볼 게임' });
  const panel = guide.getByRole('tabpanel');
  await expect(tabs).toHaveAttribute('aria-orientation', 'horizontal');
  await expect.poll(() => panel.evaluate((element) => element.clientHeight)).toBeGreaterThan(100);

  const selectedTab = tabs.locator('[role="tab"][aria-selected="true"]');
  const selectedId = await selectedTab.getAttribute('id');
  await selectedTab.press('ArrowRight');
  await expect(tabs.locator('[role="tab"][aria-selected="true"]')).not.toHaveAttribute('id', selectedId ?? '');

  await panel.focus();
  await panel.press('PageDown');
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await assertNoPageOverflow(page);

  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(stage).toHaveAttribute('role', 'dialog');
  await expect(stage.locator('.stage-content')).not.toHaveAttribute('inert', '');

  await stage.getByRole('button', { name: '연습 닫기' }).click();
  await expect(stage).toBeHidden();
  await expect(card).toBeFocused();
});

test('1,000자 한글 의견은 본문 없는 이슈 URL과 전체 복사 경로를 사용한다', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __openedUrls?: string[]; __copiedText?: string };
    state.__openedUrls = [];
    state.__copiedText = '';
    window.open = ((url?: string | URL) => {
      state.__openedUrls?.push(String(url));
      return null;
    }) as typeof window.open;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { state.__copiedText = value; } },
    });
  });
  await page.goto('/');

  await page.locator('.topbar nav').getByRole('button', { name: '의견' }).click();
  const dialog = page.getByRole('dialog', { name: '의견 보내기' });
  await dialog.locator('textarea').fill('가'.repeat(1_000));
  await expect(dialog.getByText('1000 / 1000')).toBeVisible();

  const submit = dialog.getByRole('button', { name: /복사 후 GitHub 열기/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog.getByText(/긴 의견 전체를 복사했습니다/)).toBeVisible();

  const submitted = await page.evaluate(() => {
    const state = window as Window & { __openedUrls?: string[]; __copiedText?: string };
    return { opened: state.__openedUrls?.at(-1) ?? '', copied: state.__copiedText ?? '' };
  });
  const issueUrl = new URL(submitted.opened);
  expect(issueUrl.pathname).toBe('/heotaewoong/competency-game/issues/new');
  expect(issueUrl.searchParams.get('title')).toBeTruthy();
  expect(issueUrl.searchParams.has('body')).toBe(false);
  expect(Array.from(submitted.copied).filter((character) => character === '가')).toHaveLength(1_000);
});

test('약속 정하기의 실제 더블클릭은 친구 한 명만 이동한다', async ({ page }) => {
  await seedFocusedGameSettings(page);
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();

  const stage = page.locator('section[data-game="appointment"]');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: /^연습 시작/ }).click();
  const beginRound = page.getByRole('button', { name: '이 라운드 시작' });
  await expect(beginRound).toBeVisible({ timeout: 8_000 });
  await beginRound.click();

  const next = page.locator('.appointment-stimulus .single-action');
  const counter = page.locator('.appointment-phase-meta b');
  await expect(counter).toHaveText('1 / 3');
  await next.dblclick();
  await expect(counter).toHaveText('2 / 3');
  await page.waitForTimeout(450);
  await expect(counter).toHaveText('2 / 3');
  await expect(page.locator('.appointment-question')).toBeHidden();
});

test('시간 제한 없는 연습 설정은 해당 게임에만 저장되고 다시 열어도 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  let stage = page.locator('section[data-game="rps"]');
  const rpsPacing = stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
  await expect(rpsPacing).not.toBeChecked();
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), PACING_KEY)).toEqual({ rps: true });
  await stage.getByRole('button', { name: '연습 닫기' }).click();

  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  stage = page.locator('section[data-game="rps"]');
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: '연습 닫기' }).click();

  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  stage = page.locator('section[data-game="nback"]');
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).not.toBeChecked();
});

test('길 만들기 연습은 경로가 맞아도 울타리 수가 다르면 같은 문제에서 교정한다', async ({ page }) => {
  await page.addInitScript(({ configKey, pacingKey }) => {
    Date.now = () => 0;
    Math.random = () => 0;
    window.localStorage.setItem(configKey, JSON.stringify({ path: { quantity: 3, paceMs: 120000 } }));
    window.localStorage.setItem(pacingKey, JSON.stringify({ path: true }));
    window.localStorage.setItem('nineflow-focused-practice-v1', JSON.stringify({ path: 'all' }));
  }, { configKey: CONFIG_KEY, pacingKey: PACING_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: /길 만들기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="path"]');
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: /^연습 시작/ }).click();
  await expect(page.locator('.path-shell')).toBeVisible({ timeout: 8_000 });

  const choice = (cell: number, orientation: 'slash' | 'backslash') => page.locator(`.path-fence-choice[data-cell="${cell}"][data-orientation="${orientation}"]`);
  await choice(4, 'backslash').click();
  await choice(9, 'backslash').click();
  await choice(14, 'slash').click();
  await choice(20, 'slash').click();
  const submit = page.getByRole('button', { name: '경로 확인' });
  await submit.click();

  await expect(page.locator('.workspace-progress')).toContainText('1 / 3 문제');
  await expect(page.locator('.workspace-foot')).toContainText('경로는 맞지만 울타리 초과는 감점 조건입니다. 3개로 줄여 최대득점을 완성하세요.');
  await expect(submit).toBeEnabled();
  await choice(20, 'slash').click();
  await submit.click();
  await expect(page.locator('.workspace-progress')).toContainText('2 / 3 문제', { timeout: 3_000 });
});

test('회전 조작 뒤 과정 보기 토글이 문제와 입력을 초기화하지 않는다', async ({ page }) => {
  await seedFocusedGameSettings(page);
  await page.goto('/');
  await openRotation(page);

  const targetLabel = await page.locator('.rotation-comparison article').last().getByRole('img').getAttribute('aria-label');
  await page.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();
  const meter = page.getByRole('progressbar', { name: '남은 조작 기회' });
  await expect(meter).toHaveAttribute('aria-valuenow', '19');
  await page.locator('.rotation-practice-banner button').click();

  await expect(meter).toHaveAttribute('aria-valuenow', '19');
  await expect(page.getByRole('button', { name: /답안 제출/ })).toBeEnabled();
  await expect(page.locator('.rotation-comparison article').first().getByRole('img')).toHaveAttribute('aria-label', /1단계 누적 조작.*알파벳 F.*왼쪽 45°/);
  await expect(page.locator('.rotation-comparison article').last().getByRole('img')).toHaveAttribute('aria-label', targetLabel ?? '');

  await page.getByRole('button', { name: /답안 제출/ }).click();
  const result = page.getByRole('region', { name: '문제 풀이 결과' });
  await expect(result).toContainText('정답');
  await expect(result.getByRole('button', { name: /결과 보기/ })).toBeVisible();
});

test('작은 세로·가로 화면에서도 복습 상세는 내부에서 스크롤된다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(({ key, fixture }) => {
    window.localStorage.setItem(key, JSON.stringify(fixture));
  }, { key: RESULTS_KEY, fixture: rotationReviewFixture });
  await page.goto('/');

  await page.getByRole('navigation', { name: '빠른 메뉴' }).getByRole('button', { name: '복습' }).click();
  const dialog = page.getByRole('dialog', { name: '내 실수 복습' });
  const detail = dialog.getByRole('region', { name: /선택한 시도 상세/ });
  await expect(detail).toBeVisible();
  await expect.poll(() => detail.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(120);
  await detail.focus();
  await detail.press('PageDown');
  await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollTop + document.body.scrollTop)).toBe(0);
  await assertNoPageOverflow(page);

  await page.setViewportSize({ width: 768, height: 360 });
  await expect.poll(() => detail.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(150);
  await detail.evaluate((element) => { element.scrollTop = 0; });
  await detail.press('PageDown');
  await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await assertNoPageOverflow(page);
});

test('저장 공간 쓰기가 실패해도 완료 결과와 복습 동작은 유지된다', async ({ page }) => {
  await seedFocusedGameSettings(page);
  await page.goto('/');
  await openRotation(page);
  await page.evaluate((resultsKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === resultsKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  }, RESULTS_KEY);

  await page.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();
  await page.getByRole('button', { name: /답안 제출/ }).click();
  await page.getByRole('button', { name: /결과 보기/ }).click();

  await expect(page.getByRole('heading', { name: '도형 회전하기 결과' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('브라우저 저장 공간을 사용할 수 없습니다');
  await expect(page.getByRole('button', { name: '다시 연습' })).toBeVisible();
  await expect(page.getByRole('button', { name: '문항별 복습' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '[]'), RESULTS_KEY)).toEqual([]);
});

test('결과 화면에서 연 복습창은 배경 컨트롤을 접근성 트리에서 차단한다', async ({ page }) => {
  await seedFocusedGameSettings(page);
  await page.goto('/');
  await openRotation(page);

  await page.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();
  await page.getByRole('button', { name: /답안 제출/ }).click();
  await page.getByRole('button', { name: /결과 보기/ }).click();
  await page.getByRole('button', { name: '문항별 복습' }).click();

  const review = page.getByRole('dialog', { name: '내 실수 복습' });
  await expect(review).toBeVisible();
  await expect(page.locator('.stage-content')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.stage-content')).toHaveAttribute('inert', '');
  await expect(page.locator('.stage-content').getByRole('button', { name: '다시 연습' })).toHaveCount(0);

  await review.getByRole('button', { name: '복습 센터 닫기' }).click();
  await expect(page.locator('.stage-content').getByRole('button', { name: '다시 연습' })).toBeVisible();
});

test('더 새로운 복습 스키마는 회전 연습 완료 후에도 원본 바이트를 보존한다', async ({ page }) => {
  await seedFocusedGameSettings(page);
  const futurePayloadRaw = JSON.stringify([{
    id: 'future-schema-session',
    gameId: 'rotation',
    completedAt: '2026-09-01T00:00:00.000Z',
    accuracy: 73,
    medianRt: 1420,
    stability: 81,
    errors: 2,
    detail: { sessionMode: '연습 모드', quantity: 4, futureDetail: '보존 대상' },
    review: {
      version: REVIEW_SCHEMA_VERSION + 1,
      gameId: 'rotation',
      attempts: [],
      futureOnlyField: { nested: ['이 앱이', '알 수 없는', '데이터'] },
    },
  }]);
  await page.addInitScript(({ resultsKey, raw }) => {
    window.localStorage.setItem(resultsKey, raw);
  }, { resultsKey: RESULTS_KEY, raw: futurePayloadRaw });
  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('현재 앱보다 새 형식의 복습 기록을 감지해 원본을 별도 백업했습니다');
  await expect.poll(() => page.evaluate(({ resultsKey, backupKey }) => ({
    primary: window.localStorage.getItem(resultsKey),
    backup: window.localStorage.getItem(backupKey),
  }), { resultsKey: RESULTS_KEY, backupKey: FUTURE_REVIEW_BACKUP_KEY })).toEqual({
    primary: futurePayloadRaw,
    backup: futurePayloadRaw,
  });

  await openRotation(page);
  await page.getByRole('button', { name: '1번 왼쪽 45° 회전' }).click();
  await page.getByRole('button', { name: /답안 제출/ }).click();
  await page.getByRole('button', { name: /결과 보기/ }).click();

  await expect(page.getByRole('heading', { name: '도형 회전하기 결과' })).toBeVisible();
  await expect(page.getByRole('region', { name: '도형 회전하기 결과' })).toContainText('100%');
  await expect(page.getByRole('status')).toContainText('새 형식의 기존 복습 기록을 보호하기 위해 이번 결과는 현재 화면에만 표시합니다');
  await expect.poll(() => page.evaluate(({ resultsKey, backupKey }) => ({
    primary: window.localStorage.getItem(resultsKey),
    backup: window.localStorage.getItem(backupKey),
  }), { resultsKey: RESULTS_KEY, backupKey: FUTURE_REVIEW_BACKUP_KEY })).toEqual({
    primary: futurePayloadRaw,
    backup: futurePayloadRaw,
  });
});
