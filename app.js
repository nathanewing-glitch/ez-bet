// app.js — ranks the props, draws the five picks, and handles the search box.

const SHOW = 5;           // the product is "five props", so never more than five

// Grab the page elements once, so the functions below don't keep searching the page.
const picksEl = document.getElementById("picks");
const introEl = document.getElementById("intro");
const subEl = document.getElementById("sub");
const glanceEl = document.getElementById("glance");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("q");
const resetEl = document.getElementById("reset");
const teamListEl = document.getElementById("teams");
const countEl = document.getElementById("count");

// Small helper: make an element with an optional class and text.
// textContent (not innerHTML) is used on purpose, so anything typed in the search box can never become code.
function el(tag, cls, text) {
  const node = document.createElement(tag);   // create the element
  if (cls) node.className = cls;              // add its class if given
  if (text !== undefined) node.textContent = text; // add its text safely
  return node;
}

// Count the hits in a list of games (each game has hit = true/false).
function countHits(games) {
  return games.filter((g) => g.hit).length;
}

// How far the player's TYPICAL game (the median) sat above the line, as a share of the line.
// Used only to break ties: at the same hit rate, a line close to his typical game is a longer bet.
function cushion(p) {
  const v = p.games.map((g) => g.value).sort((a, b) => a - b);  // values low to high
  return (v[3] + v[4]) / 2 / p.line;                             // middle of 8 games = average of the 4th and 5th
}

// Set the line so the bet has room for a return. If a player cleared the default line in all 8 games
// (a bet nobody would pay for), raise the line to just above his WORST game, so it hits at most 7 of 8.
// Lines are only ever raised, never lowered. Anytime TD can't be raised, so an 8-of-8 one is dropped.
function tuneLine(p) {
  if (countHits(p.games) < p.games.length) return true;          // already 7 or fewer: leave it alone
  if (p.line === 0.5) return false;                              // anytime TD at 8 of 8: no higher line exists
  const floor = Math.min(...p.games.map((g) => g.value));        // his lowest game
  const raised = floor + 0.5;                                    // just above it, in the usual x.5 style
  p.prop = p.prop.replace(String(p.line), String(raised));       // "Over 39.5 receiving yards" -> "Over 41.5 ..."
  p.line = raised;
  p.games.forEach((g) => { g.hit = g.value > raised; });         // re-score every game against the new line
  return true;
}

// The props the site ranks: every prop after its line has been set.
const POOL = PROPS.filter(tuneLine);

// Does this prop match what the user typed? Matches player, team abbreviation, city or nickname.
function matches(p, q) {
  if (!q) return true; // empty search = every prop
  return (
    p.player.toLowerCase().includes(q) ||
    p.team.toLowerCase() === q ||            // exact for abbreviations so "ne" doesn't match every name
    p.teamName.toLowerCase().includes(q)
  );
}

// Rank props for a search: filter, sort by hit rate, keep five (one per player).
function rank(query) {
  const q = query.trim().toLowerCase();                       // ignore case and stray spaces
  const pool = POOL.filter((p) => matches(p, q));             // everything the search matched (a new array, so sort is safe)
  pool.sort((a, b) => {
    const byHits = countHits(b.games) - countHits(a.games);   // more hits in 8 games ranks higher
    if (byHits) return byHits;
    const byLength = cushion(a) - cushion(b);                 // tie-break 1: the longer bet (line closest to a typical game) first, since that is the one worth more
    if (byLength) return byLength;
    const recent = (p) => countHits(p.games.slice(-4));       // tie-break 2: hits in the latest 4 games
    const byRecent = recent(b) - recent(a);
    if (byRecent) return byRecent;
    return a.player.localeCompare(b.player);                  // tie-break 3: alphabetical, so order is stable
  });
  // One row per player: a player's second-best prop shouldn't take a second slot in "the five".
  const seen = new Set();
  const top = pool.filter((p) => {
    const k = p.player + "|" + p.team;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { top: top.slice(0, SHOW), matched: pool.length };
}

// Build one pick (one "screen") from a prop and its rank position.
function buildPick(p, i) {
  const hits = countHits(p.games);                            // e.g. 7
  const pct = Math.round((hits / p.games.length) * 100);      // e.g. 88
  const li = el("li", "pick");
  li.id = "pick-" + i;                                        // the at-a-glance row links here
  li.style.setProperty("--i", i);                             // lets CSS stagger each pick's tick animation

  // Left column: rank, who, what has to happen, and a label saying the line is ours.
  const left = el("div", "pick-left");
  left.append(
    el("span", "rank", String(i + 1)),
    el("h2", "who", p.player),
    el("p", "team", p.teamName + " · " + p.pos),
    el("p", "prop", p.prop),
    el("p", "odds", "Line set by EZ Bet, not a sportsbook")     // honesty label: this line is ours, not DraftKings'
  );

  // Right column: the big hit rate, the plain-words version, then the eight ticks.
  const right = el("div", "pick-right");
  const pctEl = el("p", "pct", String(pct));
  pctEl.append(el("span", "pct-sign", "%"));                  // smaller % sign so the number leads
  right.append(pctEl, el("p", "of", hits + " of the last " + p.games.length + " games"));

  const ticks = el("ul", "ticks");
  ticks.setAttribute("aria-hidden", "true");                  // the sentence above says the same thing for screen readers
  p.games.forEach((g, k) => {
    const t = el("li", g.hit ? "tick hit" : "tick miss");
    t.style.setProperty("--k", k);                            // oldest tick fills first
    ticks.append(t);
  });
  right.append(ticks);

  // Expandable game list: the real date, opponent and stat for each tick.
  const logId = "log-" + i;
  const btn = el("button", "more", "Show last 8 games");
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", logId);
  const log = el("ol", "log");
  log.id = logId;
  log.hidden = true;
  p.games.forEach((g) => {
    // Real values from ESPN, then hit or miss against the typical line.
    log.append(el("li", g.hit ? "hit" : "miss", g.date + " " + g.opp + ": " + g.value + " (" + (g.hit ? "hit" : "miss") + ")"));
  });
  log.append(el("li", "log-note", "Past hit rate, not a forecast. Sportsbooks already price in the same history."));
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true"; // current state
    btn.setAttribute("aria-expanded", String(!open));          // flip it for assistive tech
    log.hidden = open;                                          // show or hide the list
    btn.textContent = open ? "Show last 8 games" : "Hide last 8 games";
  });
  right.append(btn, log);

  li.append(left, right);
  return li;
}

// One compact row for the at-a-glance list: rank, who and what, and the hit rate. Links to the full pick.
function buildGlance(p, i) {
  const pct = Math.round((countHits(p.games) / p.games.length) * 100);
  const li = el("li");
  const a = el("a", "g-row");
  a.href = "#pick-" + i;                                      // jump to the full pick below
  const who = el("span", "g-who");
  who.append(el("span", "g-name", p.player), el("span", "g-prop", p.team + " · " + p.prop));
  a.append(el("span", "g-rank", String(i + 1)), who, el("span", "g-pct", pct + "%"));
  li.append(a);
  return li;
}

// Redraw the whole page for the current search text.
function render(query) {
  const { top } = rank(query);
  picksEl.replaceChildren(...top.map(buildPick));             // swap old picks for new ones (re-runs the tick animation)
  glanceEl.replaceChildren(...top.map(buildGlance));          // and the compact list
  resetEl.hidden = !query.trim();                             // only offer "Show all" while a search is active

  // Headline says what the user is looking at; the line under it says how it's ranked.
  if (!query.trim()) {
    introEl.textContent = "Five props. Ranked by record.";
    subEl.textContent = "Hit rate over each player’s last 8 games, across the NFL.";
  } else if (top.length) {
    introEl.textContent = "Best records for “" + query.trim() + "”";
    subEl.textContent = "Hit rate over each player’s last 8 games.";
  } else {
    introEl.textContent = "";
    subEl.textContent = "";
  }

  // Empty state: say what happened and what to try, with no apology.
  emptyEl.hidden = top.length > 0;
  if (!top.length) {
    emptyEl.textContent = "No props for “" + query.trim() + "”. Only quarterbacks, backs, receivers and tight ends with 8 games and a regular role are listed. Try a team such as Bills, or a player such as Odunze.";
  }
}

// Fill the datalist so phones suggest team names as you type.
Object.values(TEAMS).forEach((name) => {
  const o = document.createElement("option");
  o.value = name;
  teamListEl.append(o);
});

// Footer fact, computed so it can never drift from the data.
countEl.textContent = SNAPSHOT.players + " players across " + new Set(PROPS.map((p) => p.team)).size + " teams, pulled " + SNAPSHOT.pulled;

// Re-rank on every keystroke; the data is small so this is instant.
searchEl.addEventListener("input", () => {
  Store.set("query", searchEl.value);                         // remember it for next visit
  render(searchEl.value);
});

// "Show all" clears the search.
resetEl.addEventListener("click", () => {
  searchEl.value = "";
  Store.set("query", "");
  render("");
  searchEl.focus();                                           // keep the keyboard where the user was
});

// First draw: restore the last search if there was one.
searchEl.value = Store.get("query", "");
render(searchEl.value);
