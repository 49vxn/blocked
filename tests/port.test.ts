import { describe, expect, test } from "bun:test";
import { builtUpAround, findSpawn, meshGrid, standsOn, zoneOf } from "../scripts/port-spawn-world";

const SIZE = [4, 3, 4] as const;
const idx = (x: number, y: number, z: number) => x + SIZE[0] * (z + SIZE[2] * y);

const zoneRects = {
	field: { x: [0, 2], z: [0, 2] } as { x: [number, number]; z: [number, number] },
	tower: { x: [3, 3], z: [3, 3] } as { x: [number, number]; z: [number, number] },
};

describe("meshGrid", () => {
	test("a flat slab and a pillar become two exact boxes", () => {
		const grid = new Uint8Array(SIZE[0] * SIZE[1] * SIZE[2]);
		for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) grid[idx(x, 0, z)] = 5;
		for (let y = 1; y <= 2; y++) for (let x = 0; x <= 1; x++) for (let z = 0; z <= 1; z++) grid[idx(x, y, z)] = 2;
		expect(meshGrid(grid, SIZE)).toEqual([
			{ from: [0, 0, 0], to: [3, 0, 3], block: 5 },
			{ from: [0, 1, 0], to: [1, 2, 1], block: 2 },
		]);
	});

	test("an L of one material splits into two boxes and no cell is filled twice", () => {
		const size = [3, 1, 3] as const;
		const grid = new Uint8Array(size[0] * size[1] * size[2]);
		const at = (x: number, y: number, z: number) => x + size[0] * (z + size[2] * y);
		grid[at(0, 0, 0)] = 7;
		grid[at(1, 0, 0)] = 7;
		grid[at(0, 0, 1)] = 7;
		const fills = meshGrid(grid, size);
		expect(fills).toHaveLength(2);
		expect(fills).toContainEqual({ from: [0, 0, 0], to: [1, 0, 0], block: 7 });
		expect(fills).toContainEqual({ from: [0, 0, 1], to: [0, 0, 1], block: 7 });
	});

	test("air never fills", () => {
		expect(meshGrid(new Uint8Array(SIZE[0] * SIZE[1] * SIZE[2]), SIZE)).toEqual([]);
	});
});

describe("standsOn", () => {
	test("air over solid ground stands, anything else does not", () => {
		const grid = new Uint8Array(SIZE[0] * SIZE[1] * SIZE[2]);
		for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) grid[idx(x, 0, z)] = 1;
		expect(standsOn(grid, SIZE, [2, 1, 2])).toBe(true);
		grid[idx(2, 1, 2)] = 3; // solid where the feet go
		expect(standsOn(grid, SIZE, [2, 1, 2])).toBe(false);
		expect(standsOn(grid, SIZE, [2, 0, 2])).toBe(false); // y 0 has no ground below
	});
});

describe("findSpawn", () => {
	const grid = new Uint8Array(SIZE[0] * SIZE[1] * SIZE[2]);
	for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) grid[idx(x, 0, z)] = 1;

	test("a legal cell is taken as wanted", () => {
		expect(findSpawn(grid, SIZE, [2, 1, 2], [], 12)).toEqual([2, 1, 2]);
	});

	test("a spacing violation nudges to the nearest legal ring cell", () => {
		expect(findSpawn(grid, SIZE, [2, 1, 2], [[0, 1, 2]], 3)).toEqual([3, 1, 1]);
	});

	test("a blocked cell nudges to the nearest standing cell", () => {
		const blocked = grid.slice();
		blocked[idx(2, 1, 2)] = 3;
		blocked[idx(2, 2, 2)] = 3; // no head room either
		// the spiral starts at dx -1, dz -1, so the nearest ring cell wins
		expect(findSpawn(blocked, SIZE, [2, 1, 2], [], 12)).toEqual([1, 1, 1]);
	});

	test("an impossible ask returns null instead of an illegal spawn", () => {
		expect(findSpawn(grid, SIZE, [2, 1, 2], [[0, 1, 0]], 99)).toBe(null);
	});
});

describe("builtUpAround", () => {
	test("a seat between walls counts solid neighbours; an open field counts almost none", () => {
		const size = [8, 3, 8] as const;
		const grid = new Uint8Array(size[0] * size[1] * size[2]);
		const at = (x: number, y: number, z: number) => x + size[0] * (z + size[2] * y);
		for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) grid[at(x, 0, z)] = 1;
		for (let z = 1; z <= 5; z++) for (let y = 1; y <= 2; y++) grid[at(4, y, z)] = 2; // one corridor wall
		const besideWall = builtUpAround(grid, size, [3, 1, 3]);
		const open = builtUpAround(grid, size, [0, 1, 3]);
		expect(besideWall).toBeGreaterThan(open);
		expect(open).toBe(0); // the wall sits beyond the 5x5 window
	});
});

describe("zoneOf", () => {
	test("the fill centre picks the zone rectangle holding it", () => {
		expect(zoneOf({ from: [0, 0, 0], to: [2, 1, 2], block: 1 }, zoneRects)).toBe("field");
		expect(zoneOf({ from: [3, 0, 3], to: [3, 1, 3], block: 1 }, zoneRects)).toBe("tower");
		expect(zoneOf({ from: [0, 0, 3], to: [0, 1, 3], block: 1 }, zoneRects)).toBe("grounds");
	});
});
