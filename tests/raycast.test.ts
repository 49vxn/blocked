import { expect, test } from "bun:test";
import { raycast } from "../client/engine/raycast";
import { World } from "../client/engine/world";

function worldWith(blocks: [number, number, number, number][]): World {
	const world = new World(8, 4, 8);
	for (const [x, y, z, id] of blocks) world.set(x, y, z, id);
	return world;
}

test("raycast hits the first solid cell and reports the entry face", () => {
	const world = worldWith([[3, 1, 1, 2]]);
	const hit = raycast(world, [0.5, 1.5, 1.5], [1, 0, 0], 6);
	expect(hit).not.toBeNull();
	expect([hit?.x, hit?.y, hit?.z]).toEqual([3, 1, 1]);
	// Travelling +x enters through the -x face, index 1 in PROTOCOL.md's order.
	expect(hit?.face).toBe(1);
	expect(hit?.normal).toEqual([-1, 0, 0]);
});

test("the placement cell is the neighbour in the face direction", () => {
	const world = worldWith([[3, 1, 1, 2]]);
	const hit = raycast(world, [0.5, 1.5, 1.5], [1, 0, 0], 6);
	if (!hit) throw new Error("expected a hit");
	expect([hit.x + hit.normal[0], hit.y + hit.normal[1], hit.z + hit.normal[2]]).toEqual([2, 1, 1]);
});

test("nothing solid within reach returns null", () => {
	const world = worldWith([[7, 1, 1, 2]]);
	expect(raycast(world, [0.5, 1.5, 1.5], [1, 0, 0], 3)).toBeNull();
});

test("air and non-solid water are passed through", () => {
	const world = worldWith([[2, 1, 1, 8], [4, 1, 1, 2]]);
	const hit = raycast(world, [0.5, 1.5, 1.5], [1, 0, 0], 8);
	expect(hit?.x).toBe(4);
});
