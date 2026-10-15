import { expect, test, type Page } from '@playwright/test';
import { games, type GameId, type SessionResult } from '../app/lib/game-data';
import { createPracticeResultsBackup, PRACTICE_RESULTS_BACKUP_FORMAT, PRACTICE_RESULTS_BACKUP_VERSION } from '../app/lib/practice-backup';
import { compactReviewPayload, REVIEW_SCHEMA_VERSION, type GenericReviewAttempt } from '../app/lib/review-data';

function reviewFilterFixtures(): SessionResult[] {
  const attempt = (id: string, index: number, errorCodes: string[]): GenericReviewAttempt => ({
    kind: 'generic', id, index, status: errorCodes.length ? 'error' : 'correct', errorCodes,
    title: id, prompt: `${id} 보관 문제`, expected: '기대 응답', selected: '저장된 응답', explanation: '가져온 복습 기록의 필터 검증용 예제입니다.',
  });
  const full = compactReviewPayload('rps', [attempt('loss-1', 0, ['rps-loss']), attempt('tie-1', 1, ['rps-tie']), attempt('loss-2', 2, ['rps-loss']), attempt('correct-1', 3, [])]);
  const sampled = compactReviewPayload('rps', [attempt('old-loss', 0, ['rps-loss']), attempt('old-correct', 4, [])]);
  sampled.summary = { attemptedCount: 5, correctCount: 1, neutralCount: 0, reviewPointCount: 4, errorCounts: { 'rps-loss': 2, 'rps-tie': 2 }, omittedDetailCount: 3, coverage: 'sampled' };
  const mouse = compactReviewPayload('mouse', [attempt('mouse-multiple', 0, ['mouse-miss', 'mouse-overconfidence']), attempt('mouse-correct', 1, []), { ...attempt('mouse-unscored', 2, []), status: 'neutral', scored: false }]);
  const detail = { sessionMode: '연습 모드', quantity: 4, paceMs: 4500, practiceFocus: 'full', guidedPacing: '설정 제한시간 적용' };
  return [
    { id: 'filter-full', gameId: 'rps', completedAt: '2026-10-14T12:00:00.000Z', accuracy: 25, medianRt: 720, stability: 70, errors: 3, detail, review: full },
    { id: 'filter-sampled', gameId: 'rps', completedAt: '2026-10-14T11:00:00.000Z', accuracy: 20, medianRt: 720, stability: 70, errors: 4, detail: { ...detail, quantity: 5 }, review: sampled },
    { id: 'filter-mouse', gameId: 'mouse', completedAt: '2026-10-14T10:00:00.000Z', accuracy: 50, medianRt: 720, stability: 70, errors: 1, detail: { ...detail, quantity: 2 }, review: mouse },
  ];
}

async function importReviewFilterRecords(page: Page, results: SessionResult[], expectedTotal: number) {
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  const backup = createPracticeResultsBackup(results, new Date('2026-10-14T13:00:00.000Z'));
  await data.locator('input[type="file"]').setInputFiles({ name: 'review-types.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(data.locator('.data-import-preview')).toContainText(`${results.length}개 기록`);
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText(`현재 총 ${expectedTotal}개`);
  await data.getByRole('button', { name: '닫기', exact: true }).click();
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 360 }]) {
  test(`복습 유형 ${viewport.width}x${viewport.height}: 가져온 상세만 분류하고 통계·저장·키보드 탐색을 보존한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await importReviewFilterRecords(page, reviewFilterFixtures(), 3);
    const readSaved = () => page.evaluate(() => {
      const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
      return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
    });
    const saved = await readSaved();
    expect(JSON.parse(saved.raw!).results).toHaveLength(3);
    const opener = page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ });
    await opener.click();
    const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
    const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
    const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
    const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
    const detail = review.locator('.review-attempt-detail');
    const observe = async (label: string) => {
      const view = await review.evaluate(element => {
        const select = element.querySelector<HTMLElement>('.review-attempt-filter select')!;
        const detail = element.querySelector<HTMLElement>('.review-attempt-detail')!;
        return {
          value: select.querySelector('option:checked')?.getAttribute('value') ?? null, options: Array.from(select.querySelectorAll('option'), item => item.getAttribute('value')), focused: document.activeElement === select,
          ids: Array.from(element.querySelectorAll('[role="listbox"] [role="option"]'), item => item.getAttribute('data-review-attempt-id')),
          selected: element.querySelector('[role="listbox"] [aria-selected="true"]')?.getAttribute('data-review-attempt-id') ?? null,
          status: element.querySelector('.review-attempt-filter [role="status"]')?.textContent,
          statistics: element.querySelector('.review-summary-list')?.textContent,
          font: Number.parseFloat(getComputedStyle(select).fontSize), height: select.getBoundingClientRect().height,
          selectWidth: select.getBoundingClientRect().width, detailWidth: detail.clientWidth, detailScrollWidth: detail.scrollWidth,
          documentWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth,
        };
      });
      console.log('REVIEW_TYPE_FILTER', JSON.stringify({ label, viewport, ...view }));
      await testInfo.attach(`review-type-${label}.json`, { body: JSON.stringify({ label, viewport, ...view }, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath(`review-type-${label}.png`) });
      expect(await filter.inputValue()).toBe(view.value);
      expect(await readSaved()).toEqual(saved);
      expect(view.height).toBeGreaterThanOrEqual(44);
      expect(view.font).toBeGreaterThanOrEqual(16);
      expect(view.selectWidth).toBeLessThanOrEqual(view.detailWidth);
      expect(view.detailScrollWidth).toBeLessThanOrEqual(view.detailWidth + 1);
      expect(view.documentScrollWidth).toBeLessThanOrEqual(view.documentWidth + 1);
      return view;
    };
    const initial = await observe('initial-loss');
    expect(initial.value).toBe('rps-loss');
    expect(initial.ids).toEqual(['loss-1', 'loss-2']);
    expect(initial.status).toBe('현재 표시 2개 · 저장된 상세 4개');
    await list.getByRole('option').first().press('ArrowDown');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-2');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await list.getByRole('option', { selected: true }).press('Home');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-1');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await list.getByRole('option', { selected: true }).press('End');
    await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', 'loss-2');
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
    await filter.focus();
    await filter.selectOption('rps-tie');
    const tie = await observe('tie');
    expect(tie.ids).toEqual(['tie-1']);
    expect(tie.focused).toBe(true);
    expect(tie.statistics).toBe(initial.statistics);
    await filter.selectOption('');
    await expect(list.getByRole('option')).toHaveCount(3);
    await filter.selectOption('rps-loss');
    await review.getByRole('button', { name: '오류·점검만', exact: true }).click();
    const all = await observe('all');
    expect(all.value).toBe('');
    expect(all.ids).toEqual(['loss-1', 'tie-1', 'loss-2', 'correct-1']);
    await session.selectOption('filter-sampled');
    await expect(filter).toHaveValue('');
    await filter.selectOption('rps-tie');
    const pruned = await observe('pruned-tie');
    expect(pruned.ids).toEqual([]);
    expect(pruned.status).toBe('현재 표시 0개 · 저장된 상세 2개 · 상세 3개가 정리되었습니다.');
    await expect(list).toContainText('선택한 유형의 보관 상세가 없습니다.');
    await expect(review.locator('.review-summary-list')).toContainText('2/5회');
    await list.getByRole('button', { name: '전체 시도 보기', exact: true }).click();
    await expect(filter).toHaveValue('');
    await expect(list.getByRole('option')).toHaveCount(2);
    await filter.selectOption('rps-loss');
    await review.locator('[data-review-game-id="mouse"]').click();
    const mouse = await observe('mouse-reset');
    expect(mouse.value).toBe('');
    expect(mouse.ids).toEqual(['mouse-multiple', 'mouse-unscored']);
    for (const code of ['mouse-miss', 'mouse-overconfidence']) {
      await filter.selectOption(code);
      const multi = await observe(code);
      expect(multi.ids).toEqual(['mouse-multiple']);
      expect(multi.selected).toBe('mouse-multiple');
    }
    await review.getByRole('button', { name: '오류·점검만', exact: true }).click();
    await expect(filter).toHaveValue('');
    await expect(list.getByRole('option')).toHaveCount(3);
    await detail.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await readSaved()).toEqual(saved);
    expect(errors).toEqual([]);
  });
}

test('복습 유형은 다른 탭의 정상 가져오기로 선택 세션이 정리된 뒤에도 새 세션에서 선택할 수 있다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await importReviewFilterRecords(page, reviewFilterFixtures(), 3);
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const initial = await readSaved();
  await page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ }).click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
  const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  await expect(session).toHaveValue('filter-full');
  await expect(filter).toHaveValue('rps-loss');
  const peer = await page.context().newPage();
  peer.on('pageerror', error => errors.push(error.message));
  peer.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await peer.goto('/');
    const prototype = reviewFilterFixtures()[0];
    const replacements = Array.from({ length: 100 }, (_, index) => ({ ...prototype, id: `peer-filter-${index}`, completedAt: new Date(Date.UTC(2026, 9, 14, 13, 0, index)).toISOString() }));
    await importReviewFilterRecords(peer, replacements, 100);
    await expect(session).toHaveValue('peer-filter-99');
    await expect(filter).toHaveValue('');
    const afterImport = await readSaved();
    const results = JSON.parse(afterImport.raw!).results as SessionResult[];
    expect(results).toHaveLength(100);
    expect(results.some(result => result.id === 'filter-full')).toBe(false);
    expect(afterImport.generation).toBe(initial.generation);
    await filter.selectOption('rps-tie');
    const observed = {
      session: await session.inputValue(), value: await filter.inputValue(),
      ids: await list.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-review-attempt-id'))),
      status: await review.locator('.review-attempt-filter [role="status"]').textContent(),
      generation: (await readSaved()).generation, retained: results.length, removedOriginal: !results.some(result => result.id === 'filter-full'), errors,
    };
    console.log('REVIEW_TYPE_PEER_PRUNE', JSON.stringify(observed));
    await testInfo.attach('review-type-peer-prune.json', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('review-type-peer-prune.png') });
    expect(observed.session).toBe('peer-filter-99');
    expect(observed.value).toBe('rps-tie');
    expect(observed.ids).toEqual(['tie-1']);
    expect(observed.status).toBe('현재 표시 1개 · 저장된 상세 4개');
    expect(await readSaved()).toEqual(afterImport);
    expect(errors).toEqual([]);
    await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
    await expect(review).toHaveCount(0);
  } finally {
    await peer.close();
  }
});

test('정상 백업의 예약된 오류 코드도 복습 안내·숫자 집계·유형 선택을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const codes = ['constructor', '__proto__', 'toString'];
  const attempts: GenericReviewAttempt[] = codes.map((code, index) => ({ kind: 'generic', id: `reserved-${index}`, index, status: 'error', errorCodes: [code], title: `가져온 문항 ${index + 1}`, prompt: '예약 코드 복습 예제', expected: '기대 응답', selected: '저장된 응답', explanation: '검증을 통과한 백업의 코드와 안내를 확인합니다.' }));
  const errorCounts = Object.fromEntries(codes.map(code => [code, 1]));
  const base = reviewFilterFixtures()[0];
  const results: SessionResult[] = [
    { ...base, id: 'reserved-full', completedAt: '2026-10-15T01:02:00.000Z', accuracy: 0, errors: 3, detail: { ...base.detail, quantity: 3 }, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts, summary: { attemptedCount: 3, correctCount: 0, neutralCount: 0, reviewPointCount: 3, errorCounts, omittedDetailCount: 0, coverage: 'full' } } },
    { ...base, id: 'reserved-sampled', completedAt: '2026-10-15T01:01:00.000Z', accuracy: 25, errors: 3, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts: [attempts[1]], summary: { attemptedCount: 4, correctCount: 1, neutralCount: 0, reviewPointCount: 3, errorCounts, omittedDetailCount: 3, coverage: 'sampled' } } },
  ];
  const raw = JSON.stringify({ format: PRACTICE_RESULTS_BACKUP_FORMAT, version: PRACTICE_RESULTS_BACKUP_VERSION, exportedAt: '2026-10-15T01:03:00.000Z', results });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.locator('input[type="file"]').setInputFiles({ name: 'reserved-review-codes.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(data.locator('.data-import-preview')).toContainText('2개 기록');
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText('현재 총 2개');
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const saved = await readSaved();
  const restored = JSON.parse(saved.raw!).results as SessionResult[];
  expect(restored).toHaveLength(2);
  for (const result of restored) expect(result.review?.summary.errorCounts).toEqual(errorCounts);
  const opener = page.locator('.home-review-ranking').getByRole('button', { name: /추가 확인이 필요한 응답/ }).first();
  await opener.click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const filter = review.getByRole('combobox', { name: '복습 유형', exact: true });
  const session = review.getByRole('combobox', { name: '세션·비교 기준', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  const observe = async (label: string) => {
    const snapshot = { label, session: await session.inputValue(), value: await filter.inputValue(), ids: await list.getByRole('option').evaluateAll(items => items.map(item => item.getAttribute('data-review-attempt-id'))), status: await review.locator('.review-attempt-filter [role="status"]').textContent(), labels: await review.locator('.review-error-tips b').allTextContents(), errors };
    console.log('REVIEW_RESERVED_CODES', JSON.stringify(snapshot));
    await testInfo.attach(`review-reserved-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`review-reserved-${label}.png`) });
    return snapshot;
  };
  await expect(session).toHaveValue('reserved-full');
  await expect(filter.locator('option')).toHaveCount(4);
  for (const [index, code] of codes.entries()) {
    await filter.selectOption(code);
    const current = await observe(`full-${index}`);
    expect(current.value).toBe(code);
    expect(current.ids).toEqual([`reserved-${index}`]);
    expect(current.labels).toEqual(['추가 확인이 필요한 응답']);
    expect(current.status).toBe('현재 표시 1개 · 저장된 상세 3개');
  }
  await session.selectOption('reserved-sampled');
  await filter.selectOption('constructor');
  const omitted = await observe('sampled-omitted');
  expect(omitted.value).toBe('constructor');
  expect(omitted.ids).toEqual([]);
  expect(omitted.status).toBe('현재 표시 0개 · 저장된 상세 1개 · 상세 3개가 정리되었습니다.');
  await expect(list).toContainText('선택한 유형의 보관 상세가 없습니다.');
  await filter.selectOption('__proto__');
  const retained = await observe('sampled-retained');
  expect(retained.value).toBe('__proto__');
  expect(retained.ids).toEqual(['reserved-1']);
  expect(retained.labels).toEqual(['추가 확인이 필요한 응답']);
  expect(await readSaved()).toEqual(saved);
  await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('정상 백업의 특수문자 문항 ID도 복습 선택·상세·키보드 초점과 저장값을 보존한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const ids = ['plain-control', 'a"b', 'a\\b', 'a\nb', 'a\u0000b'];
  const attempts: GenericReviewAttempt[] = ids.map((id, index) => ({ kind: 'generic', id, index, status: 'error', errorCodes: ['rps-loss'], title: `문항 ${index + 1}`, prompt: `보관 문제 ${index + 1}`, expected: '기대 응답', selected: '저장된 응답', explanation: '정상 백업의 문항 식별자를 그대로 보존합니다.' }));
  const base = reviewFilterFixtures()[0];
  const results: SessionResult[] = [{ ...base, id: 'quoted-attempt-ids', completedAt: '2026-10-15T02:00:00.000Z', accuracy: 0, errors: ids.length, detail: { ...base.detail, quantity: ids.length }, review: { version: REVIEW_SCHEMA_VERSION, gameId: 'rps', attempts, summary: { attemptedCount: ids.length, correctCount: 0, neutralCount: 0, reviewPointCount: ids.length, errorCounts: { 'rps-loss': ids.length }, omittedDetailCount: 0, coverage: 'full' } } }];
  const raw = JSON.stringify({ format: PRACTICE_RESULTS_BACKUP_FORMAT, version: PRACTICE_RESULTS_BACKUP_VERSION, exportedAt: '2026-10-15T02:01:00.000Z', results });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.records-data-button').click();
  const data = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  await data.locator('input[type="file"]').setInputFiles({ name: 'quoted-attempt-ids.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(data.locator('.data-import-preview')).toContainText('1개 기록');
  await data.getByRole('button', { name: '기존 기록과 합치기', exact: true }).click();
  await expect(data.locator('.data-dialog-notice')).toContainText('현재 총 1개');
  await data.getByRole('button', { name: '닫기', exact: true }).click();
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const saved = await readSaved();
  expect(JSON.parse(saved.raw!).results[0].review.attempts.map((attempt: GenericReviewAttempt) => attempt.id)).toEqual(ids);
  const opener = page.locator('.home-review-ranking').getByRole('button', { name: /지는 관계 선택/ });
  await opener.click();
  const review = page.getByRole('dialog', { name: '내 실수 복습', exact: true });
  const list = review.getByRole('listbox', { name: '저장된 시도 목록' });
  const observe = async (label: string) => {
    const view = await page.evaluate(() => {
      const dialog = document.querySelector('.review-dialog');
      const options = Array.from(dialog?.querySelectorAll('[role="listbox"] [role="option"]') ?? []);
      return {
        dialog: Boolean(dialog),
        ids: options.map(item => item.getAttribute('data-review-attempt-id')),
        selected: options.find(item => item.getAttribute('aria-selected') === 'true')?.getAttribute('data-review-attempt-id') ?? null,
        focused: document.activeElement?.getAttribute('data-review-attempt-id') ?? null,
        prompt: dialog?.querySelector('.generic-attempt-review h4')?.textContent ?? null,
      };
    });
    const snapshot = { label, ...view, errors: [...errors], savedUnchanged: JSON.stringify(await readSaved()) === JSON.stringify(saved) };
    console.log('REVIEW_IMPORTED_ID_NAVIGATION', JSON.stringify(snapshot));
    await testInfo.attach(`review-imported-id-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`review-imported-id-${label}.png`) });
    return snapshot;
  };
  await expect(list.getByRole('option')).toHaveCount(ids.length);
  const initial = await observe('initial-control');
  expect(initial.ids).toEqual(ids);
  expect(initial.selected).toBe(ids[0]);
  for (let index = 1; index < ids.length; index += 1) {
    let moved;
    try {
      await list.getByRole('option', { selected: true }).press('ArrowDown');
    } finally {
      moved = await observe(`arrow-${index}`);
    }
    expect(moved.dialog).toBe(true);
    expect(moved.ids).toEqual(ids);
    expect(moved.selected).toBe(ids[index]);
    expect(moved.prompt).toBe(`보관 문제 ${index + 1}`);
    expect(moved.savedUnchanged).toBe(true);
    expect(moved.errors).toEqual([]);
    await expect(list.getByRole('option', { selected: true })).toBeFocused();
  }
  await list.getByRole('option', { selected: true }).press('Home');
  await expect(list.getByRole('option', { selected: true })).toHaveAttribute('data-review-attempt-id', ids[0]);
  await expect(list.getByRole('option', { selected: true })).toBeFocused();
  await list.getByRole('option', { selected: true }).press('End');
  const last = await observe('end');
  expect(last.selected).toBe(ids.at(-1));
  await expect(list.getByRole('option', { selected: true })).toBeFocused();
  expect(await readSaved()).toEqual(saved);
  await review.getByRole('button', { name: '복습 센터 닫기', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

for (const width of [390, 1280]) {
  test(`기록 찾기 ${width}px: 오래된 기록의 게임·모드 필터와 더 보기는 저장값을 바꾸지 않는다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const generation = 'history-filter-regression';
      localStorage.setItem('nineflow-practice-results-generation-v1', generation);
      localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results: Array.from({ length: 12 }, (_, index) => ({
        id: `history-${index}`, gameId: index < 8 ? 'rps' : 'number',
        completedAt: new Date(Date.UTC(2026, 9, 1, 12 - index)).toISOString(),
        accuracy: 80, medianRt: 720, stability: 74, errors: 2,
        ...(index === 0 ? {} : { detail: { sessionMode: index % 2 ? 'practice' : 'simulation' } }),
      })) }));
    });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const saved = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:history-filter-regression'));
    const history = page.locator('.history-panel');
    await history.locator('summary').click();
    await expect(history.locator('.record-list > article')).toHaveCount(8);
    await history.getByRole('button', { name: /기록 더 보기/ }).click();
    await expect(history.locator('.record-list > article')).toHaveCount(12);
    await expect(history.getByRole('button', { name: /기록 더 보기/ })).toHaveCount(0);
    await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('number');
    await expect(history.locator('.record-list > article')).toHaveCount(4);
    await expect(history.locator('.record-list')).toContainText('숫자 누르기');
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('simulation');
    await expect(history.locator('.record-list > article')).toHaveCount(2);
    await expect(history.getByRole('status')).toHaveText('저장된 12개 중 2개 일치 · 2개 표시');
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('unknown');
    await expect(history.locator('.record-list > article')).toHaveCount(0);
    await expect(history.locator('.history-empty')).toBeVisible();
    await history.getByRole('button', { name: '필터 초기화', exact: true }).click();
    await expect(history.locator('.record-list > article')).toHaveCount(8);
    await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('unknown');
    await expect(history.locator('.record-list > article')).toHaveCount(1);
    await expect(history.locator('.record-list')).toContainText('가위바위보');
    await history.getByRole('combobox', { name: '게임', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(history.getByRole('combobox', { name: '모드', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:history-filter-regression'))).toBe(saved);
    await page.screenshot({ path: testInfo.outputPath(`history-filter-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const timezone of ['Asia/Seoul', 'America/New_York']) {
  test.describe(`훈련 활동 ${timezone}`, () => {
    test.use({ timezoneId: timezone });
    for (const width of [390, 1280]) {
      test(`${width}px: 현지 날짜 7일의 활동을 읽고 새로고침해도 저장값은 그대로다`, async ({ page }, testInfo) => {
        const referenceTime = Date.now();
        // Keep the fixture and date oracle on the same day across midnight.
        await page.clock.setFixedTime(referenceTime);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => {
          const now = new Date();
          const generation = 'training-activity-regression';
          const results = [0, 0, -1, -6, -7, 1].map((offset, index) => ({
            id: `activity-${index}`, gameId: 'rps',
            completedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, offset === -1 ? 23 : offset < 0 ? 12 : 0, offset === -1 ? 59 : 0).toISOString(),
            accuracy: 80, medianRt: 720, stability: 74, errors: 2,
          }));
          localStorage.setItem('nineflow-practice-results-generation-v1', generation);
          localStorage.setItem(`nineflow-practice-results-v4:${generation}`, JSON.stringify({ version: 4, generation, results }));
        });
        await page.goto('/');
        await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
        const saved = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'));
        const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
        const snapshot = await activity.evaluate(element => {
          const period = element.querySelector('.training-activity-heading p');
          return {
            wall: Date.now(),
            status: element.querySelector('[role="status"]')?.textContent,
            statusAtomic: element.querySelector('[role="status"]')?.getAttribute('aria-atomic'),
            period: { text: period?.textContent, live: period?.getAttribute('aria-live'), atomic: period?.getAttribute('aria-atomic') },
            days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
          };
        });
        console.log('TRAINING_ACTIVITY', JSON.stringify({ timezone, width, ...snapshot }));
        const expectedDates = await page.evaluate(() => {
          const now = new Date();
          return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          });
        });
        expect(snapshot.wall).toBe(referenceTime);
        expect(snapshot.period).toEqual({ text: `${expectedDates[0]} ~ ${expectedDates[6]} · 브라우저 현지 날짜 기준`, live: 'polite', atomic: 'true' });
        expect(snapshot.statusAtomic).toBe('true');
        expect(snapshot.days.map(day => day.date)).toEqual(expectedDates);
        expect(snapshot.days.map(day => day.count)).toEqual(['1회', '0회', '0회', '0회', '0회', '1회', '2회']);
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        await expect(activity.getByRole('list')).toHaveAttribute('role', 'list');
        await expect(activity.getByRole('listitem')).toHaveCount(7);
        for (const weekday of await activity.locator('time > span').all()) await expect(weekday).toHaveCSS('color', 'rgb(24, 33, 58)');
        await expect(activity).toContainText('브라우저 현지 날짜 기준');
        await expect(activity).toContainText('점수·실력 향상 지표가 아닙니다.');
        const refresh = activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true });
        await refresh.focus();
        await page.keyboard.press('Enter');
        await expect(refresh).toBeFocused();
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        expect(await activity.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))).toEqual(expectedDates);
        expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'))).toBe(saved);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await activity.screenshot({ path: testInfo.outputPath(`activity-${width}-${timezone.replace('/', '-')}.png`) });
        await page.screenshot({ path: testInfo.outputPath(`activity-page-${width}-${timezone.replace('/', '-')}.png`), fullPage: true });
        expect(errors).toEqual([]);

        const nextDay = await page.evaluate(() => {
          const now = new Date();
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
          return { time: date.getTime(), key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
        });
        await page.clock.setFixedTime(nextDay.time);
        const beforeRefresh = await activity.evaluate(element => ({
          wall: Date.now(),
          days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
        }));
        console.log('TRAINING_ACTIVITY_DAY_SHIFT', JSON.stringify({ timezone, width, referenceTime, nextDay, beforeRefresh }));
        expect(beforeRefresh.wall).toBe(nextDay.time);
        expect(beforeRefresh.days).toEqual(snapshot.days);
        await refresh.focus();
        await page.keyboard.press('Enter');
        const attemptedRefresh = await activity.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')));
        console.log('TRAINING_ACTIVITY_DAY_REFRESH_ATTEMPT', JSON.stringify({ timezone, width, attemptedRefresh }));
        await expect(activity.locator('time').last()).toHaveAttribute('datetime', nextDay.key);
        const refreshed = await activity.evaluate(element => {
          const period = element.querySelector('.training-activity-heading p');
          return {
            wall: Date.now(),
            statusAtomic: element.querySelector('[role="status"]')?.getAttribute('aria-atomic'),
            period: { text: period?.textContent, live: period?.getAttribute('aria-live'), atomic: period?.getAttribute('aria-atomic') },
            days: Array.from(element.querySelectorAll('li')).map(day => ({ date: day.getAttribute('data-date'), count: day.querySelector('b')?.textContent })),
          };
        });
        console.log('TRAINING_ACTIVITY_DAY_REFRESH', JSON.stringify({ timezone, width, referenceTime, nextDay, refreshed }));
        expect(refreshed.wall).toBe(nextDay.time);
        expect(refreshed.period).toEqual({ text: `${expectedDates[1]} ~ ${nextDay.key} · 브라우저 현지 날짜 기준`, live: 'polite', atomic: 'true' });
        expect(refreshed.statusAtomic).toBe('true');
        expect(refreshed.days.map(day => day.date)).toEqual([...expectedDates.slice(1), nextDay.key]);
        expect(refreshed.days.map(day => day.count)).toEqual(['0회', '0회', '0회', '0회', '1회', '2회', '1회']);
        await expect(refresh).toBeFocused();
        await expect(activity).toContainText(`${expectedDates[1]} ~ ${nextDay.key}`);
        await expect(activity.getByRole('status')).toHaveText('완료 세션 4회 · 기록이 있는 날 3일 / 7일');
        expect(await page.evaluate(() => localStorage.getItem('nineflow-practice-results-v4:training-activity-regression'))).toBe(saved);
        await activity.screenshot({ path: testInfo.outputPath(`activity-next-day-${width}-${timezone.replace('/', '-')}.png`) });
        expect(errors).toEqual([]);
      });
    }
  });
}

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

test('실제 가위바위보 두 번 완주 기록의 점수 변화·활동·필터·CSV와 새로고침이 함께 유지된다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const readSaved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    const raw = generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null;
    const envelope = raw ? JSON.parse(raw) : null;
    return { generation, raw, version: envelope?.version, envelopeGeneration: envelope?.generation, results: (envelope?.results ?? []) as SessionResult[] };
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  expect((await readSaved()).results).toEqual([]);
  await page.getByRole('button', { name: /가위바위보, 난이도 하, 설정 열기/ }).click();
  const stage = page.locator('section[data-game="rps"]');
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('15');
  for (let count = 0; count < 2; count += 1) await stage.getByRole('button', { name: '문제 수 줄이기', exact: true }).click();
  await expect(stage.getByLabel('문제 수 현재 값')).toHaveText('9');
  await stage.getByText('시간 제한 없이 연습', { exact: true }).click();
  await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
  await stage.getByRole('button', { name: /^설명·연습 시작/ }).click();
  const result = page.locator('.stage-result');
  const completions: SessionResult[] = [];
  for (let session = 0; session < 2; session += 1) {
    const workspace = page.locator('.game-workspace.game-rps');
    await expect(workspace.locator('.rps-board')).toBeVisible();
    await expect(workspace.locator('.guided-pacing-note')).toContainText('시간 제한 없이 연습 중');
    for (let question = 0; question < 9; question += 1) {
      await expect(workspace.locator('.workspace-progress > span')).toContainText(`${question + 1} / 9`);
      const choice = workspace.locator('.rps-actions button').filter({ hasText: '바위' });
      await expect(choice).toBeEnabled();
      await choice.click();
    }
    await expect(result.getByRole('heading', { name: '가위바위보 결과', exact: true })).toBeVisible();
    await expect.poll(async () => (await readSaved()).results.length).toBe(session + 1);
    const saved = (await readSaved()).results[0];
    completions.push(saved);
    const snapshot = { id: saved.id, completedAt: saved.completedAt, accuracy: saved.accuracy, errors: saved.errors, detail: saved.detail, reviewSummary: saved.review?.summary };
    console.log('RECORD_PROGRESS_REAL_COMPLETION', JSON.stringify(snapshot));
    await testInfo.attach(`record-progress-real-completion-${session + 1}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    expect(saved.gameId).toBe('rps');
    expect(saved.detail).toMatchObject({ quantity: 9, paceMs: 4500, trialCount: 9, responseCount: 9, practiceFocus: 'full', guidedPacing: '제한시간 없음', sessionMode: '연습 모드', visibilityPauses: 0 });
    expect(saved.detail?.accessibilityProfile).toMatch(/\S+/);
    expect(Number(saved.detail?.correctCount) + saved.errors).toBe(9);
    expect(saved.review?.summary.attemptedCount).toBe(9);
    await expect(result.locator('.result-metrics article').first().locator('b')).toHaveText(`${saved.accuracy}%`);
    if (session === 0) await result.getByRole('button', { name: '다시 연습', exact: true }).click();
  }
  const [previous, latest] = completions;
  expect(latest.id).not.toBe(previous.id);
  expect(Date.parse(latest.completedAt)).toBeGreaterThan(Date.parse(previous.completedAt));
  for (const key of ['quantity', 'paceMs', 'practiceFocus', 'guidedPacing', 'sessionMode', 'accessibilityProfile']) expect(latest.detail?.[key]).toEqual(previous.detail?.[key]);
  const beforeHistory = await readSaved();
  expect(beforeHistory.version).toBe(4);
  expect(beforeHistory.envelopeGeneration).toBe(beforeHistory.generation);
  await result.getByRole('button', { name: /^게임 목록/ }).click();
  await expect(page.locator('.stage-panel')).toHaveCount(0);
  const panel = page.getByRole('region', { name: '가위바위보 같은 조건 기록 변화', exact: true });
  await panel.locator('summary').focus();
  await page.keyboard.press('Enter');
  const snapshot = await panel.evaluate((element) => ({ heading: element.querySelector('h3')?.textContent, scores: Array.from(element.querySelectorAll('tbody td:last-child'), (cell) => cell.textContent), rows: Array.from(element.querySelectorAll('tbody tr'), (row) => row.textContent), open: element.querySelector('details')?.hasAttribute('open') }));
  console.log('RECORD_PROGRESS_REAL_HISTORY', JSON.stringify(snapshot));
  await testInfo.attach('record-progress-real-history.json', { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
  const change = Math.round((latest.accuracy - previous.accuracy) * 10) / 10;
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  expect(snapshot.scores).toEqual([`${latest.accuracy}%`, `${previous.accuracy}%`]);
  expect(snapshot.open).toBe(true);
  const card = page.locator('.game-record-grid > article').filter({ has: panel });
  await expect(card.locator('dl dd')).toHaveText([`${latest.accuracy}%`, `${Math.max(latest.accuracy, previous.accuracy)}%`, '2회']);
  await panel.screenshot({ path: testInfo.outputPath('record-progress-real-history.png') });
  expect(await readSaved()).toEqual(beforeHistory);
  const activity = page.getByRole('region', { name: '최근 7일 훈련 활동', exact: true });
  await activity.getByRole('button', { name: '오늘 기준으로 새로고침', exact: true }).press('Enter');
  const activitySnapshot = await activity.evaluate((element, saved) => {
    const dates = Array.from(element.querySelectorAll('li'), day => day.getAttribute('data-date'));
    const expected = dates.map(date => saved.filter(record => {
      const completed = new Date(record.completedAt);
      const key = `${completed.getFullYear()}-${String(completed.getMonth() + 1).padStart(2, '0')}-${String(completed.getDate()).padStart(2, '0')}`;
      return key === date;
    }).length);
    return { dates, expected, counts: Array.from(element.querySelectorAll('li b'), count => count.textContent), status: element.querySelector('[role="status"]')?.textContent };
  }, beforeHistory.results);
  console.log('PRACTICE_DASHBOARD_REAL_ACTIVITY', JSON.stringify(activitySnapshot));
  expect(activitySnapshot.dates).toHaveLength(7);
  expect(activitySnapshot.expected.reduce((sum, count) => sum + count, 0)).toBe(2);
  expect(activitySnapshot.counts).toEqual(activitySnapshot.expected.map(count => `${count}회`));
  await expect(activity.getByRole('status')).toHaveText(`완료 세션 2회 · 기록이 있는 날 ${activitySnapshot.expected.filter(count => count > 0).length}일 / 7일`);
  const history = page.locator('.history-panel');
  await history.locator('summary').press('Enter');
  await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('rps');
  await history.getByRole('combobox', { name: '모드', exact: true }).selectOption('practice');
  await expect(history.locator('.record-list > article')).toHaveCount(2);
  await expect(history.getByRole('status')).toHaveText('저장된 2개 중 2개 일치 · 2개 표시');
  await history.getByRole('combobox', { name: '게임', exact: true }).selectOption('number');
  await expect(history.locator('.record-list > article')).toHaveCount(0);
  await expect(history.locator('.history-empty')).toBeVisible();
  // A view filter must not hide records from progress, activity, or a full export.
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  await expect(activity.getByRole('status')).toHaveText(activitySnapshot.status!);
  const opener = page.locator('.records-data-button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원', exact: true });
  const csvButton = dialog.getByRole('button', { name: 'CSV 요약 받기', exact: true });
  const downloadPromise = page.waitForEvent('download');
  await csvButton.press('Enter');
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Actual practice CSV download stream is unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const csv: string = bytes.toString('utf8');
  const csvRows = csv.slice(1, -2).split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replaceAll('""', '"')));
  console.log('PRACTICE_DASHBOARD_REAL_CSV', JSON.stringify({ filename: download.suggestedFilename(), bom: [...bytes.subarray(0, 3)], rows: csvRows }));
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^nineflow-practice-summary-\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(csv.endsWith('\r\n')).toBe(true);
  expect(csvRows).toHaveLength(3);
  expect(csvRows.every(row => row.length === 10)).toBe(true);
  expect(csvRows[0]).toEqual(['완료 시각(UTC)', '게임', '모드', '점수 지표', '점수(%)', '시간 지표', '중앙시간(ms)', '오류 지표', '오류 수', '훈련 설정(JSON)']);
  for (const [index, saved] of beforeHistory.results.entries()) {
    expect(csvRows[index + 1].slice(0, 9)).toEqual([saved.completedAt, '가위바위보', '연습 모드', '정확도', String(saved.accuracy), '중앙 반응', saved.medianRt ? String(saved.medianRt) : '', '오류', String(saved.errors)]);
    expect(JSON.parse(csvRows[index + 1][9])).toEqual(saved.detail);
    expect(csv).not.toContain(saved.id);
  }
  await expect(dialog.locator('.data-dialog-notice')).toContainText('연습 요약 2개를 CSV 파일로 내보냈습니다.');
  await expect(csvButton).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath('practice-dashboard-real-csv.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await history.getByRole('button', { name: '필터 초기화', exact: true }).press('Enter');
  await expect(history.locator('.record-list > article')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('practice-dashboard-real-home.png'), fullPage: true });
  expect(await readSaved()).toEqual(beforeHistory);
  await page.reload();
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const restored = await readSaved();
  console.log('RECORD_PROGRESS_REAL_RELOAD', JSON.stringify({ generation: restored.generation, ids: restored.results.map((item) => item.id), scores: restored.results.map((item) => item.accuracy) }));
  expect(restored.generation).toBe(beforeHistory.generation);
  expect(restored.results).toEqual(beforeHistory.results);
  await expect(panel.getByRole('heading')).toHaveText(`직전 동일 조건 대비 ${change > 0 ? '+' : ''}${change}%p`);
  expect(errors).toEqual([]);

  const beforeScale = await readSaved();
  const summary = panel.locator('summary');
  await summary.press('Enter');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const observeScale = async (label: string) => {
    const view = await panel.evaluate((element) => {
      const summary = element.querySelector('summary')!;
      const table = element.querySelector('table')!;
      const font = (selector: string) => Number.parseFloat(getComputedStyle(element.querySelector(selector)!).fontSize);
      return {
        scale: document.documentElement.dataset.textScale,
        fonts: { heading: font('h3'), summary: font('summary'), table: font('table'), paragraph: font('p') },
        cellFonts: Array.from(element.querySelectorAll('th, td'), cell => Number.parseFloat(getComputedStyle(cell).fontSize)),
        heading: element.querySelector('h3')?.textContent,
        rows: Array.from(element.querySelectorAll('tbody tr'), row => row.textContent),
        open: element.querySelector('details')?.hasAttribute('open'),
        summaryFocused: document.activeElement === summary,
        summaryHeight: summary.getBoundingClientRect().height,
        panelClientWidth: element.clientWidth,
        panelScrollWidth: element.scrollWidth,
        tableWidth: table.getBoundingClientRect().width,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
      };
    });
    const saved = await readSaved();
    const snapshot = { label, ...view, generation: saved.generation, ids: saved.results.map(item => item.id), profiles: saved.results.map(item => item.detail?.accessibilityProfile) };
    console.log('RECORD_PROGRESS_TEXT_SCALE', JSON.stringify(snapshot));
    await testInfo.attach(`record-progress-text-scale-${label}.json`, { body: JSON.stringify(snapshot, null, 2), contentType: 'application/json' });
    await panel.screenshot({ path: testInfo.outputPath(`record-progress-text-scale-${label}.png`) });
    return { view, saved };
  };
  const standard = await observeScale('standard');
  const readinessOpener = page.locator('.readiness-banner button');
  const readiness = page.getByRole('dialog', { name: '응시 준비센터', exact: true });
  await readinessOpener.press('Enter');
  const largeButton = readiness.getByRole('button', { name: '큰 글자', exact: true });
  await expect(largeButton).toHaveAttribute('aria-pressed', 'false');
  await largeButton.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(largeButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(readiness).toHaveCount(0);
  await expect(readinessOpener).toBeFocused();
  await summary.press('Space');
  await expect(panel.locator('details')).not.toHaveAttribute('open', '');
  await summary.press('Space');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const large = await observeScale('large');
  await readinessOpener.press('Enter');
  const standardButton = readiness.getByRole('button', { name: '기본 크기', exact: true });
  await standardButton.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'standard');
  await expect(standardButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(readiness).toHaveCount(0);
  await expect(readinessOpener).toBeFocused();
  await summary.press('Space');
  await expect(panel.locator('details')).not.toHaveAttribute('open', '');
  await summary.press('Space');
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  const reset = await observeScale('reset');
  for (const observed of [standard, large, reset]) {
    expect(observed.saved).toEqual(beforeScale);
    expect(observed.view.rows).toEqual(standard.view.rows);
    expect(observed.view.heading).toBe(standard.view.heading);
    expect(observed.view.open).toBe(true);
    expect(observed.view.summaryFocused).toBe(true);
    expect(observed.view.summaryHeight).toBeGreaterThanOrEqual(44);
    expect(observed.view.panelScrollWidth).toBeLessThanOrEqual(observed.view.panelClientWidth + 1);
    expect(observed.view.documentScrollWidth).toBeLessThanOrEqual(observed.view.documentClientWidth + 1);
    expect(observed.view.tableWidth).toBeLessThanOrEqual(observed.view.panelClientWidth + 1);
  }
  expect(standard.view.scale).toBe('standard');
  expect(large.view.scale).toBe('large');
  expect(reset.view.scale).toBe('standard');
  expect(reset.view.fonts).toEqual(standard.view.fonts);
  expect(reset.view.cellFonts).toEqual(standard.view.cellFonts);
  expect(large.view.fonts.paragraph).toBeGreaterThan(standard.view.fonts.paragraph);
  for (const key of ['heading', 'summary'] as const) {
    expect(large.view.fonts[key], `large text ${key}`).toBeGreaterThan(standard.view.fonts[key]);
  }
  expect(standard.view.cellFonts).toHaveLength(6);
  expect(large.view.cellFonts).toHaveLength(standard.view.cellFonts.length);
  for (const [index, size] of large.view.cellFonts.entries()) {
    expect(size, `large text cell ${index}`).toBeGreaterThan(standard.view.cellFonts[index]);
  }
  expect(errors).toEqual([]);
});

test('9게임 시작 버튼은 현재 패널과 무관하게 각 모드의 실제 분량·시간을 알린다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const expected: Record<GameId, [string, string]> = {
    rotation: ['10문제 · 문제 제한 30초', '2단계 · 단계당 180초'],
    rps: ['15문항 · 문제 제한 4.5초', '30문항 · 문제 제한 4.5초'],
    appointment: ['한 사람 제시 3초', '4라운드 · 40문항 · 한 사람 제시 1초'],
    path: ['3문제 · 문제 제한 60초', '4문제 · 문제 제한 60초'],
    potion: ['42시행 · 응답 제한 7초', '100시행 · 응답 제한 3초'],
    nback: ['채점 20문항 · 준비 별도 · 고정 간격 3초', '채점 47문항 · 준비 별도 · 도형 간격 3초'],
    number: ['10문제 · 문제 제한 20초', '12문제 · 문제 제한 20초'],
    count: ['15문항 · 단어 제시 1초', '46문항 · 단어 제시 1초'],
    mouse: ['5라운드 · 생쥐 제시 1초', '20라운드 · 생쥐 제시 1초'],
  };
  const saved = () => page.evaluate(() => {
    const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
    return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
  });
  const before = await saved();
  for (const game of games) {
    await page.getByRole('button', { name: new RegExp(`${game.title}, 난이도`) }).click();
    const stage = page.locator(`section[data-game="${game.id}"]`);
    const practice = stage.getByRole('button', { name: /^설명·연습 시작/ });
    const simulation = stage.getByRole('button', { name: /^실전형 연습 시작/ });
    for (const mode of ['practice', 'simulation'] as const) {
      if (mode === 'simulation') await stage.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^실전형 연습/ }).press('Space');
      const snapshot = await stage.locator('.intro-start-options').evaluate(element => Array.from(element.querySelectorAll('button'), button => {
        const box = button.getBoundingClientRect();
        return { title: button.querySelector(':scope > span')?.textContent, text: button.querySelector(':scope > small')?.innerHTML, smallCount: button.querySelectorAll(':scope > small').length, selected: button.classList.contains('is-selected'), x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: button.clientWidth, scrollWidth: button.scrollWidth };
      }));
      console.log('START_SETTING_SUMMARY', JSON.stringify({ game: game.id, mode, snapshot }));
      await testInfo.attach(`start-summary-${game.id}-${mode}.json`, { body: JSON.stringify({ game: game.id, mode, snapshot }, null, 2), contentType: 'application/json' });
      await expect(practice.locator(':scope > small')).toContainText(expected[game.id][0]);
      await expect(simulation.locator(':scope > small')).toContainText(expected[game.id][1]);
      if (game.id === 'appointment') await expect(practice).toContainText('선택: 요일 · 위치 · 메뉴 · 미탑승 버스 · 총 12문항');
      expect(snapshot.map(item => item.title)).toEqual(['설명·연습 시작', '실전형 연습 시작']);
      expect(snapshot.map(item => item.selected)).toEqual([mode === 'practice', mode === 'simulation']);
      for (const button of snapshot) {
        expect(button.smallCount).toBe(1);
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.y).toBeGreaterThanOrEqual(0);
        expect(button.right).toBeLessThanOrEqual(320);
        expect(button.bottom).toBeLessThanOrEqual(568);
        expect(button.scrollWidth).toBeLessThanOrEqual(button.width + 1);
      }
      expect(await saved()).toEqual(before);
    }
    await stage.screenshot({ path: testInfo.outputPath(`start-summary-${game.id}.png`) });
    await stage.getByRole('button', { name: '실전형 연습 닫기', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

for (const target of ['practice', 'simulation'] as const) {
  test(`시작 요약 ${target}: 숨겨진 맞춤 설정을 보존하고 누른 버튼의 모드로 진입한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const open = () => page.getByRole('button', { name: /숫자 누르기, 난이도 하, 설정 열기/ }).click();
    await open();
    const stage = page.locator('section[data-game="number"]');
    await stage.getByRole('button', { name: '문제 수 늘리기', exact: true }).press('Enter');
    await stage.getByRole('button', { name: '문제 제한 늘리기', exact: true }).press('Enter');
    await stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
    await expect(stage.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('15문제 · 응답 제한 없음');
    await page.reload();
    await open();
    await expect(stage.getByRole('checkbox', { name: /시간 제한 없이 연습/ })).toBeChecked();
    await expect(stage.getByLabel('문제 수 현재 값', { exact: true })).toHaveText('15');
    await expect(stage.getByLabel('문제 제한 현재 값', { exact: true })).toHaveText('25초');
    const readSaved = () => page.evaluate(() => {
      const generation = localStorage.getItem('nineflow-practice-results-generation-v1');
      return { generation, raw: generation ? localStorage.getItem(`nineflow-practice-results-v4:${generation}`) : null };
    });
    const before = await readSaved();
    const modes = stage.getByRole('radiogroup', { name: '진행 방식', exact: true });
    if (target === 'practice') await modes.getByRole('radio', { name: /^실전형 연습/ }).press('Space');
    await expect(stage.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('15문제 · 응답 제한 없음');
    await expect(stage.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('12문제 · 문제 제한 20초');
    await stage.screenshot({ path: testInfo.outputPath(`start-summary-cross-${target}.png`) });
    await stage.getByRole('button', { name: target === 'practice' ? /^설명·연습 시작/ : /^실전형 연습 시작/ }).press('Enter');
    const workspace = page.locator('.game-workspace.game-number');
    await expect(workspace.locator('.number-board-pro')).toBeVisible();
    const snapshot = await workspace.evaluate(element => ({ mode: element.getAttribute('data-mode'), progress: element.querySelector('.workspace-progress span')?.textContent, guided: element.querySelector('.guided-pacing-note')?.textContent ?? null, deadline: element.querySelector('.time-strip')?.getAttribute('aria-valuemax') ?? null, selected: element.querySelectorAll('.number-board-pro button:disabled').length }));
    console.log('START_SETTING_CROSS_MODE', JSON.stringify({ target, ...snapshot }));
    await testInfo.attach(`start-summary-cross-${target}.json`, { body: JSON.stringify({ target, ...snapshot }, null, 2), contentType: 'application/json' });
    expect(snapshot.mode).toBe(target);
    expect(snapshot.progress).toBe(`1라운드 · 점등 숫자 · 1 / ${target === 'practice' ? 7 : 6} 문제`);
    expect(snapshot.selected).toBe(0);
    if (target === 'practice') {
      expect(snapshot.guided).toContain('시간 제한 없이 연습 중');
      expect(snapshot.deadline).toBeNull();
      await expect(workspace.locator('.time-strip')).toHaveCount(0);
    } else {
      expect(snapshot.guided).toBeNull();
      expect(snapshot.deadline).toBe('20000');
      await expect(workspace.locator('.time-strip')).toBeVisible();
    }
    await workspace.getByRole('button', { name: target === 'practice' ? '연습 닫기' : '실전형 연습 닫기', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '연습창 닫기', exact: true }).click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator('.record-summary')).toHaveCount(0);
    expect(await readSaved()).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('시작 요약은 N-back 빠른 전환보다 무시간제를 우선하고 약속의 선택 분량을 갱신한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: /도형 순서 기억하기, 난이도 상, 설정 열기/ }).click();
  const nback = page.locator('section[data-game="nback"]');
  const practice = nback.getByRole('button', { name: /^설명·연습 시작/ });
  await nback.locator('.practice-advanced-settings > summary').press('Enter');
  await nback.getByRole('radio', { name: /^응답 빠른 전환/ }).press('Space');
  await expect(practice).toContainText('채점 20문항 · 준비 별도 · 응답 후 빠른 전환 · 무응답 제한 3초');
  await nback.getByRole('button', { name: '문제 간격 늘리기', exact: true }).press('Enter');
  await expect(practice).toContainText('응답 후 빠른 전환 · 무응답 제한 3.5초');
  await nback.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
  await expect(practice).toContainText('채점 20문항 · 준비 별도 · 응답 제한 없음');
  await expect(practice).not.toContainText('응답 후 빠른 전환');
  await nback.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^실전형 연습/ }).press('Space');
  await expect(practice).toContainText('응답 제한 없음');
  await expect(nback.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('채점 47문항 · 준비 별도 · 도형 간격 3초');
  await nback.screenshot({ path: testInfo.outputPath('start-summary-nback-guided.png') });
  await nback.getByRole('radiogroup', { name: '진행 방식', exact: true }).getByRole('radio', { name: /^연습 모드/ }).press('Space');
  await nback.getByRole('checkbox', { name: /시간 제한 없이 연습/ }).press('Space');
  await expect(practice).toContainText('응답 후 빠른 전환 · 무응답 제한 3.5초');
  await nback.getByRole('button', { name: '연습 닫기', exact: true }).click();
  await page.getByRole('button', { name: /약속 정하기, 난이도 상, 설정 열기/ }).click();
  const appointment = page.locator('section[data-game="appointment"]');
  await appointment.getByRole('button', { name: '4라운드 미탑승 버스만 연습', exact: true }).press('Enter');
  await appointment.getByRole('button', { name: '라운드당 문항 늘리기', exact: true }).press('Enter');
  await expect(appointment.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('선택: 미탑승 버스 · 총 4문항');
  await appointment.getByRole('checkbox', { name: '요일 연습 포함', exact: true }).press('Space');
  await expect(appointment.getByRole('button', { name: /^설명·연습 시작/ })).toContainText('선택: 요일 · 미탑승 버스 · 총 8문항');
  await expect(appointment.getByRole('button', { name: /^실전형 연습 시작/ })).toContainText('4라운드 · 40문항 · 한 사람 제시 1초');
  await appointment.screenshot({ path: testInfo.outputPath('start-summary-appointment-selection.png') });
  expect(errors).toEqual([]);
});
