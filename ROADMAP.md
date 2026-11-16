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

- [ ] Tile-based hole format
- [ ] Generator driven by the date seed, Day 1 = 2026-11-11
- [ ] Sand, water, slopes, bumpers, angled walls
- [ ] Solver bot that rejects impossible and trivial holes
- [ ] Nine-hole flow with par, rising difficulty and an end-of-round scorecard
- [ ] Test: a recorded run replays to the same score

Done when: a week of generated courses are all finishable and none feel broken.

## v0.3: daily and shareable

- [ ] Rollover at 00:00 UTC, one scored run a day, practice replays after
- [ ] Nickname, streak and today's result stored on the device
- [ ] Copy-paste scorecard with coloured squares
- [ ] Title screen, day number, how-to-play
- [ ] Archive list of every past day, playable for practice
- [ ] Course audio: birds, putter, cup, applause, hole-in-one cheer
- [ ] Three or four synthesized music loops, one per day, with separate music and sound switches

Done when: it works as a complete single-player daily with no server.

## v0.4: other players

- [ ] Node and SQLite service on the Debian VM
- [ ] Submit a run; server replays it to check the score
- [ ] Daily leaderboard
- [ ] Shot trails after each hole
- [ ] Bot scores and trails for quiet days
- [ ] Name filter and rate limits

Done when: two phones playing the same day see each other's trails and scores.

## v0.5: launch

- [ ] Deploy to the parbs.online subdomain with versioned assets
- [ ] Card on parbs.online with a gameplay loop
- [ ] Link-preview image for shared scorecards
- [ ] Playtest pass on hole difficulty
- [ ] "Better than N% of players" on the scorecard
- [ ] Challenge link: a shared link carries your run, and a friend plays against your trail
- [ ] Generated course name each day, with hole 9 as the signature hole
- [ ] Shot of the day: the title screen replays the day's best hole-in-one

## Later, not committed

- Windmills, moving gates, tunnels, ice
- Weekly and all-time boards, hole-in-one counts
- Private rooms to race friends on today's course
- Ball and flag skins earned by streaks
- Streak rewards, golden cup, weekly cup, under-two-minutes mode
