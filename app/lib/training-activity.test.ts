import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeTrainingActivity } from './training-activity.ts';

test('최근 7일 완료 횟수와 활동일을 세고 원본·기간 밖 기록을 변경하지 않는다', () => {
  const reference = new Date(2026, 9, 14, 12);
  const results = [14, 14, 13, 8, 7, 15].map(day => ({ completedAt: new Date(2026, 9, day, 12).toISOString() }));
  results.push({ completedAt: 'invalid' });
  const before = JSON.stringify(results);
  const activity = summarizeTrainingActivity(results, reference);
  assert.deepEqual(activity.days.map(day => day.sessions), [1, 0, 0, 0, 0, 1, 2]);
  assert.equal(activity.sessionCount, 4);
  assert.equal(activity.activeDayCount, 3);
  assert.equal(activity.period, '2026-10-08 ~ 2026-10-14');
  assert.equal(JSON.stringify(results), before);
});

test('월·연도 경계와 윤년을 달력 날짜로 계산한다', () => {
  assert.deepEqual(summarizeTrainingActivity([], new Date(2026, 0, 2)).days.map(day => day.key), [
    '2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
  ]);
  assert.deepEqual(summarizeTrainingActivity([], new Date(2024, 2, 1)).days.map(day => day.key), [
    '2024-02-24', '2024-02-25', '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01',
  ]);
});

test('같은 ISO 시각도 실행 환경의 현지 날짜로 분류한다', () => {
  const previousTimezone = process.env.TZ;
  try {
    const results = [{ completedAt: '2026-10-13T16:00:00.000Z' }];
    process.env.TZ = 'Asia/Seoul';
    assert.equal(summarizeTrainingActivity(results, new Date(2026, 9, 14)).days[6].sessions, 1);
    process.env.TZ = 'America/New_York';
    const activity = summarizeTrainingActivity(results, new Date(2026, 9, 14));
    assert.equal(activity.days[5].sessions, 1);
    assert.equal(activity.days[6].sessions, 0);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('일광 절약 시간으로 하루 길이가 달라도 7개 날짜를 중복 없이 표시한다', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const activity = summarizeTrainingActivity([8, 9].map(day => ({ completedAt: new Date(2026, 2, day, 0, 15).toISOString() })), new Date(2026, 2, 10, 12));
    assert.deepEqual(activity.days.map(day => day.key), ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
    assert.deepEqual(activity.days.map(day => day.sessions), [0, 0, 0, 0, 1, 1, 0]);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('완료 기록이 없는 기간도 빈 날짜 7개와 0회를 반환한다', () => {
  const activity = summarizeTrainingActivity([], new Date(2026, 9, 14));
  assert.equal(activity.days.length, 7);
  assert.ok(activity.days.every(day => day.sessions === 0));
  assert.equal(activity.sessionCount, 0);
  assert.equal(activity.activeDayCount, 0);
});

test('잘못된 기준 날짜는 임의 날짜로 대체하지 않는다', () => {
  assert.throws(() => summarizeTrainingActivity([], new Date('invalid')), RangeError);
});
