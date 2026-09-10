import type { GameId, SessionResult } from './game-data';

export type ResultMode = 'practice' | 'simulation' | 'unknown';
export const SIMULATION_PRESET_VERSION = 'legacy-training-v2-2026-09';
type ComparisonDetailKey =
  | 'quantity' | 'paceMs' | 'practiceFocus' | 'evidenceHint' | 'scoringVersion'
  | 'rotationContent' | 'rotationLetters' | 'rotationTargetIds' | 'previewUsed'
  | 'appointmentRounds' | 'guidedPacing'
  | 'nbackTask' | 'nbackGroupSetting' | 'nbackProgression' | 'nbackNameLabels' | 'nbackMnemonics'
  | 'accessibilityProfile'
  | 'simulationPresetVersion';

const comparisonDetailKeys: readonly ComparisonDetailKey[] = [
  'quantity', 'paceMs', 'practiceFocus', 'evidenceHint', 'scoringVersion',
  'rotationContent', 'rotationLetters', 'rotationTargetIds', 'previewUsed',
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
  rotation: ['rotationContent', 'rotationLetters', 'rotationTargetIds', 'previewUsed'],
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
  if (key === 'quantity' || key === 'paceMs') return typeof value === 'number' && Number.isFinite(value);
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
