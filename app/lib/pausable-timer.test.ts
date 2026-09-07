import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeElapsedTime,
  createActiveElapsed,
  createPausableTimer,
  pauseActiveElapsed,
  pausePausableTimer,
  remainingPausableTime,
  resumeActiveElapsed,
  resumePausableTimer,
} from './pausable-timer.ts';

test('pause preserves the exact remaining duration and resume continues from it', () => {
  const initial = resumePausableTimer(createPausableTimer(5_000), 1_000);
  const paused = pausePausableTimer(initial, 2_250);
  assert.equal(paused.remainingMs, 3_750);
  assert.equal(remainingPausableTime(paused, 20_000), 3_750);

  const resumed = resumePausableTimer(paused, 30_000);
  assert.equal(remainingPausableTime(resumed, 31_500), 2_250);
  assert.equal(remainingPausableTime(resumed, 35_000), 0);
});

test('timer state clamps invalid durations and never becomes negative', () => {
  assert.deepEqual(createPausableTimer(-10), { remainingMs: 0, startedAtMs: null });
  const running = resumePausableTimer(createPausableTimer(100), 500);
  assert.equal(remainingPausableTime(running, 900), 0);
  assert.deepEqual(pausePausableTimer(running, 900), { remainingMs: 0, startedAtMs: null });
});

test('active elapsed time excludes every paused interval', () => {
  const firstRun = createActiveElapsed(1_000);
  assert.equal(activeElapsedTime(firstRun, 1_500), 500);

  const firstPause = pauseActiveElapsed(firstRun, 1_500);
  assert.equal(activeElapsedTime(firstPause, 11_500), 500);

  const secondRun = resumeActiveElapsed(firstPause, 11_500);
  assert.equal(activeElapsedTime(secondRun, 12_250), 1_250);

  const secondPause = pauseActiveElapsed(secondRun, 12_250);
  const resumedAgain = resumeActiveElapsed(secondPause, 14_250);
  assert.equal(activeElapsedTime(resumedAgain, 14_500), 1_500);
});

test('an elapsed clock started while paused remains at zero until resume', () => {
  const paused = createActiveElapsed(5_000, true);
  assert.equal(activeElapsedTime(paused, 8_000), 0);
  const resumed = resumeActiveElapsed(paused, 8_000);
  assert.equal(activeElapsedTime(resumed, 8_350), 350);
});
