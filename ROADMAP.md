# Putt Daily: roadmap

Each version is playable on its own. See [PLAN.md](PLAN.md) for the design.

## v0.1: one hole feels good

- [ ] Canvas, pixel scaling, portrait layout for phones
- [ ] Drag-to-aim with a power line, release to putt
- [ ] Ball physics on a fixed time step: walls, bounce, friction, cup
- [ ] One hand-made test hole
- [ ] Stroke counter and stroke limit

Done when: putting on a phone feels right and the same shot always lands in the same place.

## v0.2: nine generated holes

- [ ] Tile-based hole format
- [ ] Generator driven by the date seed
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
- [ ] Ball and cup sounds

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

## Later, not committed

- Windmills, moving gates, tunnels, ice
- Weekly and all-time boards, hole-in-one counts
- Yesterday's course for practice
- Private rooms to race friends on today's course
- Ball and flag skins earned by streaks
- Music
