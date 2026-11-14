/**
 * Client-side motion: prediction for the local body, interpolation for everyone else.
 *
 * The server is still authoritative — it owns every position. What changes is that the
 * camera no longer waits for the 10 Hz snapshot: the same `moveBody` controller the
 * server runs steps locally against the client's copy of the world, and the server's
 * position is used to correct drift rather than to drive the view.
 */
import { EYE_HEIGHT, TICK_HZ, WATER } from "../shared/constants";
import { moveBody, type Body, type Intent } from "../shared/movement";
import type { World } from "./engine/world";
import type { PlayerState } from "../shared/protocol";

const TICK_MS = 1000 / TICK_HZ;
/** Render other players this far in the past, so two snapshots always bracket them. */
const INTERP_DELAY_MS = 120;
/** Beyond this, teleport: walking through a doorway must never be dragged back. */
const SNAP_DISTANCE = 1.2;

export function collisionWorld(world: World): (x: number, y: number, z: number) => boolean {
	return (x, y, z) => {
		const id = world.get(x, y, z);
		return id !== 0 && id !== WATER;
	};
}

export class LocalBody {
	readonly body: Body;
	private accumulator = 0;
	/** Position before the last simulated tick, so frames between ticks can be interpolated. */
	private readonly previous = { x: 0, y: 0, z: 0 };
	private steppedAt = 0;

	constructor(
		x: number,
		y: number,
		z: number,
		yaw: number,
		private readonly world: World,
	) {
		this.body = { x, y, z, vx: 0, vy: 0, vz: 0, yaw, onGround: false };
		this.previous.x = x;
		this.previous.y = y;
		this.previous.z = z;
	}

	get eyeY(): number {
		return this.body.y + EYE_HEIGHT;
	}

	/** Advance in fixed ticks however long the frame was; the simulation never depends on fps. */
	step(intent: Intent, dtMs: number, nowMs = performance.now()): void {
		this.accumulator = Math.min(this.accumulator + dtMs, TICK_MS * 5);
		const solid = collisionWorld(this.world);
		while (this.accumulator >= TICK_MS) {
			this.accumulator -= TICK_MS;
			this.previous.x = this.body.x;
			this.previous.y = this.body.y;
			this.previous.z = this.body.z;
			moveBody(solid, this.body, intent, 1);
			this.steppedAt = nowMs - this.accumulator;
		}
	}

	/**
	 * Where to draw the camera this frame: between the last two simulated positions.
	 * Without this the view advances in 20 Hz chunks even at 60 fps, which reads as
	 * teleporting forward on WASD while mouse look stays smooth.
	 */
	sample(nowMs: number): { x: number; y: number; z: number } {
		const alpha = Math.max(0, Math.min(1, (nowMs - this.steppedAt) / TICK_MS));
		return {
			x: this.previous.x + (this.body.x - this.previous.x) * alpha,
			y: this.previous.y + (this.body.y - this.previous.y) * alpha,
			z: this.previous.z + (this.body.z - this.previous.z) * alpha,
		};
	}

	/**
	 * Pull the body toward the server's position. Small errors (latency, a dropped input)
	 * are eased away so the view never jitters; real corrections snap.
	 */
	reconcile(x: number, y: number, z: number): void {
		const dx = x - this.body.x;
		const dy = y - this.body.y;
		const dz = z - this.body.z;
		const distance = Math.hypot(dx, dy, dz);
		if (distance > SNAP_DISTANCE) {
			this.body.x = x;
			this.body.y = y;
			this.body.z = z;
			this.body.vx = 0;
			this.body.vy = 0;
			this.body.vz = 0;
			return;
		}
		if (distance < 0.001) return;
		this.body.x += dx * 0.2;
		this.body.y += dy * 0.2;
		this.body.z += dz * 0.2;
	}
}

/** A short history of snapshots, sampled in the past so remote bodies move smoothly. */
export class RemotePlayers {
	private history: { at: number; players: PlayerState[] }[] = [];

	push(serverTime: number, players: PlayerState[]): void {
		this.history.push({ at: serverTime, players });
		// Two seconds is plenty to cover a stalled socket.
		while (this.history.length > 2 && serverTime - this.history[0].at > 2000) this.history.shift();
	}

	/** Positions at `now - INTERP_DELAY_MS`, interpolated between the bracketing snapshots. */
	sample(now: number): Map<string, PlayerState> {
		const out = new Map<string, PlayerState>();
		if (this.history.length === 0) return out;
		const at = now - INTERP_DELAY_MS;
		const latest = this.history[this.history.length - 1];

		let older = this.history[0];
		let newer = latest;
		for (let i = this.history.length - 1; i > 0; i--) {
			if (this.history[i - 1].at <= at) {
				older = this.history[i - 1];
				newer = this.history[i];
				break;
			}
		}
		const span = newer.at - older.at;
		const t = span > 0 ? Math.max(0, Math.min(1, (at - older.at) / span)) : 1;
		const before = new Map(older.players.map((p) => [p.id, p]));

		for (const p of newer.players) {
			const from = before.get(p.id);
			if (!from || from.alive !== p.alive) {
				out.set(p.id, p);
				continue;
			}
			out.set(p.id, {
				...p,
				x: from.x + (p.x - from.x) * t,
				y: from.y + (p.y - from.y) * t,
				z: from.z + (p.z - from.z) * t,
				yaw: shortestAngle(from.yaw, p.yaw, t),
			});
		}
		return out;
	}
}

/** Interpolate yaw the short way round, so a body never spins 350° to turn 10°. */
function shortestAngle(from: number, to: number, t: number): number {
	let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (delta < -Math.PI) delta += Math.PI * 2;
	return from + delta * t;
}
