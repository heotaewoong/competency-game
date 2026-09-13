import type { GameId } from './game-data';

export const RPS_ASSET_PATHS = Object.freeze({
  scissors: '/assets/rps/scissors.svg',
  rock: '/assets/rps/rock.svg',
  paper: '/assets/rps/paper.svg',
} as const);

/** Assets whose absence would make the home materially unusable. */
export const ESSENTIAL_ASSET_PATHS = Object.freeze([
  '/icon.svg',
  '/assets/mori-coach-hero-v2-800.webp',
] as const);

const GAME_ASSET_PATHS: Partial<Record<GameId, readonly string[]>> = {
  appointment: ['/assets/appointment/food-sprite-v1.webp'],
  rps: Object.values(RPS_ASSET_PATHS),
};

/** Only verify assets needed by the current surface instead of downloading every game's media. */
export function essentialAssetPathsFor(gameId?: GameId) {
  return [...ESSENTIAL_ASSET_PATHS, ...(gameId ? GAME_ASSET_PATHS[gameId] ?? [] : [])];
}
