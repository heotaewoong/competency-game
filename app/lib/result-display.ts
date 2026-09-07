import type { SessionResult } from './game-data.ts';

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
