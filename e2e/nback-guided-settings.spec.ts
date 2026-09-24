import { expect, test, type Page } from '@playwright/test';

async function seedFastPreference(page: Page, guidedPacing: boolean) {
  await page.addInitScript((untimed) => {
    // A reload must read what the user saved, not reseed the original values.
    if (sessionStorage.getItem('nback-guided-settings-seeded')) return;
    sessionStorage.setItem('nback-guided-settings-seeded', '1');
    localStorage.setItem('nineflow-practice-config-v1', JSON.stringify({ nback: { quantity: 1, paceMs: 3000 } }));
    localStorage.setItem('nineflow-practice-pacing-v1', JSON.stringify({ nback: untimed }));
    localStorage.setItem('nineflow-nback-preferences-v1', JSON.stringify({ task: 'n2', group: 0, progression: 'fast' }));
  }, guidedPacing);
}

async function openNBackSettings(page: Page) {
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="nback"]');
  await expect(stage).toBeVisible();
  await stage.locator('.practice-advanced-settings > summary').click();
  await expect(stage.locator('.nback-progression-picker')).toBeVisible();
  return stage;
}

test('N-back 무제한 설정은 빠른 전환을 보존하고 시간 제한을 켜면 키보드 조작도 복구한다', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await seedFastPreference(page, false);
  await page.goto('/');
  const stage = await openNBackSettings(page);
  const untimed = stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ });
  const progression = stage.locator('fieldset.nback-progression-picker');
  const fast = progression.getByRole('radio', { name: /^응답 빠른 전환/ });
  const fixed = progression.getByRole('radio', { name: /^고정 간격/ });
  const difficulty = stage.getByRole('radiogroup', { name: '도형 순서 난이도' });
  const task23 = difficulty.getByRole('radio', { name: /^2·3-back/ });
  const groups = stage.getByRole('radiogroup', { name: '출제 도형 묶음' });
  const group2 = groups.getByRole('radio', { name: /^묶음 2/ });
  const note = stage.locator('#nback-progression-note');

  await expect(untimed).not.toBeChecked();
  await expect(fast).toBeEnabled();
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(untimed).toBeChecked();
  await expect(progression).toHaveAttribute('disabled', '');
  await expect(progression).toHaveAttribute('aria-describedby', 'nback-progression-note');
  await expect(fast).toBeDisabled();
  await expect(fixed).toBeDisabled();
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toContainText('직접 다음 도형');
  await expect(note).toContainText(/자동 전환.*다시 적용/);

  // Only automatic progression is unavailable; difficulty and glyph groups
  // remain editable, and their updates must not overwrite the saved fast mode.
  await expect(task23).toBeEnabled();
  await task23.click();
  await expect(task23).toHaveAttribute('aria-checked', 'true');
  await expect(group2).toBeEnabled();
  await group2.click();
  await expect(group2).toHaveAttribute('aria-checked', 'true');
  await group2.press('Tab');
  expect(await progression.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  await expect(fast).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await openNBackSettings(page);
  await expect(untimed).toBeChecked();
  await expect(fast).toBeDisabled();
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await expect(task23).toHaveAttribute('aria-checked', 'true');
  await expect(group2).toHaveAttribute('aria-checked', 'true');
  await expect(note).toContainText('직접 다음 도형');

  await untimed.press('Space');
  await expect(untimed).not.toBeChecked();
  await expect(fast).toBeEnabled();
  await expect(fixed).toBeEnabled();
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await expect(progression).not.toHaveAttribute('disabled', '');
  await expect(progression).not.toHaveAttribute('aria-describedby', 'nback-progression-note');
  await expect(note).toHaveCount(0);
  await group2.press('Tab');
  await expect(fast).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(fixed).toHaveAttribute('aria-checked', 'true');
  await expect(fixed).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await expect(fast).toBeFocused();

  await page.reload();
  await openNBackSettings(page);
  await expect(untimed).not.toBeChecked();
  await expect(fast).toBeEnabled();
  await expect(fast).toHaveAttribute('aria-checked', 'true');
  await expect(task23).toHaveAttribute('aria-checked', 'true');
  await expect(group2).toHaveAttribute('aria-checked', 'true');
  await expect(note).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('저장된 빠른 전환보다 무제한 연습이 우선하여 직접 이동한 N-back 결과를 한 번 저장한다', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await seedFastPreference(page, true);
  await page.goto('/');
  const stage = await openNBackSettings(page);
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await expect(stage.locator('.nback-progression-picker').getByRole('radio', { name: /^응답 빠른 전환/ })).toHaveAttribute('aria-checked', 'true');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('1');

  const clockOrigin = Date.UTC(2030, 0, 7);
  await page.clock.install({ time: clockOrigin });
  await page.clock.pauseAt(clockOrigin + 60_000);
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const workspace = page.locator('.game-workspace.game-nback');
  for (const second of ['3', '2', '1']) {
    await expect(workspace.locator('.nback-countdown > b')).toHaveText(second);
    await page.clock.runFor(1050);
  }
  await expect(workspace.locator('.nback-time')).toHaveCount(0);
  const lagMap = workspace.locator('.nback-lag-map');
  const nextGlyph = workspace.getByRole('button', { name: /기억했어요 · 다음 도형/ });
  for (let warmup = 1; warmup <= 2; warmup += 1) {
    await expect(lagMap).toHaveAttribute('aria-label', `기억 채우기 ${warmup}/2`);
    // Exceed the saved 3000 ms deadline without allowing an automatic move.
    await page.clock.runFor(3500);
    await expect(lagMap).toHaveAttribute('aria-label', `기억 채우기 ${warmup}/2`);
    await nextGlyph.click();
    await expect(nextGlyph).toBeDisabled();
    await page.clock.runFor(350);
  }

  const nextAnswer = workspace.getByRole('button', { name: /응답 완료 · 다음 도형/ });
  const answer = workspace.locator('.nback-actions button').first();
  await expect(nextAnswer).toBeDisabled();
  await expect(answer).toBeEnabled();
  await answer.click();
  await expect(answer).toHaveAttribute('aria-pressed', 'true');
  await expect(nextAnswer).toBeEnabled();
  // Neither the fast 300 ms delay nor the normal deadline may finish this trial.
  await page.clock.runFor(3500);
  await expect(workspace.locator('.workspace-progress > span')).toContainText('1 / 1');
  await expect(nextAnswer).toBeEnabled();
  await expect(page.locator('.stage-result')).toHaveCount(0);
  await nextAnswer.click();
  await expect(page.getByRole('heading', { name: '도형 순서 기억하기 결과' })).toBeVisible();
  await page.clock.runFor(550);

  await expect.poll(() => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const envelope = JSON.parse(localStorage.getItem(`nineflow-practice-results-v4:${generation}`) ?? 'null') as {
      version?: number;
      generation?: string;
      results?: Array<{
        gameId?: string;
        detail?: { guidedPacing?: string; nbackProgression?: string; trialCount?: number };
        review?: { attempts?: unknown[]; summary?: { attemptedCount?: number } };
      }>;
    } | null;
    const results = envelope?.results?.filter((result) => result.gameId === 'nback') ?? [];
    return {
      version: envelope?.version,
      generationMatches: Boolean(generation && envelope?.generation === generation),
      resultCount: results.length,
      guidedPacing: results[0]?.detail?.guidedPacing,
      savedProgression: results[0]?.detail?.nbackProgression,
      trialCount: results[0]?.detail?.trialCount,
      reviewCount: results[0]?.review?.attempts?.length,
      attemptedCount: results[0]?.review?.summary?.attemptedCount,
    };
  })).toEqual({
    version: 4,
    generationMatches: true,
    resultCount: 1,
    guidedPacing: '제한시간 없음',
    savedProgression: 'fast',
    trialCount: 1,
    reviewCount: 1,
    attemptedCount: 1,
  });
  expect(runtimeErrors).toEqual([]);
});
