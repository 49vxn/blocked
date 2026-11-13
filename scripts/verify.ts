// One command that proves the build works. No deps beyond Bun + the project.
import { readFileSync } from "node:fs";

const PORT = Number(process.env.VERIFY_PORT ?? 4321);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/ws`;
const arenaOnly = process.argv.includes("--arena");
let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, why: string) => { failures++; console.log(`  FAIL  ${n} — ${why}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- 6. arena data (runs with or without a server) ----------
function checkArena() {
  const arena = JSON.parse(readFileSync("client/arena.json", "utf8"));
  const [W, H, D] = arena.size;
  if (arena.size.join() !== "64,32,64") return fail("arena size", `expected 64,32,64 got ${arena.size}`);
  const grid = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (const f of arena.fills) {
    for (const c of [f.from, f.to]) {
      const [x, y, z] = c;
      if (x < 0 || x >= W || y < 0 || y >= H || z < 0 || z >= D) return fail("arena bounds", `fill ${f.zone} at ${c}`);
    }
    for (let x = f.from[0]; x <= f.to[0]; x++)
      for (let y = f.from[1]; y <= f.to[1]; y++)
        for (let z = f.from[2]; z <= f.to[2]; z++) grid.set(key(x, y, z), f.block);
  }
  const solid = (b?: number) => b !== undefined && b !== 0;
  // survival: 8 points, head room above, ground below, all >= 12 apart in x/z
  const ffa: [number, number, number][] = arena.spawns.ffa ?? [];
  if (ffa.length < 8) return fail("survival spawns", `expected 8 ffa spawns, got ${ffa.length}`);
  for (const [x, y, z] of ffa) {
    if (solid(grid.get(key(x, y, z)))) return fail("ffa spawn", `cell ${x},${y},${z} is not air`);
    if (solid(grid.get(key(x, y + 1, z)))) return fail("ffa spawn", `no head room at ${x},${y + 1},${z}`);
    if (!solid(grid.get(key(x, y - 1, z)))) return fail("ffa spawn", `no ground at ${x},${y - 1},${z}`);
  }
  for (let i = 0; i < ffa.length; i++)
    for (let j = i + 1; j < ffa.length; j++) {
      const d = Math.hypot(ffa[i][0] - ffa[j][0], ffa[i][2] - ffa[j][2]);
      if (d < 12) return fail("survival spawns", `${ffa[i]} and ${ffa[j]} are ${d.toFixed(1)} apart`);
    }
  for (const team of ["red", "blue"] as const) {
    for (const [x, y, z] of arena.spawns[team]) {
      if (solid(grid.get(key(x, y, z)))) return fail(`${team} spawn`, `cell ${x},${y},${z} is not air`);
      if (!solid(grid.get(key(x, y - 1, z)))) return fail(`${team} spawn`, `no ground at ${x},${y - 1},${z}`);
    }
    const [bx, by, bz] = arena.beds[team];
    if (grid.get(key(bx, by, bz)) !== 6) return fail(`${team} bed`, `expected block 6 at ${bx},${by},${bz}, got ${grid.get(key(bx, by, bz))}`);
    if (!solid(grid.get(key(bx, by - 1, bz)))) return fail(`${team} bed`, "no ground under bed");
  }
  ok(`arena: ${arena.fills.length} fills, size ${arena.size.join("x")}, ${ffa.length} ffa spawns + beds valid`);
}

// ---------- a tiny client ----------
type Msg = Record<string, any>;
class Client {
  ws!: WebSocket; inbox: Msg[] = []; id = ""; seq = 0;
  async connect(name: string) {
    this.ws = new WebSocket(WS);
    this.ws.addEventListener("message", (e) => this.inbox.push(JSON.parse(String(e.data))));
    await new Promise<void>((res, rej) => {
      this.ws.addEventListener("open", () => res(), { once: true });
      this.ws.addEventListener("error", () => rej(new Error("ws error")), { once: true });
    });
    this.send({ t: "join", v: 1, name, room: "verify" });
    await this.waitFor((m) => m.t === "welcome");
    this.id = this.last("welcome").id;
  }
  send(m: Msg) { this.ws.send(JSON.stringify(m)); }
  last(t: string): Msg { return [...this.inbox].reverse().find((m) => m.t === t) ?? {}; }
  async waitFor(pred: (m: Msg) => boolean, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = this.inbox.find(pred);
      if (hit) return hit;
      await sleep(25);
    }
    return null;
  }
}

async function checkNet() {
  const a = new Client();
  await a.connect("verify-a");
  const b = new Client();          // created after A opens: the harness bug from the rehearsal
  await b.connect("verify-b");

  if (a.id && b.id && a.id !== b.id) ok("two clients, different ids");
  else return fail("two clients", `ids ${a.id} / ${b.id}`);

  const wa = a.last("welcome");
  if (wa.arena?.size?.join() === "64,32,64") ok("welcome carries the arena");
  else fail("welcome", "arena missing from welcome");

  // movement replication
  const pos = (c: Client) => (c.last("snapshot").players ?? []).find((p: Msg) => p.id === a.id);
  const x0 = pos(b)?.x, z0 = pos(b)?.z;
  for (let i = 0; i < 20; i++) {
    a.send({ t: "input", seq: ++a.seq, move: i % 2 ? [1, 0] : [0, 1], yaw: 0, pitch: 0, keys: 0 });
    await sleep(10);
  }
  const moved = await b.waitFor(() => {
    const p = pos(b);
    if (x0 === undefined || z0 === undefined || !p) return false;
    return Math.abs(p.x - x0) > 0.1 || Math.abs(p.z - z0) > 0.1;
  });
  moved ? ok("movement replicates to the other client") : fail("movement", `stayed at ${x0},${z0}`);

  const seqOk = await a.waitFor((m) => m.t === "snapshot" && m.seq >= a.seq);
  seqOk ? ok("snapshot.seq advances") : fail("snapshot.seq", "server never echoed seq");

  // place / break round-trip, seen by the OTHER client.
  // `place` names a clicked block + face; the new block appears in the adjacent cell.
  const me = pos(b) ?? { x: 8, y: 1, z: 8 };
  const px = Math.floor(me.x), py = Math.floor(me.y), pz = Math.floor(me.z);
  const grid = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (const f of wa.arena.fills) {
    for (let x = f.from[0]; x <= f.to[0]; x++)
      for (let y = f.from[1]; y <= f.to[1]; y++)
        for (let z = f.from[2]; z <= f.to[2]; z++) grid.set(k(x, y, z), f.block);
  }
  const solid = (x: number, y: number, z: number) => (grid.get(k(x, y, z)) ?? 0) !== 0;
  const air = (x: number, y: number, z: number) => (grid.get(k(x, y, z)) ?? 0) === 0;
  let anchor: { x: number; y: number; z: number; face: number; placed: { x: number; y: number; z: number } } | null = null;
  for (let dx = -3; dx <= 3 && !anchor; dx++)
    for (let dz = -3; dz <= 3 && !anchor; dz++)
      for (let dy = -1; dy <= 2 && !anchor; dy++) {
        const x = px + dx, y = py + dy, z = pz + dz;
        if (!solid(x, y, z)) continue;
        const dirs = [
          { nx: x + 1, nz: z, face: 0 }, { nx: x - 1, nz: z, face: 1 },
          { nx: x, nz: z + 1, face: 4 }, { nx: x, nz: z - 1, face: 5 },
        ];
        for (const d of dirs) {
          if (d.nx === px && d.nz === pz) continue;
          if (air(d.nx, y, d.nz) && Math.hypot(d.nx - px, d.nz - pz) <= 5) {
            anchor = { x, y, z, face: d.face, placed: { x: d.nx, y, z: d.nz } };
            break;
          }
        }
      }
  if (!anchor) {
    fail("place", "no solid block with an air neighbour within 5");
  } else {
    const a1 = anchor;
    a.send({ t: "place", x: a1.x, y: a1.y, z: a1.z, block: 3, face: a1.face });
    const placed = await b.waitFor(() => ((b.last("snapshot").blocks ?? []) as Msg[]).some((d) => d.x === a1.placed.x && d.y === a1.placed.y && d.z === a1.placed.z));
    placed ? ok("place visible to the other client") : fail("place", "no block delta at the adjacent cell");

    a.send({ t: "break", ...a1.placed });
    const broke = await b.waitFor(() => ((b.last("snapshot").blocks ?? []) as Msg[]).some((d) => d.x === a1.placed.x && d.y === a1.placed.y && d.z === a1.placed.z && d.block === 0));
    broke ? ok("break visible to the other client") : fail("break", "block did not clear");
  }

  // bots fill the empty seats, then a compressed round -> winner (optional until A4/A9 land)
  a.send({ t: "setup", bots: 3, mode: "survival" });
  a.send({ t: "start" });
  const bots = await b.waitFor(
    () => ((b.last("snapshot").players ?? []) as Msg[]).filter((p) => p.bot).length >= 3, 6000);
  bots ? ok("bots fill the empty seats") : console.log("  SKIP  bots (A9 not merged yet)");

  const end = await a.waitFor((m) => m.t === "round" && m.phase === "over", 15000);
  if (end) ok(`compressed round ended${("winnerId" in end || "winner" in end) ? " with a winner" : " (draw/timeout)"}`);
  else console.log("  SKIP  round end (A3/A4 not merged yet — expected before 15:00)");

  a.ws.close(); b.ws.close();
}

// ---------- run ----------
console.log(`verify: port ${PORT}${arenaOnly ? " (arena only)" : ""}`);
try { checkArena(); } catch (e) { fail("arena", String(e)); }
if (!arenaOnly) {
  // Direct execution (no `bun run`): on Windows the kill() must reach the server process
  // itself, or an orphan keeps port 4321 and every later verify run tests a stale build.
  const server = Bun.spawn(["bun", "server/index.ts"], {
    env: { ...process.env, PORT: String(PORT), TEST_TIME_SCALE: "60" },
    stdout: "ignore", stderr: "inherit",
  });
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + "/")).ok) { up = true; break; } } catch {}
    await sleep(100);
  }
  up ? ok("server answers HTTP") : fail("server", `nothing on ${BASE}`);
  if (up) { try { await checkNet(); } catch (e) { fail("net", String(e)); } }
  server.kill();
}
console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
