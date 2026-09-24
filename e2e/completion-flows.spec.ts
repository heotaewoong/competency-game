import { expect, test, type Locator, type Page } from '@playwright/test';

const RESULTS_STORAGE_PREFIX = 'nineflow-practice-results-v4:';
const RESULTS_GENERATION_KEY = 'nineflow-practice-results-generation-v1';
const CONFIG_KEY = 'nineflow-practice-config-v1';
const PACING_KEY = 'nineflow-practice-pacing-v1';

type CompletionGame = {
  id: 'rps' | 'rotation' | 'appointment' | 'path' | 'potion' | 'nback' | 'number' | 'count' | 'mouse';
  title: string;
  difficulty: '하' | '중' | '상';
  quantityLabel: string;
  quantity: number;
  landmark: string;
};

const completionGames = {
  rps: { id: 'rps', title: '가위바위보', difficulty: '하', quantityLabel: '문제 수', quantity: 9, landmark: '.rps-board' },
  rotation: { id: 'rotation', title: '도형 회전하기', difficulty: '중', quantityLabel: '문제 수', quantity: 1, landmark: '.rotation-stage-layout' },
  appointment: { id: 'appointment', title: '약속 정하기', difficulty: '상', quantityLabel: '라운드당 문항', quantity: 1, landmark: '.appointment-shell' },
  path: { id: 'path', title: '길 만들기', difficulty: '상', quantityLabel: '문제 수', quantity: 3, landmark: '.path-shell' },
  potion: { id: 'potion', title: '마법약 만들기', difficulty: '중', quantityLabel: '시행 수', quantity: 28, landmark: '.potion-layout' },
  nback: { id: 'nback', title: '도형 순서 기억하기', difficulty: '상', quantityLabel: '문제 수', quantity: 1, landmark: '.nback-stage' },
  number: { id: 'number', title: '숫자 누르기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.number-board-pro' },
  count: { id: 'count', title: '개수 비교하기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.count-stage-shell' },
  mouse: { id: 'mouse', title: '고양이 술래잡기', difficulty: '중', quantityLabel: '라운드 수', quantity: 3, landmark: '.mouse-layout' },
} as const satisfies Record<string, CompletionGame>;

async function seedMinimumUntimedPractice(page: Page) {
  await page.addInitScript(({ configKey, pacingKey }) => {
    Date.now = () => 0;
    Math.random = () => 0;
    window.localStorage.setItem(configKey, JSON.stringify({
      rps: { quantity: 9, paceMs: 8000 },
      rotation: { quantity: 1, paceMs: 15000 },
      appointment: { quantity: 1, paceMs: 6000 },
      path: { quantity: 3, paceMs: 120000 },
      potion: { quantity: 28, paceMs: 12000 },
      nback: { quantity: 1, paceMs: 3000 },
      number: { quantity: 5, paceMs: 60000 },
      count: { quantity: 5, paceMs: 2500 },
      mouse: { quantity: 3, paceMs: 700 },
    }));
    window.localStorage.setItem(pacingKey, JSON.stringify({
      rps: true,
      rotation: true,
      appointment: true,
      path: true,
      potion: true,
      nback: true,
      number: true,
      count: true,
      mouse: true,
    }));
    window.localStorage.setItem('nineflow-appointment-preferences-v1', JSON.stringify({ selectedRounds: ['day'] }));
    window.localStorage.setItem('nineflow-focused-practice-v1', JSON.stringify({
      rps: 'player',
      path: 'all',
      potion: { comboSize: 1, showEvidence: true },
      number: 'full',
      count: 'foundation',
      mouse: 'foundation',
    }));
    window.localStorage.setItem('nineflow-nback-preferences-v1', JSON.stringify({ task: 'n2', group: 0, progression: 'fixed' }));
  }, { configKey: CONFIG_KEY, pacingKey: PACING_KEY });
}

async function startMinimumUntimedGame(page: Page, game: CompletionGame) {
  await seedMinimumUntimedPractice(page);
  await page.goto('/');
  await page.getByRole('button', {
    name: new RegExp(`${game.title}, 난이도 ${game.difficulty}, 설정 열기`),
  }).click();

  const stage = page.locator(`section[data-game="${game.id}"]`);
  await expect(stage.getByLabel(`${game.quantityLabel} 현재 값`)).toHaveText(String(game.quantity));
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

  const workspace = page.locator(`.game-workspace.game-${game.id}`);
  await expect(workspace).toBeVisible({ timeout: 10_000 });
  await expect(workspace.locator(game.landmark)).toBeVisible({ timeout: 10_000 });
  return workspace;
}

async function clickWhenEnabled(locator: Locator) {
  await expect(locator).toBeEnabled({ timeout: 5_000 });
  await locator.click();
}

async function assertResultStored(page: Page, game: CompletionGame) {
  await expect(page.getByRole('heading', { name: `${game.title} 결과` })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(({ prefix, generationKey, gameId }) => {
    const generation = window.localStorage.getItem(generationKey);
    const activeKey = generation ? `${prefix}${generation}` : '';
    const envelope = JSON.parse((activeKey && window.localStorage.getItem(activeKey)) || 'null') as {
      version?: number;
      generation?: string;
      results?: Array<{
        gameId?: string;
        review?: { attempts?: unknown[]; summary?: { attemptedCount?: number } };
      }>;
    } | null;
    const result = envelope?.results?.find((item) => item.gameId === gameId);
    return {
      version: envelope?.version,
      generationMatches: Boolean(generation && envelope?.generation === generation),
      found: Boolean(result),
      hasReviewAttempts: Math.max(result?.review?.summary?.attemptedCount ?? 0, result?.review?.attempts?.length ?? 0) > 0,
    };
  }, { prefix: RESULTS_STORAGE_PREFIX, generationKey: RESULTS_GENERATION_KEY, gameId: game.id })).toEqual({
    version: 4,
    generationMatches: true,
    found: true,
    hasReviewAttempts: true,
  });

  // Persisted game-generated reviews must survive the same strict loader used
  // on the user's next visit, not merely exist immediately after completion.
  await page.reload();
  await expect(page.locator('.header-status')).toHaveAttribute('aria-label', '완료한 연습 1회, 기록으로 이동');
  await page.getByRole('button', { name: `${game.title} 최근 세션 복습`, exact: true }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText(game.title);
}

test('가위바위보 최소 연습은 결과 직후 화면을 떠나도 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.rps;
  const workspace = await startMinimumUntimedGame(page, game);

  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.stage-result')) return;
      observer.disconnect();
      window.dispatchEvent(new Event('pagehide'));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  for (let round = 0; round < game.quantity; round += 1) {
    await clickWhenEnabled(workspace.locator('.rps-actions button').first());
  }

  await assertResultStored(page, game);
});

test('약속 정하기 최소 연습을 끝까지 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.appointment;
  const workspace = await startMinimumUntimedGame(page, game);

  await workspace.getByRole('button', { name: '이 라운드 시작' }).click();
  for (const expectedPerson of ['2 / 3', '3 / 3']) {
    await clickWhenEnabled(workspace.locator('.appointment-stimulus .single-action'));
    await expect(workspace.locator('.appointment-phase-meta b')).toHaveText(expectedPerson);
  }
  await clickWhenEnabled(workspace.locator('.appointment-stimulus .single-action'));
  await clickWhenEnabled(workspace.locator('.appointment-choice-grid button').first());

  await assertResultStored(page, game);
});

test('길 만들기 최소 연습을 UI 울타리 조작으로 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.path;
  const workspace = await startMinimumUntimedGame(page, game);
  const solutions = [
    [[4, 'backslash'], [9, 'backslash'], [14, 'slash']],
    [[0, 'slash'], [1, 'backslash'], [10, 'slash'], [16, 'slash']],
    [[11, 'slash'], [24, 'backslash'], [12, 'slash']],
  ] as const;

  for (let round = 0; round < solutions.length; round += 1) {
    for (const [cell, orientation] of solutions[round]) {
      await workspace.locator(`.path-fence-choice[data-cell="${cell}"][data-orientation="${orientation}"]`).click();
    }
    await workspace.getByRole('button', { name: '경로 확인' }).click();
    if (round < solutions.length - 1) {
      await expect(workspace.locator('.workspace-progress')).toContainText(`${round + 2} / ${game.quantity} 문제`, { timeout: 5_000 });
    }
  }

  await assertResultStored(page, game);
});

test('마법약 만들기 최소 연습을 끝까지 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.potion;
  const workspace = await startMinimumUntimedGame(page, game);

  for (let round = 0; round < game.quantity; round += 1) {
    await clickWhenEnabled(workspace.locator('.potion-actions button.blue'));
  }

  await assertResultStored(page, game);
});

test('숫자 누르기 최소 연습을 끝까지 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.number;
  const workspace = await startMinimumUntimedGame(page, game);

  await expect(workspace.locator('.number-round-banner')).toContainText('ROUND 1 / 2');
  for (let round = 0; round < game.quantity; round += 1) {
    if (round === 2) {
      const transition = workspace.locator('.number-round-transition');
      await expect(transition).toContainText('ROUND 2 / 2');
      await expect(workspace.locator('.time-strip')).toHaveCount(0);
      const secondRoundStart = transition.getByRole('button', { name: /2라운드 시작/ });
      await expect(secondRoundStart).toBeFocused();
      await secondRoundStart.click();
      await expect(workspace.locator('.number-round-banner')).toContainText('ROUND 2 / 2');
    }
    const banner = workspace.locator('.number-round-banner');
    await expect(banner.locator('em')).toHaveText(round < 2 ? `${round + 1} / 2 문제` : `${round - 1} / 3 문제`);
    if ((await banner.textContent())?.includes('ROUND 1')) {
      await clickWhenEnabled(workspace.locator('.number-board-pro button.target'));
      continue;
    }
    const skip = Number((await workspace.locator('.number-rule span').nth(0).textContent())?.match(/\d+/)?.[0]);
    const doubles = [...((await workspace.locator('.number-rule span').nth(1).textContent()) ?? '').matchAll(/\d+/g)].map((match) => Number(match[0]));
    for (let value = 1; value <= 9; value += 1) {
      if (value === skip) continue;
      const repeats = doubles.includes(value) ? 2 : 1;
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        await clickWhenEnabled(workspace.getByRole('button', { name: String(value), exact: true }));
      }
    }
  }

  await assertResultStored(page, game);
});

test('숫자 누르기 실전형은 1라운드 뒤 타이머를 멈추고 3초 후 2라운드를 시작한다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Date.now = () => 0;
    Math.random = () => 0;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /숫자 누르기, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="number"]');
  await stage.getByRole('button', { name: /^실전형 연습 시작/ }).click();

  const workspace = page.locator('.game-workspace.game-number');
  await expect(workspace.locator('.number-round-banner')).toContainText('ROUND 1 / 2', { timeout: 10_000 });
  for (let question = 0; question < 6; question += 1) {
    await clickWhenEnabled(workspace.locator('.number-board-pro button.target'));
  }

  const transition = workspace.locator('.number-round-transition');
  await expect(transition).toContainText('ROUND 2 / 2');
  const transitionStartedAt = await page.evaluate(() => performance.now());
  await expect(transition.locator('.number-transition-countdown')).toHaveAttribute('aria-label', /초 뒤 2라운드 시작/);
  await expect(workspace.locator('.time-strip')).toHaveCount(0);
  await expect(workspace.locator('.number-board-pro')).toHaveCount(0);
  await expect(workspace.locator('.number-round-banner')).toContainText('ROUND 2 / 2', { timeout: 5_000 });
  const transitionElapsed = await page.evaluate((startedAt) => performance.now() - startedAt, transitionStartedAt);
  expect(transitionElapsed).toBeGreaterThanOrEqual(2_500);
  expect(transitionElapsed).toBeLessThan(4_500);
  await expect(workspace.locator('.time-strip')).toHaveAttribute('data-deadline-active', 'true');
});

test('개수 비교하기 최소 연습을 끝까지 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.count;
  const workspace = await startMinimumUntimedGame(page, game);

  for (let round = 0; round < game.quantity; round += 1) {
    await clickWhenEnabled(workspace.getByRole('button', { name: /내용을 들었어요 · 응답으로 이동/ }));
    await clickWhenEnabled(workspace.getByRole('button', { name: '왼쪽 선택' }));
  }

  await assertResultStored(page, game);
});

test('도형 회전하기 최소 연습을 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.rotation;
  const workspace = await startMinimumUntimedGame(page, game);

  await clickWhenEnabled(workspace.locator('.rotation-op-grid button').first());
  await clickWhenEnabled(workspace.getByRole('button', { name: /답안 제출/ }));
  await clickWhenEnabled(workspace.getByRole('button', { name: /결과 보기/ }));

  await assertResultStored(page, game);
});

test('도형 순서 기억하기 최소 연습을 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.nback;
  const workspace = await startMinimumUntimedGame(page, game);

  for (let warmup = 0; warmup < 2; warmup += 1) {
    await clickWhenEnabled(workspace.getByRole('button', { name: /기억했어요 · 다음 도형/ }));
  }
  await clickWhenEnabled(workspace.locator('.nback-actions button').first());
  await clickWhenEnabled(workspace.getByRole('button', { name: /응답 완료 · 다음 도형/ }));

  await assertResultStored(page, game);
});

test('고양이 술래잡기 최소 연습을 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.mouse;
  const workspace = await startMinimumUntimedGame(page, game);

  for (let round = 0; round < game.quantity; round += 1) {
    for (let presentation = 0; presentation < 4; presentation += 1) {
      await clickWhenEnabled(workspace.getByRole('button', { name: /내용을 들었어요 · 다음 단계/ }));
    }
    await clickWhenEnabled(workspace.locator('.cat-decision.red .decision-groups button').first());
    await clickWhenEnabled(workspace.locator('.cat-decision.blue .decision-groups button').first());
  }

  await assertResultStored(page, game);
});
