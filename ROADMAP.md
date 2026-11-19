# Putt Daily: roadmap

Each version is playable on its own. See [PLAN.md](PLAN.md) for the design.

## v0.1: one hole feels good

- [x] Canvas, pixel scaling, portrait layout for phones
- [x] Drag-to-aim with a power line, release to putt
- [x] Ball physics on a fixed time step: walls, bounce, friction, cup
- [x] One hand-made test hole
- [x] Stroke counter and stroke limit

Done when: putting on a phone feels right and the same shot always lands in the same place.

## v0.2: nine generated holes

- [x] Tile-based hole format
- [x] Generator driven by the date seed, Day 1 = 2026-11-11
- [x] Sand, water, slopes, bumpers, angled walls
- [x] Solver bot that rejects impossible and trivial holes
- [x] Nine-hole flow with par, rising difficulty and an end-of-round scorecard
- [x] Test: a recorded run replays to the same score

Done when: a week of generated courses are all finishable and none feel broken.

## v0.3: daily and shareable

- [x] Rollover at 00:00 UTC, one scored run a day, practice replays after
- [x] Nickname, streak and today's result stored on the device
- [x] Copy-paste scorecard with coloured squares
- [x] Title screen, day number, how-to-play
- [x] Archive list of every past day, playable for practice
- [x] Course audio: birds, putter, cup, applause, hole-in-one cheer
- [x] Three or four synthesized music loops, one per day, with separate music and sound switches

Done when: it works as a complete single-player daily with no server.

## v0.4: clear graphics and live weather

- [x] Draw at the phone's real resolution: sharp text, edges and ball
- [x] Clearer course art: raised wooden rails with shadows, scenery outside the course, mowing stripes, animated slope arrows, sand lip, water foam, tee mat, cup rim, outlined ball, aim arrow
- [x] Title, scorecard, archive and settings over a live practice green
- [x] `/api/weather`: Open-Meteo lookup from Cloudflare visitor location or opt-in phone location, rounded to 0.1 deg, cached 15 min
- [x] Looks: clear, night, partly cloudy, cloudy, fog, drizzle, rain, heavy rain, snow, thunderstorm, windy (leaves, flag)
- [x] Ambience follows the weather: rain hiss, wind, birds by day, crickets on warm nights, thunder
- [x] Settings screen: music, effects, weather live / always clear / preview, phone location
- [ ] Turn on Cloudflare "Add visitor location headers" for parbs.online (until then live weather needs the phone-location button)
- [ ] Playtest every look on a phone for readability

Done when: every look keeps the ball, cup, walls and hazards easy to read on a 360 x 640 phone.

## v0.5: other players

- [x] Node and SQLite service on the Debian VM (`/data/putt-daily.db`, built-in `node:sqlite`)
- [x] Submit a run; server replays it to check the score (one scored run per device a day, unfinished holes and extra shots rejected)
- [x] Daily leaderboard: ranked by total, ties to whoever finished first, any past day browsable
- [x] Shot trails after each hole: yours in gold, up to 30 others in white
- [x] Bot scores and trails for quiet days: five tagged bots of different skill, hidden once 10 people have played
- [x] Name filter and rate limits
- [x] Rank and "better than N% of players" on the scorecard and in the copied result

Done when: two phones playing the same day see each other's trails and scores.

## v0.6: launch

- [x] Deploy to the parbs.online subdomain with versioned assets
- [x] Card on parbs.online (still image; a gameplay loop is still to do)
- [x] Link-preview image for shared scorecards: `/og/<day>.png` (signature hole 9, day, course name) and `/og/c/<code>.png` for challenges, drawn on the server with no dependencies
- [ ] Playtest pass on hole difficulty
- [x] "Better than N% of players" on the scorecard
- [x] Challenge link: the shared result links `/?vs=<code>`; a friend sees "beat Sam's 31", plays the same day, and gets Sam's trail in coral plus a running lead after each hole and on the scorecard (past days play as practice)
- [x] Generated course name each day, with hole 9 as the signature hole
- [x] Shot of the day: the title screen replays the day's best hole-in-one (today's once you've played, yesterday's before, so no spoilers)

Also in v0.6 (from the research and code audit, 2026-11-18):

- [x] Share button opens the phone share sheet; desktop copies
- [x] Installable: web manifest, icons and a service worker, so the page loads offline after the first visit
- [x] Haptics on Android: putt (by power), hard bounces, water, cup. Follows the Effects switch
- [x] Sound comes back after a phone call or app switch (iOS suspends the audio context)
- [x] Leaderboard submit retries with backoff (15 s, 45 s, 2 min, then every 5 min) and when the page comes back
- [x] "Change name" after a score was sent now renames the board entry
- [x] `?hole=N` only works with `?dev=1`, so it can't spoil archive bests
- [x] Bigger MENU tap area; one bad frame no longer freezes the game
- [x] Server: course cache holds 64 days, each hole replays once

## v0.7: polish and habit

From the research agent's survey of daily games and the code audit. Plain theme still; nothing here changes the rules.

- [x] Stats screen: games played, average vs par, best round, streak and longest streak, rounds-vs-par chart, hole results (aces, under, par, bogey, worse)
- [x] Cup juice: a short pixel burst when the ball drops, a tiny screen nudge on hard bounces (off with the phone's reduce-motion setting)
- [ ] Colour-blind help: the scorecard and board already print the +/- number; the shared squares are still colour only
- [ ] Bigger minimum text (8 units) for anything that matters, after the phone playtest
- [x] Day number from server time when the phone clock is more than 2 minutes off (`now` in `/api/version`)
- [x] Menu screens draw at about 30 fps to save battery; play and replays stay at full rate
- [x] Note on the title when storage is blocked (private mode), since the run can't resume
- [x] Trails: each hole's random sample is cached for 30 s, so busy days don't re-sort the table per request
- [x] Rule for deploys: never change generator or physics output for a live day. A test pins days 1, 5 and 9; gate any change on the day number

## Later, not committed

- Windmills, moving gates, tunnels, ice
- Weekly and all-time boards, hole-in-one counts
- Private rooms to race friends on today's course
- Ball and flag skins earned by streaks
- Streak rewards, golden cup, weekly cup, under-two-minutes mode
- Streak freeze: one missed day a week doesn't break the streak
- Share one hole's trail as an image after a great shot
- Milestone badges: first ace, 7-day streak, a full week under par
- Friends board from shared challenge codes
