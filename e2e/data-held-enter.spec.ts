import { expect, test } from '@playwright/test';

for (const entry of ['records', 'footer'] as const) {
  for (const action of ['export', 'csv', 'clear'] as const) {
    test(`${entry} 백업 창: 유지된 Enter는 ${action === 'export' ? '백업을 중복 다운로드하지 않는다' : action === 'csv' ? 'CSV 요약을 중복 다운로드하지 않는다' : '삭제 확인을 자동 취소하지 않는다'}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        localStorage.setItem('nineflow-practice-results-v2', JSON.stringify([{
          id: 'held-enter-backup', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
          accuracy: 80, medianRt: 720, stability: 74, errors: 2,
        }]));
        const state = window as Window & { __backupDownloads?: number };
        state.__backupDownloads = 0;
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download.startsWith('nineflow-practice-backup-') || this.download.startsWith('nineflow-practice-summary-')) {
            state.__backupDownloads! += 1;
            return; // Count the real export path without creating downloaded files.
          }
          originalClick.call(this);
        };
      });
      await page.goto('/');
      await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
      const opener = entry === 'records'
        ? page.locator('.records-data-button')
        : page.getByRole('button', { name: '기록 백업·복원', exact: true });
      await opener.press('Enter');
      const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
      await expect(dialog.getByRole('button', { name: '내 기록 백업·복원 닫기' })).toBeFocused();
      await expect(dialog).toContainText('현재 기록 1개');
      const generation = await page.evaluate(() => localStorage.getItem('nineflow-practice-results-generation-v1'));
      const trigger = dialog.getByRole('button', { name: action === 'export' ? 'JSON 백업 받기' : action === 'csv' ? 'CSV 요약 받기' : '전체 기록 삭제', exact: true });
      await trigger.focus();
      await page.keyboard.down('Enter');
      if (action === 'clear') await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
      for (let repeat = 0; repeat < 3; repeat += 1) await page.keyboard.down('Enter');
      const downloads = () => page.evaluate(() => (window as Window & { __backupDownloads?: number }).__backupDownloads);
      if (action !== 'clear') expect(await downloads()).toBe(1);
      else await expect(dialog.getByRole('button', { name: '삭제 확정' })).toBeVisible();
      await page.keyboard.up('Enter');
      await page.keyboard.press('Enter');
      if (action !== 'clear') {
        expect(await downloads()).toBe(2);
        await page.keyboard.press('Space');
        expect(await downloads()).toBe(3);
        await trigger.click();
        expect(await downloads()).toBe(4);
      } else {
        await expect(dialog.getByRole('button', { name: '삭제 확정' })).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Space');
        await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
        await dialog.getByRole('button', { name: '취소', exact: true }).click();
        await expect(trigger).toBeFocused();
      }
      const stored = await page.evaluate((activeGeneration) => ({
        generation: localStorage.getItem('nineflow-practice-results-generation-v1'),
        results: JSON.parse(localStorage.getItem(`nineflow-practice-results-v4:${activeGeneration}`) ?? '{}').results,
      }), generation);
      expect(stored.generation).toBe(generation);
      expect(stored.results).toHaveLength(1);
      expect(stored.results[0].id).toBe('held-enter-backup');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}

test('예약된 창 첫 초점이 사용자가 옮긴 백업 버튼 초점을 뺏지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-results-v2', JSON.stringify([{
      id: 'delayed-dialog-focus', gameId: 'rps', completedAt: '2026-09-09T12:00:00.000Z',
      accuracy: 80, medianRt: 720, stability: 74, errors: 2,
    }]));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const nativeRequest = window.requestAnimationFrame;
    const nativeCancel = window.cancelAnimationFrame;
    const pending = new Map<number, FrameRequestCallback>();
    let nextHandle = -1;
    // Hold only the opening frame, then release it after the user moves focus.
    window.requestAnimationFrame = (callback) => { const id = nextHandle--; pending.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { if (!pending.delete(id)) nativeCancel.call(window, id); };
    (window as Window & { __releaseModalFrame?: () => void }).__releaseModalFrame = () => {
      window.requestAnimationFrame = nativeRequest;
      window.cancelAnimationFrame = nativeCancel;
      for (const callback of pending.values()) callback(performance.now());
      pending.clear();
    };
  });
  const opener = page.locator('.records-data-button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog.getByRole('button', { name: '내 기록 백업·복원 닫기' })).toBeFocused();
  const trigger = dialog.getByRole('button', { name: 'JSON 백업 받기', exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => (window as Window & { __releaseModalFrame?: () => void }).__releaseModalFrame!());
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const width of [390, 1280]) {
  test(`${width}px: CSV 요약을 키보드로 내려받고 점수 의미·저장값·초점을 보존한다`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const results = [
      { id: 'csv-rps', gameId: 'rps', completedAt: '2026-10-14T01:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2, detail: { sessionMode: '연습 모드', quantity: 9, paceMs: 4500, note: '=1+2,"문구"\n@SUM(1,2)' } },
      { id: 'csv-potion', gameId: 'potion', completedAt: '2026-10-14T02:00:00.000Z', accuracy: 0, medianRt: 0, stability: 0, errors: 0, detail: { sessionMode: '실전형 연습', scoringVersion: 'potion-evidence-v1', evidenceTrials: 0 } },
      { id: 'csv-path', gameId: 'path', completedAt: '2026-10-14T03:00:00.000Z', accuracy: 80, medianRt: 940, stability: 70, errors: 2, detail: { sessionMode: '실전형 연습' } },
      { id: 'csv-legacy', gameId: 'potion', completedAt: '2026-10-14T04:00:00.000Z', accuracy: 64, medianRt: 100, stability: 60, errors: 3 },
    ];
    await page.addInitScript(saved => {
      localStorage.setItem('nineflow-practice-results-generation-v1', 'csv-summary');
      localStorage.setItem('nineflow-practice-results-v4:csv-summary', JSON.stringify({ version: 4, generation: 'csv-summary', results: saved }));
    }, results);
    await page.goto('/');
    await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
    const before = await page.evaluate(() => ({ generation: localStorage.getItem('nineflow-practice-results-generation-v1'), raw: localStorage.getItem('nineflow-practice-results-v4:csv-summary') }));
    const opener = page.locator('.records-data-button');
    await opener.press('Enter');
    const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
    const trigger = dialog.getByRole('button', { name: 'CSV 요약 받기', exact: true });
    await trigger.focus();
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error('CSV download stream is unavailable');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const csv: string = bytes.toString('utf8');
    const rows = csv.slice(1, -2).split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replaceAll('""', '"')));
    const after = await page.evaluate(() => ({ generation: localStorage.getItem('nineflow-practice-results-generation-v1'), raw: localStorage.getItem('nineflow-practice-results-v4:csv-summary') }));
    console.log('PRACTICE_SUMMARY_CSV', JSON.stringify({ width, filename: download.suggestedFilename(), bom: [...bytes.subarray(0, 3)], rows, before, after }));
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/^nineflow-practice-summary-\d{4}-\d{2}-\d{2}\.csv$/);
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.length === 10)).toBe(true);
    expect(rows[0]).toEqual(['완료 시각(UTC)', '게임', '모드', '점수 지표', '점수(%)', '시간 지표', '중앙시간(ms)', '오류 지표', '오류 수', '훈련 설정(JSON)']);
    expect(rows[1].slice(1, 9)).toEqual(['마법약 만들기', '설정 정보 없음', '결과 적중률', '64', '중앙 반응', '100', '결과 미적중', '3']);
    expect(rows[2].slice(1, 9)).toEqual(['길 만들기', '실전형 연습', '첫 제출 최대득점률', '80', '경로 연결 중앙시간', '940', '첫 제출 최대득점 미달', '2']);
    expect(rows[3].slice(1, 9)).toEqual(['마법약 만들기', '실전형 연습', '근거 정렬률', '', '중앙 반응', '', '근거 반대·무응답', '0']);
    expect(rows[4].slice(0, 9)).toEqual(['2026-10-14T01:00:00.000Z', '가위바위보', '연습 모드', '정확도', '80', '중앙 반응', '720', '오류', '2']);
    expect(JSON.parse(rows[4][9])).toEqual(results[0].detail);
    expect(results.some(result => csv.includes(result.id))).toBe(false);
    expect(after).toEqual(before);
    await expect(trigger).toBeFocused();
    await expect(dialog.locator('.data-dialog-notice')).toContainText('연습 요약 4개를 CSV 파일로 내보냈습니다.');
    await expect(dialog).toContainText('복원·문항별 복습 보관은 JSON 백업');
    await expect(trigger).toHaveAccessibleDescription('UTF-8 · 시각은 UTC 기준 · 다른 모드·설정·점수 지표는 단순 비교하지 마세요. 복원·문항별 복습 보관은 JSON 백업을 사용하세요.');
    expect(await trigger.evaluate(button => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`csv-summary-${width}.png`) });
    await dialog.locator('[aria-labelledby="csv-title"]').screenshot({ path: testInfo.outputPath(`csv-summary-action-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('기록이 없으면 CSV 다운로드를 막고 JSON 가져오기·닫기는 유지한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const opener = page.locator('.records-data-button');
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await expect(dialog.getByRole('button', { name: 'CSV 요약 받기', exact: true })).toBeDisabled();
  await expect(dialog.locator('input[type="file"]')).toBeEnabled();
  await dialog.screenshot({ path: testInfo.outputPath('csv-empty.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('CSV 파일 생성이 차단되면 기록을 보존하고 새 요청으로 회복한다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('nineflow-practice-results-v2', JSON.stringify([{ id: 'csv-recovery', gameId: 'rps', completedAt: '2026-10-14T01:00:00.000Z', accuracy: 80, medianRt: 720, stability: 74, errors: 2 }]));
  });
  await page.goto('/');
  await expect(page.locator('#records')).toHaveAttribute('aria-busy', 'false');
  const saved = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
  await page.locator('.records-data-button').click();
  const dialog = page.getByRole('dialog', { name: '내 기록 백업·복원' });
  await page.evaluate(() => {
    const nativeCreate = URL.createObjectURL;
    URL.createObjectURL = () => { throw new Error('modeled CSV file creation denial'); };
    (window as Window & { __restoreCsvCreation?: () => void }).__restoreCsvCreation = () => { URL.createObjectURL = nativeCreate; };
  });
  const trigger = dialog.getByRole('button', { name: 'CSV 요약 받기', exact: true });
  await trigger.click();
  await expect(dialog.locator('.data-dialog-notice')).toHaveText('CSV 요약 파일을 만들지 못했습니다. 기록은 그대로입니다. 잠시 후 다시 시도해 주세요.');
  const afterFailure = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
  console.log('PRACTICE_SUMMARY_CSV_RECOVERY', JSON.stringify({ saved, afterFailure }));
  expect(afterFailure).toEqual(saved);
  await dialog.screenshot({ path: testInfo.outputPath('csv-creation-denied.png') });
  await page.evaluate(() => (window as Window & { __restoreCsvCreation?: () => void }).__restoreCsvCreation!());
  const downloadPromise = page.waitForEvent('download');
  await trigger.click();
  expect(await (await downloadPromise).failure()).toBeNull();
  await expect(dialog.locator('.data-dialog-notice')).toContainText('연습 요약 1개를 CSV 파일로 내보냈습니다.');
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])))).toEqual(saved);
  expect(errors).toEqual([]);
});
