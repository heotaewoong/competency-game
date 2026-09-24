import { expect, test } from '@playwright/test';

const RESULTS_PREFIX = 'nineflow-practice-results-v4:';
const RESULTS_GENERATION_KEY = 'nineflow-practice-results-generation-v1';
const LEGACY_RESULTS_KEY = 'nineflow-practice-results-v2';
const READINESS_KEY = 'nineflow-readiness-check-v1';

async function storedResultCount(page: import('@playwright/test').Page) {
  return page.evaluate(({ prefix, generationKey }) => {
    const generation = window.localStorage.getItem(generationKey);
    const envelope = JSON.parse(generation ? window.localStorage.getItem(`${prefix}${generation}`) ?? '{}' : '{}') as { results?: unknown[] };
    return envelope.results?.length ?? -1;
  }, { prefix: RESULTS_PREFIX, generationKey: RESULTS_GENERATION_KEY });
}

async function expectDialogFooterInsideViewport(dialog: import('@playwright/test').Locator) {
  const bounds = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const footerRect = element.querySelector('footer')?.getBoundingClientRect();
    return footerRect ? { dialogBottom: dialogRect.bottom, footerBottom: footerRect.bottom, viewportBottom: window.innerHeight } : null;
  });
  expect(bounds).not.toBeNull();
  expect(bounds!.footerBottom).toBeLessThanOrEqual(bounds!.dialogBottom + 1);
  expect(bounds!.footerBottom).toBeLessThanOrEqual(bounds!.viewportBottom + 1);
}

test('백업 창을 닫으면 두 진입 버튼의 키보드 초점이 복원된다', async ({ page }) => {
  await page.goto('/');
  for (const trigger of [page.locator('.records-data-button'), page.getByRole('button', { name: '기록 백업·복원', exact: true })]) {
    for (const closeName of ['Escape', '내 기록 백업·복원 닫기', '닫기']) {
      await expect(trigger).toBeEnabled();
      await trigger.press('Enter');
      const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
      await expect(dialog.getByRole('button', { name: '내 기록 백업·복원 닫기' })).toBeFocused();
      if (closeName === 'Escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: closeName, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.soft(trigger).toBeFocused();
    }
  }
});

test('준비센터를 닫으면 홈과 게임 내부 진입 버튼의 키보드 초점이 복원된다', async ({ page }) => {
  await page.goto('/');
  for (const nested of [false, true]) {
    if (nested) await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
    const trigger = nested
      ? page.locator('section[data-game="rps"]').getByRole('button', { name: '응시 준비센터 열기' })
      : page.locator('.readiness-banner button');
    for (const closeName of ['Escape', '응시 준비센터 닫기', '설정 저장하고 닫기']) {
      await trigger.press('Enter');
      const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
      await expect(dialog.getByRole('button', { name: '응시 준비센터 닫기' })).toBeFocused();
      if (closeName === 'Escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: closeName, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.soft(trigger).toBeFocused();
    }
  }
});

test('준비센터에서 자동·직접 점검과 접근성 설정을 완료하고 다시 복원한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /준비 점검 시작/ }).click();

  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('연습 준비 완료', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(dialog.locator('.readiness-check-grid article')).toHaveCount(6);

  await dialog.getByRole('button', { name: /여기를 클릭 또는 터치/ }).click();
  await expect(dialog.getByRole('button', { name: /클릭·터치 확인됨/ })).toBeVisible();
  await dialog.getByRole('button', { name: /키보드 입력 확인/ }).click();
  const waitingForKeyboard = dialog.getByRole('button', { name: /아무 문자·방향키를 눌러주세요/ });
  const highContrast = dialog.getByRole('button', { name: '고대비' });
  await highContrast.focus();
  await page.keyboard.press('Enter');
  await expect(highContrast).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(waitingForKeyboard).toBeVisible();
  await waitingForKeyboard.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('button', { name: /ArrowLeft 키 확인됨/ })).toBeVisible();

  await dialog.getByRole('button', { name: '큰 글자' }).click();
  await dialog.getByRole('button', { name: '움직임 줄이기' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');

  await dialog.getByRole('button', { name: '설정 저장하고 닫기' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.readiness-banner')).toContainText('준비 완료');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect(page.locator('.readiness-banner')).toContainText('준비 완료');
});

test('게임별 무점수 규칙 예제는 오답 재시도 뒤 정답 2/2일 때만 완료 상태를 저장한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  const check = stage.locator('.rule-check');
  await expect(check).toContainText('시작 전 무점수 예제');
  await expect(check).toContainText('1 / 2');

  await check.getByRole('button', { name: /화면에 보이는 패만 그대로 누른다/ }).click();
  await expect(check).toContainText('정답은 2번입니다.');
  await check.getByRole('button', { name: /다음 예제/ }).click();
  await expect(check.locator('legend')).toBeFocused();
  await check.getByRole('button', { name: /입력 → 관점 확인 → 수정/ }).click();
  await expect(check).toContainText('정답은 1번입니다.');
  const retry = check.getByRole('button', { name: /해설 확인 후 다시 풀기 · 0\/2/ });
  await expect(retry).toBeVisible();
  await expect(stage.getByText('무점수 규칙 확인 완료', { exact: true })).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('nineflow-rule-check-v1'))).toBeNull();
  await retry.click();
  await expect(check).toContainText('1 / 2');
  await expect(check.locator('legend')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('nineflow-rule-check-v1'))).toBeNull();

  await check.getByRole('button', { name: /누구의 패를 완성해야 하는지 확인한다/ }).click();
  await expect(check).toContainText('핵심을 정확히 이해했습니다.');
  await check.getByRole('button', { name: /다음 예제/ }).click();
  await expect(check.locator('legend')).toBeFocused();
  await check.getByRole('button', { name: /관점 확인 → 관계 판단 → 입력/ }).click();
  await check.getByRole('button', { name: /확인 완료 · 2\/2/ }).click();
  await expect(stage.getByText('무점수 규칙 확인 완료', { exact: true })).toBeVisible();
  await expect(stage.getByRole('button', { name: '다시 확인' })).toBeFocused();
  await expect(stage.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('규칙 확인 완료');

  const stored = await page.evaluate(() => window.localStorage.getItem('nineflow-rule-check-v1'));
  expect(stored).toContain('rule-check-v1-2026-09');
  await stage.getByRole('button', { name: '연습 닫기' }).click();
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  await expect(page.locator('section[data-game="rps"]')).toContainText('무점수 규칙 확인 완료');
});

test('실제 게임 필수 이미지가 404면 준비 완료로 오판하지 않는다', async ({ page }) => {
  await page.route('**/assets/appointment/food-sprite-v1.webp', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  await page.locator('section[data-game="appointment"]').getByRole('button', { name: '응시 준비센터 열기' }).click();

  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(dialog.getByText('시작 전 확인 필요', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('일부 이미지 리소스를 불러오지 못했습니다.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '다시 점검' })).toBeEnabled();
  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown, READINESS_KEY);
  expect(stored).toMatchObject({ version: 1, overall: 'review', assetStatus: 'review' });
});

test('필수 이미지 응답이 멈춰도 제한시간 뒤 확인 필요로 수렴하고 재점검할 수 있다', async ({ page }) => {
  await page.route('**/assets/appointment/food-sprite-v1.webp', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 7_500));
    await route.abort('timedout').catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const startedAt = Date.now();
  await page.locator('section[data-game="appointment"]').getByRole('button', { name: '응시 준비센터 열기' }).click();

  const dialog = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(dialog.getByText('시작 전 확인 필요', { exact: true })).toBeVisible({ timeout: 9_000 });
  expect(Date.now() - startedAt).toBeLessThan(7_400);
  await expect(dialog.getByRole('button', { name: '다시 점검' })).toBeEnabled();
});

test('기록 JSON을 내려받고 검증된 파일만 병합하며 확인 후 전체 삭제한다', async ({ page }) => {
  const existing = {
    id: 'existing-rps', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
    accuracy: 80, medianRt: 720, stability: 74, errors: 2,
    detail: { sessionMode: '연습 모드', quantity: 9, paceMs: 4500, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' },
  };
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, JSON.stringify([value])), { key: LEGACY_RESULTS_KEY, value: existing });
  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('1');
  await page.locator('.records-data-button').click();

  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'JSON 백업 받기' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^nineflow-practice-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const imported = {
    id: 'imported-count', gameId: 'count', completedAt: '2026-09-10T02:00:00.000Z',
    accuracy: 60, medianRt: 940, stability: 65, errors: 2,
    detail: { sessionMode: '연습 모드', quantity: 5, paceMs: 1000, practiceFocus: 'foundation', guidedPacing: '설정 제한시간 적용' },
  };
  const validBackup = JSON.stringify({
    format: 'nineflow-practice-results', version: 1, exportedAt: '2026-09-10T03:00:00.000Z', results: [imported],
  });
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(validBackup) });
  await expect(dialog).toContainText('검증 완료: 1개 기록');
  await dialog.getByRole('button', { name: '기존 기록과 합치기' }).click();
  await expect(dialog).toContainText('현재 총 2개');
  await expect.poll(() => storedResultCount(page)).toBe(2);

  await dialog.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog).toContainText('올바른 JSON 형식이 아닙니다');
  await expect.poll(() => storedResultCount(page)).toBe(2);

  const peer = await page.context().newPage();
  await peer.goto('/');
  await expect(peer.locator('.header-status')).toContainText('2');
  await dialog.getByRole('button', { name: '전체 기록 삭제' }).click();
  await expect(dialog).toContainText('2개 기록을 삭제할까요?');
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
  await dialog.getByRole('button', { name: '삭제 확정' }).click();
  await expect(dialog).toContainText('모두 삭제했습니다');
  await expect.poll(() => storedResultCount(page)).toBe(0);
  await expect(peer.locator('.header-status')).toContainText('0');
  await expect.poll(() => storedResultCount(peer)).toBe(0);
  await peer.close();
});


test('백업의 중복 ID는 기존 점수를 덮어쓰지 않고 새 기록만 추가한다', async ({ page }) => {
  const existing = {
    id: 'keep-local-result', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
    accuracy: 80, medianRt: 720, stability: 74, errors: 2,
    detail: { sessionMode: '연습 모드', quantity: 9, paceMs: 4500 },
  };
  const added = {
    id: 'new-backup-result', gameId: 'count', completedAt: '2026-09-10T02:00:00.000Z',
    accuracy: 60, medianRt: 940, stability: 65, errors: 2,
  };
  await page.addInitScript(({ prefix, generationKey, saved }) => {
    if (sessionStorage.getItem('backup-collision-seeded')) return;
    sessionStorage.setItem('backup-collision-seeded', '1');
    localStorage.setItem(generationKey, 'backup-collision');
    localStorage.setItem(`${prefix}backup-collision`, JSON.stringify({
      version: 4, generation: 'backup-collision', results: [saved],
    }));
  }, { prefix: RESULTS_PREFIX, generationKey: RESULTS_GENERATION_KEY, saved: existing });
  await page.goto('/');
  await expect(page.locator('.header-status')).toContainText('1');
  await page.locator('.records-data-button').click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'duplicate-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'nineflow-practice-results', version: 1, exportedAt: '2026-09-10T03:00:00.000Z',
      results: [{ ...existing, accuracy: 0, errors: 9, detail: undefined }, added],
    })),
  });
  await expect(dialog).toContainText('검증 완료: 2개 기록');
  await dialog.getByRole('button', { name: '기존 기록과 합치기' }).click();
  await expect(dialog).toContainText('새로 추가 1개, 현재 총 2개');
  await page.reload();
  await expect(page.locator('.header-status')).toContainText('2');
  const stored = await page.evaluate(({ prefix, generationKey }) => {
    const generation = localStorage.getItem(generationKey);
    return JSON.parse(localStorage.getItem(`${prefix}${generation}`) ?? '{}').results;
  }, { prefix: RESULTS_PREFIX, generationKey: RESULTS_GENERATION_KEY });
  expect(stored).toHaveLength(2);
  expect(stored).toEqual(expect.arrayContaining([existing, added]));
});

test('게임 내부에서 저장한 환경 차단은 화면 복구 즉시 해제되고 새로고침 뒤에도 유지된다', async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 300 });
  await page.goto('/');
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await stage.getByRole('button', { name: '응시 준비센터 열기' }).click();
  const readiness = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(readiness.getByText('환경 조정 필요', { exact: true })).toBeVisible({ timeout: 10_000 });
  await readiness.getByRole('button', { name: '설정 저장하고 닫기' }).click();
  await stage.getByRole('button', { name: '연습 닫기' }).click();
  await expect(page.locator('.readiness-banner')).toContainText('환경 조정 필요');

  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown, READINESS_KEY);
  expect(stored).toMatchObject({ version: 1, overall: 'blocked', assetStatus: 'ready' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.readiness-banner')).toContainText('준비 완료');
  await page.reload();
  await expect(page.locator('.readiness-banner')).toContainText('준비 완료');
});

test('844×360 가로 화면에서 준비센터와 기록 관리 하단 버튼이 잘리지 않는다', async ({ page }) => {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, JSON.stringify([value])), {
    key: LEGACY_RESULTS_KEY,
    value: {
      id: 'landscape-rps', gameId: 'rps', completedAt: '2026-09-10T03:00:00.000Z',
      accuracy: 80, medianRt: 720, stability: 74, errors: 2,
    },
  });
  await page.setViewportSize({ width: 844, height: 360 });
  await page.goto('/');
  await page.getByRole('button', { name: /준비 점검 시작/ }).click();
  const readiness = page.getByRole('dialog', { name: '응시 준비센터' });
  await expect(readiness).toBeVisible();
  await expectDialogFooterInsideViewport(readiness);
  await readiness.getByRole('button', { name: '설정 저장하고 닫기' }).click();

  await page.locator('.records-data-button').click();
  const dataDialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dataDialog).toBeVisible();
  await expectDialogFooterInsideViewport(dataDialog);
  await expect(dataDialog.getByRole('button', { name: '닫기', exact: true })).toBeVisible();
});
