# Task board

Written before the sprint; these become GitHub issues at 11:00 Saturday. Estimates are for one
person with an agent. "Acceptance" is the check that moves the card to Done.

## A — net, sim, hosting

| ID | Task | Est | Deps | Acceptance |
|---|---|---|---|---|
| A0 | Protocol stubs in `shared/` | 0.5h | — | `shared/protocol.ts` compiles under `bun run typecheck`, and both `server/` and `client/` import it without error |
| A1 | Bun server: static files + WS echo | 1h | A0 | Two browsers connect, server logs both ids |
| A2 | Block grid + authority | 2h | A1 | `tests/world.test.ts` green; two clients see the same edit |
| A3 | **Survival combat:** hp, death, spectate, last-standing win | 1.5h | A2 | Two clients: attacker lands five hits → `death` event, victim free-flies, `round` carries `winnerName` and the win screen appears |
| A4 | Round loop, phases, timer, **mode + bot config** | 1h | A3 | `TEST_TIME_SCALE=10`: lobby→countdown→live→over without intervention; `setup` switches `survival`/`bedwars` and sets bots; real rate verified once by hand |
| A9 | **Bots:** wander, chase, swing, flee disasters | 1h | A3 | 5 bots in a compressed round deal and take damage, one dies to a disaster, and the round still ends with a single winner; bots never place or break |
| A10 | **Bedwars mode** (`beds.ts`) — *only after A9, and only if the clock allows* | 1.5h | A4 | `mode: "bedwars"`: 2v2, bed at 0 hp ends the round for the other team; survival unaffected |
| A5 | Disasters: meteor, flood, earthquake | 1.5h | A4 | All three fire in one compressed round at their scaled 2:00/4:00/6:00 marks (`TEST_TIME_SCALE=10`) |
| A6 | Join, reconnect, room full | 0.5h | A4 | Kill a tab, reopen, rejoin same seat |
| A7 | Hosting: bind 0.0.0.0, print the LAN URL, start the tunnel | 0.5h | A1 | Second device joins by LAN IP; the public URL loads from a phone on mobile data |
| A8 | Smoke suite | 0.5h | A5 | `bun test` green; pure functions only |

## B — client, map, content

> B = **nobills** (UTC+3, no VC — async text only). Online NZ Sat 21:00 → Sun 09:30 freeze.
> First client merge by NZ 23:00 or the solo cut list activates. He cannot attend the live demo.
> His lanes: B3–B8 (B2's renderer is A's Sol run; `render.ts` ownership moved to A).
>
> **His shift, his clock (UTC+3 = NZ−10), locked Fri night:** Sat 11:00 online — clone, install,
> read pack → 11:30 map QA (B4 first: easy first merge, warm-up) → **13:00 first-merge gate**
> (place/break at minimum) → 13:00–21:00 B5 → B7 → B6 → B8 support → 23:30 freeze. If still up at
> his midnight (NZ Sun 10:00): remote second player in the recording. Rule: stuck 30+ min →
> message A, never grind silent. No separate landing/TOS page — the "site" is the game's start
> screen + repo README (20 min while installing); his design taste goes into B5/B7 (black + gold).

| ID | Task | Est | Deps | Acceptance |
|---|---|---|---|---|
| B1 | Vite client, camera, input | 1.5h | A0 | A cube moves with WASD in the browser — **A does B1 himself Sat morning** (nobills is asleep until NZ 21:00) |
| B2 | Rendering: chunks, atlas material, MAP.md texture tiles | 2h | B1 | ≥30 fps sustained 30 s in the library zone on the demo laptop (60 is the target), measured from the dev `renderer.info.render.calls` readout at ≤150 calls; **each block draws its top on `+y`, its side on the four verticals and its bottom on `−y`** (face→row `[1,1,0,2,1,1]`), and grass/iron/bed match the `MAP.md` per-face table — **owner: A + Sol (one run per day, see `TOOLS.md`)** |
| B3 | Place/break + attack + highlight | 1.5h | A2, B2 | Place, break and attack visible in both clients; a bot loses HP on hit (bedwars: a bed loses HP) |
| B4 | `arena.json` QA (survival first) | 1h | B2 | Pre-built (decision #37), already in `client/`. Passes `bun run verify --arena` spawn checks: **all eight `spawns.ffa` points stand on solid ground in air**. Then these walks in the client: ffa spawn → library door north → library mezzanine → library door south → quad → science hall → science hall west mouth → ffa spawn. Bedwars-only walk (skip if A10 is cut): red spawn → red bed → red gate → blue bed. Fix only cells that break a walk; do not redesign |
| B5 | HUD: timer, alive count, kill feed, disaster banner, win screen | 1.5h | A4 | Every phase has visible state — including *you are dead, spectating*; HUD, banner and tags in black + gold (college colours) |
| B6 | Juice: shake, particles, sound cues | 1.5h | A5 | Every `ENGINE.md` cue wired; no square waves; the meteor beat has whistle + rumble |
| B7 | Name tags, spectator view, rematch button | 1h | A3 | Names above players (bots included); a dead player free-flies; rematch works |
| B8 | Video capture + narration | 1.5h | B5, B6 | 2-minute file, audio audible, showing the round's *arc* — the map standing, a meteor taking the roof, a bot dying in the flood, the last one standing, the win screen. **Opens with ~15s of the class's real struggle** (exam week / blocked-network footage shot Saturday — shot list in `docs/DEMO.md`) before the game appears; recorded on a `TEST_TIME_SCALE=5` server so all three disasters land inside 2:00; insurance take ~22:15 Sat. **A records the host screen**; nobills can join remotely if awake, but the demo does not depend on him |

## Shared checkpoints

| ID | Task | Est | Owner | Acceptance |
|---|---|---|---|---|
| S1 | Walking skeleton merge | 0.5h | A | Two browsers, one cube each, same server |
| S2 | Reachability test: LAN device **and** public URL | 0.5h | A | Join by LAN URL, then by public URL from a phone on mobile data; play, disconnect, rejoin |
| S3 | Playable checkpoint tags | — | A | Created **by the human** at the `docs/SCHEDULE.md` times: `playable-1`, `playable-2`, `freeze`, `gold` |
| S4 | Demo rehearsal + submission | 1h | Both | Demo under 3 minutes on a visible timer, logged in `#build-log`; link, video and 3 one-liners posted by the `docs/SCHEDULE.md` times |

## Order of work (critical path)

```
A0 → A1 → A2 → A3 → A4 → A5 → A9 → A10 (optional)
      ↘ B1 → B2 → B3 ↗
            ↘ B4
                 B5 (needs A4) → B6 (needs A5) → B8
A7 after A1 · A6 after A4 · A8 after A5+A9
S1 after A1+B1 · S2 after A7+B3 · freeze after A5+B5
```

The headline lane is A3 → A4 → A5 → **A9**. A10 (bedwars) is the only card that may be dropped
entirely: it is the fallback, not the product.

## If behind

1. Drop A10 (bedwars) — survival is the product; the mode flag stays, the beds do not.
2. Drop B4 to "library + quad + eight spawns only".
3. Drop the flood (A5 partial): meteor + earthquake still read as disasters.
4. Drop B6 to place/break sounds and the meteor rumble.
5. Drop B7 name tags; cubes are colour-coded.
6. Drop A9 to **3 bots with a straight-line chase** (no disaster-flee behaviour).
7. Never drop: A1–A5, A9, B3, one disaster, win screen, B8.
