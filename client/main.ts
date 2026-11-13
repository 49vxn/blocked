// client/main.ts — join, move, and see everyone in 3D.
// Rendering is the voxel engine in client/engine (see client/render.ts); this file
// owns the socket, the input intents and the HUD.
import type { ArenaSnapshot, ClientMsg, PlayerState, ServerMsg } from "../shared/protocol";
import {
	BoxGeometry,
	Color,
	EdgesGeometry,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	Vector3,
} from "three";
import { moveBody, type Body } from "../shared/movement";
import { buildWorld } from "./engine/arena";
import { raycast } from "./engine/raycast";
import type { World } from "./engine/world";
import { createVoxelRenderer, type VoxelRenderer } from "./render";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const joinOverlay = document.getElementById("join") as HTMLDivElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

let ws: WebSocket | null = null;
let myId = "";
let joined = false;
let world: World | null = null;
let view: VoxelRenderer | null = null;
let players: PlayerState[] = [];
let banner = "";
let seq = 0;
const keys = new Set<string>();

/** Mouse look; the server only cares about yaw (it drives movement direction). */
let yaw = 0;
let pitch = 0;
let hasLooked = false; // until the player moves the mouse, the server's spawn facing wins
/** Block placed by right click; 1-9 pick, wheel cycles. Advisory: the server owns the rule. */
let selected = 3;

// Local prediction: the server still owns the truth, but the camera runs on this body so
// movement is smooth between the 10 Hz snapshots.
let body: Body | null = null;
let predAcc = 0;
let lastFrameAt = performance.now();

const send = (msg: ClientMsg) => ws?.send(JSON.stringify(msg));

function connect(): void {
	const host = new URLSearchParams(location.search).get("ws") ?? location.host;
	// A tunnel serves https, where ws:// is mixed content and blocked. Match the page scheme.
	const scheme = location.protocol === "https:" ? "wss" : "ws";
	ws = new WebSocket(`${scheme}://${host}/ws`);
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

async function startView(arena: ArenaSnapshot): Promise<void> {
	if (view) return;
	world = buildWorld(arena);
	view = await createVoxelRenderer(canvas, world);
	const me = players.find((p) => p.id === myId);
	if (me) {
		yaw = me.yaw;
		view.camera.position.set(me.x, me.y + 1.62, me.z);
	}
	resize();
	addEntities();
}

function handle(msg: ServerMsg): void {
	if (msg.t === "welcome") {
		myId = msg.id;
		joined = true;
		sessionStorage.setItem("id", myId);
		sessionStorage.setItem("name", nameInput.value.trim() || "player");
		joinOverlay.style.display = "none";
		statusEl.textContent = "loading world…";
		void startView(msg.arena);
		return;
	}
	if (msg.t === "snapshot") {
		players = msg.players;
		const mine = msg.players.find((p) => p.id === myId);
		if (mine) {
			if (!body)
				body = { x: mine.x, y: mine.y, z: mine.z, vx: 0, vy: 0, vz: 0, yaw: mine.yaw, onGround: false };
			else {
				const dx = mine.x - body.x, dy = mine.y - body.y, dz = mine.z - body.z;
				if (Math.hypot(dx, dy, dz) > 1.5) {
					body.x = mine.x; body.y = mine.y; body.z = mine.z;
					body.vx = 0; body.vy = 0; body.vz = 0;
				} else {
					body.x += dx * 0.25;
					body.y += dy * 0.25;
					body.z += dz * 0.25;
				}
			}
			if (!hasLooked) { yaw = mine.yaw; body.yaw = yaw; }
		}
		if (world) {
			for (const d of msg.blocks) world.set(d.x, d.y, d.z, d.block);
			if (msg.blocks.length > 0) view?.flush();
		}
		addEntities();
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
		return;
	}
	if (msg.t === "error") {
		banner = msg.message;
		return;
	}
	if (msg.t === "event" && msg.kind === "death") banner = `${msg.name} is out`;
}

// --- other players as boxes (skinned models land next) ---------------------------

const entityGeometry = new BoxGeometry(0.6, 1.8, 0.6);
const entityMeshes = new Map<string, Mesh<BoxGeometry, MeshBasicMaterial>>();

function addEntities(): void {
	if (!view) return;
	for (const [id, mesh] of entityMeshes) {
		if (!players.some((p) => p.id === id && p.alive)) {
			view.scene.remove(mesh);
			entityMeshes.delete(id);
		}
	}
	for (const p of players) {
		if (p.id === myId || !p.alive) continue;
		let mesh = entityMeshes.get(p.id);
		if (!mesh) {
			const color = p.team === "red" ? "#e04040" : p.team === "blue" ? "#4060e0" : p.bot ? "#b9c2cc" : "#f0f0f0";
			mesh = new Mesh(entityGeometry, new MeshBasicMaterial({ color: new Color(color) }));
			entityMeshes.set(p.id, mesh);
			view.scene.add(mesh);
		}
		mesh.position.set(p.x, p.y + 0.9, p.z);
		mesh.rotation.y = p.yaw;
	}
}

// --- break / place ---------------------------------------------------------------

/** Gold wireframe on the cell under the crosshair. */
let highlight: LineSegments | null = null;
const lookDirection = new Vector3();

function targetCell() {
	if (!view || !world) return null;
	const eye = view.camera.position;
	view.camera.getWorldDirection(lookDirection);
	return raycast(world, [eye.x, eye.y, eye.z], [lookDirection.x, lookDirection.y, lookDirection.z], 6);
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e: MouseEvent) => {
	// Pointer lock is not required: some managed laptops refuse it, and the crosshair is fixed
	// at the view centre either way.
	if (!joined) return;
	const hit = targetCell();
	if (!hit) return;
	if (e.button === 0) {
		send({ t: "break", x: hit.x, y: hit.y, z: hit.z });
		return;
	}
	if (e.button === 2) {
		// PROTOCOL: name the cell hit and the face; the server writes the empty neighbour itself.
		send({ t: "place", x: hit.x, y: hit.y, z: hit.z, block: selected, face: hit.face });
	}
});

addEventListener("keydown", (e: KeyboardEvent) => {
	const n = Number(e.key);
	if (n >= 1 && n <= 9) selected = n;
});
addEventListener(
	"wheel",
	() => {
		selected = selected >= 9 ? 1 : selected + 1;
	},
	{ passive: true },
);

// --- frame loop ------------------------------------------------------------------

function resize(): void {
	if (!view) return;
	// Full-bleed 3D view: the grid's fixed 640x640 box and page margins go away.
	for (const [prop, value] of Object.entries({ position: "fixed", inset: "0", width: "100vw", height: "100vh", border: "0", margin: "0" }))
		canvas.style.setProperty(prop, value);
	document.body.style.overflow = "hidden";
	document.documentElement.style.overflow = "hidden";
	document.body.style.margin = "0";
	view.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);

canvas.addEventListener("click", () => {
	if (joined && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
addEventListener("mousemove", (e: MouseEvent) => {
	if (document.pointerLockElement !== canvas) return;
	hasLooked = true;
	yaw -= e.movementX * 0.0022;
	pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});

function frame(): void {
	if (view) {
		const cam = view.camera;
		const me = players.find((p) => p.id === myId);
		const now = performance.now();
		const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
		lastFrameAt = now;

		if (body && joined && world) {
			predAcc = Math.min(0.2, predAcc + dt);
			const f = (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0);
			const s = (keys.has("KeyD") ? 1 : 0) + (keys.has("KeyA") ? -1 : 0);
			const intent = {
				forward: f,
				strafe: s,
				jump: keys.has("Space"),
				sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
			};
			const solid = (x: number, y: number, z: number) => world!.isSolid(x, y, z);
			body.yaw = yaw;
			while (predAcc >= 0.05) {
				const wet = world.get(Math.floor(body.x), Math.floor(body.y), Math.floor(body.z)) === 8;
				moveBody(solid, body, intent, wet ? 0.55 : 1);
				predAcc -= 0.05;
			}
			cam.position.set(body.x, body.y + 1.62, body.z);
		} else if (me) {
			cam.position.set(me.x, me.y + 1.62, me.z);
		}
		if (!hasLooked && me) yaw = me.yaw;
		cam.rotation.set(pitch, yaw, 0, "YXZ");

		if (!highlight) {
			highlight = new LineSegments(
				new EdgesGeometry(new BoxGeometry(1.004, 1.004, 1.004)),
				new LineBasicMaterial({ color: new Color("#ffd700") }),
			);
			highlight.visible = false;
			view.scene.add(highlight);
		}
		const hit = targetCell();
		highlight.visible = Boolean(hit);
		if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

		view.render();
		statusEl.textContent = `${myId || "…"} · ${view.fps()} fps${banner ? ` · ${banner}` : ""}`;
	}
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

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
		bit("KeyW", 0) | bit("KeyS", 1) | bit("KeyA", 2) | bit("KeyD", 3) | bit("Space", 4) | bit("ShiftLeft", 5);  send({ t: "input", seq: ++seq, move: [f, s], yaw, pitch, keys: keysMask, look: hasLooked });
}, 50);

// Dev-only handle so the view can be inspected from the console (`vite` sets DEV; the
// production bundle leaves this branch out).
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
	Object.assign(window, { __blocked: { targetCell, send, get view() { return view; }, get world() { return world; } } });
}

playBtn.addEventListener("click", connect);
nameInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") connect();
});
