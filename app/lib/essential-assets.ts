export const RPS_ASSET_PATHS = Object.freeze({
  scissors: '/assets/rps/scissors.svg',
  rock: '/assets/rps/rock.svg',
  paper: '/assets/rps/paper.svg',
} as const);

/** Assets whose absence would make the home or a game materially unusable. */
export const ESSENTIAL_ASSET_PATHS = Object.freeze([
  '/icon.svg',
  '/assets/mori-coach-hero-v2-800.webp',
  '/assets/appointment/food-sprite-v1.webp',
  ...Object.values(RPS_ASSET_PATHS),
] as const);
