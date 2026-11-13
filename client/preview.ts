/**
 * Standalone harness for the engine: renders client/arena.json with no server,
 * so the renderer can be verified before main.ts is rewired onto it.
 * Vite root is client/, so: `bun run dev` -> http://localhost:5173/preview.html
 */
import { buildWorld, type Arena } from "./engine/arena";
import { createVoxelRenderer } from "./render";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;

const arena = (await (await fetch("/arena.json")).json()) as Arena;
const world = buildWorld(arena);
const view = await createVoxelRenderer(canvas, world);

const camera = view.camera;
// South-west of the quad, looking north-east into the library and the science block.
camera.position.set(14, 24, 76);
let yaw = Math.atan2(-(32 - 14), -(30 - 76));
let pitch = Math.atan2(3 - 24, Math.hypot(32 - 14, 30 - 76));

const keys = new Set<string>();
addEventListener("keydown", (e: KeyboardEvent) => {
	keys.add(e.code);
	if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e: KeyboardEvent) => keys.delete(e.code));

canvas.addEventListener("click", () => {
	if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
addEventListener("mousemove", (e: MouseEvent) => {
	if (document.pointerLockElement !== canvas) return;
	yaw -= e.movementX * 0.0022;
	pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.0022));
});

function resize(): void {
	view.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

let last = performance.now();
function frame(): void {
	const now = performance.now();
	const dt = Math.min(0.05, (now - last) / 1000);
	last = now;

	const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
	const speed = (fast ? 34 : 11) * dt;
	const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
	const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
	const up = (keys.has("Space") ? 1 : 0) - (keys.has("ControlLeft") ? 1 : 0);

	const sin = Math.sin(yaw);
	const cos = Math.cos(yaw);
	camera.position.x += (-sin * forward + cos * strafe) * speed;
	camera.position.z += (-cos * forward - sin * strafe) * speed;
	camera.position.y += up * speed;
	camera.rotation.set(pitch, yaw, 0, "YXZ");

	view.render();
	hud.textContent = `${view.fps()} fps · ${world.sx}x${world.sy}x${world.sz} · ${arena.fills.length} fills · ${view.renderer.info.render.triangles} tris · ${view.renderer.info.render.calls} calls`;
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Snapshot edits from the server arrive as set() calls; this proves the remesh path.
Object.assign(window, { world, view });
