import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { games, getGame, type SessionResult } from '../app/lib/game-data';
import { getResultComparisonKey } from '../app/lib/result-comparison';
import { serializeResultsEnvelope } from '../app/lib/result-envelope';
import { isReviewPayloadStructurallyValid } from '../app/lib/practice-backup';
import { compactReviewPayload, sanitizeReviewPayload, type GenericReviewAttempt } from '../app/lib/review-data';
import { mergeSessionResults } from '../app/lib/result-storage';
import { contrastRatio } from './color-contrast';

// Do not focus/press the opener first: that would hide Safari's pointer-origin
// focus behavior. Each test starts with a fresh, empty browser context.
for (const closeMethod of ['pointer', 'escape'] as const) {
  test(`홈 복습을 포인터로 열고 ${closeMethod}로 닫으면 진입 버튼으로 초점이 돌아온다`, async ({ page, hasTouch }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const activate = (target: Locator) => hasTouch ? target.tap() : target.click();

    await page.goto('/');
    const opener = page.getByRole('button', { name: '내 실수 복습', exact: true });
    await expect(opener).toBeEnabled();
    await expect(opener).not.toBeFocused();
    await activate(opener);

    const dialog = page.getByRole('dialog', { name: '복습 센터', exact: true });
    const close = dialog.getByRole('button', { name: '복습 센터 닫기', exact: true });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    if (closeMethod === 'escape') await page.keyboard.press('Escape');
    else await activate(close);

    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
    await expect.poll(() => opener.evaluate(element => Boolean(element.closest('[inert], [aria-hidden="true"]')))).toBe(false);
    expect(errors).toEqual([]);
  });
}

const recommendationGeneration = 'recommendation-review';
const recommendationGenerationKey = 'nineflow-practice-results-generation-v1';
const recommendationStorageKey = `nineflow-practice-results-v4:${recommendationGeneration}`;
const representativeId = 'recommended-rps-latest';
const representativeAttemptId = 'recommended-rps-latest-tie';

function recommendationRecords({ repeated = true, allGames = true, summaryOnly = false } = {}): SessionResult[] {
  const rpsSession = (id: string, day: number, quantity: number, includeLoss = false): SessionResult => {
    const attempts = Array.from({ length: quantity }, (_, index): GenericReviewAttempt => {
      const errorCodes = index === 1 ? ['rps-tie'] : includeLoss && index === 0 ? ['rps-loss'] : [];
      return { kind: 'generic', id: `${id}-${index === 1 ? 'tie' : index}`, index, status: errorCodes.length ? 'error' : 'correct', errorCodes, title: `${id} ${index + 1}번`, prompt: `${id}에 보관된 ${index + 1}번 문제`, expected: '이기는 패', selected: errorCodes.length ? '다른 패' : '이기는 패', explanation: '저장된 응답과 기대 응답을 비교합니다.', rtMs: 720 };
    });
    const review = compactReviewPayload('rps', attempts);
    return { id, gameId: 'rps', completedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`, accuracy: Math.round(100 * review.summary.correctCount / quantity), medianRt: 720, stability: 74, errors: review.summary.reviewPointCount, detail: { sessionMode: '연습 모드', quantity, paceMs: 4500, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용', accessibilityProfile: 'standard|standard|system', visibilityPauses: 0 }, review };
  };
  const latest = rpsSession(representativeId, 14, 9, repeated);
  if (summaryOnly && latest.review) latest.review = { ...latest.review, attempts: [], summary: { ...latest.review.summary, coverage: 'sampled', omittedDetailCount: 9 } };
  const previous = rpsSession('recommended-rps-previous', 13, 9);
  // The same visible error label in another comparison context must not win.
  const otherContext = rpsSession('other-context-rps', 12, 12);
  expect(getResultComparisonKey(latest)).not.toBeNull();
  expect(getResultComparisonKey(previous)).toBe(getResultComparisonKey(latest));
  expect(getResultComparisonKey(otherContext)).not.toBe(getResultComparisonKey(latest));
  const records: SessionResult[] = [latest, ...(repeated ? [previous] : []), otherContext, ...games.filter(game => game.id !== 'rps' && (allGames || game.id !== 'number')).map((game): SessionResult => ({ id: `completed-${game.id}`, gameId: game.id, completedAt: '2026-10-10T12:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2 }))];
  for (const record of records) {
    if (!record.review) continue;
    expect(isReviewPayloadStructurallyValid(record.review, record.gameId)).toBe(true);
    expect(sanitizeReviewPayload(record.review)).toEqual(record.review);
  }
  return mergeSessionResults(records);
}

function recommendationErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function installRecommendationRecords(page: Page, records: SessionResult[]) {
  const raw = serializeResultsEnvelope(recommendationGeneration, records);
  await page.addInitScript(({ generationKey, generation, storageKey, value }) => {
    localStorage.setItem(generationKey, generation);
    localStorage.setItem(storageKey, value);
  }, { generationKey: recommendationGenerationKey, generation: recommendationGeneration, storageKey: recommendationStorageKey, value: raw });
  await page.goto('/');
  await expect(page.locator('.header-status b')).toHaveText(String(records.length));
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const saved = await recommendationStorage(page);
  expect(saved).toEqual({ [recommendationGenerationKey]: recommendationGeneration, [recommendationStorageKey]: raw });
  return saved;
}

function recommendationStorage(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('nineflow-practice-results')).sort().map(key => [key, localStorage.getItem(key)])));
}

async function captureRecommendationReview(page: Page, testInfo: TestInfo, phase: string) {
  const snapshot = await page.evaluate(() => {
    const active = document.activeElement;
    const opener = document.querySelector('.recommendation-review');
    const dialog = document.querySelector('.review-dialog');
    const box = opener?.getBoundingClientRect();
    const style = opener ? getComputedStyle(opener) : null;
    const activeStyle = active ? getComputedStyle(active) : null;
    const rect = (element: Element) => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height }; };
    const ancestorOpacities: number[] = [];
    for (let parent = opener; parent; parent = parent.parentElement) ancestorOpacities.push(Number(getComputedStyle(parent).opacity));
    return {
      viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      opener: opener ? { text: opener.textContent, describedBy: opener.getAttribute('aria-describedby'), box: box ? { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null, color: style!.color, background: style!.backgroundColor, backgroundImage: style!.backgroundImage, ancestorOpacities } : null,
      actions: Array.from(document.querySelectorAll('.hero-actions > *'), element => ({ text: element.textContent, box: rect(element) })),
      coach: document.querySelector('#coach-title')?.textContent,
      dialog: dialog ? { empty: dialog.classList.contains('is-empty'), session: dialog.querySelector('.review-game-head select option:checked')?.getAttribute('value'), errorCode: dialog.querySelector('.review-attempt-filter select option:checked')?.getAttribute('value'), ids: Array.from(dialog.querySelectorAll('[data-review-attempt-id]'), element => element.getAttribute('data-review-attempt-id')), selectedIds: Array.from(dialog.querySelectorAll('[data-review-attempt-id][aria-selected="true"]'), element => element.getAttribute('data-review-attempt-id')), detail: dialog.querySelector('.generic-attempt-review h4')?.textContent, status: dialog.querySelector('.review-attempt-filter [role="status"]')?.textContent, emptyCopy: dialog.querySelector('.review-list-empty, .review-no-data')?.textContent } : null,
      active: { tag: active?.tagName, className: active?.getAttribute('class'), text: active?.textContent?.slice(0, 100), connected: active?.isConnected ?? false, inert: Boolean(active?.closest('[inert]')), ariaHidden: Boolean(active?.closest('[aria-hidden="true"]')), homePrimary: active === document.querySelector('.hero-primary'), insideHome: Boolean(active?.closest('.site-shell')), visible: activeStyle?.visibility !== 'hidden' && activeStyle?.display !== 'none' },
      stage: document.querySelector('.stage-panel') ? { gameId: document.querySelector('.stage-panel')?.getAttribute('data-game'), intro: document.querySelectorAll('.stage-intro').length, preparations: document.querySelectorAll('.game-preparation').length, workspaces: document.querySelectorAll('.game-workspace').length, results: document.querySelectorAll('.stage-result').length } : null,
      storage: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('nineflow-practice-results')).sort().map(key => [key, localStorage.getItem(key)])),
    };
  });
  const rgba = (value: string) => {
    if (!/^rgba?\(/.test(value)) throw new Error(`지원하지 않는 실제 색상: ${value}`);
    const parts = value.match(/[\d.]+/g)!.map(Number);
    if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) throw new Error(`실제 색상 채널 오류: ${value}`);
    return { channels: parts.slice(0, 3), alpha: parts[3] ?? 1 };
  };
  // A translucent button may cover a gradient. Bound contrast against both
  // black and white underlays instead of claiming its raw RGB is opaque.
  const contrastBounds = snapshot.opener ? [0, 255].map(underlay => {
    const background = rgba(snapshot.opener!.background);
    const foreground = rgba(snapshot.opener!.color);
    const effectiveBackground = background.channels.map(channel => channel * background.alpha + underlay * (1 - background.alpha));
    const effectiveForeground = foreground.channels.map((channel, index) => channel * foreground.alpha + effectiveBackground[index] * (1 - foreground.alpha));
    return { underlay, background: `rgb(${effectiveBackground.join(', ')})`, foreground: `rgb(${effectiveForeground.join(', ')})`, ratio: contrastRatio(`rgb(${effectiveForeground.join(', ')})`, `rgb(${effectiveBackground.join(', ')})`) };
  }) : [];
  const sample = { phase, ...snapshot, contrastBounds };
  console.log('RECOMMENDATION_REVIEW', JSON.stringify(sample));
  await testInfo.attach(`recommendation-review-${phase}.json`, { body: JSON.stringify(sample, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath(`recommendation-review-${phase}.png`) });
  return sample;
}

test('반복 실수 추천을 포인터·Enter·Space로 열면 정확한 세션·유형·상세로 이어지고 설정은 시작하지 않는다', async ({ page, hasTouch }, testInfo) => {
  const errors = recommendationErrors(page);
  const before = await installRecommendationRecords(page, recommendationRecords());
  const opener = page.getByRole('button', { name: '추천한 실수 먼저 보기', exact: true });
  await expect(page.locator('#coach-title')).toContainText('반복된 비기는 패 선택');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 360 }]) {
    await page.setViewportSize(viewport);
    for (const method of ['pointer', 'Enter', 'Space'] as const) {
      await expect(opener).toBeVisible();
      await opener.scrollIntoViewIfNeeded();
      const phase = `${viewport.width}-${method}`;
      const layout = await captureRecommendationReview(page, testInfo, `${phase}-button`);
      expect(layout.opener?.describedBy).toBe('coach-title');
      expect(layout.opener?.box).toMatchObject({ height: expect.any(Number), width: expect.any(Number) });
      expect(layout.opener!.box!.height).toBeGreaterThanOrEqual(44);
      expect(layout.opener!.box!.width).toBeGreaterThanOrEqual(44);
      expect(layout.opener!.box!.x).toBeGreaterThanOrEqual(0);
      expect(layout.opener!.box!.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.opener!.box!.y).toBeGreaterThanOrEqual(0);
      expect(layout.opener!.box!.bottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.viewport.scrollWidth).toBeLessThanOrEqual(layout.viewport.clientWidth);
      expect(layout.opener!.backgroundImage).toBe('none');
      expect(layout.opener!.ancestorOpacities.every(opacity => opacity === 1)).toBe(true);
      for (const color of layout.contrastBounds) expect(color.ratio).toBeGreaterThanOrEqual(4.5);
      for (const [index, action] of layout.actions.entries()) {
        expect(action.box.x).toBeGreaterThanOrEqual(0);
        expect(action.box.right).toBeLessThanOrEqual(viewport.width);
        for (const other of layout.actions.slice(index + 1)) expect(Math.min(action.box.right, other.box.right) - Math.max(action.box.x, other.box.x) > 1 && Math.min(action.box.bottom, other.box.bottom) - Math.max(action.box.y, other.box.y) > 1).toBe(false);
      }
      if (method === 'pointer') {
        // Leave focus on another real control before pointer/touch activation.
        await page.locator('.hero-primary').focus();
        await expect(opener).not.toBeFocused();
        if (hasTouch) await opener.tap(); else await opener.click();
      } else {
        await opener.focus();
        await page.keyboard.press(method);
      }
      const dialog = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '복습 센터 닫기', exact: true })).toBeFocused();
      const opened = await captureRecommendationReview(page, testInfo, `${phase}-opened`);
      expect(opened.dialog).toMatchObject({ empty: false, session: representativeId, errorCode: 'rps-tie', ids: [representativeAttemptId], selectedIds: [representativeAttemptId], detail: `${representativeId}에 보관된 2번 문제`, status: '현재 표시 1개 · 저장된 상세 9개' });
      await expect(dialog.getByRole('combobox', { name: '세션·비교 기준', exact: true })).toHaveValue(representativeId);
      await expect(dialog.getByRole('combobox', { name: '복습 유형', exact: true })).toHaveValue('rps-tie');
      await expect(dialog.getByRole('option', { name: /recommended-rps-latest 2번/ })).toHaveAttribute('aria-selected', 'true');
      expect(opened.storage).toEqual(before);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const closed = await captureRecommendationReview(page, testInfo, `${phase}-closed`);
      expect(closed.active).toMatchObject({ connected: true, inert: false, ariaHidden: false, className: 'hero-guide recommendation-review' });
      await expect(opener).toBeFocused();
      expect(closed.storage).toEqual(before);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: '설정하고 시작', exact: true }).click();
  const stage = page.locator('.stage-panel[data-game="rps"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole('button', { name: '게임 바꾸기', exact: true })).toBeFocused();
  const intro = await captureRecommendationReview(page, testInfo, 'settings-intro');
  expect(intro.stage).toEqual({ gameId: 'rps', intro: 1, preparations: 0, workspaces: 0, results: 0 });
  expect(intro.storage).toEqual(before);
  await stage.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await expect(stage).toHaveCount(0);
  expect(await recommendationStorage(page)).toEqual(before);
  expect(errors).toEqual([]);
});

for (const scenario of ['single-error-session', 'unpracticed-priority'] as const) {
  test(`반복 실수 바로보기는 ${scenario} 추천에 나타나지 않는다`, async ({ page }, testInfo) => {
    const errors = recommendationErrors(page);
    const before = await installRecommendationRecords(page, recommendationRecords({ repeated: scenario !== 'single-error-session', allGames: scenario !== 'unpracticed-priority' }));
    const snapshot = await captureRecommendationReview(page, testInfo, scenario);
    expect(snapshot.opener).toBeNull();
    await expect(page.getByRole('button', { name: '추천한 실수 먼저 보기', exact: true })).toHaveCount(0);
    await expect(page.locator('#coach-title')).toContainText(scenario === 'unpracticed-priority' ? `${getGame('number').title}, 아직 만들지 않은 기록` : '가장 오래 쉰 감각');
    expect(snapshot.storage).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('반복 실수 추천의 대표 세션에 통계만 남아도 유형과 정리된 상세 안내를 보존한다', async ({ page }, testInfo) => {
  const errors = recommendationErrors(page);
  const before = await installRecommendationRecords(page, recommendationRecords({ summaryOnly: true }));
  const opener = page.getByRole('button', { name: '추천한 실수 먼저 보기', exact: true });
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '복습 센터 닫기', exact: true })).toBeFocused();
  const opened = await captureRecommendationReview(page, testInfo, 'summary-only-opened');
  expect(opened.dialog).toMatchObject({ session: representativeId, errorCode: 'rps-tie', ids: [], selectedIds: [], status: '현재 표시 0개 · 저장된 상세 0개 · 상세 9개가 정리되었습니다.' });
  await expect(dialog.getByRole('combobox', { name: '세션·비교 기준', exact: true })).toHaveValue(representativeId);
  await expect(dialog.getByRole('combobox', { name: '복습 유형', exact: true })).toHaveValue('rps-tie');
  await expect(dialog.locator('.review-list-empty')).toContainText('오래된 세션의 통계만 보관되어 있습니다.');
  await expect(dialog.locator('.review-empty-copy')).toHaveText('왼쪽에서 복습할 시도를 선택하세요.');
  expect(opened.storage).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const closed = await captureRecommendationReview(page, testInfo, 'summary-only-closed');
  await expect(opener).toBeFocused();
  expect(closed.storage).toEqual(before);
  expect(errors).toEqual([]);
});

test('추천 복습을 연 상태에서 다른 탭이 실제 기록을 삭제하면 빈 상태와 홈 초점으로 안전하게 돌아온다', async ({ page, context, hasTouch }, testInfo) => {
  const errors = recommendationErrors(page);
  const records = recommendationRecords();
  await installRecommendationRecords(page, records);
  const opener = page.getByRole('button', { name: '추천한 실수 먼저 보기', exact: true });
  if (hasTouch) await opener.tap(); else await opener.click();
  await expect(page.getByRole('dialog', { name: '내 실수 복습', exact: true })).toBeVisible();
  const initial = await captureRecommendationReview(page, testInfo, 'peer-before-delete');
  expect(initial.dialog).toMatchObject({ session: representativeId, errorCode: 'rps-tie', selectedIds: [representativeAttemptId] });
  const peer = await context.newPage();
  const peerErrors = recommendationErrors(peer);
  await peer.goto('/');
  await expect(peer.locator('.header-status b')).toHaveText(String(records.length));
  await peer.locator('.records-data-button').click();
  const data = peer.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.getByRole('button', { name: '전체 기록 삭제', exact: true }).click();
  await expect(data).toContainText(`${records.length}개 기록을 삭제할까요?`);
  await expect(data.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await data.getByRole('button', { name: '삭제 확정', exact: true }).click();
  await expect(data).toContainText('모두 삭제했습니다');
  const empty = page.getByRole('dialog', { name: '복습 센터', exact: true });
  await expect(empty).toBeVisible();
  await expect(page.locator('.header-status b')).toHaveText('0');
  const deleted = await captureRecommendationReview(page, testInfo, 'peer-deleted-empty');
  expect(deleted.opener).toBeNull();
  expect(deleted.dialog).toMatchObject({ empty: true });
  await expect(empty).toContainText('아직 문항별 복습 기록이 없습니다.');
  const generation = deleted.storage[recommendationGenerationKey];
  expect(generation).not.toBe(recommendationGeneration);
  expect(generation).not.toBeNull();
  expect(JSON.parse(deleted.storage[`nineflow-practice-results-v4:${generation}`]!)).toEqual({ version: 4, generation, results: [] });
  expect(deleted.storage[recommendationStorageKey]).toBeUndefined();
  await empty.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(empty).toHaveCount(0);
  const closed = await captureRecommendationReview(page, testInfo, 'peer-deleted-closed');
  expect(closed.active).toMatchObject({ connected: true, inert: false, ariaHidden: false, homePrimary: true });
  await expect(page.locator('.hero-primary')).toBeFocused();
  await expect(page.locator('.site-shell > [inert]')).toHaveCount(0);
  await page.keyboard.press('Tab');
  const tabbed = await captureRecommendationReview(page, testInfo, 'peer-deleted-tabbed');
  expect(tabbed.active).toMatchObject({ connected: true, inert: false, ariaHidden: false, insideHome: true, visible: true });
  expect(tabbed.active.tag).not.toBe('BODY');
  expect(tabbed.storage).toEqual(deleted.storage);
  expect(await recommendationStorage(peer)).toEqual(deleted.storage);
  await peer.close();
  expect(errors).toEqual([]);
  expect(peerErrors).toEqual([]);
});
