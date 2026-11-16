# Putt Daily: plan

A daily mini-golf game for the browser. Everyone gets the same nine holes each day, plays them once, and compares scores.

## The game in one paragraph

Open the page, play today's nine holes, and you're done until tomorrow. Drag back from the ball to aim and set power, release to putt. After you finish a hole you see the paths other players' balls took on it. At the end you get a scorecard to share and a place on the day's leaderboard.

## Decisions made (2026-11-16)

- **Name:** Putt Daily, at putt.parbs.online.
- **Day 1 is 2026-11-11.** Courses exist from that date on, so there are past days to test with before launch.
- **Every past course stays playable** from an archive list.
- **Sound:** a few music tracks plus golf-course audio (see Sound below).
- **Theme:** simple, classic mini-golf. Green felt, wooden borders, a flag in the cup. No satire or story.
- **Daily content:** nine new generated holes a day and nothing else. No weather, no rule changes.
- **Look:** top-down 2D pixel art.
- **Other players:** shot trails after each hole, a daily leaderboard and a shareable scorecard. No live players in the first version.
- **Phones first:** modern phones only, 640x360 minimum, portrait. Desktop works with the mouse.

## How a day works

- The day's seed is the UTC date. The same seed always produces the same nine holes, on every device.
- The course rolls over at 00:00 UTC. A run started before the rollover can be finished and counts for the day it started.
- One scored run per day per player. After that, the course can be replayed for practice, which doesn't count.
- Past days are open from an archive list, numbered from Day 1 (2026-11-11). An archive run shows that day's leaderboard and trails and keeps your own best, but doesn't join the board, since that day is over.
- Stroke limit of 8 per hole. Reaching it records an 8 and moves on.

## Holes

- Each hole is built on a small grid of tiles: felt, wall, and a handful of obstacle pieces.
- First version pieces: straight walls, angled walls, sand (slows the ball), water (one-stroke penalty, ball returns to the last spot), slopes (push the ball one way), and bumpers.
- Later pieces: windmill, moving gates, tunnels, ice.
- Difficulty rises across the nine: holes 1 to 3 are par 2, 4 to 7 are par 3, 8 and 9 are par 4.
- The generator makes a hole, then a solver bot plays it. A hole is kept only if the bot can finish it in par, and can't hole out in one on par 3 and 4 holes. Otherwise it's thrown away and regenerated from the next seed.

## Ball physics

- Fixed time step, so the same shot gives the same result on every device and frame rate. This is what makes trails and scores comparable.
- Simple circle-against-line collisions with a bounce loss, rolling friction, and a stop speed.
- A shot is stored as an angle and a power. A whole run is a short list of shots, which the server can replay to check a score.

## Other players

- **Trails:** when you finish a hole, the server sends up to about 30 other players' shot lists for it. The game replays them as faint lines. Nothing is shown before you finish the hole, so trails can't be used as hints.
- **Leaderboard:** total strokes for the day, ties broken by who finished first. Daily board, plus a streak count kept on the device.
- **Scorecard:** a copy-paste text card with one coloured square per hole (under par, par, over par) and the total, with the day number and a link.
- **Names:** a nickname typed once and stored on the device. No accounts. Names are length-limited and filtered.

## Sound

- **Course audio:** birdsong and a light breeze as the background, a putter tap, wall knocks, sand and water sounds, the ball dropping in the cup, polite applause for par or better, a bigger cheer for a hole-in-one, a crowd groan when the ball lips out.
- **Music:** three or four short, relaxed chiptune loops, one picked per day from the seed so each day has its tune. Synthesized in code with Web Audio, so there are no audio files to license or download.
- Music and sound effects have separate switches, and both start quiet. Nothing plays until the first tap.

## Proposed daily hooks (suggested, not yet agreed)

- **"Better than 73% of players"** on the scorecard, beside the rank.
- **Challenge link:** sharing carries your run, so a friend who opens it plays against your trail and sees who won.
- **Named courses and a signature hole:** each day gets a generated name, and hole 9 is always the showpiece.
- **Shot of the day:** the title screen replays the day's best hole-in-one.
- **Streak rewards:** ball colours and flags unlocked at 3, 7, 30 days, visible in your trails.
- **Golden cup:** one hole a day has a second, harder cup worth one stroke off.
- **Weekly cup:** the seven daily totals add up to a Monday-to-Sunday board.
- **Under two minutes:** fast ball roll, no waits between holes, round timer shown at the end.

## Technical shape

- **Client:** plain JavaScript and one canvas, no framework. Pixel art drawn at a low internal resolution and scaled up with whole-number scaling.
- **Server:** a small Node service on the Debian VM with SQLite. Three calls: submit a run, get trails for a hole, get the leaderboard.
- **Cheat checks:** the server replays each submitted shot list with the same physics code and uses its own stroke count. A run that doesn't replay to completion is rejected.
- **Shared code:** the physics and the hole generator are one module used by both client and server.
- **Hosting:** static files on GitHub Pages behind Cloudflare at a parbs.online subdomain. Every asset link carries a version number, because Cloudflare caches CSS, scripts and images.

## Risks

- **Generated holes can be dull or unfair.** The solver bot and a set of hand-made hole templates that the generator varies are the guard against this. This is the part most likely to need several rounds.
- **Physics that differ between devices** would break trails and server checks. Fixed time step and integer-friendly maths from the start, with a test that replays recorded runs.
- **An empty leaderboard** on quiet days. Bot scores with obvious bot names fill the board and the trails until real players do.

## Open questions

- Which of the proposed daily hooks to build, and in which version.
