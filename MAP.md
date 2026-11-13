# The map: our school

One arena, 64 blocks wide × 64 deep × 32 tall (`size` `[64, 32, 64]`, `[x, y, z]`). Hand-built, described as fill operations rather than a cell list, and
materialised into a `Uint8Array` at load. Recognisable by silhouette and landmarks, not by accuracy.

**One map, two modes.** The school is the game: the primary mode is **Survival** — eight players
(bots fill empty slots) scattered across the school, no beds, last one standing wins — and the map
itself is the antagonist. **Bedwars** is the secondary mode on the same geometry (see `PLAN.md`).
Nothing in the map is bedwars-specific except the two beds.

## File format: `client/arena.json`

Do **not** write a 131,072-cell array. Write 50–200 fill operations; the client expands them.

```json
{
  "v": 1,
  "size": [64, 32, 64],
  "fills": [
    { "zone": "ground",  "from": [0, 0, 0],   "to": [63, 0, 63], "block": 1 },
    { "zone": "library shell", "from": [24, 1, 24], "to": [39, 6, 39], "block": 2 },
    { "zone": "library interior", "from": [25, 1, 25], "to": [38, 6, 38], "block": 0 },
    { "zone": "library roof", "from": [24, 7, 24], "to": [39, 7, 39], "block": 7 },
    { "zone": "quad",    "from": [0, 1, 44],  "to": [63, 1, 63], "block": 5 }
  ],
  "spawns": { "red": [[8, 1, 8]], "blue": [[56, 1, 56]] },
  "beds":   { "red": [10, 1, 8],  "blue": [54, 1, 56] }
}
```

Rules:

- `from`/`to` are inclusive corners; a fill writes `block` into every cell.
- All coordinates are `[x, y, z]`: 64 wide (x), **32 tall (y)**, 64 deep (z) — so `size` is
  `[64, 32, 64]`. Ground is `y=0`, the library roof `y=7`. Later fills overwrite earlier ones,
  so order matters: ground first, structures after, **interior air carves after their shell**.
- `block`: 0 air, 1 ground, 2 wall, 3 wood, 4 glass, 5 stone, 6 bed, 7 metal, 8 water.
  (8 is flood-only and never hand-placed. Beds are placed as block 6 **and** tracked as entities —
  the block is what renders, `BedState` is what takes damage.)
- `zone` is a label only; it exists so a human can find the line to edit.
- Spawns and beds are `[x, y, z]` cell coordinates of the **cell the player's feet occupy** — `y=1`
  stands on the `y=0` ground, so a valid spawn has air at `y` and a solid block at `y−1`.
  The staging map is validated against exactly that rule (see `docs/VERIFY.md`).
- Client loads it once, expands to `Uint8Array`, never rewrites it.
- The example above omits `spawns.ffa` for brevity; the shipped `arena.json` carries the eight
  survival points listed under **Spawns**.

## Layout (top-down)

```
        N
  +----------------+
  |  SCIENCE       |   bases: NW (red), SE (blue)
  |  BLOCK    []   |
  |                |
  |     LIBRARY    |   centre: two-storey, roof, mezzanine
  |     ######     |
  |                |
  |  []      QUAD  |   open, low cover, floods first
  +----------------+
        S
```

| Zone | What it offers | Threat, and when | How to play it |
|---|---|---|---|
| **Library** (centre) | Flat roof, tallest cover, mezzanine sightlines over the middle crossing | **Meteor 2:00** takes the roof — the best cover decays first (meteor is biased to the library, see `ENGINE.md`) | Fight here early. After 2:00 the centre is exposed; fall back and rotate |
| **Quad** (south) | Flat and fast, no cover | **Flood 4:00** rises 4 blocks — movement crawls in it | Cross before 4:00. After, it is a blue killzone: go around, or accept a slow fight |
| **Science block** (north) | Tight corridors, the quiet flank into the blue base | **Earthquake 6:00** collapses the corridors, cutting the flank | Raid through it mid-round. Leave by 6:00 — after, it strands you |
| **Bases** (NW, SE) | Bed, spawn pad, 3-high wall, indestructible floor — **bedwars only** | Never targeted directly; the earthquake can still land here | Bedwars: hold the wall. Once a bed dies there is no respawn — the endgame is fought here |
| **Middle** (raised crossing) | The only fast route between bases | Every disaster reaches it eventually | The obvious fight 0:00–2:00. Whoever holds it dictates the rotation |

Read it as a minute-by-minute threat map: every zone is safe until one clock strikes.

## Blocks (eight) — Wellington College palette

The arena should read as WC: red-brick main block, cream window joinery, pale concrete tower, dark
iron roofs, green Town Belt fields. School colours are **black and gold** — they live in the HUD,
banner and name tags (`hud.ts`), not in the terrain tiles.

**Three tiles per block, not one.** Every block has a **top**, a **side** and a **bottom**; the four
vertical faces share the side tile. This is the fix for v1 of the atlas, which packed a single tile
and stretched it over all six faces — grass grew no dirt on its sides, and the 1-px contact shadow
baked in for walls drew a dark line across every rooftop. Only the **side** row carries that contact
shadow; tops and bottoms never do.

| Block | Top (`+y`) | Side (`±x`, `±z`) | Bottom (`−y`) | Reads as |
|---|---|---|---|---|
| 1 Grass | `#55703a` + 26 scattered blades `#6b8a48` / `#45602e`; **no dirt** | dirt `#7a6a4a` with `#6a5b3d` / `#8d7d5c` speckle, ragged 2–5 px turf fringe `#55703a` at the top | plain dirt, tree-root speckle | the fields |
| 2 Brick | cream mortar `#d8cfc0` courses every 4 px, bricks `#8e4a3a` ±6, offset joints, flat (no rim) | same courses, **plus a 1-px top highlight and bottom contact shadow** | same courses, tighter spread, no rim | main block, library walls |
| 3 Wood | **end grain**: growth rings `#7a5535` at r=2 and r=5, pale ring `#b58a5e` at r=7, off-centre pith | vertical grain `#7a5535` every 2–3 px, 1-px `#b58a5e` highlight | end grain, 8% darker | desks, shelves, Firth Hall weatherboard |
| 4 Glass | pane `#b8dbe8` at 80% alpha, 2-px cream frame `#efe6d2`, one 45° white-30% glare | pane + frame + **centre mullion at x=8** + glare | frame and a solid `#b8dbe8` back panel at 90% | cream-framed windows |
| 5 Concrete | pale `#b9bcbe` + `#a6a9ab` speckle, joint-free (it is the slab surface) | same + horizontal joints `#9fa2a4` at y=4 and y=12 | `#b9bcbe` at 88%, sparse speckle | Tower Block, Science/Languages, the quad surface |
| 6 Bed (red) | wool `#b5342f`, 3-row pillow `#e8e4da` at the head, 1-px frame `#4a3a2e` | blanket over a wooden base: 5-px `#4a3a2e` plinth, plank line, centre fold | wooden underside, two plank seams | the objective (bedwars) |
| 34 Bed (blue) | same geometry, wool `#2f5fb3` | same | same | the other team's objective |
| 7 Iron | welded sheet: `#4a5055` rim, `#383d42` field, seams `#2e3236` at y=5 and y=10 | 1-px corrugation alternating `#383d42` / `#26292d`, top highlight `#4a5055` | `#26292d` with two `#2e3236` seams | the library roof, base floor |
| 8 Water | surface: 2-px `#a8d4ee` line at the top, `#5a8fd6` wave dashes on a 70%-alpha `#3f76c9` body | body only, 8% darker below y=9, no surface line | body at 80%, 70% alpha | the flood |

### Atlas layout (`client/textures/atlas.png`, 544×48)

| | |
|---|---|
| Grid | 34 columns × 3 rows of 16×16 tiles, no padding or bleed |
| Column | `col = blockId − 1`; block ids run 1–34 (see below) |
| Row | 0 = top, 1 = side, 2 = bottom |
| Sampling | `NearestFilter`, `generateMipmaps = false`, `repeat` off, one opaque material |
| Source of truth | `client/textures/manifest.json` — per block: `rect`, `faces` (face → row), `face_files`, palette, pattern params |

Face index → row, in `PROTOCOL.md`'s `face` order (`+x, −x, +y, −y, +z, −z`): **`[1, 1, 0, 2, 1, 1]`**.
UVs for atlas cell `(col, row)`, with the texture's default `flipY`:
`u0 = col/34`, `u1 = (col+1)/34`, `v0 = 1 − (row+1)/3`, `v1 = 1 − row/3`. The local corner order is
unchanged, so one UV rewrite on the chunk geometry selects the face and nothing else moves.

**Eight shipped ids, 34 available.** The map and protocol only need ids 1–8: the arena as built uses
1–7 plus disaster water 8. The atlas also carries 26 extra tiles (ids 9–34: stone, plaster, slate
roofs, doors, pavers, hedge, steel, tinted glazing, carpet, shelves, court, turf, gravel, blackboard,
terracotta, brick variants, and the blue bed). `block` is a `uint8` in the snapshot, so using them is
a **data** change in `arena.json`, not a protocol change — B may dress a zone with them, but nothing
in the gate depends on it.

No CDN, no licensing, no downloads. An optional moodboard may exist at
`docs/reference-block-textures.png` — if it is missing, **the per-face recipes above and the
pre-built atlas are the spec**. The atlas and `manifest.json` are pre-built assets (decision #37),
copied in at kickoff; the fallback is to draw flat colours from the block ids.

One destructibility nuance: block 7 is player-indestructible (base floor), but **disasters delete
every block, including the iron roof** — that is the meteor beat.

## Spawns

`arena.json` carries both sets; the server picks by mode.

- **Survival (primary):** `spawns.ffa` — eight scattered points, one per seat, every pair at least
  12 blocks apart in `x`/`z` so nobody starts in a fight. Same rule as everything else: air at `y`
  and `y + 1` (head room), solid at `y − 1`. Validated in the shipped `arena.json`:

  `[6,1,18]` `[22,2,18]` `[50,1,16]` `[5,1,30]` `[58,1,30]` `[14,2,55]` `[50,2,58]` `[32,2,60]`

  (West, north-west, north-east, west flank, east flank, and three on the quad slab — the quad is
  the first zone to flood, so a third of the seats start where the water is going.)
- **Bedwars (secondary):** `spawns.red = [[8, 1, 8]]`, `spawns.blue = [[56, 1, 56]]`, beds at
  `[10, 1, 8]` and `[54, 1, 56]`, walls facing centre.
- Spawn kit: sword, 32 wood. Survival adds **3 respawns' worth of nothing** — there are no
  respawns, so the kit is what you have. No inventory, no crafting.

## Destruction rules

- Map blocks are indestructible except by disasters; player-placed blocks can always be broken.
- Survival: no beds, no teams, no respawn. Disasters kill, the last player standing wins.
- Bedwars: beds take player damage and disaster damage.
- Water is decorative: it slows movement, it does not flow.

## Building the map in 2 hours

> **The arena already exists.** `client/arena.json` is a pre-built asset (decision #37): 61 fills,
> size `[64, 32, 64]`, shell + carved interiors, validated spawns and beds. The steps below are the
> **fallback** if that file fails QA — do not author the map from scratch by default.

1. Heightmap: flat 64×64 at `y=0`, walls at the border.
2. Library box: 16×16 footprint, 8 high, roof slab at y=7, two shelf rows.
3. Science corridors: two 3-wide halls crossing.
4. Quad: benches, a flagpole.
5. Bases: floor, wall, bed, spawn pad.
6. Fill `arena.json`, load it in the client, walk it once, adjust.

If time runs short: ship the library and the two bases only. The disasters matter more than the
school's floor plan.

## Fallback: top-down 2D

If the arena is not rendering from `arena.json` by **15:30 Saturday**, switch the renderer to a
top-down 2D canvas. At 64×64 that reads perfectly, and B can iterate on it without fighting chunk
meshing. It is a planned fallback, not an emergency.
