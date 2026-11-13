# Engine plan

Small and boring on purpose. Seven server modules, five client modules, one shared contract. Everything
below is written during the sprint.

## Server

```
server/
  index.ts      Bun.serve: static files, /ws upgrade, room lifecycle
  room.ts       players, mode, phase, tick loop, input buffer, snapshots
  world.ts      block grid, place/break validation, dirty chunks
  survival.ts   hp, deaths, kill feed, last-standing check
  bots.ts       server-side players that wander, chase and swing
  beds.ts       bed entities, damage, respawn rules  (bedwars mode only)
  disasters.ts  meteor, flood, earthquake as block operations

The room has a `mode`: **survival** (default, the headline) or **bedwars** (secondary). Both run on
`world.ts` + `disasters.ts`; only the win condition and the bed module differ. That split is what
makes bedwars the fallback instead of a second codebase.
```

### `world.ts`

- Grid: `Uint8Array(64 * 64 * 32)`, index `x + z*64 + y*64*64`.
- `get(x,y,z)`, `set(x,y,z,id)`, `isSolid(x,y,z)`, `place()`, `break()`.
- Place rules: within 5 blocks, against a face, empty target, inside bounds, block budget > 0, not
  inside a player hitbox.
- Break rules: within 5 blocks, line of sight (voxel ray), block was player-placed or disaster-marked;
  map blocks are indestructible.
- Dirty set: chunk coordinates touched this tick, drained by `room.ts` into the snapshot.

### `room.ts`

- `Player`: id, name, bot, team (`null` in survival), position, yaw, hp, alive, lastInputSeq.
- `Phase`: `lobby | countdown | live | over`; round clock in ticks.
- Tick 20 Hz: apply queued inputs, step bots, step movement, resolve kills and the win condition.
- Snapshot 10 Hz: players + changed blocks + beds (`[]` in survival) + phase.
- Late join: rejected while `over`; allowed mid-round if a seat is free — a survival death is
  **final**, so a late joiner takes a spectator slot, not a respawn.

### `bots.ts`

Bots exist for two reasons: the pitch is "you against the school", and the demo must not depend on
a friend being awake to join. A bot is an ordinary `Player` with `bot: true` and no socket, stepped
on the server tick — it is authoritative like everyone else, and clients cannot tell the difference
except by the name.

- **Budget:** 1h for a straight-line brain: pick the nearest living target within 24 blocks, walk
  toward it with `stepMovement` (same collision code as a player, so bots cannot clip), swing when
  within 5 blocks on a 600 ms cooldown, otherwise wander to a random point.
- **Fairness:** bots move at 90% of player speed and swing at 600 ms vs the player's 400 ms.
- **Fear:** a bot inside a disaster's `cells` radius retreats away from the epicentre for 2 s. That
  one rule is what makes the disasters read as a threat to someone other than the player.
- **Never:** bots do not place or break blocks. That keeps `place`/`break` authority rules out of
their path and keeps a bot bug from corrupting the map.
- **Count:** host sets `bots: 0–7` in the lobby; empty seats up to 8 are filled to `bots`.

### `survival.ts`

- `attack` on a player deals 20 hp; hp ≤ 0 sets `alive = false` and broadcasts a `death` event with
  the killer's name. Deaths are final for the round.
- **Win:** when one player is alive (and at least two started), `round` fires with `winnerId` and
  `winnerName`. If the clock expires first, the player with the most hp wins; equal hp is a draw.
- The dead keep their socket and fly a free camera — spectating is cheaper than a kick and stops
  the reconnect path from rejoining a live round.

### `beds.ts`

- Bed = team, position, hp (100), alive.
- Damage from player hits and disasters; destruction broadcasts `event`.
- Respawn: 3 s if the bed is alive; otherwise the player is out.

### `disasters.ts`

| Function | Operation |
|---|---|
| `meteor(world, rng)` | 5 columns of 3×3 deleted; a particle/dust burst at each impact (there is no fire block id). **Bias the columns to the library zone** — the demo beat is "the roof comes off", and a fully random target misses it |
| `flood(world, level)` | fill air up to `level + 4` from the lowest corner |
| `earthquake(world, rng)` | delete sphere radius 6; mark placed blocks breakable |

Each returns the changed block list; `room.ts` broadcasts it with a `disaster` event.

## Client

```
client/
  index.html
  main.ts     socket, input, prediction, interpolation, round loop
  render.ts   chunk meshing, one material, vertex colours
  hud.ts      timer, alive count, kill feed, HP, banner, win screen, name tags
  audio.ts    WebAudio cue set, noise + filter + envelope (see `### audio.ts` below)
  arena.json  the school map, as fill operations (see MAP.md), expanded to Uint8Array at load
```

### `render.ts`

- One `BufferGeometry` per 16×16×32 chunk; face culling only (no greedy meshing at this size).
- **One material, one texture, per-face UVs.** The atlas is 544×48: 34 sixteen-pixel columns
  (block id − 1) by three rows — **row 0 top, row 1 side, row 2 bottom**. A block's four vertical
  faces share the side row, which is why three tiles per block is enough and six is not needed. In
  `PROTOCOL.md` face order (`+x, −x, +y, −y, +z, −z`) the row index is `[1, 1, 0, 2, 1, 1]`. The
  pre-built `client/textures/manifest.json` lists `faces` (face → row) and `face_files` per block;
  read it at load rather than hardcoding which blocks have a distinct top.
- UVs are computed once per face when the chunk geometry is built: `u0 = col/34`, `u1 = (col+1)/34`,
  `v0 = 1 − (row+1)/3`, `v1 = 1 − row/3` with the texture's default `flipY`. This keeps the single
  material and the single draw call per chunk; do **not** switch to a material array, and do not
  give water its own transparent pass — every atlas cell is opaque on purpose.
- `vertexColors: true` stays on for face shading (sun-lit tops, shaded sides). `NearestFilter`,
  `generateMipmaps = false`, no repeat, no post-processing.
- Rebuild at most **one dirty chunk per frame**, pooled meshes.
- `devicePixelRatio` capped at 1; `antialias: false`; no post-processing.
- Read `renderer.info.render.calls` once per second in dev; target under 150.

### `main.ts`

- Connect, send `join`, store id in `sessionStorage`.
- Input at 20 Hz with `seq`; predict locally; reconcile on the server's last processed seq.
- Remote players rendered ~100 ms in the past from a two-snapshot buffer.
- Block edits applied only on server confirmation.

### `audio.ts`

One `AudioContext`, resumed on the first click. One 2-second white-noise buffer generated at load;
every cue is a buffer source or an oscillator through a filter and a gain envelope. **No square
waves anywhere** — the default square-wave bleeps are exactly what this section exists to prevent.
Master gain 0.7 → compressor → destination; one key toggles mute.

| Cue | Trigger | Recipe |
|---|---|---|
| place "tok" | block placed | 40 ms noise burst, bandpass ~1.2 kHz, fast decay, plus a 60 Hz sine thump |
| break "crunch" | block broken | 120 ms noise burst, lowpass sweep 3 kHz → 300 Hz; the concrete variant is slower and deeper |
| swing | attack | 150 ms noise, bandpass sweep 400 → 1600 Hz, quiet |
| bed break | bed destroyed | break crunch + a descending triangle 220 → 60 Hz over 400 ms + a 2 s rumble tail |
| meteor whistle | 3 s before impact | sine glissando 2400 → 300 Hz with rising gain; impact = brown-noise rumble, lowpass 120 Hz, 2 s decay |
| flood swell | water rises | brown noise, lowpass 250 Hz, gain ramps up over 2.5 s, sustains through the flood, fades out |
| earthquake | shake starts | 45 Hz sine with a 3 Hz LFO on gain + noise rumble, 4 s; the envelope follows the camera-shake value |
| respawn | player returns | two soft triangle notes, quiet, no fanfare |
| win / lose | round ends | short three-note triangle motif; lose is the same motif a minor third down |
| ui tick | click | 15 ms filtered click, very quiet |

World sounds attenuate with distance, `1 / (1 + d²/64)`; UI sounds do not. No music — the
disasters are the soundtrack.

## Serving

Bun cannot serve raw `.ts`. Vite builds `client/` into `client/dist`; `Bun.serve` serves that
directory and upgrades `/ws`. In dev, Vite's server runs separately and the client points at the
Bun server with `?ws=host:port`.

For judges the same server goes online: `cloudflared tunnel --url http://localhost:8080` (no
account, tunnels WebSockets; ngrok as backup). The client picks the socket scheme from the page —
`location.protocol === "https:" ? "wss" : "ws"`, one line in `main.ts` — because an https page
blocks `ws://` as mixed content. Prove the public URL from a phone on **mobile data**, never from
the LAN itself. If the tunnel proves flaky mid-sprint, deploying the same server to a free host is
the fallback, not a rewrite.

## Shared

```
shared/
  constants.ts  TICK_HZ=20, SNAPSHOT_HZ=10, ROUND_SECONDS=480, PORT=8080, block ids
  protocol.ts   ClientMsg | ServerMsg (see PROTOCOL.md)
```

## Build order (the only order that works)

1. `world.ts` grid + `place/break` rules + tests — no rendering needed.
2. `index.ts` serve a page, `/ws` echo, `room.ts` with one player.
3. `render.ts` draw the grid from `arena.json`; one cube for the local player.
4. Movement sync: input → server step → snapshot → interpolate the remote cube.
5. `survival.ts` + round phases + win screen (**the primary mode is playable here**).
6. `disasters.ts` + camera shake + banner.
7. `bots.ts` + the `mode` switch — survival with bots is the demo; bedwars (`beds.ts`) is the
   secondary mode and the fallback if bots misbehave.
8. HUD, sound cues (the recipes in `audio.ts`), name tags, rematch.

Checkpoints use `playable-1`, `playable-2`, `freeze`, `gold` — see `docs/SCHEDULE.md`. Only the human
creates tags (`AGENTS.md`).

## Performance budget (floor: 30 fps integrated · target: 60 fps on the demo laptop)

| Slice | Budget |
|---|---|
| Sim + input | 3–5 ms |
| `renderer.render()` | 4–6 ms |
| Chunk rebuild | ≤ 2 ms amortised |
| Draw calls | ≤ 150 |

## Risks and the answer

| Risk | Answer |
|---|---|
| WebGL missing on a school laptop | Assumed fine; keep a 2D renderer behind the same interface if the probe fails |
| Bun WS bug on Windows | Reject at upgrade time, never `ws.close()` in `open()`; Node + `ws` fallback file |
| Firewall silently blocks | Pre-create the inbound rule; print the URL; test on a second device |
| Merge conflicts | File ownership, branches under 2 hours, one dependency owner |
| Scope creep | The cut list in `PLAN.md` is the answer; soft freeze Sat 22:00, hard freeze Sun 09:30 (`docs/SCHEDULE.md`) |
