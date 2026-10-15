import type { SessionResult } from './game-data.ts';

export const TRAINING_ACTIVITY_GOAL_KEY = 'nineflow-training-activity-goal-v1';

export function parseTrainingActivityGoal(raw: string | null): number | null {
  if (raw === null || raw.length !== 1 || raw < '1' || raw > '7') return null;
  return Number(raw);
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Counts retained records by local calendar day, not elapsed 24-hour blocks. */
export function summarizeTrainingActivity(
  results: readonly Pick<SessionResult, 'completedAt'>[],
  referenceDate: Date,
) {
  if (!Number.isFinite(referenceDate.getTime())) throw new RangeError('활동 기준 날짜가 올바르지 않습니다.');
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - 6 + index);
    return {
      key: localDateKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: date.toLocaleDateString('ko-KR', { weekday: 'short' }),
      sessions: 0,
    };
  });
  for (const result of results) {
    const timestamp = Date.parse(result.completedAt);
    if (!Number.isFinite(timestamp)) continue;
    const key = localDateKey(new Date(timestamp));
    const day = days.find(item => item.key === key);
    if (day) day.sessions += 1;
  }
  return {
    days,
    sessionCount: days.reduce((total, day) => total + day.sessions, 0),
    activeDayCount: days.filter(day => day.sessions > 0).length,
    period: `${days[0].key} ~ ${days[6].key}`,
  };
}
