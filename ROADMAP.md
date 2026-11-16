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
- [ ] Link-preview image for shared scorecards
- [ ] Playtest pass on hole difficulty
- [x] "Better than N% of players" on the scorecard
- [ ] Challenge link: a shared link carries your run, and a friend plays against your trail
- [ ] Generated course name each day, with hole 9 as the signature hole
- [ ] Shot of the day: the title screen replays the day's best hole-in-one

## Later, not committed

- Windmills, moving gates, tunnels, ice
- Weekly and all-time boards, hole-in-one counts
- Private rooms to race friends on today's course
- Ball and flag skins earned by streaks
- Streak rewards, golden cup, weekly cup, under-two-minutes mode
