# Module contract

Plain ES modules, no bundler, no framework. `shared/` runs unchanged in the browser and in Node 24.

## Layout

- `shared/` physics, hole format, seeded RNG (later: generator, solver). No DOM, no Node APIs.
- `client/` static page: `index.html`, `main.js`, canvas render, input, audio. Imports `../shared/*.js`.
- `server/` Node HTTP service: serves `client/` and `shared/` as static files, plus `/api/*`.
- `test/` `node --test`.

## Units

- World 180 x 320 units (portrait). The canvas backing store is `k` device pixels per unit (`k` a whole number, from devicePixelRatio); `ctx.setTransform(k, ...)` each frame so all drawing is in world units. Top 24 units are the HUD.
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
- `replayRun(hole, shots)` plays shots from the tee, returns `{ strokes, holed, used }` (`used` = shots actually played).

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

## `client/weather.js` (v0.4)

Cosmetic only. Nothing in `shared/` reads it.

- `current()` returns `{ kind, night, tempC, windKmh, windDir, src }`. `kind` is one of `clear partly cloudy fog drizzle rain heavy snow storm`. `src` is `ip | gps | none | preview | off`.
- `refresh()` fetches `/api/weather` (with `?lat=&lon=` if the player opted in to phone location), at most every 15 min.
- `getMode()/setMode(m)`: `live`, `off` (always clear) or a preview from `PREVIEWS`. `?wx=<kind>` in the URL forces one for testing.
- `palette()`, `drawGround()`, `drawNight()`, `drawSky()`, `drawIcon()` are used by `render.js` and `screens.js`.

## `GET /api/weather`

Location: `lat`/`lon` query, else Cloudflare `cf-iplatitude`/`cf-iplongitude` headers. Rounded to 0.1 deg, Open-Meteo `current` lookup, cached 15 min per cell in memory, 20 requests a minute per IP. Returns the `current()` shape plus `code`; `{ kind: 'clear', src: 'none' }` when there is no location or the lookup fails.

## Dev URL switches

`?dev=1&hole=N` starts today's practice round at hole N (needs `dev`). `?screen=settings|archive`. `?wx=<kind>`.

## Other players (v0.5): `server/players.js`

SQLite at `$DATA_DIR/putt-daily.db`, table `runs (day, pid, nick, total, strokes, shots, bot, created)`, unique `(day, pid)`.

- `POST /api/run` `{ day, pid, nick, shots: [9 x [{ax, ay, p}]] }`. `day` must be today or yesterday (UTC). `pid` is a random 16-32 hex device id from `store.pid()`. Each hole is replayed with `replayRun`; it must end holed or at 8 strokes with no shots left over. Returns `{ ok, fresh, rank, of, humans, better, total, strokes, par }`; errors `{ error: 'name' | 'day' | 'pid' | 'shots' | 'unfinished' | 'extra shots' }`. A second run from the same pid returns the first one.
- `GET /api/board?day=N&pid=X` top 50 `{ r, nick, total, diff, bot, you, s }`, plus `you`, `humans`, `showsBots`, `par`, `name`.
- `GET /api/trails?day=N&hole=K` up to 30 `{ bot, shots }`, humans first.
- Bots (`shared/bot.js`): five seeded skill levels, inserted on first use of a day; listed and counted only while fewer than 10 people have played. Ties sort humans before bots.
- Names: `server/names.js` `cleanNick()`. Rate limits per IP: 12 submits / 10 min, 240 reads / min.

`?dev=1` exposes `window.__putt` (state, play, shoot, next, course) for automated playtests.

## v0.6: challenges, shot of the day, previews

- `POST /api/run` also returns `code`: 8 letters/digits, one per human run, made on first submit.
- `GET /api/challenge?c=CODE&pid=X` `{ day, nick, total, par, diff, strokes, shots, self }` (no device id); 404 if unknown. The client keeps it as `pd.rival` and shows it for that day only.
- `GET /api/shot?day=N` `{ day, ace: { nick, bot, hole, shot } | null }`: people before bots, then the later hole, then the earliest. Cached 60 s.
- `/?vs=CODE` serves the page with Open Graph tags for that run; `/` gets today's. Images: `/og/<day>.png`, `/og/c/<code>.png` (`server/og.js`, 1200 x 630, own PNG encoder).
- PWA: `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png`, `/favicon.png`, `/sw.js` (cache named by build; `/api/*` never cached).
- `SITE` env var sets the absolute URL used in the tags (default `https://putt.parbs.online`).

## v0.7

- `GET /api/version` also returns `now` (server ms). The client uses it for the day number only when the phone clock is off by more than 2 minutes.
- `?screen=stats` opens the stats screen. `store.stats(today, parsFn)` and `store.storageOk`.
- Frozen courses: `test/daily.test.js` pins the hash of days 1, 5 and 9. Never change what a live day generates.
