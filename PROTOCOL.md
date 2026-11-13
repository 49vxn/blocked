# Protocol

Specification only. The TypeScript below describes message shapes; no implementation exists in
this repository until the sprint begins.

The contract between client and server. One owner: **A**. Written before parallel work starts, then
turned into TypeScript stubs in `shared/protocol.ts` at 11:30 Saturday.

## Constants

| Name | Value | Note |
|---|---|---|
| `TICK_HZ` | 20 | server simulation |
| `SNAPSHOT_HZ` | 10 | state broadcasts |
| `ROUND_SECONDS` | 480 | 8 minutes, both modes |
| `MAX_PLAYERS` | 8 | survival seats; bedwars 2 × 2 (4 seats) |
| `BOT_MAX` | 7 | host-set, fills empty seats |
| `PORT` | 8080 | `0.0.0.0` |

Two modes share this protocol. **`survival` is the default** (free-for-all, no beds, last alive
wins); `bedwars` is the secondary mode and the fallback. Every message below is mode-independent
except where it is marked otherwise.

## Transport

One WebSocket per client at `/ws`. JSON messages. Binary only if profiling demands it. The scheme
follows the page: `ws://` on an http origin (LAN), `wss://` when the page is served over https
(online hosting for judges). Server is
authoritative for blocks, beds, positions and the round clock; clients predict their own movement
and interpolate everyone else.

## Client → server

```ts
type ClientMsg =
  | { t: "join"; v: 1; name: string; room: string; id?: string }
  | { t: "setup"; mode?: Mode; bots?: number }   // host only, lobby only
  | { t: "input"; seq: number; move: [number, number]; yaw: number; pitch: number; keys: number }
  | { t: "place"; x: number; y: number; z: number; block: number; face: number }
  | { t: "break"; x: number; y: number; z: number }
  | { t: "attack"; x: number; y: number; z: number }   // a cell, resolved to a player or a bed
  | { t: "chat"; text: string }
  | { t: "start" }
  | { t: "rematch" }
```

`keys` is a bitmask: forward, back, left, right, jump, sneak. `move` is movement **intent**, never
position — the server owns x/y/z (see Transport); clients predict locally. `seq` increases per
input; the server stamps the last processed `seq` onto every `snapshot` so the client can
reconcile. `attack` is the sword swing and names a **cell**: the server resolves it to the nearest
player whose hitbox intersects that cell, or (bedwars only) to a bed, then validates reach (≤5
blocks from the server-known position), a 400 ms cooldown and `phase === "live"`. `start` requests
a round from `lobby` — the server fires it when enough seats are filled, counting bots
(`survival`: ≥2 combatants; `bedwars`: ≥2). `rematch` leaves `over` and deals
everyone into a fresh `live` round. Clients never move the clock.

`setup` is the host's lobby config: the mode (default `survival`) and how many bots fill empty seats
(0–7; default = `MAX_PLAYERS − humans`). Non-hosts get `error { code: "not_host" }`; outside `lobby`
it is ignored. Bots are ordinary server players with `bot: true` and no socket — never client-driven.

## Server → client

```ts
type ServerMsg =
  | { t: "welcome"; v: 1; id: string; mode: Mode; team: Team | null; arena: ArenaSnapshot; serverTime: number }
  | { t: "snapshot"; tick: number; seq: number; serverTime: number; players: PlayerState[]; blocks: BlockDelta[]; beds: BedState[]; phase: Phase }
  | { t: "disaster"; kind: "meteor" | "flood" | "earthquake"; at: number; cells: BlockDelta[] }
  | { t: "event"; kind: "join" | "leave" | "death" | "bed" | "chat"; name?: string; killer?: string; text?: string }
  | { t: "round"; phase: Phase; winner?: "red" | "blue"; winnerId?: string; winnerName?: string; endsAt: number; startsAt?: number }
  | { t: "error"; code: string; message: string }
```

```ts
type PlayerState = { id: string; name: string; bot: boolean; team: Team | null; x: number; y: number; z: number; yaw: number; hp: number; alive: boolean };
type BlockDelta = { x: number; y: number; z: number; block: number };
type BedState   = { team: Team; x: number; y: number; z: number; hp: number; alive: boolean };
type Phase      = "lobby" | "countdown" | "live" | "over";
type Mode       = "survival" | "bedwars";
type Team       = "red" | "blue";
// survival: team is null, beds is always []  ·  bedwars: team is red/blue, beds has 2 entries
// The arena.json document itself, sent on `welcome` — shape is the MAP.md fill format.
type ArenaSnapshot = {
  v: 1;
  size: [number, number, number];
  fills: { zone?: string; from: [number, number, number]; to: [number, number, number]; block: number }[];
  spawns: { red: [number, number, number][]; blue: [number, number, number][];
            ffa?: [number, number, number][] };
  beds:   { red: [number, number, number];   blue: [number, number, number] };
};
```

## Rules the server enforces

- Join only while `phase !== "over"`; a full room rejects with `room_full`. A reconnect during
  `over` waits in the lobby for `rematch`.
- Movement: max distance per tick, no flying, no walking through solid blocks. Input intent
  decays: if no `input` arrives within 500 ms, intent zeroes — a silent client stops, never drifts.
- Place: within 5 blocks, against a face, inside the arena, not inside a player, block budget > 0.
  The client's `block` field is **advisory**: the server places wood (id 3) until the runner has
  other blocks. Budget is 32 blocks, refilled at the start of each round, **not refunded on break**.
- Break: within 5 blocks, line of sight, block was placed this round or destroyed by a disaster.
- Attack: resolves the target cell to the nearest player whose hitbox intersects it (hp −20), or
  in bedwars to a bed (hp −25), within 5 blocks and with a 400 ms cooldown per attacker. Outside
  `live` it is ignored. Dead players cannot attack.
- **Death:** hp ≤ 0 sets `alive = false` permanently for the round and broadcasts
  `event { kind: "death", name, killer }`. The socket stays open and the player free-flies (spectates).
- **Win:** survival ends the moment one combatant is alive; `round` carries `winnerId` and
  `winnerName`. At `endsAt` with more than one alive, the highest hp wins; equal hp is a draw.
- Bedwars only: bed damage while `phase === "live"`; a bed at 0 ends the round for the other team;
  respawn 3 s while the bed lives.
- Bots are server actors: they are stepped on the tick, obey the same collision and reach rules, and
  cannot place or break blocks.
- Disasters fire on the server clock only; clients never trigger them. The host page's `M`/`F`/`E`
  debug keys are host-only and are disabled whenever the server is reached through a public URL.

## Round, win and rematch

- `start` (host) moves `lobby` → `countdown` (3 s) → `live`; the server also fires it automatically
  when the seats are filled (bots count) and 15 s have passed.
- **Survival (default):** the round ends the moment one combatant is alive — `round` carries
  `winnerId` + `winnerName` and no `winner`. At `endsAt` with several alive, highest hp wins; equal
  hp is a **draw** (no winner fields, client shows Draw).
- **Bedwars:** a bed reaching hp 0 **immediately** ends the round: the other team wins. Both beds at
  0 in the same tick is a **draw**: `round` carries no `winner`, the client shows Draw. At `endsAt`
  with both beds alive, the higher bed hp wins; equal is a draw.
- `rematch` returns `over` → `live` with a fresh 480 s clock, resets beds to 100 and budgets to 32,
  respawns everyone (survival: rescattered across the `ffa` spawns) and rebuilds the arena from
  `arena.json` — a rematch must not start in the rubble of the last round. It is idempotent:
  repeated messages within the same tick are ignored.

## Encodings (undefined anywhere else; these are the values)

- `keys` bitmask: bit 0 forward, 1 back, 2 left, 3 right, 4 jump, 5 sneak. Other bits ignored.
- `yaw`, `pitch`: **radians**. `yaw` 0 = looking toward −z; `pitch` clamped to [−π/2, +π/2].
- `move`: `[forward, strafe]` in each player's own frame, each −1..1; the server rotates by `yaw`.
- "Within 5 blocks": Euclidean from the player's eye (y + 1.6) to the target cell's centre, ≤ 5.0.
- Line of sight treats glass (4) and water (8) as transparent; everything else solid blocks it.
- `face`: `0..5` = +x, −x, +y, −y, +z, −z. `place` targets the empty cell **adjacent** to the named
  face; `break`/`attack` name the occupied cell itself.
- **Player hitbox:** 0.6 × 1.8 × 0.6, centred on the feet cell's `x`/`z`, spanning `y` to `y + 1.8`.
  `attack` resolves a cell to the nearest player whose hitbox intersects it; `place` refuses a cell
  that intersects any player's hitbox. Both sides use these numbers, so a hit looks the same to both.
- All times (`at`, `endsAt`, `startsAt`, `serverTime`) are **epoch milliseconds** (`Date.now()` on
  the server). The client computes the offset from `welcome.serverTime` and re-syncs from
  `snapshot.serverTime`. `tick` counts 50 ms steps since server start; do not assume
  `serverTime = tick × 50`.

## Error codes

| code | when | client shows |
|---|---|---|
| `room_full` | 8 seated | "This room is full" |
| `not_host` | non-host sends `setup` | nothing (silent) |
| `version` | `v` mismatch | "Refresh — server updated" |
| `bad_name` | name empty or > 16 chars | "Pick a shorter name" |
| `phase` | place/break/attack outside `live` | nothing (silent) |
| `out_of_range` | target > 5 blocks or no LOS | brief red flash on the highlight |
| `no_budget` | budget exhausted | brief "no blocks" toast |
| `indestructible` | breaking a map block | brief red flash |

Rejected `place`/`break` send `error`, never a `snapshot` delta — the block simply does not change.

## Version

`join` and `welcome` both carry `v: 1`. If the server's version and the client's differ, the server
replies `error { code: "version" }` and the client shows "Refresh — server updated". Bump `v`
only when a message shape changes mid-sprint.

## Reconnect

Client stores `id` in `sessionStorage`. On reconnect it sends `join` with the same name, room **and
the stored `id`**; the server restores the seat if the round is live and the player is alive. A dead
player reconnects as a spectator. Otherwise it seats them in the lobby. A `join` without `id` is a
new seat.

## Failure states the client must render

| Case | UI |
|---|---|
| Socket closed | "Reconnecting to `<host>`…" with the IP |
| `room_full` | "This room is full" |
| Version mismatch | "Refresh — server updated" |
| Own death (survival) | "You're out — spectating" + free-fly, and the killer's name |
| All bots, no humans | lobby copy says the seats are bot-filled, so nobody waits for a friend |
