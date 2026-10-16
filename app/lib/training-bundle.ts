import { games, type GameId } from './game-data.ts';

export type TrainingBundleTicket = {
  plan: number;
  launch: number;
  index: number;
  gameId: GameId;
};

export type TrainingBundle = {
  id: number;
  games: GameId[];
  completed: number;
  launch: TrainingBundleTicket | null;
};

export function createTrainingBundle(id: number, gameIds: readonly GameId[]): TrainingBundle | null {
  if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(gameIds) || gameIds.length < 2 || gameIds.length > 3) return null;
  const selected = [...gameIds];
  if (new Set(selected).size !== selected.length || selected.some(id => !games.some(game => game.id === id))) return null;
  return { id, games: selected, completed: 0, launch: null };
}

// 호출자는 묶음·실행 ID를 취소 후에도 재사용하지 않고 새 값을 발급한다.
export function launchTrainingBundle(bundle: TrainingBundle, launchId: number): TrainingBundle {
  if (bundle.launch || bundle.completed >= bundle.games.length || !Number.isSafeInteger(launchId) || launchId <= 0) return bundle;
  return {
    ...bundle,
    launch: { plan: bundle.id, launch: launchId, index: bundle.completed, gameId: bundle.games[bundle.completed] },
  };
}

export function completeTrainingBundle(bundle: TrainingBundle, ticket: TrainingBundleTicket): TrainingBundle {
  const current = bundle.launch;
  if (!current || current.plan !== ticket.plan || current.launch !== ticket.launch || current.index !== ticket.index || current.gameId !== ticket.gameId) return bundle;
  return { ...bundle, completed: bundle.completed + 1, launch: null };
}

export function clearTrainingBundleLaunch(bundle: TrainingBundle): TrainingBundle {
  return bundle.launch ? { ...bundle, launch: null } : bundle;
}
