import { expect, test } from "bun:test";
import { World } from "../client/engine/world";
import { LocalBody, RemotePlayers } from "../client/net";
import type { PlayerState } from "../shared/protocol";

function floorWorld(): World {
	const world = new World(16, 8, 16);
	world.fill(0, 0, 0, 15, 0, 15, 1);
	return world;
}

function player(id: string, x: number, z: number, yaw = 0): PlayerState {
	return { id, name: id, bot: false, team: null, x, y: 1, z, yaw, hp: 100, alive: true };
}

test("prediction walks the body forward at walking speed", () => {
	const body = new LocalBody(4, 1.05, 4, 0, floorWorld());
	// 20 frames of 50 ms, the real cadence: a long stall is clamped inside step().
	for (let i = 0; i < 20; i++) body.step({ forward: 1, strafe: 0, jump: false, sprint: false }, 50);
	// One second of walking is ~4 blocks; forward is -z at yaw 0.
	expect(body.body.z).toBeLessThan(4);
	expect(4 - body.body.z).toBeGreaterThan(3);
	expect(4 - body.body.z).toBeLessThan(4.6);
});

test("a small correction eases, so the view does not jitter", () => {
	const body = new LocalBody(4, 1.05, 4, 0, floorWorld());
	body.reconcile(4.2, 1.05, 4);
	expect(body.body.x).toBeCloseTo(4.04, 5);
});

test("a large correction snaps to the server", () => {
	const body = new LocalBody(4, 1.05, 4, 0, floorWorld());
	body.reconcile(9, 1.05, 4);
	expect([body.body.x, body.body.vx]).toEqual([9, 0]);
});

test("remote players interpolate between snapshots", () => {
	const remotes = new RemotePlayers();
	remotes.push(1000, [player("a", 0, 0)]);
	remotes.push(1100, [player("a", 10, 0)]);
	// Sampled 120 ms in the past: at 1050 the body is halfway between the two.
	const sampled = remotes.sample(1170).get("a");
	expect(sampled?.x).toBeCloseTo(5, 5);
});

test("remote yaw takes the short way round", () => {
	const remotes = new RemotePlayers();
	remotes.push(1000, [player("a", 0, 0, Math.PI * 0.98)]);
	remotes.push(1100, [player("a", 0, 0, -Math.PI * 0.98)]);
	const sampled = remotes.sample(1190).get("a");
	// The short path crosses pi, so the midpoint is near +-pi, not near 0.
	expect(Math.abs(sampled?.yaw ?? 0)).toBeGreaterThan(Math.PI * 0.9);
});
