# Dashboards — specification

Source of truth for what we are building. Derived from the Figma file
(`Untitled.fig`) plus decisions made 2026-07-26. If the design and this document
disagree, update this document — the code is built against this.

---

## Screens and flow

```
START PAGE
  ├─ format buttons (6)
  │     └─ click ─► FORMAT VIEW (two dashboards appear below)
  │                   ├─ Top 100 ladder        ─ click a name ──┐
  │                   └─ Recent top-100 replays ─ click ─► opens│replay
  │                                                 (new tab)   │
  └─ "search a player" box                                      │
        ├─ valid username ────────────────────────► PLAYER PAGE ◄┘
        └─ invalid ─► inline message "user not found" (below the box)
```

### Start page
- Buttons for every supported format (list below).
- Below the buttons, the **search a player** box.
- Selecting a format reveals two dashboards; it does not navigate away.

### Format view (two dashboards)
1. **Top 100 players** on that format's ladder — scrollable. Clicking a name
   loads that player's page, exactly as if their name had been typed into the
   search box.
2. **Recent replays from top 100 players** — a handful. Clicking one opens the
   replay on Pokémon Showdown **in a new browser tab**.

### Player page
All of the player's dashboards (widgets below).

---

## Widgets

### Player page
| Widget | Meaning |
|---|---|
| See Data From How Many Games? | User-controlled sample size — how many replays to analyze |
| ~~Formats~~ | **Removed 2026-08-09.** Every dashboard is now scoped to exactly one format (chosen in the filter, carried in the URL), so this table was a single row restating the filter. The format *picker* remains; the breakdown widget does not |
| Most Used Team | The player's most-brought **whole teams** — one row per distinct set brought together, not per Pokémon (changed 2026-08-09). Also the page's **team filter** (added 2026-08-12) |
| Most Common Wins | **Opposing** Pokémon appearing most often in the player's **wins** |
| Most Common Loses | **Opposing** Pokémon appearing most often in the player's **losses** |
| Players who beat you more than once | Opponents with 2+ wins against this player |
| Ladder Rank Over Time | Elo across the analyzed replays, chronological (line chart) |
| Most Used Tera | Most-chosen Tera types |
| Replay Showcase | Links out to individual replays (new tab) |

`Most Common Wins`/`Loses` = **opposing Pokémon** — "what you beat" and "what
beats you" (decided 2026-07-26; the other readings considered were the player's
own Pokémon by win rate, and head-to-head records vs other players).

### Team filter (added 2026-08-12)
Each row of `Most Used Team` carries a **"Filter by team"** radio. Selecting one
re-scopes **every widget on the page** — tiles, rating chart, matchups, rivals,
game length, Tera, replay showcase — to only the games where that team was
brought. **One team at a time**, hence radios rather than checkboxes. Clicking
the selected radio again clears the filter — a radio can't unset itself, so the
row handles `click` (which fires on an already-checked radio) alongside `change`
(which does not).

Rules this has to follow:
- **No re-fetch.** The replays are already downloaded and parsed, so the filter
  is `battles.filter(b => teamKeyOf(b) === key)` followed by a re-`aggregate()`.
  Instant, and no extra load on Showdown.
- **One definition of team identity.** `teamKeyOf(battle)` in `src/lib/aggregate.js`
  is exported and used by both `teamsUsed()` and the page filter. Two copies
  would let a row read "12 battles" and filter down to 11.
- **The widget keeps listing every team**, because it is the filter's own
  control — narrowing it to the selected row would remove the way back out. It
  reads `data.stats` (unfiltered) while everything else reads the filtered
  aggregate.
- **Say the scope out loud.** A banner above the dashboards names the team and
  offers "Show all teams"; a checked radio further down the page is not enough
  to explain why every number changed. It is also the keyboard route out, since
  arrow-key navigation within a radio group can't deselect.
- **Column widths are percentages, not fixed.** The team column is `nameWidth
  ="50%"` rather than `w-100`, which was squeezing Battles / Win rate / Filter
  into a scrunched pile on the right. Percentages let narrow screens scale
  instead of forcing the `.table-responsive` wrapper to scroll.
- **Cleared on a format change** (the six can't be legal in another format), but
  *not* on a game-count or unrated-toggle change — there the user is adjusting
  the sample for the team they're already reading.
- Battles without team preview belong to no team, so no filter can claim them.

### Design note answered
The Figma file asks:

> *"If it's allowed I want this to literally open a new tab to a replay from the
> pokemon showdown website. If that's not allowed im scrapping this idea entirely."*

**It is allowed.** Replay pages are public and linkable. Use a plain anchor —
`<a href={`https://replay.pokemonshowdown.com/${id}`} target="_blank"
rel="noopener noreferrer">`. This is navigation, not a `fetch`, so CORS is not
involved. Keep the feature.

---

## Supported formats

All six ladder endpoints verified live on 2026-07-26.

| Display label | formatid | Ladder |
|---|---|---|
| Gen 9 OU | `gen9ou` | 500 players |
| Gen 9 Ubers | `gen9ubers` | 500 players |
| Gen 9 UU | `gen9uu` | 500 players |
| Monotype | `gen9monotype` | 500 players |
| VGC 2026 Reg M-B | `gen9championsvgc2026regmb` | 500 players |
| Random Battle | `gen9randombattle` | 500 players |

**Do not guess formatids.** `gen9vgc2026regm` and `gen9vgc2026regmb` both look
plausible and both return `200` with an **empty** toplist — the endpoint does not
404 on a bad id, it echoes the id back as the format name. The real VGC id was
found by reading `formatid`s out of the live replay feed. Verify any new format
the same way, and treat "toplist is empty" as "this id is wrong".

Display labels must come from us: `gen9ou` reports `format: "OverUsed"`, but the
VGC ladder reports `format: "gen9championsvgc2026regmb"`.

---

## API facts (verified 2026-07-26)

All endpoints send `Access-Control-Allow-Origin: *`, so the browser calls them
directly and the app stays static (see the client-side constraint in CLAUDE.md).

| Need | Endpoint |
|---|---|
| Ladder | `https://pokemonshowdown.com/ladder/<formatid>.json` |
| A user's replays | `https://replay.pokemonshowdown.com/search.json?user=<id>` |
| …filtered by format | `…&user=<id>&format=<formatid>` |
| A format's recent replays | `https://replay.pokemonshowdown.com/search.json?format=<formatid>` |
| One replay (with log) | `https://replay.pokemonshowdown.com/<replayid>.json` |
| User profile / ratings | `https://pokemonshowdown.com/users/<id>.json` |

- **Ladder** returns **500** players, not 100 — slice for the top 100. One
  request supplies username, `w`/`l`/`t`, `gxe`, and `elo`, so the whole
  dashboard renders with no follow-up calls, and clicking a name costs nothing
  extra (we already hold the userid).
- **Replay search** returns **51 per page**; paginate with `&page=N`; a page with
  fewer than 51 is the last one. It also accepts `&format=<formatid>`, alone or
  together with `user`.
- **Pagination overlaps — deduplicate by replay id.** Consecutive pages can
  repeat a replay: 3 duplicates per 200 for `therazer456` and `relicstone`, 2 for
  `faronaan`. Undeduplicated, those replays are parsed and counted twice, which
  skews every statistic slightly and inflates the "available" count.
  `fetchAllReplayMeta` now tracks seen ids. Note the end-of-pages check must
  test the **raw** page length, not the deduplicated total, or a page that
  happened to be all duplicates would look like the end of the list.
- **Usernames** normalise to a "userid": lowercase, non-alphanumerics stripped.
  `"Blunder Policy"` → `blunderpolicy`. Route params use the userid.
- **Replay `log`** is the standard battle protocol. The lines we parse:
  `|player|`, `|poke|`, `|switch|`/`|drag|`/`|replace|`, `|faint|`,
  `|-terastallize|`, `|turn|`, `|win|`, `|tie|`, `|rated|`, `|tier|`, and
  `|-message|…forfeited`. Slots are `p1a`/`p1b` (doubles), and Pokémon are
  referred to by nickname, so nicknames must be mapped to species via the
  switch-in lines.

### Detecting an invalid username
`users/<id>.json` returns **200 with a complete-looking body for any name**,
echoing back whatever userid was asked for. A nonexistent user is identified by
`registertime: 0` and `ratings: {}`.

Treat a name as **valid** if `registertime > 0` **or** it has ≥1 public replay —
the second clause matters because unregistered players can still upload replays.
Otherwise show **"user not found"** beneath the search box.

### Recent top-100 replays — how it's built
Cannot be built from the format-wide replay feed: only **3 of 51** recent Gen 9
OU replays involved even a top-*500* player. It has to be per-player via
`?user=X&format=Y`.

Implemented in `useTopPlayerReplays.js`: query the **top 20** ranked players
(concurrency 6), take at most **3** replays each so one prolific uploader can't
fill the list, dedupe by replay id (two ranked players may have faced each
other), sort newest-first, show **20**. Cost: 20 requests per format view, and it
reuses the ladder the page already loaded rather than re-fetching it.

Verified 2026-07-26 — all six formats fill all 20 slots:

| Format | Ranked players with replays | Candidates | Shown |
|---|---|---|---|
| Gen 9 OU | 12/20 | 36 | 20/20 |
| Gen 9 Ubers | 16/20 | 48 | 20/20 |
| Gen 9 UU | 19/20 | 55 | 20/20 |
| Monotype | 16/20 | 47 | 20/20 |
| VGC 2026 Reg M-B | 9/20 | 27 | 20/20 |
| Random Battle | 20/20 | 60 | 20/20 |

VGC is the thinnest margin. If a future format drops below ~7 players with
replays the box will under-fill, so raise `PLAYERS_TO_QUERY` rather than
`MAX_PER_PLAYER` (more players keeps the list diverse; more per player doesn't).

"Recent" means recent *for that ladder* — the newest replay ranged from 2h to 59h
old across formats. That is normal, not a bug.

### Caching
`src/lib/cache.js` — in-memory, 5-minute TTL, shared per hook. Ladders are keyed
by formatid; replay lists by formatid + the top-20 player set (if the ladder
shifts, the old list no longer applies).

It caches the **promise**, not the value, so simultaneous callers share one
request. Failures are evicted immediately so a network blip can't poison a key
for five minutes.

Effect on request volume — clicking through all six formats and back:

| | First pass | Revisit within 5 min |
|---|---|---|
| Requests | 126 | **0** |

Two consequences worth remembering:

- **Do not pass a component's `AbortSignal` into a cached factory.** The promise
  is shared, so one component unmounting would cancel it for everyone. The hooks
  instead let the request finish and ignore the result via an `active` flag —
  which also means switching formats mid-flight still warms the cache.
- This incidentally fixes React `<StrictMode>`'s double-invoked effects in dev.
  The second run hits the cached promise, so dev costs 21 requests per format,
  not 42.

---

## Format scoping on the player page (added 2026-07-26)

**The player page is format-aware, and this is core to the project.** Blending
formats produces statistics that look fabricated.

The bug that forced this: clicking a top player on the **VGC 2026 Reg M-B**
ladder showed a populated "Most Used Tera" widget — but that format has no
Terastallization at all (verified: 0 Tera events across 20 replays, versus 15
across 10 replays of VGC 2025 Reg I). The numbers were real, read correctly from
`|-terastallize|` lines, but they came from the player's *other* formats. The
#2-ranked player on that ladder, `therazer456`, has **zero** public replays in
it — all 200 are VGC 2024 Reg H, 2026 Reg F, 2025 Reg I and older gens.

Rules now enforced:

- The selected format lives in the URL (`/player/<id>?format=<formatid>`), so a
  scoped dashboard is shareable.
- Clicking a name on a ladder carries **that ladder's format** through. Clicking
  a rival on the player page keeps the current scope.
- The **Format** dropdown lists only formats the player actually has replays in,
  with counts. **There is no "All formats" option** (removed 2026-08-09): it was
  the one choice that produced numbers describing no real game, and it made the
  game-count picker buy a mixed sample — asking for 50 games returned 50 replays
  spread across whatever the player happened to play. Arriving without a format
  now resolves to the player's **most-played** one, which is then written into
  the URL.
- **Never substitute another format's data.** With no replays in the selected
  format the page says so and offers to switch to their most-played format
  instead. Being ranked on a ladder does not mean uploading replays from it.
- The scope is always stated on the page: "45 battles · Gen 9 OU".

**Scoping fetches the format's own listing** (`?user=X&format=Y`), so
`MAX_REPLAY_LIMIT` applies *per format*. An earlier version filtered the
unfiltered listing client-side, which divided the 200 cap across every format a
player had ever touched — a scoped view could then never reach a full sample.
Measured: `relicstone` in Gen 9 OU went 46 → 65 replays, `faronaan` 120 → 135.

Cost is up to 4 extra requests when a format is selected, cached per
user+format.

The **format dropdown** is still built from the unfiltered listing, which stops
at 200. When it comes back full, those per-format counts are a floor, so they
render as `N+` with a note. Selecting a format then reports its real total.

## Data limitations (verified 2026-07-26 against 39 live replays, 17 formats)

**No team preview in Random Battle.** `gen9randombattle` logs contain **zero**
`|poke|` lines and no `|teampreview|`, unlike `gen9ou` and VGC (12 `|poke|` lines
each). The parser falls back to the Pokémon actually sent out, so `me.team` there
is only what was *revealed* — typically 3–5 of 6 — and never Pokémon that stayed
on the bench.

**Resolved 2026-08-09 for "Most Used Team".** Now that the widget identifies a
whole team rather than counting Pokémon, the fallback is not merely imprecise but
unusable: the same random team reveals a different subset every battle, so it
would never match itself and the table would be nothing but one-offs. `parseReplay`
therefore exposes `me.teamPreviewed` / `opponent.teamPreviewed`, and `teamsUsed()`
skips any battle without it. `stats.battlesWithoutTeamPreview` counts what was
left out so the widget can say so instead of quietly shrinking its sample. The
widget is accurate for OU / Ubers / UU / Monotype / VGC, which all use team
preview.

**A Pokémon can faint more than once.** Revival Blessing puts a fainted Pokémon
back on the team, so it can be knocked out again and appear on two `|faint|`
lines. Verified live 2026-08-10: `gen9purehackmons-2663042252` has 14 faint lines
across 8 Pokémon, three of them fainting twice. Consequences:
- `me.fainted` / `opponent.fainted` are a log of knockouts, **not** a set of
  Pokémon lost. Anything that wants "how many did they lose" must dedupe;
  `stats.knockouts` deliberately does not, because knocking the same Pokémon out
  twice really is two knockouts.
- `scripts/validate-parser.mjs` bounds *distinct* faints by team size, not the
  raw count.

**Six is not a universal team size.** `gen9randombattlesharedpowerb12p6` brings
**12** (the `b12` in the id), verified live 2026-08-09. Nothing may hard-code six:
`teamsUsed()` groups whatever the preview lists, the widget copy says "the full
team" rather than "the six", and `scripts/validate-parser.mjs` treats a team over
six as a note rather than a failure (it fails only above 24, which would mean the
parser is mixing the two sides). The faint-count check is against that battle's
own team size, not a flat six.

**Free-For-All is not tracked.** FFA formats (e.g. Free-For-All Random Battle)
have four players — `|player|p3|`, `|player|p4|`. Every dashboard here assumes a
single opponent, so `parseReplay` returns `null` for them and they never reach
any statistic. Decided 2026-07-26: FFA is simply out of scope — don't add a
widget for it, and don't report a skipped-FFA count in the UI. It is not a
supported format and isn't on the start page.

Re-run `node scripts/validate-parser.mjs [n]` after touching the parser. It
checks invariants (perspectives mirror each other, nicknames resolve to real
species, team sizes are sane — see "Six is not a universal team size" — and FFA
is declined) against live replays.

---

## Open questions
- ~~Should the player page be format-filtered?~~ Answered 2026-07-26: **yes**,
  see "Format scoping on the player page" above.
- What is the **"Internal Only Canvas"** frame in the Figma file for?
- ~~**"Top 100 Replay Showcase"** appears both as a frame name and as a widget
  label — is it the same thing as the format view's replay dashboard?~~ Answered
  2026-08-10: **two different things, both now built.** The Figma frame is the
  start page's "recent replays from top-100 players" (`ReplayList`, driven by
  `useTopPlayerReplays`). The player-page widget is *that player's* own analyzed
  battles (`ReplayShowcase`), which additionally knows each result and turn count
  because those replays have been parsed.
- ~~How many replays should "See Data From How Many Games?" offer?~~ Answered
  2026-07-26: options **25 / 50 / 100 / 200**, default **50**. Each step is one
  request per replay, so this is the user's main lever over both wait time and
  load on Showdown. Individual replays are cached for 30 minutes (a finished
  replay never changes), so raising 25 → 50 fetches only the 25 new ones, and
  lowering it again costs nothing. Verified: 50 network calls for a
  25 → 50 → 25 sequence, versus 100 uncached.

  **Options the player can't fill are greyed out**, and if they have fewer than
  25 the control says `only: N replays available` with every option disabled.
  Offering "200" to someone with 30 replays implies a 200-game sample and
  quietly delivers 30 — a misleading number, which is the one thing a stats site
  must not print. If the current selection exceeds what exists, it steps down to
  the largest usable option, and the "Battles analyzed" tile reads
  "of N available".

  To know the true count we always fetch the replay *listing* up to 200 (at most
  4 requests at 51/page, cached per user) and only download as many battle
  *logs* as the user asked for. Discovery is cheap; logs are the expensive part.
- Professor's requirements and due date are still unknown (`CLAUDE.md`).
