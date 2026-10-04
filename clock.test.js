// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const { createMoveClock, formatMs } = require('./clock.js');

function fakeTime() {
  let t = 1000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

// 30 s per move, 10 min game = 5 min (300000 ms) each.
function newClock() {
  const time = fakeTime();
  return { time, clock: createMoveClock(30, 10, time.now) };
}

test('before start: white is first, full times, clock not running', () => {
  const { time, clock } = newClock();
  time.advance(60000);
  assert.deepStrictEqual(clock.state(), {
    status: 'ready',
    turn: 'white',
    white: { moveMs: 30000, gameMs: 300000 },
    black: { moveMs: 30000, gameMs: 300000 },
  });
});

test('start runs white move time and white game time down', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(10000);
  assert.deepStrictEqual(clock.state(), {
    status: 'running',
    turn: 'white',
    white: { moveMs: 20000, gameMs: 290000 },
    black: { moveMs: 30000, gameMs: 300000 },
  });
});

test('done passes the turn: fresh move time, game time goes down only on your own turn', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(25000);
  clock.done('white');
  time.advance(5000);
  assert.deepStrictEqual(clock.state(), {
    status: 'running',
    turn: 'black',
    white: { moveMs: 30000, gameMs: 275000 },
    black: { moveMs: 25000, gameMs: 295000 },
  });
  clock.done('black');
  assert.deepStrictEqual(clock.state().white, { moveMs: 30000, gameMs: 275000 });
});

test('tap from the player who is not on turn is ignored', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(1000);
  clock.done('black');
  const s = clock.state();
  assert.strictEqual(s.turn, 'white');
  assert.strictEqual(s.white.moveMs, 29000);
});

test('done before start is ignored', () => {
  const { clock } = newClock();
  clock.done('white');
  assert.strictEqual(clock.state().status, 'ready');
});

test('move time runs out: that player loses and the clock stops', () => {
  const { time, clock } = newClock();
  clock.start();
  clock.done('white');
  time.advance(30000);
  const s = clock.state();
  assert.strictEqual(s.status, 'timeup');
  assert.strictEqual(s.turn, 'black');
  assert.deepStrictEqual(s.black, { moveMs: 0, gameMs: 270000 });
  time.advance(60000);
  assert.deepStrictEqual(clock.state(), s);
});

test('game time runs out before move time: that player loses', () => {
  const time = fakeTime();
  const clock = createMoveClock(20, 1, time.now); // 30 s game time each
  clock.start();
  time.advance(15000);
  clock.done('white');
  time.advance(1000);
  clock.done('black');
  // White has 15 s game time left, less than the 20 s move time.
  assert.deepStrictEqual(clock.state().white, { moveMs: 15000, gameMs: 15000 });
  time.advance(15000);
  const s = clock.state();
  assert.strictEqual(s.status, 'timeup');
  assert.strictEqual(s.turn, 'white');
  assert.deepStrictEqual(s.white, { moveMs: 0, gameMs: 0 });
});

test('player not on turn sees the move time they will get, capped by their game time', () => {
  const time = fakeTime();
  const clock = createMoveClock(20, 1, time.now);
  clock.start();
  time.advance(15000);
  clock.done('white');
  assert.deepStrictEqual(clock.state().white, { moveMs: 15000, gameMs: 15000 });
});

test('a late check charges only the time that was left, not more', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(100000);
  assert.deepStrictEqual(clock.state().white, { moveMs: 0, gameMs: 270000 });
});

test('tapping after the time ran out does not save the player', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(30001);
  clock.done('white'); // no state() call in between, like a slow UI tick
  const s = clock.state();
  assert.strictEqual(s.status, 'timeup');
  assert.strictEqual(s.turn, 'white');
});

test('after time up, nothing restarts the clock', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(30000);
  clock.start();
  clock.resume();
  clock.done('white');
  clock.done('black');
  const s = clock.state();
  assert.strictEqual(s.status, 'timeup');
  assert.strictEqual(s.turn, 'white');
});

test('pause freezes both times and resume continues from there', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(12000);
  clock.pause();
  time.advance(600000);
  assert.deepStrictEqual(clock.state(), {
    status: 'paused',
    turn: 'white',
    white: { moveMs: 18000, gameMs: 288000 },
    black: { moveMs: 30000, gameMs: 300000 },
  });
  clock.done('white'); // no move while paused
  assert.strictEqual(clock.state().turn, 'white');
  clock.resume();
  time.advance(3000);
  assert.deepStrictEqual(clock.state().white, { moveMs: 15000, gameMs: 285000 });
});

test('pause after the deadline gives time up, not a pause', () => {
  const { time, clock } = newClock();
  clock.start();
  time.advance(31000);
  clock.pause();
  assert.strictEqual(clock.state().status, 'timeup');
});

test('a slow game still ends within the whole game time', () => {
  const { time, clock } = newClock();
  clock.start();
  let elapsed = 0;
  let thisMove = 0;
  while (clock.state().status === 'running') {
    time.advance(1000);
    elapsed += 1000;
    thisMove += 1000;
    if (thisMove === 29000) { // every move takes 29 s
      clock.done(clock.state().turn);
      thisMove = 0;
    }
  }
  assert.ok(elapsed <= 600000, `game lasted ${elapsed} ms`);
  assert.deepStrictEqual(clock.state().white, { moveMs: 0, gameMs: 0 });
});

test('formatMs shows m:ss and rounds up', () => {
  assert.strictEqual(formatMs(30000), '0:30');
  assert.strictEqual(formatMs(29001), '0:30');
  assert.strictEqual(formatMs(29000), '0:29');
  assert.strictEqual(formatMs(1), '0:01');
  assert.strictEqual(formatMs(0), '0:00');
  assert.strictEqual(formatMs(-50), '0:00');
  assert.strictEqual(formatMs(90000), '1:30');
  assert.strictEqual(formatMs(600000), '10:00');
});
