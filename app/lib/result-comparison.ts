import type { GameId, SessionResult } from './game-data';
import { formatResultScore } from './result-display.ts';

export type ResultMode = 'practice' | 'simulation' | 'unknown';
export const SIMULATION_PRESET_VERSION = 'public-rules-training-v4-2026-09';
type ComparisonDetailKey =
  | 'quantity' | 'paceMs' | 'practiceFocus' | 'evidenceHint' | 'scoringVersion'
  | 'rotationContent' | 'rotationLetters' | 'rotationTargetIds' | 'previewUsed' | 'rotationPhaseCount' | 'rotationPhaseDurationMs'
  | 'appointmentRounds' | 'guidedPacing'
  | 'nbackTask' | 'nbackGroupSetting' | 'nbackProgression' | 'nbackNameLabels' | 'nbackMnemonics'
  | 'accessibilityProfile'
  | 'simulationPresetVersion';

const comparisonDetailKeys: readonly ComparisonDetailKey[] = [
  'quantity', 'paceMs', 'practiceFocus', 'evidenceHint', 'scoringVersion',
  'rotationContent', 'rotationLetters', 'rotationTargetIds', 'previewUsed', 'rotationPhaseCount', 'rotationPhaseDurationMs',
  'appointmentRounds', 'guidedPacing',
  'nbackTask', 'nbackGroupSetting', 'nbackProgression', 'nbackNameLabels', 'nbackMnemonics',
  'accessibilityProfile',
  'simulationPresetVersion',
];

const practiceSpecificKeys: Record<GameId, readonly ComparisonDetailKey[]> = {
  rps: ['practiceFocus', 'guidedPacing'],
  rotation: ['rotationContent', 'rotationLetters', 'rotationTargetIds', 'previewUsed', 'guidedPacing'],
  appointment: ['appointmentRounds', 'guidedPacing'],
  path: ['practiceFocus', 'guidedPacing'],
  potion: ['practiceFocus', 'evidenceHint', 'scoringVersion', 'guidedPacing'],
  nback: ['nbackTask', 'nbackGroupSetting', 'nbackProgression', 'nbackNameLabels', 'nbackMnemonics', 'guidedPacing'],
  number: ['practiceFocus', 'guidedPacing'],
  count: ['practiceFocus', 'guidedPacing'],
  mouse: ['practiceFocus', 'guidedPacing'],
};

const simulationSpecificKeys: Partial<Record<GameId, readonly ComparisonDetailKey[]>> = {
  rotation: ['rotationContent', 'rotationLetters', 'rotationTargetIds', 'previewUsed', 'rotationPhaseCount', 'rotationPhaseDurationMs'],
  appointment: ['appointmentRounds'],
  nback: ['nbackTask', 'nbackGroupSetting', 'nbackProgression'],
  potion: ['scoringVersion'],
};

export function getResultMode(result: SessionResult): ResultMode {
  const value = result.detail?.sessionMode;
  if (typeof value !== 'string') return 'unknown';
  if (value.includes('실전') || value === 'simulation') return 'simulation';
  if (value.includes('연습') || value === 'practice') return 'practice';
  return 'unknown';
}

function hasUsableDetail(detail: Record<string, string | number>, key: ComparisonDetailKey) {
  const value = detail[key];
  if (key === 'quantity' || key === 'paceMs' || key === 'rotationPhaseCount' || key === 'rotationPhaseDurationMs') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string' && value.trim().length > 0;
}

/** Returns null when a legacy record lacks enough metadata for a fair claim
 * that another session used the same settings. */
export function getResultComparisonKey(result: SessionResult) {
  const mode = getResultMode(result);
  if (mode === 'unknown') return null;
  const detail = result.detail ?? {};
  if (typeof detail.visibilityPauses === 'number' && detail.visibilityPauses > 0) return null;
  const requiredKeys = mode === 'practice'
    ? (['quantity', 'paceMs', ...practiceSpecificKeys[result.gameId]] as const)
    : (['quantity', 'paceMs', 'simulationPresetVersion', ...(simulationSpecificKeys[result.gameId] ?? [])] as const);
  if (requiredKeys.some((key) => !hasUsableDetail(detail, key))) return null;

  return JSON.stringify([
    mode,
    ...comparisonDetailKeys.map((key) => detail[key] ?? null),
  ]);
}

/** Compare saved scores, not ability: randomized questions may still differ. */
export function getResultProgress(latest: SessionResult, results: readonly SessionResult[]) {
  const key = getResultComparisonKey(latest);
  const completedAt = Date.parse(latest.completedAt);
  if (key === null || !Number.isFinite(completedAt)) return null;
  const seen = new Set([latest.id]);
  const history = [latest, ...results
    .filter((result) => {
      const timestamp = Date.parse(result.completedAt);
      if (seen.has(result.id) || result.gameId !== latest.gameId || !Number.isFinite(timestamp) || timestamp > completedAt || getResultComparisonKey(result) !== key) return false;
      seen.add(result.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))];
  // Equal timestamps cannot establish which session came before the other.
  const previous = history.slice(1).find((result) => Date.parse(result.completedAt) < completedAt);
  const hasScore = (result: SessionResult) => Number.isFinite(result.accuracy) && result.accuracy >= 0 && result.accuracy <= 100 && formatResultScore(result) !== '—';
  const scores = history.filter(hasScore).map((result) => result.accuracy);
  return {
    history,
    previous,
    scoreChange: previous && hasScore(latest) && hasScore(previous) ? Math.round((latest.accuracy - previous.accuracy) * 10) / 10 : null,
    best: scores.length ? Math.max(...scores) : null,
  };
}
