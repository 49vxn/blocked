// server/index.ts — the authoritative server. Bun.serve serves client/ (transpiling TS on the
// fly), upgrades /ws, runs a 20 Hz simulation and broadcasts 10 Hz snapshots.
// The server owns positions, blocks, beds and the round clock; clients send intent only.
// TEST_TIME_SCALE divides every game duration (verify runs 60; the video recording runs 5).
import { readFileSync } from "node:fs";
import type { ServerWebSocket } from "bun";
import type {
  ArenaSnapshot,
  BlockDelta,
  ClientMsg,
  Phase,
  PlayerState,
  ServerMsg,
} from "../shared/protocol";
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  COUNTDOWN_SECONDS,
  DEFAULT_PORT,
  EYE_HEIGHT,
  INTENT_DECAY_MS,
  MAX_PLAYERS,
  MOVE_SPEED,
  PLACE_BUDGET,
  PLAYER_HP,
  REACH,
  ROUND_SECONDS,
  SNAPSHOT_HZ,
  TICK_HZ,
  WOOD,
} from "../shared/constants";
import {
  adjacentCell,
  buildGrid,
  cellKey,
  hitsPlayer,
  inBounds,
} from "../shared/blocks";

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const TIME_SCALE = Math.max(1e-9, Number(process.env.TEST_TIME_SCALE ?? 1) || 1);
const scaled = (gameMs: number) => gameMs / TIME_SCALE;

const arena = JSON.parse(readFileSync("client/arena.json", "utf8")) as ArenaSnapshot;
const [W, , D] = arena.size;
const base = buildGrid(arena);
const overrides = new Map<string, number>(); // this round's placed/broken cells
const deltas: BlockDelta[] = []; // drained into every snapshot
const solidAt = (x: number, y: number, z: number): boolean =>
  (overrides.get(cellKey(x, y, z)) ?? base.get(cellKey(x, y, z)) ?? 0) !== 0;

type Player = {
  id: string;
  name: string;
  team: PlayerState["team"];
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  budget: number;
  move: [number, number];
  seq: number;
  lastInputAt: number;
  lastAttackAt: number;
};

const players = new Map<string, Player>();
const sockets = new Map<ServerWebSocket<unknown>, string>();
let hostId: string | null = null;
let ffaIndex = 0;
let idCounter = 0;

let phase: Phase = "lobby";
let mode: "survival" | "bedwars" = "survival";
let botCount = 0;
let countdownEndsAt = 0;
let roundEndsAt = 0;
let snapshotSeq = 0;
let tick = 0;

const ffa = arena.spawns.ffa ?? [];
function respawn(p: Player): void {
  const s = ffa.length > 0 ? ffa[ffaIndex++ % ffa.length] : [Math.floor(W / 2), 1, Math.floor(D / 2)];
  p.x = s[0] + 0.5;
  p.y = s[1];
  p.z = s[2] + 0.5;
  p.hp = PLAYER_HP;
  p.alive = true;
  p.budget = PLACE_BUDGET;
  p.move = [0, 0];
  p.seq = 0;
}

const send = (ws: ServerWebSocket<unknown>, msg: ServerMsg) => ws.send(JSON.stringify(msg));
const broadcast = (msg: ServerMsg) => {
  const data = JSON.stringify(msg);
  for (const ws of sockets.keys()) ws.send(data);
};

function resetRound(): void {
  overrides.clear();
  deltas.length = 0;
  for (const p of players.values()) respawn(p);
}

function beginLive(): void {
  phase = "live";
  resetRound();
  roundEndsAt = Date.now() + scaled(ROUND_SECONDS * 1000);
  broadcast({ t: "round", phase, endsAt: roundEndsAt });
}

function endRound(winner?: { id: string; name: string }): void {
  phase = "over";
  broadcast({
    t: "round",
    phase,
    endsAt: roundEndsAt,
    ...(winner ? { winnerId: winner.id, winnerName: winner.name } : {}),
  });
}

// Survival ends the moment one combatant is alive.
function checkSurvivalEnd(): void {
  if (mode !== "survival" || phase !== "live") return;
  const alive = [...players.values()].filter((p) => p.alive);
  if (alive.length === 1) endRound({ id: alive[0].id, name: alive[0].name });
}

// At the clock: >1 alive → highest hp wins, equal hp is a draw; 0 alive → draw.
function endRoundByClock(): void {
  const alive = [...players.values()].filter((p) => p.alive).sort((a, b) => b.hp - a.hp);
  const top = alive[0];
  const tie = alive.length > 1 && alive[1].hp === top.hp;
  endRound(top && !tie ? { id: top.id, name: top.name } : undefined);
}

// --- movement -----------------------------------------------------------------

function boxSolid(cx: number, cy: number, cz: number): boolean {
  const x0 = Math.floor(cx - 0.3 + 0.001), x1 = Math.floor(cx + 0.3 - 0.001);
  const z0 = Math.floor(cz - 0.3 + 0.001), z1 = Math.floor(cz + 0.3 - 0.001);
  const y0 = Math.floor(cy + 0.001), y1 = Math.floor(cy + 1.8 - 0.001);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) if (solidAt(x, y, z)) return true;
  return false;
}

function step(p: Player): void {
  const active = Date.now() - p.lastInputAt <= INTENT_DECAY_MS ? p.move : ([0, 0] as [number, number]);
  const [f, s] = active;
  if (f === 0 && s === 0) return;
  const sp = MOVE_SPEED / TICK_HZ;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  const vx = (f * -sin + s * cos) * sp;
  const vz = (f * -cos + s * -sin) * sp;
  const nx = Math.min(W - 0.31, Math.max(0.31, p.x + vx));
  if (!boxSolid(nx, p.y, p.z)) p.x = nx;
  const nz = Math.min(D - 0.31, Math.max(0.31, p.z + vz));
  if (!boxSolid(p.x, p.y, nz)) p.z = nz;
}

// --- actions ------------------------------------------------------------------

const dist = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const eyeOf = (p: Player) => ({ x: p.x, y: p.y + EYE_HEIGHT, z: p.z });

// GATE 0 note: place/break are allowed in `lobby` as practice building — the frozen
// verify script (check 5) exercises them before `start`. Rejected only in `over`.
function onPlace(
  ws: ServerWebSocket<unknown>,
  p: Player,
  m: Extract<ClientMsg, { t: "place" }>,
): void {
  if (phase === "over") return;
  const target = adjacentCell(m.face, m.x, m.y, m.z, arena.size);
  if (!target) return;
  if (solidAt(target.x, target.y, target.z)) return;
  if (dist(eyeOf(p), { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 }) > REACH) return;
  for (const other of players.values())
    if (other.alive && hitsPlayer(target.x, target.y, target.z, other)) return;
  if (p.budget <= 0) {
    send(ws, { t: "error", code: "no_budget", message: "no blocks left" });
    return;
  }
  // The client's block field is advisory: the server places wood until inventory exists.
  overrides.set(cellKey(target.x, target.y, target.z), WOOD);
  deltas.push({ x: target.x, y: target.y, z: target.z, block: WOOD });
  p.budget--;
}

function onBreak(
  ws: ServerWebSocket<unknown>,
  p: Player,
  m: Extract<ClientMsg, { t: "break" }>,
): void {
  if (phase === "over") return;
  const k = cellKey(m.x, m.y, m.z);
  const placed = overrides.get(k);
  if (placed === undefined || placed === 0) {
    send(ws, { t: "error", code: "indestructible", message: "that block is part of the map" });
    return;
  }
  overrides.set(k, 0);
  deltas.push({ x: m.x, y: m.y, z: m.z, block: 0 });
}

function onAttack(
  ws: ServerWebSocket<unknown>,
  p: Player,
  m: Extract<ClientMsg, { t: "attack" }>,
): void {
  if (phase !== "live") return;
  const now = Date.now();
  if (now - p.lastAttackAt < ATTACK_COOLDOWN_MS) return;
  p.lastAttackAt = now;
  const eye = eyeOf(p);
  if (dist(eye, { x: m.x + 0.5, y: m.y + 0.5, z: m.z + 0.5 }) > REACH) {
    send(ws, { t: "error", code: "out_of_range", message: "too far" });
    return;
  }
  let best: Player | null = null;
  let bestD = Infinity;
  for (const other of players.values()) {
    if (other.id === p.id || !other.alive) continue;
    if (!hitsPlayer(m.x, m.y, m.z, other)) continue;
    const d = dist(eye, { x: other.x, y: other.y + 0.9, z: other.z });
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  if (!best) return;
  best.hp -= ATTACK_DAMAGE;
  if (best.hp <= 0) {
    best.hp = 0;
    best.alive = false;
    broadcast({ t: "event", kind: "death", name: best.name, killer: p.name });
    checkSurvivalEnd();
  }
}

// --- messages -----------------------------------------------------------------

function onJoin(ws: ServerWebSocket<unknown>, msg: Extract<ClientMsg, { t: "join" }>): void {
  if (msg.v !== 1) {
    send(ws, { t: "error", code: "version", message: "Refresh — server updated" });
    return;
  }
  const name = String(msg.name ?? "").trim().slice(0, 16);
  if (!name) {
    send(ws, { t: "error", code: "bad_name", message: "Pick a shorter name" });
    return;
  }
  const existing = msg.id ? players.get(msg.id) : undefined;
  if (!existing && players.size >= MAX_PLAYERS) {
    send(ws, { t: "error", code: "room_full", message: "This room is full" });
    return;
  }
  let p: Player;
  if (existing) {
    p = existing;
  } else {
    const id = `p${++idCounter}-${Math.random().toString(36).slice(2, 6)}`;
    p = {
      id, name, team: null, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      hp: PLAYER_HP, alive: true, budget: PLACE_BUDGET,
      move: [0, 0], seq: 0, lastInputAt: 0, lastAttackAt: 0,
    };
    players.set(id, p);
    respawn(p);
    if (!hostId) hostId = id;
  }
  sockets.set(ws, p.id);
  send(ws, {
    t: "welcome",
    v: 1,
    id: p.id,
    mode,
    team: p.team,
    arena,
    serverTime: Date.now(),
  });
  // A fresh joiner gets one snapshot immediately — the verify gate reads a peer's position
  // from the joiner's first snapshot, and a client should see the world the instant it joins.
  send(ws, buildSnapshot([]));
  broadcast({ t: "event", kind: "join", name: p.name });
}

const clamp1 = (n: number) => Math.max(-1, Math.min(1, Number(n) || 0));

function onMessage(ws: ServerWebSocket<unknown>, raw: string): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    return;
  }
  if (msg.t === "join") return onJoin(ws, msg);
  const pid = sockets.get(ws);
  const me = pid ? players.get(pid) : undefined;
  if (!me) return;

  switch (msg.t) {
    case "input": {
      me.seq = msg.seq;
      me.yaw = Number(msg.yaw) || 0;
      me.pitch = Number(msg.pitch) || 0;
      me.move = [clamp1(msg.move[0]), clamp1(msg.move[1])];
      me.lastInputAt = Date.now();
      return;
    }
    case "place":
      return onPlace(ws, me, msg);
    case "break":
      return onBreak(ws, me, msg);
    case "attack":
      return onAttack(ws, me, msg);
    case "setup": {
      if (me.id !== hostId || phase !== "lobby") return; // non-hosts are silent
      if (msg.mode) mode = msg.mode;
      if (typeof msg.bots === "number")
        botCount = Math.max(0, Math.min(7, Math.floor(msg.bots)));
      return;
    }
    case "start": {
      if (phase !== "lobby" || players.size < 1) return;
      phase = "countdown";
      countdownEndsAt = Date.now() + scaled(COUNTDOWN_SECONDS * 1000);
      broadcast({
        t: "round",
        phase,
        startsAt: countdownEndsAt,
        endsAt: countdownEndsAt + scaled(ROUND_SECONDS * 1000),
      });
      return;
    }
    case "rematch": {
      if (phase !== "over") return; // idempotent: repeats inside `over` do nothing either
      beginLive();
      return;
    }
    case "chat": {
      broadcast({ t: "event", kind: "chat", name: me.name, text: String(msg.text).slice(0, 120) });
      return;
    }
  }
}

function onClose(ws: ServerWebSocket<unknown>): void {
  const pid = sockets.get(ws);
  if (!pid) return;
  sockets.delete(ws);
  const p = players.get(pid);
  if (!p) return;
  players.delete(pid);
  if (hostId === pid) hostId = sockets.size > 0 ? [...sockets.values()][0] : null;
  broadcast({ t: "event", kind: "leave", name: p.name });
  checkSurvivalEnd();
}

// --- clock --------------------------------------------------------------------

const buildSnapshot = (blocks: BlockDelta[]): ServerMsg => ({
  t: "snapshot",
  tick,
  seq: snapshotSeq,
  serverTime: Date.now(),
  players: [...players.values()].map(
    (p): PlayerState => ({
      id: p.id, name: p.name, bot: false, team: p.team,
      x: Math.round(p.x * 100) / 100, y: p.y, z: Math.round(p.z * 100) / 100,
      yaw: p.yaw, hp: p.hp, alive: p.alive,
    }),
  ),
  blocks,
  beds: [],
  phase,
});

setInterval(() => {
  tick++;
  const now = Date.now();
  if (phase === "countdown" && now >= countdownEndsAt) beginLive();
  else if (phase === "live" && now >= roundEndsAt) endRoundByClock();
  for (const p of players.values()) step(p);
  if (tick % (TICK_HZ / SNAPSHOT_HZ) === 0) {
    snapshotSeq++;
    broadcast(buildSnapshot(deltas.splice(0, deltas.length)));
  }
}, 1000 / TICK_HZ);

// --- http + upgrade -----------------------------------------------------------

const transpiler = new Bun.Transpiler({ loader: "ts" });
const tsFile = async (path: string) =>
  new Response(transpiler.transformSync(await Bun.file(path).text()), {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
const file = (path: string) => new Response(Bun.file(path));

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const p = new URL(req.url).pathname;
    if (p === "/ws") return server.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
    if (p === "/" || p === "/index.html") return file("client/index.html");
    if (p === "/main.ts" || p === "/shared/protocol.ts" || p === "/shared/constants.ts")
      return tsFile("client" + (p === "/main.ts" ? "/main.ts" : p));
    if (p === "/arena.json") return file("client/arena.json");
    if (p.startsWith("/textures/")) return file("client" + p);
    return new Response("not found", { status: 404 });
  },
  websocket: {
    message(ws, raw) {
      onMessage(ws, typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8"));
    },
    close(ws) {
      onClose(ws);
    },
  },
});

console.log(`blocked — http://0.0.0.0:${PORT} · time scale ×${TIME_SCALE} · arena ${arena.size.join("x")}`);
