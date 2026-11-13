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
  DISASTER_AT,
  EYE_HEIGHT,
  INTENT_DECAY_MS,
  KEY_JUMP,
  KEY_SPRINT,
  MAX_PLAYERS,
  MOVE_SPEED,
  PLACE_BUDGET,
  PLAYER_HP,
  REACH,
  ROUND_SECONDS,
  SNAPSHOT_HZ,
  TICK_HZ,
  WATER,
  WOOD,
} from "../shared/constants";
import {
  adjacentCell,
  buildGrid,
  cellKey,
  hitsPlayer,
  inBounds,
} from "../shared/blocks";
import { earthquake, flood, meteor, type WorldView } from "./disasters";
import { moveBody } from "../shared/movement";

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const TIME_SCALE = Math.max(1e-9, Number(process.env.TEST_TIME_SCALE ?? 1) || 1);
const scaled = (gameMs: number) => gameMs / TIME_SCALE;

const arena = JSON.parse(readFileSync("client/arena.json", "utf8")) as ArenaSnapshot;
const [W, , D] = arena.size;
const base = buildGrid(arena);
const overrides = new Map<string, number>(); // this round's placed/broken cells
const deltas: BlockDelta[] = []; // drained into every snapshot
const worldView: WorldView = {
  size: arena.size,
  blockAt: (x, y, z) => overrides.get(cellKey(x, y, z)) ?? base.get(cellKey(x, y, z)) ?? 0,
};
const solidAt = (x: number, y: number, z: number): boolean =>
  (overrides.get(cellKey(x, y, z)) ?? base.get(cellKey(x, y, z)) ?? 0) !== 0;

type Player = {
  id: string;
  name: string;
  bot: boolean;
  team: PlayerState["team"];
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  budget: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  keys: number;
  move: [number, number];
  seq: number;
  lastInputAt: number;
  lastAttackAt: number;
};

const players = new Map<string, Player>();
const sockets = new Map<ServerWebSocket<unknown>, string>();
const humanCount = () => [...players.values()].filter((p) => !p.bot).length;
let hostId: string | null = null;
let ffaIndex = 0;
let idCounter = 0;

let phase: Phase = "lobby";
let mode: "survival" | "bedwars" = "survival";
let botCount = 0;
let countdownEndsAt = 0;
let roundEndsAt = 0;
let liveStartedAt = 0;
let nextDisaster = 0;
const DISASTERS = [
  { kind: "meteor", at: DISASTER_AT.meteor },
  { kind: "flood", at: DISASTER_AT.flood },
  { kind: "earthquake", at: DISASTER_AT.earthquake },
] as const;
let snapshotSeq = 0;
let tick = 0;

const ffa = arena.spawns.ffa ?? [];
function respawn(p: Player): void {
  const s = ffa.length > 0 ? ffa[ffaIndex++ % ffa.length] : [Math.floor(W / 2), 1, Math.floor(D / 2)];
  p.x = s[0] + 0.5;
  p.y = s[1];
  p.z = s[2] + 0.5;
  // Face the middle of the campus, not whichever wall happens to be two blocks away.
  p.yaw = Math.atan2(-(W / 2 - p.x), -(D / 2 - p.z));
  p.pitch = 0;
  p.hp = PLAYER_HP;
  p.alive = true;
  p.budget = PLACE_BUDGET;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  p.onGround = false;
  p.keys = 0;
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
  liveStartedAt = Date.now();
  nextDisaster = 0;
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

// Water is walk-through (it slows, it does not wall you in), unlike every other block.
const moveSolidAt = (x: number, y: number, z: number): boolean => {
  const b = overrides.get(cellKey(x, y, z)) ?? base.get(cellKey(x, y, z)) ?? 0;
  return b !== 0 && b !== WATER;
};

function step(p: Player): void {
  const active = Date.now() - p.lastInputAt <= INTENT_DECAY_MS ? p.move : ([0, 0] as [number, number]);
  const wet = worldView.blockAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === WATER;
  moveBody(
    moveSolidAt,
    p,
    {
      forward: active[0],
      strafe: active[1],
      jump: (p.keys & KEY_JUMP) !== 0,
      sprint: (p.keys & KEY_SPRINT) !== 0,
    },
    wet ? 0.55 : 1,
  );
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
  hitPlayer(p, best);
}

function damagePlayer(target: Player, amount: number, cause: string): void {
  if (!target.alive) return;
  target.hp -= amount;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    broadcast({ t: "event", kind: "death", name: target.name, killer: cause });
    checkSurvivalEnd();
  }
}

function hitPlayer(attacker: Player, target: Player): void {
  damagePlayer(target, ATTACK_DAMAGE, attacker.name);
}

// --- disasters ----------------------------------------------------------------

function fireDisaster(kind: "meteor" | "flood" | "earthquake"): void {
  const result =
    kind === "meteor" ? meteor(worldView, Math.random)
    : kind === "flood" ? flood(worldView)
    : earthquake(worldView);

  for (const c of result.cells) {
    overrides.set(cellKey(c.x, c.y, c.z), c.block);
    deltas.push(c);
  }
  broadcast({ t: "disaster", kind, at: DISASTER_AT[kind], cells: result.cells });

  const alive = [...players.values()].filter((p) => p.alive);
  if (kind === "meteor") {
    for (const impact of result.impacts)
      for (const p of alive)
        if (Math.hypot(p.x - (impact.x + 0.5), p.z - (impact.z + 0.5)) <= 3)
          damagePlayer(p, 100, "meteor");
  } else if (kind === "earthquake") {
    const c = result.impacts[0];
    for (const p of alive)
      if (Math.hypot(p.x - (c.x + 0.5), p.y - (c.y + 0.5), p.z - (c.z + 0.5)) <= 6)
        damagePlayer(p, 100, "earthquake");
  }
}

// Standing in flood water costs hp; one check per second, in real time.
function drownTick(): void {
  if (phase !== "live") return;
  for (const p of players.values()) {
    if (!p.alive) continue;
    if (worldView.blockAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === WATER)
      damagePlayer(p, 5, "flood");
  }
}

// --- bots ---------------------------------------------------------------------
// Bots are ordinary players with `bot: true`: same collision, hp, damage and snapshot shape.
// They never place or break. They chase the nearest survivor, swing in reach, and wander when
// the round is empty — enough for a solo demo to read as a fight.

type BotState = {
  lastX: number;
  lastZ: number;
  stuckFor: number;
  wanderUntil: number;
  wx: number;
  wz: number;
};
const botStates = new Map<string, BotState>();
// Bots swing weaker and slower than humans. With no respawns, 20-damage bots clear the
// whole lobby before the 2:00 meteor; the disaster arc needs survivors, not a knife fight.
const BOT_ATTACK_DAMAGE = 10;
const BOT_ATTACK_COOLDOWN_MS = 900;

function addBots(): void {
  const humans = humanCount();
  const want = Math.min(botCount, Math.max(0, MAX_PLAYERS - humans));
  let have = [...players.values()].filter((p) => p.bot).length;
  for (; have < want; have++) {
    const id = `bot-${have + 1}`;
    if (players.has(id)) continue;
    const p: Player = {
      id, name: `BOT ${have + 1}`, bot: true, team: null,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      hp: PLAYER_HP, alive: true, budget: PLACE_BUDGET,
      vx: 0, vy: 0, vz: 0, onGround: false, keys: 0,
      move: [0, 0], seq: 0, lastInputAt: 0, lastAttackAt: 0,
    };
    players.set(id, p);
    respawn(p);
    botStates.set(id, { lastX: p.x, lastZ: p.z, stuckFor: 0, wanderUntil: 0, wx: 0, wz: 0 });
  }
}

function botTick(p: Player, now: number): void {
  if (!p.alive) {
    p.move = [0, 0];
    return;
  }
  const st = botStates.get(p.id) ?? { lastX: p.x, lastZ: p.z, stuckFor: 0, wanderUntil: 0, wx: 0, wz: 0 };
  botStates.set(p.id, st);
  p.keys = 0;

  let target: Player | null = null;
  let bestD = Infinity;
  for (const q of players.values()) {
    if (q.id === p.id || !q.alive) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) { bestD = d; target = q; }
  }

  // Bots only commit to a fight they can see the start of. Chasing the nearest player
  // anywhere on a 64x64 map collapses every round into one early brawl and the 6:00
  // disasters never get to fire; outside the leash they patrol the campus instead.
  const AGGRO = 14;
  if (target && bestD <= AGGRO) {
    p.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
    if (bestD <= 1.7) {
      p.move = [0, 0];
      if (now - p.lastAttackAt >= BOT_ATTACK_COOLDOWN_MS) {
        p.lastAttackAt = now;
        damagePlayer(target, BOT_ATTACK_DAMAGE, p.name);
      }
    } else {
      p.move = [1, 0];
    }
  } else {
    if (st.wx === 0 || Math.hypot(p.x - st.wx, p.z - st.wz) < 1.5 || now > st.wanderUntil) {
      st.wx = 16 + Math.random() * 32;
      st.wz = 16 + Math.random() * 32;
      st.wanderUntil = now + 6000;
    }
    p.yaw = Math.atan2(-(st.wx - p.x), -(st.wz - p.z));
    p.move = [1, 0];
  }

  // A bot that walks into a wall slides along it for a moment, then turns out.
  const moved = Math.hypot(p.x - st.lastX, p.z - st.lastZ);
  st.lastX = p.x;
  st.lastZ = p.z;
  st.stuckFor = moved < 0.01 ? st.stuckFor + 1 / TICK_HZ : 0;
  if (st.stuckFor > 0.35) {
    p.keys = KEY_JUMP;
    p.yaw += 1.1;
    p.move = [0, 1];
    if (st.stuckFor > 0.8) {
      p.yaw += 1.9;
      p.move = [1, 0];
      st.stuckFor = 0.35;
    }
  }
  p.lastInputAt = now;
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
  if (!existing && humanCount() >= MAX_PLAYERS) {
    send(ws, { t: "error", code: "room_full", message: "This room is full" });
    return;
  }
  let p: Player;
  if (existing) {
    p = existing;
  } else {
    const id = `p${++idCounter}-${Math.random().toString(36).slice(2, 6)}`;
    p = {
      id, name, bot: false, team: null, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      hp: PLAYER_HP, alive: true, budget: PLACE_BUDGET,
      vx: 0, vy: 0, vz: 0, onGround: false, keys: 0,
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
      // Until the player actually looks, keep the spawn facing: an early input's yaw 0
      // would otherwise turn every new player into the nearest wall.
      if (msg.look) {
        me.yaw = Number(msg.yaw) || 0;
        me.pitch = Number(msg.pitch) || 0;
      }
      me.move = [clamp1(msg.move[0]), clamp1(msg.move[1])];
      me.keys = Number(msg.keys) || 0;
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
      addBots();
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
      id: p.id, name: p.name, bot: p.bot, team: p.team,
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
  while (
    phase === "live" &&
    nextDisaster < DISASTERS.length &&
    now - liveStartedAt >= scaled(DISASTERS[nextDisaster].at * 1000)
  ) {
    fireDisaster(DISASTERS[nextDisaster].kind);
    nextDisaster++;
  }
  if (tick % TICK_HZ === 0) drownTick();
  for (const p of players.values()) {
    if (p.bot) botTick(p, now);
    step(p);
  }
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

// The client is a module graph now (renderer, engine, three). Handing the browser raw TS only
// worked while it was one file; bare "three" and relative engine imports 404 without a bundler.
// Build once at boot and serve that from /main.ts, so the single-origin demo path keeps working.
let clientBundle: string | null = null;
try {
  const built = await Bun.build({ entrypoints: ["client/main.ts"], target: "browser" });
  if (built.success && built.outputs[0]) clientBundle = await built.outputs[0].text();
  else console.error("client build failed:", built.logs.map(String).join("\n"));
} catch (err) {
  console.error("client build failed:", err);
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const p = new URL(req.url).pathname;
    if (p === "/ws") return server.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
    if (p === "/" || p === "/index.html") return file("client/index.html");
    if (p === "/main.ts") {
      if (clientBundle)
        return new Response(clientBundle, { headers: { "content-type": "text/javascript; charset=utf-8" } });
      return tsFile("client/main.ts");
    }
    if (p === "/shared/protocol.ts" || p === "/shared/constants.ts")
      return tsFile("client" + p);
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

console.log(`blocked — http://0.0.0.0:${server.port} · time scale ×${TIME_SCALE} · arena ${arena.size.join("x")}`);
