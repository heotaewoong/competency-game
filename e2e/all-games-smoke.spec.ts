import { expect, test, type Page } from '@playwright/test';

const CONFIG_KEY = 'nineflow-practice-config-v1';

const gameCases = [
  { id: 'rotation', title: '도형 회전하기', difficulty: '중', quantityLabel: '문제 수', quantity: 1, landmark: '.rotation-comparison' },
  { id: 'rps', title: '가위바위보', difficulty: '하', quantityLabel: '문제 수', quantity: 9, landmark: '.rps-board' },
  { id: 'appointment', title: '약속 정하기', difficulty: '상', quantityLabel: '라운드당 문항', quantity: 1, landmark: '.appointment-shell' },
  { id: 'path', title: '길 만들기', difficulty: '상', quantityLabel: '문제 수', quantity: 3, landmark: '.path-shell' },
  { id: 'potion', title: '마법약 만들기', difficulty: '중', quantityLabel: '시행 수', quantity: 28, landmark: '.potion-layout' },
  { id: 'nback', title: '도형 순서 기억하기', difficulty: '상', quantityLabel: '문제 수', quantity: 1, landmark: '.nback-stage' },
  { id: 'number', title: '숫자 누르기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.number-board-pro' },
  { id: 'count', title: '개수 비교하기', difficulty: '하', quantityLabel: '문제 수', quantity: 5, landmark: '.count-stage-shell' },
  { id: 'mouse', title: '고양이 술래잡기', difficulty: '중', quantityLabel: '라운드 수', quantity: 3, landmark: '.mouse-layout, .cat-decision' },
] as const;

async function seedMinimumPracticeSettings(page: Page) {
  await page.addInitScript(({ configKey }) => {
    window.localStorage.setItem(configKey, JSON.stringify({
      rotation: { quantity: 1, paceMs: 90000 },
      rps: { quantity: 9, paceMs: 8000 },
      appointment: { quantity: 1, paceMs: 6000 },
      path: { quantity: 3, paceMs: 120000 },
      potion: { quantity: 28, paceMs: 12000 },
      nback: { quantity: 1, paceMs: 6000 },
      number: { quantity: 5, paceMs: 60000 },
      count: { quantity: 5, paceMs: 2500 },
      mouse: { quantity: 3, paceMs: 3000 },
    }));
    window.localStorage.setItem('nineflow-appointment-preferences-v1', JSON.stringify({ selectedRounds: ['day'] }));
    window.localStorage.setItem('nineflow-rotation-preferences-v1', JSON.stringify({
      contentMode: 'letters',
      selectedLetters: ['F'],
      selectedTransforms: ['turn-left-45'],
      showPreview: false,
    }));
    window.localStorage.setItem('nineflow-nback-preferences-v1', JSON.stringify({
      task: 'n2',
      group: 0,
      progression: 'fixed',
    }));
    window.localStorage.setItem('nineflow-focused-practice-v1', JSON.stringify({
      rps: 'player',
      path: 'base',
      potion: { comboSize: 1, showEvidence: true },
      number: 'flash',
      count: 'foundation',
      mouse: 'foundation',
    }));
  }, { configKey: CONFIG_KEY });
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

test.describe('9개 게임 모바일 시작·종료 스모크', () => {
  for (const game of gameCases) {
    test(`${game.title} 설정에서 실제 문제 화면까지 진입한다`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      await seedMinimumPracticeSettings(page);
      await page.goto('/');

      const card = page.getByRole('button', {
        name: new RegExp(`${game.title}, 난이도 ${game.difficulty}, 설정 열기`),
      });
      await card.click();

      const stage = page.locator(`section[data-game="${game.id}"]`);
      await expect(stage).toHaveAttribute('role', 'dialog');
      await expect(stage.getByRole('heading', { name: game.title })).toBeVisible();
      await expect(stage.getByLabel(`${game.quantityLabel} 현재 값`)).toHaveText(String(game.quantity));
      await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();

      const workspace = page.locator(`.game-workspace.game-${game.id}`);
      await expect(workspace).toBeVisible({ timeout: 10_000 });
      await expect(workspace.locator(game.landmark)).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => pageOverflow(page)).toEqual({ document: 0, body: 0 });
      await expect(page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')).toHaveCount(0);
      expect(pageErrors).toEqual([]);

      await workspace.getByRole('button', { name: '연습 닫기' }).click();
      const confirmation = page.getByRole('alertdialog', { name: '이번 세션을 종료할까요?' });
      await expect(confirmation).toBeVisible();
      await expect(confirmation.getByRole('button', { name: '계속 연습' })).toBeFocused();
      await confirmation.getByRole('button', { name: '연습창 닫기' }).click();
      await expect(stage).toBeHidden();
      await expect(card).toBeFocused();
      await expect(page.getByRole('link', { name: 'NINEFLOW LAB 홈' })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });
  }
});
