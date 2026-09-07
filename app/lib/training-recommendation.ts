import type { GameId, SessionResult } from './game-data';

export const onboardingGameOrder: readonly GameId[] = [
  'rps', 'number', 'count', 'rotation', 'potion', 'mouse', 'appointment', 'path', 'nback',
];

export type RecommendationReason = 'first-session' | 'unpracticed' | 'recurring-error' | 'least-recent';

export type RecommendationError = {
  gameId: GameId;
  label: string;
  count: number;
  sessionCount: number;
};

export type TrainingRecommendation = {
  gameId: GameId;
  reason: RecommendationReason;
  error?: RecommendationError;
};

function completedAt(result: SessionResult) {
  const value = Date.parse(result.completedAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** Picks a transparent next exercise without treating the latest click or a
 * single noisy result as a personalised weakness. */
export function chooseTrainingRecommendation(
  results: readonly SessionResult[],
  recurringErrors: readonly RecommendationError[],
  availableGames: readonly GameId[] = onboardingGameOrder,
): TrainingRecommendation {
  const available = new Set(availableGames);
  const fallback = onboardingGameOrder.find((gameId) => available.has(gameId)) ?? availableGames[0] ?? 'rps';
  if (!results.length) return { gameId: fallback, reason: 'first-session' };

  const practiced = new Set(results.map((result) => result.gameId));
  const unpracticed = onboardingGameOrder.find((gameId) => available.has(gameId) && !practiced.has(gameId));
  if (unpracticed) return { gameId: unpracticed, reason: 'unpracticed' };

  const repeated = recurringErrors.find((error) => available.has(error.gameId) && error.sessionCount >= 2 && error.count >= 2);
  if (repeated) return { gameId: repeated.gameId, reason: 'recurring-error', error: repeated };

  const lastPlayed = new Map<GameId, number>();
  results.forEach((result) => lastPlayed.set(result.gameId, Math.max(lastPlayed.get(result.gameId) ?? Number.NEGATIVE_INFINITY, completedAt(result))));
  const leastRecent = [...availableGames].sort((left, right) => (lastPlayed.get(left) ?? Number.NEGATIVE_INFINITY) - (lastPlayed.get(right) ?? Number.NEGATIVE_INFINITY))[0] ?? fallback;
  return { gameId: leastRecent, reason: 'least-recent' };
}
