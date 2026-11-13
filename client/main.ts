// client/main.ts — join (HTML input, never window.prompt), move, see everyone.
// Renderer: skeleton top-down flat-colour grid. client/render.ts (B2, three.js) replaces this.
import type { ArenaSnapshot, ClientMsg, PlayerState, ServerMsg } from "../shared/protocol";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const joinOverlay = document.getElementById("join") as HTMLDivElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

const COLORS: Record<number, string> = {
  1: "#55703a", // grass
  2: "#8e4a3a", // brick
  3: "#9c7048", // wood
  4: "#cfe3ea", // glass
  5: "#b8b8b0", // concrete
  6: "#c03030", // bed
  7: "#5a5f66", // iron
  8: "#2f6da8", // water
};

const SIZE = 640;
const CELL = SIZE / 64;

let ws: WebSocket | null = null;
let myId = "";
let joined = false;
let arena: ArenaSnapshot | null = null;
let base = new Uint8Array(0);
const overrides = new Map<number, number>(); // index → block, this round's deltas
let players: PlayerState[] = [];
let banner = "";
let seq = 0;
const keys = new Set<string>();

const idx = (x: number, y: number, z: number, size: [number, number, number]) =>
  x + z * size[0] + y * size[0] * size[2];
const cellAt = (x: number, y: number, z: number): number => {
  if (!arena) return 0;
  const i = idx(x, y, z, arena.size);
  return overrides.get(i) ?? base[i] ?? 0;
};
const setCell = (x: number, y: number, z: number, b: number) => {
  if (!arena) return;
  overrides.set(idx(x, y, z, arena.size), b);
};

const send = (msg: ClientMsg) => ws?.send(JSON.stringify(msg));

function connect(): void {
  const host = new URLSearchParams(location.search).get("ws") ?? location.host;
  ws = new WebSocket(`ws://${host}/ws`);
  ws.addEventListener("open", () => {
    const stored = sessionStorage.getItem("id") ?? undefined;
    const name = (nameInput.value.trim() || sessionStorage.getItem("name") || "player").slice(0, 16);
    send({ t: "join", v: 1, name, room: "main", ...(stored ? { id: stored } : {}) });
  });
  ws.addEventListener("message", (ev) => handle(JSON.parse(String(ev.data)) as ServerMsg));
  ws.addEventListener("close", () => {
    if (!joined) statusEl.textContent = "reconnecting…";
    joined = false;
    setTimeout(connect, 1000);
  });
}

function handle(msg: ServerMsg): void {
  if (msg.t === "welcome") {
    myId = msg.id;
    joined = true;
    sessionStorage.setItem("id", myId);
    sessionStorage.setItem("name", nameInput.value.trim() || "player");
    arena = msg.arena;
    base = new Uint8Array(msg.arena.size[0] * msg.arena.size[1] * msg.arena.size[2]);
    for (const f of msg.arena.fills)
      for (let x = f.from[0]; x <= f.to[0]; x++)
        for (let y = f.from[1]; y <= f.to[1]; y++)
          for (let z = f.from[2]; z <= f.to[2]; z++)
            base[idx(x, y, z, msg.arena.size)] = f.block;
    overrides.clear();
    joinOverlay.style.display = "none";
    return;
  }
  if (msg.t === "snapshot") {
    players = msg.players;
    for (const d of msg.blocks) setCell(d.x, d.y, d.z, d.block);
    draw(msg.phase);
    return;
  }
  if (msg.t === "round") {
    banner =
      msg.phase === "over"
        ? msg.winnerName
          ? `${msg.winnerName} wins — rematch?`
          : "draw — rematch?"
        : msg.phase === "live"
          ? ""
          : "round starting…";
    draw(msg.phase);
    return;
  }
  if (msg.t === "event" && msg.kind === "death") banner = `${msg.name} is out`;
}

function draw(phase: string): void {
  if (!arena) return;
  ctx.fillStyle = "#111418";
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let z = 0; z < arena.size[2]; z++) {
    for (let x = 0; x < arena.size[0]; x++) {
      let block = 0;
      for (let y = arena.size[1] - 1; y >= 0; y--) {
        const b = cellAt(x, y, z);
        if (b !== 0) {
          block = b;
          break;
        }
      }
      if (block === 0) continue;
      ctx.fillStyle = COLORS[block] ?? "#888888";
      ctx.fillRect(x * CELL, z * CELL, CELL, CELL);
    }
  }
  for (const p of players) {
    if (!p.alive) continue;
    ctx.fillStyle =
      p.id === myId ? "#ffd700" : p.team === "red" ? "#e04040" : p.team === "blue" ? "#4060e0" : "#f0f0f0";
    ctx.fillRect(p.x * CELL - 4, p.z * CELL - 4, 8, 8);
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(p.name, p.x * CELL + 5, p.z * CELL + 3);
  }
  if (banner) {
    ctx.fillStyle = "#ffd700";
    ctx.font = "16px ui-monospace, monospace";
    ctx.fillText(banner, 12, 24);
  }
  statusEl.textContent = `${myId || "…"} · ${phase}`;
}

// input: intent only — the server owns the position (PROTOCOL.md)
addEventListener("keydown", (e: KeyboardEvent) => {
  keys.add(e.code);
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e: KeyboardEvent) => keys.delete(e.code));

setInterval(() => {
  if (!joined || !ws || ws.readyState !== WebSocket.OPEN) return;
  const f = (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0);
  const s = (keys.has("KeyD") ? 1 : 0) + (keys.has("KeyA") ? -1 : 0);
  const bit = (code: string, bitIndex: number) => (keys.has(code) ? 1 << bitIndex : 0);
  const keysMask =
    bit("KeyW", 0) | bit("KeyS", 1) | bit("KeyA", 2) | bit("KeyD", 3) |
    bit("Space", 4) | bit("ShiftLeft", 5);
  send({ t: "input", seq: ++seq, move: [f, s], yaw: 0, pitch: 0, keys: keysMask });
}, 50);

playBtn.addEventListener("click", connect);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") connect();
});
