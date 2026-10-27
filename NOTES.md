# NOTES — EZ Bet

## Decisions
- Dark ground: used on a couch at game time. Square corners. One signal color (hit green). No gradients, no glow.
- Idea: the last 8 games become 8 yard-line ticks (tall = hit, short = miss).
- One live thing: search any team or player and the five picks re-rank.
- Odds window −300 to +300 from the brief is NOT applied: no odds source (see round 1 below).
- Label is "hit rate", not "chance", plus a footnote: past record is not a forecast.

## Changelog
- 2026-10-27: First build with sample data.
- 2026-10-27 (round 1): Replaced sample data with a real ESPN snapshot (233 players, 32 teams, last 8 games each). Odds removed: ESPN's DraftKings prop feed had no player yardage/reception lines and no Anytime TD prices, so the −300 to +300 window cannot be applied. Lines are fixed typical lines and labeled as such on every pick and in the footer. Tie-breaks now: hits, then the worst game's margin over the line, then hits in last 4, then name. One pick per player.
- 2026-10-27 (round 2, design critique): (1) Added an at-a-glance list of the five above the full picks and cut each pick from 78svh to 60svh. (2) Added the headline "Five props. Ranked by record." as the page's h1 and aligned the top bar to the content column. (3) Miss ticks, search box and button outlines now meet 3:1 contrast. (4) Removed tabular numbers from the "Typical line" sentence (it put gaps before commas). (5) Brand link is now a 44px tap target.
- 2026-10-27 (round 3, longer bets): Lines are raised, never lowered. A prop that cleared its default line in all 8 games gets a line just above his lowest game (x.5), so nothing shows 8 of 8; an 8-of-8 Anytime TD is dropped because it has no higher line. Tie-break 1 flipped: at equal hit rate, the line closest to the typical (median) game ranks first, since that is the longer bet. Label now reads "Line set by EZ Bet, not a sportsbook"; footer explains the fitting.
