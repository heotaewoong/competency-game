import { games, type SessionResult } from './game-data.ts';
import { createPracticeResultsBackup, type PracticeResultsBackup } from './practice-backup.ts';
import { getResultMode } from './result-comparison.ts';
import { formatResultScore, resultErrorLabel, resultScoreLabel } from './result-display.ts';

const modeLabels = { practice: '연습 모드', simulation: '실전형 연습', unknown: '설정 정보 없음' };

function csvCell(value: string | number) {
  const text = String(value);
  // This is a viewing export, not an import format; keep formula-prefixed cells literal.
  const literal = /^\s*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text) ? `\t${text}` : text;
  return `"${literal.replaceAll('"', '""')}"`;
}

export function createPracticeSummaryCsv(results: readonly SessionResult[]) {
  // Reuse the backup boundary instead of accepting partial or malformed records.
  const backup: PracticeResultsBackup = JSON.parse(createPracticeResultsBackup(results));
  const rows: (string | number)[][] = [[
    '완료 시각(UTC)', '게임', '모드', '점수 지표', '점수(%)',
    '시간 지표', '중앙시간(ms)', '오류 지표', '오류 수', '훈련 설정(JSON)',
  ]];
  for (const result of backup.results) {
    rows.push([
      new Date(result.completedAt).toISOString(), games.find(game => game.id === result.gameId)!.title,
      modeLabels[getResultMode(result)], resultScoreLabel(result), formatResultScore(result) === '—' ? '' : result.accuracy,
      result.gameId === 'path' ? '경로 연결 중앙시간' : '중앙 반응', result.medianRt || '',
      resultErrorLabel(result), result.errors, JSON.stringify(result.detail ?? {}),
    ]);
  }
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
