# OPUS BRIEF — NXT Build Sprint, day 1 afternoon (Sat 14 Nov 2026)

You are Opus 5.5 on spawn.co, joining a hackathon build mid-flight. Your lane is ONE bounded
deliverable: **rebuild the game map (`client/arena.json`) so it is recognisably Wellington
College**, transcribed from an approved schematic. Everything else is context so you don't break
what already works.

Repo: `github.com/49vxn/blocked` (clone it; never `git init` a new repo; never commit to `main`).

---

## 1. The product (why this map matters)

"Blocked" — a voxel survival game set in **Wellington College** (our real school, Wellington NZ),
built in 27 hours for Kevin's Year 11 class: exam week, every game site blocked on the school
network, nothing to do at lunch. The pitch is **"the map is the antagonist"**: the school itself
attacks three times a round. If the campus doesn't look like *their* school, the pitch dies.

- Survival: 8 seats free-for-all, 8-minute rounds, bots fill empty seats, last alive wins.
- Secondary mode `bedwars` (2v2, beds at red/blue bases) on the same map.
- Disasters on the server clock: **meteor 2:00** (takes the library roof), **flood 4:00**
  (fills the sunken school field — decision changed today: the field, NOT the quad),
  **earthquake 6:00** (cuts the science corridors).
- Deadlines: round-1 submission **Sun 14:00 NZ** (link + 2-min video), live demo 15:00.
  Soft freeze tonight 22:00 NZ, hard freeze Sun 09:30.

## 2. Hard rules (do not relitigate)

- **Server is authoritative** for positions, blocks, beds, clock (never trust client messages).
- `shared/protocol.ts` is **frozen** — one owner; do not edit it. Map data is *not* a protocol
  change: `arena.json` is data consumed through `ArenaSnapshot`.
- TypeScript strict, **no `any`** in new code, no new dependencies (only A runs `bun add`).
- No network requests at runtime; no CDNs, no external fonts/analytics.
- **Ruling #37 (organizer-sanctioned):** pre-built assets (atlas textures, arena.json, sfx) are
  legal and entered the repo after kickoff with a citation commit. Code was all written in-window.
- Gates that must stay green: `bun run verify` (10 checks — arena validity, two-client net,
  place/break, bots, round end), `bun test` (25 tests, 5 files), `tsc --noEmit`.
  Verify spawns its own server on port 4321 with `TEST_TIME_SCALE=60`.

## 3. Current state (verified just now)

- `main` @ `76fccf5`. Last four commits (Codebuff lanes, DeepSeek v4.1 flash):
  - `cff6461` verify: reap the real bun binary and always find a place target
  - `24b0aec` campus arena, bots, disasters, and real movement physics (229-fill arena)
  - `76fccf5` client: target, break and place, predicted movement, 2-block jump
  - `2d0d64b` (OpenCode, morning): skeleton — server, client join/move, verify gate, shared types
- Gates: **verify 10/10 PASS · 25 tests pass · tsc clean.** Game serves live on `:8080`
  (bundled client + 229-fill arena). A session is joined in a test browser ("kevin").
- **Known issues (do not fix in your lane, just know):**
  1. The 229-fill campus is an *invented generic school* — no Tower, no Alan Gibbs, no Firth,
     no terraces, no sunken field, bases not at the schematic positions. This is what you replace.
  2. Client hard-requires pointer lock (no right-drag fallback) — OpenCode is fixing that.
  3. `MAP.md` still says "quad flood"; decision today is **field flood** (see spec below).
  4. Uncommitted in-flight work exists (`client/main.ts` modified, `client/net.ts` new) —
     another lane is mid-task. **Stay out of `client/`, `server/`, `shared/`, `scripts/`.**

## 4. YOUR LANE — the campus map rebuild

Deliverable: a new `client/arena.json`, same format, replacing the invented campus.
**Touch only `client/arena.json`** (and, on a branch, nothing else). Work on branch
`opus/campus-map`.

### 4.1 Format

```json
{ "v": 1, "size": [64, 32, 64],
  "fills": [ { "zone": "library-roof", "from": [26,13,40], "to": [39,13,48], "block": 2 }, ... ],
  "spawns": { "red": [[x,y,z],...], "blue": [[x,y,z],...], "ffa": [[x,y,z] ×8] },
  "beds": { "red": [x,y,z], "blue": [x,y,z] } }
```

- Fills expand **inclusive** on every axis (`from` and `to` are both included).
- **Later fills overwrite earlier** — carve with air (`block: 0`) last, details after shells.
- `y` = 0..31 (32 tall); feet-cell convention: a spawn at `[x,1,z]` stands ON block y=0.
- Arena `size` must stay `[64, 32, 64]`.

### 4.2 Ground plan (transcribed from the approved schematic)

Schematic: `campus-schematic-64.png` — a proposed 64×64 translation, image is 1024 px wide,
**16.02 px per grid cell**, grid (0,0) at image top-left. Bases sit at **grid (10,10) red / (54,54)
blue — 44 blocks apart on each axis** (62 diagonal), per the schematic caption.

| Zone (image label) | Grid rect x | Grid rect z | What it is |
|---|---|---|---|
| NO 1 FIELD / FLOOD | 6–50 | 3–20 | **Sunken grass basin** — the flood basin. Floor 4 deep (basin floor surface y≈1), campus level y≈5. Real field has **stairs leading down into it** on the south side. |
| TERRACES | 6–50 | 20–23 | Stepped bank (4 one-block steps) rising from the basin rim to campus level. The step between field and buildings. |
| TOWER | 26–34 | 24–32 | The Tower Block — **6 storeys**, tall, concrete frame + glass bands. Tallest thing on the map. |
| ALAN GIBBS | 34–46 | 24–34 | Alan Gibbs Centre — 2–3 storeys, wood/plaster, modern. |
| FIRTH | 34–44 | 34–38 | Firth Hall — 2 storeys, big open interior hall, brick. |
| TURF / GYM | 46–58 | 24–44 | Turf + gym — big low shed (steel roof), turf floor, court markings outside. |
| SCIENCE / MATHS | 6–26 | 40–50 | Science/Maths block — 2 storeys brick, **long E–W corridors** (the earthquake cuts these). |
| LIBRARY | 26–40 | 40–49 | Library — 2 storeys brick + mezzanine, **flat roof slab = the meteor target**, highest roof in the centre. |
| NO 3 FIELD | 40–60 | 52–62 | Flat grass field at campus level (not sunken), blue base sits in it. |
| Path | diagonal | — | Paver path **red (10,10) → bend → blue (54,54)**, stepped 2×2 so it's walkable both directions. Schematic bend points (grid): (10,10) → (26,21) → (30,28) → (33,45) → (46,56) → (54,54). Crosses the terraces — put stairs there. |

Orientation: schematic top = grid north (z small). Red NW, blue SE. The beige margin in the
schematic is outside the 64×64 grid.

### 4.3 Vertical plan (campus ground = y 4 solid, feet at y 5)

- Basin floor (no. 1 field): ground surface y 0 (feet y 1) — **4 below campus**.
- Terraces: 4 one-block steps z 20→23 (y 1,2,3,4 tops) spanning x 6–50.
- Buildings rise from y 5:
  - **Tower**: 6 storeys ≈ 24 tall (top ≈ y 29). Concrete (5) frame, glass (4/22/23) bands,
    stone (9) plinth. Stair core inside — make it climbable.
  - **Alan Gibbs**: 3 storeys ≈ 12 (plaster 12/13, wood 3, slate roof 14).
  - **Firth**: 2 storeys ≈ 8, brick (2), worn roof (15), **open hall interior** (carve air).
  - **Science/Maths**: 2 storeys ≈ 8, brick (2/31), three parallel E–W corridors with doorways
    (16) — corridors must be long, straight, and cut-able.
  - **Library**: 2 storeys ≈ 8, brick (2), mezzanine + shelf (25) interior, **flat roof slab**
    (concrete 5 or slate 14) — the meteor takes this. Keep it the tallest centre roof.
  - **Turf/Gym**: one volume ≈ 6 tall, steel (20) roof, turf floor (27), court (26) markings
    on the tarmac outside.
- Roofs: slate (14) / worn (15) / terracotta (30) per building to read as separate blocks.
- Greenery: hedge (19) lines along boundaries; grass (1) fields; gravel (28) margins.
- Bases: walled pads at (10,10) and (54,54) — 3-high wall, bed inside. Red bed block **6**,
  blue bed block **34** (blue bed is column 33 in the atlas — verify expects literal id 6 for
  red bed and id 34 renders as blue bed; the current map used 6 and 34).

### 4.4 Block palette (atlas v5 — 34 ids, `col = id − 1`)

1 grass · 2 brick · 3 wood · 4 glass · 5 concrete · 6 bed (red) · 7 iron · 8 water ·
9 stone · 10 stone-cracked · 11 stone-mossy · 12 plaster · 13 plaster-dirty · 14 roof-slate ·
15 roof-worn · 16 door · 17 pavers · 18 pavers-wet · 19 hedge · 20 steel · 21 steel-rusted ·
22 glass-green · 23 glass-dark · 24 carpet · 25 shelf · 26 court · 27 turf · 28 gravel ·
29 blackboard · 30 roof-terracotta · 31 brick-aged · 32 brick-mossy · 33 brick-gold ·
34 bed (blue). Faces: rows top/side/bottom; side row is shared by all four vertical faces.

### 4.5 Hard requirements from the verify gate (frozen — the gate will judge you)

1. `size` exactly `[64, 32, 64]`; every fill coordinate in bounds.
2. **8 `spawns.ffa`** points: cell air, cell above air (head room), block below solid
   (feet-cell convention), **every pair ≥ 12 apart** in x/z (aim ≥ 30 — the current map
   achieves 30.02; don't regress it).
3. Spread the 8 across the campus (science, library mezzanine, firth hall, gym, turf,
   path mid-point, no. 3 field edge, tower base or similar). Each should have buildable
   structure within a few blocks (cover matters for gameplay).
4. `spawns.red` / `spawns.blue`: air cell + solid ground below; several points each is fine.
5. `beds.red` cell = block 6, `beds.blue` = block 34, each with solid ground below.
6. Water (8) is placed by the flood disaster at runtime — **don't pre-fill the basin with water**;
   the basin is just a deep grass depression.
7. Keep walkability sane: doors/carved openings connect interiors to the path; the path network
   must connect red base → blue base without parkour (2-block steps max, prefer 1).

### 4.6 Done criteria

1. `bun run verify` → **PASS** (it loads your arena.json).
2. Walk test by Kevin (human): open `http://localhost:8080`, join, walk — Tower is the tower,
   field is *the* field with the stairs, library reads as the library. He is the acceptance gate.
3. Zone recognisability > exact geometry. A student must say "that's our school" in ~10 seconds.

### 4.7 Return contract (spawn → us)

- Best: push branch `opus/campus-map` to `github.com/49vxn/blocked` with exactly one changed
  file (`client/arena.json`) and a commit message saying what changed. OpenCode merges after
  gates pass. Do NOT merge to `main` yourself. Do NOT create tags (`playable-*`, `freeze`,
  `gold` are the human's job).
- Alternative (if spawn can't push): return the complete `arena.json` file content; OpenCode
  writes it in and runs the gates.

## 5. Reference material (upload these into the spawn workspace if you can)

- `docs/reference/campus-schematic-64.png` — **the approved ground plan** (section 4.2 transcribes it).
- `docs/reference/campus-map-2024.png` — official campus map (also `mapper/campus-hi.png` in the repo).
- `docs/reference/campus-zones-annotated.png` — zones overlay.
- `docs/reference/photo-index.md` + `docs/reference/photos/` — named photos of every block
  (Tower, Science, Maths, Alan Gibbs, Firth Hall, fields, terraces…). Use for volume/roof character.
- `client/textures/atlas.png` + `manifest.json` — the palette your block ids map to (in the repo).

## 6. Team & roles (so you don't collide)

- **Kevin (human, "A")** — drives, walks the map (acceptance), owns tags, owns deps.
- **OpenCode (GLM 5.3, free agent)** — gates, server/client fixes, pointer-lock fallback,
  MAP.md/DEMO.md alignment, merges your branch. Talk to it through Kevin.
- **Codebuff lanes (DeepSeek v4.1 flash)** — built bots/disasters/physics/atlas this morning;
  may still be mid-task in `client/` — another reason you touch only `client/arena.json`.
- **nobills ("B", UTC+3, offline right now)** — client/content by his shift (his 11:00 = NZ 21:00);
  QA on arena.json is partially his too — keep the file clean and commented via `zone` fields.

## 7. Complete file inventory (verbatim, three roots)

### 7.1 `C:\Users\Kevin\Documents\30hrHACKATHON` — planning workspace (internal, NOT judge-facing)

```
.gitattributes  160
.gitignore  552
AGENTS.md  3334
HACKATHON.md  4991
LIVE-TEST.md  2446
MAP.md  11166
PLAN.md  4602
PROTOCOL.md  10600
README.md  2581
WORKFLOW.md  5605
.freebuff/.gitignore  114
.freebuff/project-id  37
.github/pull_request_template.md  323
client/arena.json  12671          (stale duplicate — staging/repo versions supersede it)
docs/ASSETS.md  2036
docs/AUDIT-fri-verify.md  11602
docs/AUDIT-fri.md  33464
docs/B-SIM.md  15856
docs/DECISIONS.md  8820           ← every pre-sprint decision, see §8
docs/DELEGATION-sat.md  7706      ← today's lane prompts (DeepSeek SFX, bots, Sol B2, Muse audit)
docs/DEMO.md  8563                ← video script (round-1 filter) + 3-min live demo script
docs/ENGINE.md  10678             ← module map + build order
docs/FRIEND-SETUP.md  3215
docs/GITHUB.md  4429
docs/HANDOFF.md  11618            ← current state, Sat entries
docs/KICKOFF.md  8009
docs/RUNBOOK.md  11984
docs/SCHEDULE.md  3793
docs/SCHOOL-SURVEY.md  3466
docs/TASKS.md  6973
docs/TOOLS.md  7441
docs/VERIFY.md  12255             ← the frozen gate spec (what verify.ts implements)
docs/reference/campus-aerial-linz.jpg  149922
docs/reference/campus-map-2024.pdf  12987848
docs/reference/campus-map-2024.png  442465
docs/reference/campus-schematic-64.png  36138   ← THE MAP BLUEPRINT (your input)
docs/reference/campus-zones-annotated.png  376026
docs/reference/commons.json  151403
docs/reference/contact-sheet-all.jpg  964391
docs/reference/contact-sheet-preview.jpg  271393
docs/reference/hero-sheet.jpg  563479
docs/reference/map-central-crop.png  723147
docs/reference/photo-index.md  13115
docs/reference/REFERENCE.md  12903
docs/reference/photos/ (37 named photos, jpg/png, ~35 MB total)
  Alan-Gibbs-Centre-and-Reception, Alan-Gibbs-Centre, Art-Block, Canteen-and-BreWCafe,
  Careers-and-Transition-Department, Counselling-Department, E-block,
  Edward-George-Honey-1885-1922, Entrance-to-the-Wellington-College-archives,
  Firth-House-remnants, Frank-Crist-Centre, House-Point-Counter, International-Centre,
  Language-Centre, manifest.json, Math-Block, Music-Centre, Number-1-field (+Alternate),
  Number-2-field (+Alternate), Number-3-field, Old-Boys-Centre, Opening-of-the-Memorial-Hall,
  Pavilion, Science-Block, Sports-Centre, St-Patrick-s-College-haka-2008,
  Student-Services-Centre, Te-Whare, Technology-Block, Terraces-being-rebuilt,
  Theatre-and-Firth-Hall, Tower-Block, Uniform-Shop, V1-FL73395669, V1-FL73877627,
  Wellington-College-letter-of-thanks (Treaty of Versailles), Old-Wooden-Building-circa-1880,
  with-cricket-game-in-progress-ca-1900, Wellington-college
```

### 7.2 `C:\Users\Kevin\Documents\30hrHACKATHON-assets` — asset staging (Fri night pre-build, #37)

```
arena.json  44834                 (old 65-fill map — superseded by the repo's 229-fill one)
atlas.png  10572                  (544×48, 34 cols × 3 face rows — the texture atlas)
manifest.json  36956              (v5 block contract)
build_textures.py  1090
_p0.png  7783 · _p1.png  11354    (atlas preview renders)
MAP-NOTES.md  2825                (science corridor crossing verification, old map)
NOTES.md  4152                    (atlas contract + QA notes)
README.md  1586
texture_system/  details.py 3028 · painters.py 13612 · palette.py 1666 · registry.py 11987
                                  · render.py 10373 · __init__.py 76
tiles/  52 PNGs — 01-grass(-top/-bottom) 02-brick 03-wood 04-glass 05-concrete 06-bed
        07-iron 08-water 09-stone 10-stone-cracked 11-stone-mossy 12-plaster 13-plaster-dirty
        14-roof-slate 15-roof-worn 16-door 17-pavers 18-pavers-wet 19-hedge 20-steel
        21-steel-rusted 22-glass-green 23-glass-dark 24-carpet 25-shelf 26-court 27-turf
        28-gravel 29-blackboard 30-roof-terracotta 31-brick-aged 32-brick-mossy 33-brick-gold
        34-bed-blue(-top/-bottom)
```

### 7.3 `C:\Users\Kevin\Documents\blocked` — the judge repo (= github.com/49vxn/blocked)

```
.gitignore  206 · AGENTS.md 3334 · bun.lock 20211 · HANDOFF.md 2655 · MAP.md 11206
package.json 459 · PROTOCOL.md 10600 · README.md 2581 · tsconfig.json 360 · vite.config.ts 422
.agents/handoff/2026-11-14T{1145,1152,1156}/  (test.log, typecheck.log, verify-arena.log, verify.log)
client/arena.json  44834          ← YOUR DELIVERABLE (currently the invented 229-fill campus)
client/index.html  1613 · client/main.ts  9433 · client/net.ts  4286 (uncommitted, in-flight)
client/preview.html  1079 · client/preview.ts  2693 · client/render.ts  3728
client/engine/arena.ts  683 · engine/blocks.ts  2464 · engine/random.ts  621
client/engine/raycast.ts  2510 · engine/world.ts  3994
client/engine/render/atlas.ts  1144 · render/chunk-mesher.ts  5954 · render/chunks.ts  2836
client/engine/render/light.ts  8976 · render/mesher.ts  6622 · render/shaders.ts  9699
client/engine/render/sky.ts  2577
client/textures/atlas.png  10572 · client/textures/manifest.json  36956
docs/CHANGELOG.md  3919 · docs/ENGINE.md  10678 · docs/SCHEDULE.md  3793 · docs/STATE.md  3095
docs/TASKS.md  6973 · docs/WALL-CHECKLIST.html  8457
docs/compaction/  DECISIONS.md 1461 · NEXT.md 1045 · README.md 474 · WORKSTREAMS.md 1873
                  · sessions/2026-11-14-01.md 7645 · sessions/README.md 156
mapper/campus-hi.png  1315902 · mapper/campus-regions.json  1897 (Kevin's hand-drawn regions,
                  source-image pixel rects over campus-map-2024: library, two buildings, path,
                  building — see file for exact numbers)
mapper/index.html  3585 · mapper/main.js  12080
scripts/verify.ts  11177          ← the gate (frozen behaviour)
server/disasters.ts  3608 · server/index.ts  20775
shared/blocks.ts  2052 · shared/constants.ts  1501 · shared/movement.ts  3976
shared/protocol.ts  2426          ← FROZEN, do not edit
tasks/README.md  714
tests/blocks.test.ts  2866 · tests/disasters.test.ts  3252 · tests/movement.test.ts  2565
tests/net.test.ts  2156 · tests/raycast.test.ts  1443
viewer/index.html  2562 · viewer/main.js  13121 · viewer/server.js  1748
viewer/server.log  59 · viewer/vite.log  5627
```

## 8. Decisions you must respect (from docs/DECISIONS.md — full file available on request)

- **#11** server authoritative for blocks/beds/positions/clock — never.
- **#15** `shared/protocol.ts` one owner (A), frozen.
- **#16** maps are fill operations expanded to a grid (inclusive, later-overwrites-earlier).
- **#24** 2:00pm Sunday hard deadline, finalist showcase 3:00pm.
- **#29** fresh judge repo at kickoff; the planning workspace stays internal.
- **#33** online for judges (tunnel), LAN for the story.
- **#36** team: Kevin + nobills (UTC+3, async); powtr out.
- **#37** pre-built assets legal (organizer ruling); pre-built code was not; no staged commits.
- **#38** survival is the product; bedwars is the coded fallback. Disasters 2:00/4:00/6:00.
- Today's addition: **flood basin = the school field** (sunken, with stairs), not the quad.

## 9. Anti-collision summary

Touch ONLY `client/arena.json` on branch `opus/campus-map`. Everything else is owned by
OpenCode or in-flight Codebuff lanes. If you believe a code change is required (e.g. the
disaster code needs a named zone), STOP and say so in your final message instead of editing.

Final message format: what you built, zone table you actually implemented (rects + heights),
verify output pasted, spawn count + min pairwise distance, anything you couldn't honour.
