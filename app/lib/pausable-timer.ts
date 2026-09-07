export type PausableTimerState = {
  remainingMs: number;
  startedAtMs: number | null;
};

export function createPausableTimer(durationMs: number): PausableTimerState {
  return { remainingMs: Math.max(0, durationMs), startedAtMs: null };
}

export function resumePausableTimer(state: PausableTimerState, nowMs: number): PausableTimerState {
  if (state.startedAtMs !== null || state.remainingMs <= 0) return state;
  return { ...state, startedAtMs: nowMs };
}

export function remainingPausableTime(state: PausableTimerState, nowMs: number): number {
  if (state.startedAtMs === null) return state.remainingMs;
  return Math.max(0, state.remainingMs - Math.max(0, nowMs - state.startedAtMs));
}

export function pausePausableTimer(state: PausableTimerState, nowMs: number): PausableTimerState {
  return { remainingMs: remainingPausableTime(state, nowMs), startedAtMs: null };
}

export type ActiveElapsedState = {
  startedAtMs: number;
  pausedAtMs: number | null;
  pausedTotalMs: number;
};

export function createActiveElapsed(nowMs: number, paused = false): ActiveElapsedState {
  return { startedAtMs: nowMs, pausedAtMs: paused ? nowMs : null, pausedTotalMs: 0 };
}

export function pauseActiveElapsed(state: ActiveElapsedState, nowMs: number): ActiveElapsedState {
  if (state.pausedAtMs !== null) return state;
  return { ...state, pausedAtMs: nowMs };
}

export function resumeActiveElapsed(state: ActiveElapsedState, nowMs: number): ActiveElapsedState {
  if (state.pausedAtMs === null) return state;
  return {
    ...state,
    pausedAtMs: null,
    pausedTotalMs: state.pausedTotalMs + Math.max(0, nowMs - state.pausedAtMs),
  };
}

export function activeElapsedTime(state: ActiveElapsedState, nowMs: number): number {
  const activePauseMs = state.pausedAtMs === null ? 0 : Math.max(0, nowMs - state.pausedAtMs);
  return Math.max(0, nowMs - state.startedAtMs - state.pausedTotalMs - activePauseMs);
}
