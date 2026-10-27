# pull_data.py — pulls real game logs from ESPN's public (unofficial) API and rewrites data.js.
# Run by .github/workflows/refresh.yml every Tuesday and Friday; you can also run it by hand:
#   python3 scripts/pull_data.py
# It only needs Python 3.9+ and nothing to install. No keys: ESPN's stats are public.
import json, os, sys, time, datetime, urllib.request
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))              # the scripts/ folder
OUT = os.path.join(HERE, "..", "data.js")                       # the file the site reads
MIN_PLAYERS = int(os.environ.get("MIN_PLAYERS", "150"))         # safety check: a healthy pull keeps ~230 players
UA = {"User-Agent": "Mozilla/5.0"}                              # a normal browser name, so ESPN answers plain requests
SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
LOG = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{}/gamelog"
FIX = {"WSH": "WAS"}                                            # ESPN says WSH; the site uses WAS

FAILED = []                                                     # URLs that never answered, so a bad run is visible in the log

def get(url):
    # Fetch JSON, retrying up to 4 times with a growing pause (busy servers often answer on a retry).
    # Returns None only if every try fails, so one bad player doesn't stop the run.
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return json.load(r)
        except Exception:
            time.sleep(1 + attempt)                             # 1s, 2s, 3s, 4s
    FAILED.append(url)
    return None

# Starting lines: fixed round numbers chosen for this site, NOT sportsbook lines.
# app.js raises a line when a player cleared it in all 8 games.
LINES = {
    "pyds": ("Over 199.5 passing yards", 199.5),
    "ptd":  ("Over 1.5 passing TDs", 1.5),
    "ryds": ("Over 39.5 rushing yards", 39.5),
    "rec":  ("Over 3.5 receptions", 3.5),
    "rec2": ("Over 2.5 receptions", 2.5),
    "recy": ("Over 39.5 receiving yards", 39.5),
    "atd":  ("Anytime touchdown", 0.5),
}
PROPS_BY_POS = {"QB": ["pyds", "ptd"], "RB": ["ryds", "rec2", "atd"], "WR": ["rec", "recy", "atd"], "TE": ["rec", "recy", "atd"]}

def current_season():
    # Ask ESPN which season it is on now, instead of hardcoding a year (so this keeps working next year).
    d = get(SITE + "/scoreboard")
    return d["season"]["year"] if d and d.get("season") else None

def game_rows(aid, seasons):
    # Return the player's regular-season games, newest first, each tagged with its season.
    games = []
    for season in seasons:                                      # current season first, then the one before to fill in
        d = get(LOG.format(aid) + f"?season={season}")
        if not d or not d.get("names"):
            continue                                            # no log that season (rookie, injured, etc.)
        names = d["names"]
        for st in d.get("seasonTypes", []):
            if "Regular Season" not in st["displayName"]:
                continue                                        # postseason games are skipped
            for cat in st["categories"]:
                for ev in cat["events"]:
                    s = dict(zip(names, ev["stats"]))
                    meta = d["events"].get(ev["eventId"], {})
                    if "gameDate" not in meta:
                        continue                                # without a date the game can't be ordered
                    when = datetime.datetime.fromisoformat(meta["gameDate"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
                    opp = FIX.get(meta.get("opponent", {}).get("abbreviation", "?"), meta.get("opponent", {}).get("abbreviation", "?"))
                    def num(k):
                        try: return float(s.get(k, 0))
                        except ValueError: return 0.0
                    games.append({
                        "season": season, "when": when, "opp": ("@ " if meta.get("atVs") == "@" else "vs ") + opp,
                        "pyds": num("passingYards"), "ptd": num("passingTouchdowns"), "patt": num("passingAttempts"),
                        "ryds": num("rushingYards"), "ratt": num("rushingAttempts"),
                        "rec": num("receptions"), "tgt": num("receivingTargets"), "recy": num("receivingYards"),
                        "td": num("rushingTouchdowns") + num("receivingTouchdowns"),
                    })
    games.sort(key=lambda g: g["when"], reverse=True)
    return games

def played(g):
    # A game counts only if the player actually had a role in it (a pass, carry or target).
    return g["patt"] + g["ratt"] + g["tgt"] + g["rec"] > 0

def role_ok(pos, g8):
    # Skip backups: average usage over the 8 games must look like a real starter/contributor.
    n = len(g8)
    if pos == "QB": return sum(g["patt"] for g in g8) / n >= 15
    if pos == "RB": return sum(g["ratt"] + g["rec"] for g in g8) / n >= 4
    return sum(g["tgt"] for g in g8) / n >= 2.5

def one_player(args):
    # Build the prop rows for one player, or [] if they don't qualify.
    aid, name, pos, team, seasons = args
    games = [g for g in game_rows(aid, seasons) if played(g)]
    if len(games) < 8 or games[0]["season"] != seasons[0]:
        return []                                               # need 8 played games and some action this season
    g8 = games[:8][::-1]                                        # newest 8, then flip to oldest -> newest
    if not role_ok(pos, g8):
        return []
    rows = []
    for key in PROPS_BY_POS[pos]:
        stat = "td" if key == "atd" else {"rec2": "rec"}.get(key, key)
        rows.append([name, team, pos, key, [[g["when"].strftime("%b %-d"), g["opp"], int(g[stat])] for g in g8]])
    return rows

def main():
    season = current_season()
    if not season:
        sys.exit("ESPN scoreboard did not answer; leaving data.js as it is.")
    seasons = (season, season - 1)
    print("season:", season, file=sys.stderr)
    teams_json = get(SITE + "/teams")
    if not teams_json:
        sys.exit("ESPN teams list did not answer; leaving data.js as it is.")
    jobs, tinfo = [], {}
    for t in teams_json["sports"][0]["leagues"][0]["teams"]:
        t = t["team"]; ab = FIX.get(t["abbreviation"], t["abbreviation"])
        tinfo[ab] = t["displayName"]
        r = get(f"{SITE}/teams/{t['id']}/roster")
        if not r:
            continue                                            # skip a team whose roster failed; the safety check below catches a bad run
        for grp in r["athletes"]:
            if grp["position"] != "offense":
                continue                                        # the 'offense' group excludes IR, practice squad and suspended
            for a in grp["items"]:
                pos = a["position"]["abbreviation"]
                if pos in PROPS_BY_POS:
                    jobs.append((a["id"], a["fullName"], pos, ab, seasons))
    print("candidates:", len(jobs), file=sys.stderr)
    with ThreadPoolExecutor(8) as ex:                           # fewer parallel requests = fewer rejected ones
        results = list(ex.map(one_player, jobs))
    rows = sorted((r for res in results for r in res), key=lambda r: (r[1], r[0], r[3]))
    players = {(r[0], r[1]) for r in rows}
    print("players kept:", len(players), "prop rows:", len(rows), "failed requests:", len(FAILED), file=sys.stderr)

    # Safety check: too few players means ESPN changed or failed. Keep the old data.js and fail loudly.
    if len(players) < MIN_PLAYERS or len({r[1] for r in rows}) < 28:
        sys.exit(f"Only {len(players)} players (need {MIN_PLAYERS}+, and 28+ teams); NOT overwriting data.js.")

    today = datetime.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    body = []                                                   # build the whole file in memory first
    body.append("// data.js — REAL game logs from ESPN's public (unofficial) API, pulled " + today + ".\n")
    body.append("// Lines are fixed \"typical lines\" chosen for this site. They are NOT DraftKings lines, and no odds are included.\n")
    body.append("// Generated by scripts/pull_data.py; don't edit by hand.\n\n")
    body.append("const SNAPSHOT = " + json.dumps({"source": "ESPN", "pulled": today, "players": len(players)}) + ";\n\n")
    body.append("const TEAMS = " + json.dumps(dict(sorted(tinfo.items())), indent=1) + ";\n\n")
    body.append("// The typical line for each prop type. Hit = value above the line (anytime TD: at least 1).\n")
    body.append("const LINES = " + json.dumps({k: {"text": v[0], "line": v[1]} for k, v in LINES.items()}, indent=1) + ";\n\n")
    body.append("// One row per player prop: [player, team, position, line key, last 8 games oldest->newest as [date, opponent, value]].\n")
    body.append("const ROWS = [\n")
    for r in rows:
        body.append("  " + json.dumps(r, ensure_ascii=False, separators=(",", ":")) + ",\n")
    body.append("];\n\n")
    body.append("""// Turn each row into an object with named fields, so app.js reads p.player instead of row[0].
const PROPS = ROWS.map(([player, team, pos, key, log]) => ({
  player, team, pos,                                   // who
  teamName: TEAMS[team],                               // full team name for display and search
  prop: LINES[key].text,                               // what has to happen for the bet to hit
  line: LINES[key].line,                               // the typical line as a number
  games: log.map(([date, opp, value]) => ({            // each game with its real stat value
    date, opp, value,
    hit: value > LINES[key].line                       // cleared the typical line?
  }))
}));
""")
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:                                   # write to a temp file first...
        f.write("".join(body))
    os.replace(tmp, OUT)                                        # ...then swap it in, so a crash can't leave a half-written data.js
    print("wrote", os.path.normpath(OUT), file=sys.stderr)

main()
