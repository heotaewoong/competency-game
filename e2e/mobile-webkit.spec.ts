import { expect, test, type Locator, type Page } from '@playwright/test';

const RESULTS_STORAGE_PREFIX = 'nineflow-practice-results-v4:';
const LEGACY_V3_RESULTS_KEY = 'nineflow-practice-results-v3';
const LEGACY_RESULTS_KEY = 'nineflow-practice-results-v2';
const RESULTS_GENERATION_KEY = 'nineflow-practice-results-generation-v1';
const ACCESSIBILITY_KEY = 'nineflow-accessibility-v1';
const READINESS_KEY = 'nineflow-readiness-check-v1';

async function touchTap(page: Page, target: Locator) {
  await target.waitFor({ state: 'visible' });
  await target.evaluate((element) => {
    let ancestor: Element | null = element;
    while (ancestor instanceof HTMLElement) {
      ancestor.style.scrollBehavior = 'auto';
      ancestor = ancestor.parentElement;
    }
    document.documentElement.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  });
  const box = await target.boundingBox();
  expect(box, '터치할 요소의 화면 좌표를 찾을 수 있어야 합니다.').not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function expectNativeDialogOpen(dialog: Locator) {
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => dialog.evaluate((element) => ({
    tagName: element.tagName,
    open: (element as HTMLDialogElement).open,
  })), { timeout: 15_000 }).toEqual({ tagName: 'DIALOG', open: true });
}

test('Mobile Safari에서도 키보드로 연 native 창을 닫으면 진입 버튼에 복귀한다', async ({ page }) => {
  await page.goto('/');
  for (const [trigger, name, closeName] of [
    [page.locator('.records-data-button'), '내 기록 백업·복원', '닫기'],
    [page.locator('.readiness-banner button'), '응시 준비센터', '설정 저장하고 닫기'],
  ] as const) {
    for (const escape of [true, false]) {
      await trigger.press('Enter');
      const dialog = page.getByRole('dialog', { name });
      await expectNativeDialogOpen(dialog);
      if (escape) await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: closeName, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  }
});

test('Mobile Safari 홈과 native 준비센터에서 터치·접근성 설정이 동작한다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('게임 규칙부터 실수 복습까지');
  await expect(page.getByRole('heading', { name: '연습 게임' })).toBeVisible();
  await expect(page.locator('.game-card-hitarea')).toHaveCount(9);
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });

  await touchTap(page, page.getByRole('button', { name: /준비 점검 시작/ }));
  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await expectNativeDialogOpen(dialog);
  await expect(dialog.locator('.readiness-check-grid article')).toHaveCount(6);

  await touchTap(page, dialog.getByRole('button', { name: /여기를 클릭 또는 터치/ }));
  await expect(dialog.getByRole('button', { name: /클릭·터치 확인됨/ })).toBeVisible();
  await touchTap(page, dialog.getByRole('button', { name: '고대비' }));
  await touchTap(page, dialog.getByRole('button', { name: '큰 글자' }));
  await touchTap(page, dialog.getByRole('button', { name: '움직임 줄이기' }));
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), ACCESSIBILITY_KEY)).toContain('"contrast":"high"');

  await touchTap(page, dialog.getByRole('button', { name: '설정 저장하고 닫기' }));
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), READINESS_KEY)).toContain('"version":1');
});

test('390×844에서 설정→무점수 예제→연습 첫 문제를 실제 터치로 진행한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ rps: { quantity: 9, paceMs: 8000 } }));
    window.localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ rps: true }));
  });
  await page.goto('/');

  await touchTap(page, page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }));
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('9');

  const ruleCheck = stage.locator('.rule-check');
  await expect(ruleCheck).toContainText('1 / 2');
  await touchTap(page, ruleCheck.getByRole('button', { name: /누구의 패를 완성해야 하는지 확인한다/ }));
  await expect(ruleCheck).toContainText('핵심을 정확히 이해했습니다.');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('nineflow-rule-check-v1'))).toBeNull();

  await touchTap(page, stage.getByRole('button', { name: /^설명·연습 시작/ }));
  const workspace = page.locator('.game-workspace.game-rps');
  await expect(workspace.locator('.rps-board')).toBeVisible({ timeout: 8_000 });
  await expect(workspace.locator('.workspace-progress span')).toContainText('1 / 9 문항');
  await expect(workspace.locator('.rps-actions button')).toHaveCount(3);

  const firstChoice = workspace.locator('.rps-actions button').first();
  await touchTap(page, firstChoice);
  await expect(firstChoice).toBeDisabled();
  await expect(workspace.locator('.workspace-foot b')).not.toBeEmpty();
});

test('Mobile Safari에서 legacy v2 기록을 v4 세대 키로 이전하고 기록 모달을 닫아도 보존한다', async ({ page }) => {
  const savedResult = {
    id: 'webkit-rps-result',
    gameId: 'rps',
    completedAt: '2026-09-10T03:00:00.000Z',
    accuracy: 80,
    medianRt: 720,
    stability: 74,
    errors: 2,
    detail: {
      sessionMode: '연습 모드',
      quantity: 9,
      paceMs: 4500,
      practiceFocus: 'full',
      guidedPacing: '설정 제한시간 적용',
    },
  };
  await page.addInitScript(({ key, result }) => {
    window.localStorage.setItem(key, JSON.stringify([result]));
  }, { key: LEGACY_RESULTS_KEY, result: savedResult });
  await page.goto('/');

  await expect(page.locator('.header-status')).toContainText('1', { timeout: 15_000 });
  await expect(page.locator('.record-summary')).toContainText('저장된 최근 연습');
  await expect.poll(() => page.evaluate(({ prefix, generationKey, legacyKey }) => {
    const generation = window.localStorage.getItem(generationKey);
    const activeKey = generation ? `${prefix}${generation}` : '';
    const envelope = JSON.parse((activeKey && window.localStorage.getItem(activeKey)) || 'null') as {
      version?: number;
      generation?: string;
      results?: unknown[];
    } | null;
    return {
      version: envelope?.version,
      generationMatches: Boolean(generation && envelope?.generation === generation),
      resultCount: envelope?.results?.length,
      legacy: window.localStorage.getItem(legacyKey),
    };
  }, { prefix: RESULTS_STORAGE_PREFIX, generationKey: RESULTS_GENERATION_KEY, legacyKey: LEGACY_RESULTS_KEY })).toEqual({
    version: 4,
    generationMatches: true,
    resultCount: 1,
    legacy: null,
  });
  await touchTap(page, page.locator('.records-data-button'));

  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expectNativeDialogOpen(dialog);
  await expect(dialog).toContainText('현재 기록 1개');
  await touchTap(page, dialog.getByRole('button', { name: '닫기', exact: true }));
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(({ prefix, generationKey }) => {
    const generation = window.localStorage.getItem(generationKey);
    const activeKey = generation ? `${prefix}${generation}` : '';
    const envelope = JSON.parse((activeKey && window.localStorage.getItem(activeKey)) || 'null') as { results?: unknown[] } | null;
    return envelope?.results?.length;
  }, { prefix: RESULTS_STORAGE_PREFIX, generationKey: RESULTS_GENERATION_KEY })).toBe(1);
});

test('Mobile Safari에서 fixed-key legacy v3 envelope를 v4 세대 키로 이전한다', async ({ page }) => {
  const generation = 'webkit-legacy-v3';
  const savedResult = {
    id: 'webkit-v3-rps-result',
    gameId: 'rps',
    completedAt: '2026-09-10T03:30:00.000Z',
    accuracy: 75,
    medianRt: 760,
    stability: 70,
    errors: 2,
  };
  await page.addInitScript(({ key, legacyGeneration, result }) => {
    window.localStorage.setItem(key, JSON.stringify({
      version: 3,
      generation: legacyGeneration,
      results: [result],
    }));
  }, { key: LEGACY_V3_RESULTS_KEY, legacyGeneration: generation, result: savedResult });
  await page.goto('/');

  await expect(page.locator('.header-status')).toContainText('1', { timeout: 15_000 });
  await expect.poll(() => page.evaluate(({ prefix, generationKey, legacyKey }) => {
    const activeGeneration = window.localStorage.getItem(generationKey);
    const activeKey = activeGeneration ? `${prefix}${activeGeneration}` : '';
    const envelope = JSON.parse((activeKey && window.localStorage.getItem(activeKey)) || 'null') as {
      version?: number;
      generation?: string;
      results?: Array<{ id?: string }>;
    } | null;
    return {
      activeGeneration,
      version: envelope?.version,
      envelopeGeneration: envelope?.generation,
      resultIds: envelope?.results?.map((result) => result.id),
      legacy: window.localStorage.getItem(legacyKey),
    };
  }, {
    prefix: RESULTS_STORAGE_PREFIX,
    generationKey: RESULTS_GENERATION_KEY,
    legacyKey: LEGACY_V3_RESULTS_KEY,
  })).toEqual({
    activeGeneration: generation,
    version: 4,
    envelopeGeneration: generation,
    resultIds: [savedResult.id],
    legacy: null,
  });
});
