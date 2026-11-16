# Module contract

Plain ES modules, no bundler, no framework. `shared/` runs unchanged in the browser and in Node 24.

## Layout

- `shared/` physics, hole format, seeded RNG (later: generator, solver). No DOM, no Node APIs.
- `client/` static page: `index.html`, `main.js`, canvas render, input, audio. Imports `../shared/*.js`.
- `server/` Node HTTP service: serves `client/` and `shared/` as static files, plus `/api/*`.
- `test/` `node --test`.

## Units

- Internal canvas 180 x 320 (portrait), scaled up by a whole number. Top 24 px is the HUD.
- Tile = 10 px. A hole is up to 18 x 29 tiles and fits on one screen (no camera scroll).
- World units are internal pixels. Origin top-left, y down.

## Hole

```js
{
  id: 'test-1', par: 2,
  cols: 18, rows: 29,
  tiles: ['##################', '#................#', ...], // rows strings, length cols
  // '#' wall (solid, outside play), '.' felt, 's' sand, 'w' water,
  // '^' 'v' '<' '>' slope pushing that way
  walls: [{ x1, y1, x2, y2 }],   // extra angled wall segments, world units
  bumpers: [{ x, y, r }],        // round bouncy posts
  tee: { x, y }, cup: { x, y },  // world units
}
```

## Shot

`{ ax, ay, p }` all integers. `(ax, ay)` is the aim direction, each in -1000..1000, not both 0 (normalised inside the sim with Math.sqrt). `p` is power 1..1000.

## Determinism rule

The sim uses only `+ - * /`, `Math.sqrt`, `Math.abs`, `Math.min/max`, `Math.floor/round`. No `Math.sin/cos/atan2/exp/pow/random` and no `Date` inside a step. Fixed step of 1/120 s; the sim never reads frame time.

## `shared/physics.js` exports

- `BALL_R` ball radius (world units).
- `createSim(hole)` returns `sim` with `sim.ball = { x, y, vx, vy }`, `sim.state` `'rest' | 'moving' | 'holed'`, `sim.strokes`.
- `shoot(sim, shot)` starts a stroke from rest. Throws if not at rest.
- `step(sim)` advances one fixed step and returns an array of events: `{ type: 'wall'|'bumper'|'sand'|'water'|'lip'|'holed'|'stop', speed }`. On water the ball is put back at the shot's start spot, a penalty stroke is added, and the state goes to `'rest'`.
- `simulateShot(hole, from, shot)` runs one stroke to rest/holed without a sim object and returns `{ path: [{x,y}] (every 4th step), end: {x,y}, holed, water, strokesAdded }`. Used by trails, the solver and the server.
- `replayRun(hole, shots)` plays shots from the tee, returns `{ strokes, holed }`.

## `shared/holes.js` exports

- `TEST_HOLES` array with at least one hand-made hole (par 2) for v0.1.

## Stroke limit

8 per hole. Reaching 8 without holing records 8 and the hole ends.

## `shared/daily.js` exports (v0.2)

- `DAY1 = '2026-11-11'` (UTC). `dayNumber(date = new Date())` returns 1 for 2026-11-11 UTC, 2 the next day, etc. `dateOfDay(n)` returns 'YYYY-MM-DD'.
- `generateCourse(n)` returns `{ day: n, date, holes: [9 holes] }`, the same on every device. Hole ids are `d<n>-h<1..9>`, each with `name` and `par` (holes 1-3 par 2, 4-7 par 3, 8-9 par 4). Pure and synchronous. Budget: under 500 ms for a full course in Node on a desktop.
- `shared/rng.js`: `makeRng(seed)` returns `{ next() /* [0,1) */, int(lo, hi) /* inclusive */, pick(arr) }`, integer-based (e.g. mulberry32), deterministic.

## `client/audio.js` exports (v0.3)

- `unlockAudio()` called on the first pointerdown; nothing makes sound before it.
- `sfx(name, intensity = 1)` with names: `putt`, `wall`, `bumper`, `sand`, `water`, `lip`, `cup`, `applause`, `cheer`, `groan`, `ui`. `intensity` 0..1 scales loudness (e.g. hit speed).
- `startMusic(dayNumber)` / `stopMusic()`; the track is picked from the day number.
- `setMusicOn(bool)`, `setSfxOn(bool)`, `isMusicOn()`, `isSfxOn()`; saved in localStorage. Both default on at low volume.
- Ambience (birds, light breeze) plays under everything and follows the sound-effects switch.
