import type { GameId, SessionResult } from './game-data.ts';
import { getResultMode, type ResultMode } from './result-comparison.ts';
import { localDateKey } from './training-activity.ts';

export function getResultLocalDateKey(result: Pick<SessionResult, 'completedAt'>): string {
  const timestamp = Date.parse(result.completedAt);
  return Number.isFinite(timestamp) ? localDateKey(new Date(timestamp)) : '';
}

export function getResultHistoryDates(results: readonly Pick<SessionResult, 'completedAt'>[]): string[] {
  return [...new Set(results.map(result => Date.parse(result.completedAt))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)
    .map(timestamp => localDateKey(new Date(timestamp))))];
}

/** Filters the saved history without changing its order or comparison context. */
export function filterResultHistory(
  results: readonly SessionResult[],
  gameId: GameId | 'all',
  mode: ResultMode | 'all',
  completedDate = '',
) {
  return results.filter((result) => (gameId === 'all' || result.gameId === gameId)
    && (mode === 'all' || getResultMode(result) === mode)
    && (!completedDate || getResultLocalDateKey(result) === completedDate));
}

export function usesPotionEvidenceScore(result: SessionResult) {
  return result.gameId === 'potion' && result.detail?.scoringVersion === 'potion-evidence-v1';
}

export function resultScoreLabel(result: SessionResult) {
  if (usesPotionEvidenceScore(result)) return '근거 정렬률';
  if (result.gameId === 'potion') return '결과 적중률';
  if (result.gameId === 'path') return '첫 제출 최대득점률';
  return '정확도';
}

export function resultErrorLabel(result: SessionResult) {
  if (usesPotionEvidenceScore(result)) return '근거 반대·무응답';
  if (result.gameId === 'potion') return '결과 미적중';
  if (result.gameId === 'path') return '첫 제출 최대득점 미달';
  return '오류';
}

export function formatResultScore(result: SessionResult) {
  if (usesPotionEvidenceScore(result) && result.detail?.evidenceTrials === 0) return '—';
  return `${result.accuracy}%`;
}
