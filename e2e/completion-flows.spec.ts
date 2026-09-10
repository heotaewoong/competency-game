import { expect, test, type Locator, type Page } from '@playwright/test';

const RESULTS_STORAGE_PREFIX = 'nineflow-practice-results-v4:';
const RESULTS_GENERATION_KEY = 'nineflow-practice-results-generation-v1';
const CONFIG_KEY = 'nineflow-practice-config-v1';
const PACING_KEY = 'nineflow-practice-pacing-v1';

type CompletionGame = {
  id: 'rps' | 'appointment' | 'path' | 'potion' | 'number' | 'count';
  title: string;
  difficulty: '하' | '중' | '상';
  quantityLabel: string;
  quantity: number;
  landmark: string;
};

const completionGames = {
  rps: { id: 'rps', title: '가위바위보', difficulty: '하', quantityLabel: '문제 수', quantity: 9, landmark: '.rps-board' },
  appointment: { id: 'appointment', title: '약속 정하기', difficulty: '상', quantityLabel: '라운드당 문항', quantity: 1, landmark: '.appointment-shell' },
  path: { id: 'path', title: '길 만들기', difficulty: '상', quantityLabel: '문제 수', quantity: 3, landmark: '.path-shell' },
  potion: { id: 'potion', title: '마법약 만들기', difficulty: '중', quantityLabel: '시행 수', quantity: 28, landmark: '.potion-layout' },
  number: { id: 'number', title: '숫자 누르기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.number-board-pro' },
  count: { id: 'count', title: '개수 비교하기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.count-stage-shell' },
} as const satisfies Record<string, CompletionGame>;

async function seedMinimumUntimedPractice(page: Page) {
  await page.addInitScript(({ configKey, pacingKey }) => {
    Date.now = () => 0;
    Math.random = () => 0;
    window.localStorage.setItem(configKey, JSON.stringify({
      rps: { quantity: 9, paceMs: 8000 },
      appointment: { quantity: 1, paceMs: 6000 },
      path: { quantity: 3, paceMs: 120000 },
      potion: { quantity: 28, paceMs: 12000 },
      number: { quantity: 5, paceMs: 60000 },
      count: { quantity: 5, paceMs: 2500 },
    }));
    window.localStorage.setItem(pacingKey, JSON.stringify({
      rps: true,
      appointment: true,
      path: true,
      potion: true,
      number: true,
      count: true,
    }));
    window.localStorage.setItem('nineflow-appointment-preferences-v1', JSON.stringify({ selectedRounds: ['day'] }));
    window.localStorage.setItem('nineflow-focused-practice-v1', JSON.stringify({
      rps: 'player',
      path: 'all',
      potion: { comboSize: 1, showEvidence: true },
      number: 'flash',
      count: 'foundation',
    }));
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
}

test('가위바위보 최소 연습을 끝까지 완료하고 복습 결과를 저장한다', async ({ page }) => {
  const game = completionGames.rps;
  const workspace = await startMinimumUntimedGame(page, game);

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

  for (let round = 0; round < game.quantity; round += 1) {
    await clickWhenEnabled(workspace.locator('.number-board-pro button').first());
  }

  await assertResultStored(page, game);
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
