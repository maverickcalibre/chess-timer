// Chess timer logic. No DOM, so Node can test it.
// Two limits run during your turn:
// - move time: every turn gets the same fixed time (for example 30 s).
// - game time: each player gets half of the whole game time (for example 5 of 10 min).
//   It goes down only during your own turns.
// When a player has made their move, they tap "done" and the opponent's turn starts
// with a fresh move time. If either limit runs out first, that player loses.
(function () {
  'use strict';

  const OTHER = { white: 'black', black: 'white' };

  function createMoveClock(secondsPerMove, gameMinutes, now) {
    now = now || (() => performance.now());
    const moveLimitMs = secondsPerMove * 1000;
    const gameMs = { white: gameMinutes * 30000, black: gameMinutes * 30000 }; // half each
    let status = 'ready'; // ready | running | paused | timeup
    let turn = 'white';
    let moveMs = moveLimitMs; // move time left for `turn`, as of `since`
    let since = 0; // when the time was last charged (only while running)

    // Take the time used since `since` off the player on turn.
    // Never takes more than what is left, so a late check still stops at exactly 0.
    function charge(t) {
      if (status !== 'running') return;
      const used = Math.min(t - since, moveMs, gameMs[turn]);
      moveMs -= used;
      gameMs[turn] -= used;
      since = t;
      if (moveMs <= 0 || gameMs[turn] <= 0) status = 'timeup';
    }

    return {
      start() {
        if (status !== 'ready') return;
        status = 'running';
        since = now();
      },
      // `player` has made their move. Ignored unless it is their turn.
      done(player) {
        charge(now());
        if (status !== 'running' || player !== turn) return;
        turn = OTHER[turn];
        moveMs = moveLimitMs;
      },
      pause() {
        charge(now());
        if (status === 'running') status = 'paused';
      },
      resume() {
        if (status !== 'paused') return;
        status = 'running';
        since = now();
      },
      // For each player: moveMs = time to make the move (for the player not on turn,
      // the time they get on their next move), gameMs = game time left.
      state() {
        charge(now());
        const view = (player) => ({
          moveMs: Math.min(player === turn ? moveMs : moveLimitMs, gameMs[player]),
          gameMs: gameMs[player],
        });
        return { status, turn, white: view('white'), black: view('black') };
      },
    };
  }

  // 30000 -> "0:30". Rounds up, so "0:00" shows only when the time is up.
  function formatMs(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  const api = { createMoveClock, formatMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.MoveClock = api;
})();
