# Blocked

> Planning artifact. There is no code in this repository yet; implementation starts at kickoff,
> Saturday 14 November, 11:00.

**A LAN survival game set in our school, where the building falls down three times a round.**

Our school blocks every game site. After exams there is nothing to do on the network. So this runs
from one laptop on the school network: friends open a URL, join a match, and play in the browser. No internet,
no installs, no accounts.

Built for the NXT Build Sprint, 14–15 November 2026. Theme: *build something for someone you know.*

## The idea in one sentence

Eight of you are dropped into a block-built version of our school, three times a round a natural
disaster destroys part of it, and the last one standing wins — the building is the enemy.

## How it plays

- **Survival (main mode):** 8 seats, free-for-all, 8-minute rounds. Empty seats are filled by bots,
  so a single laptop still has a game.
- Break and place blocks. Cover is the whole skill: the library roof is the best ground in the map
  until the meteor takes it.
- Three disasters on a fixed clock: **meteor** (2:00, biased to the library), **flood** (4:00, through
  the quad), **earthquake** (6:00, cuts the science corridor).
- No respawn: a death is final, and the last player alive wins on the spot.
- **Bedwars (secondary mode):** 2v2, one bed each, respawn until a bed breaks — same map, same
  disasters. Ships as the fallback.
- Rematch in one click.

## Run it (planned)

```bash
bun install
bun run start        # builds the client, serves on 0.0.0.0:8080, prints the LAN URL
```

The host laptop runs the game two ways: a public tunnel for judges, and plain
`http://<host-ip>:8080` on a local network for friends in the same room. The school setting is the
story; the judged demo runs from the host machine, not on the school network.

The host is a personal laptop with Bun installed. Every client is a laptop on the same network;
phones are not part of the design.

## Controls (planned)

`WASD` move · `Space` jump · mouse look · left click break/attack · right click place · `Enter` chat ·
`Tab` scoreboard (if built).

## Status

Built during the NXT Build Sprint, 14–15 November 2026, from scratch. `MAP.md` describes the arena and
`PROTOCOL.md` the client/server messages. The default mode is survival; `?mode=bedwars` switches to
the secondary mode.

## Credits

Engine, code and map: written during the event. Assets: procedurally generated textures and
WebAudio tones, or CC0 packs (Kenney, Poly Haven) if any are used, credited here.
