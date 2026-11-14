// scripts/port-spawn-world.ts — port the spawn world's authored campus into client/arena.json.
//
// Source of truth: the spawn repo's scripts/lib/campus.js (the map lane's authored school).
// It is a pure builder: build() returns a Uint8Array of material indexes over MATS on the same
// 64x32x64 grid the judge arena uses. The port runs that builder locally — no live world, no
// network — meshes the grid into box fills, maps material names onto the judge atlas
// (client/textures/manifest.json), ports the campus spawn ring (nudging the judge gate's
// 12-block spacing rule where the live world never had one), plants the two bedwars beds,
// and mirrors every docs/VERIFY.md arena check before it will write. Re-run it whenever the
// campus changes.
//
// Usage: bun run scripts/port-spawn-world.ts [--check] [--campus <path-to-campus.js>]
//   --check  validate only, write nothing.

import { readFileSync, writeFileSync } from "node:fs";

// --- shapes we read out of the spawn repo's plain-JS campus module -------------------------

interface CampusZone {
	x: [number, number];
	z: [number, number];
	[key: string]: unknown;
}
interface Campus {
	SIZE: [number, number, number];
	MATS: (string | null)[];
	ZONES: Record<string, CampusZone>;
	FFA: [number, number, number][];
	build(): Uint8Array;
}

interface ArenaFill {
	zone?: string;
	from: [number, number, number];
	to: [number, number, number];
	block: number;
}

const SIZE: [number, number, number] = [64, 32, 64];
const FFA_MIN_DIST = 12; // verify.ts: no two survival spawns closer than this in x/z
const BED_BLOCK = 6; // verify.ts expects block 6 at both beds
const BED_SPAWN = { red: [8, 1, 8] as [number, number, number], blue: [56, 5, 56] as [number, number, number] };
const BEDS = { red: [10, 1, 8] as [number, number, number], blue: [54, 5, 56] as [number, number, number] };

// Spawn-only materials with no atlas tile of their own, mapped to the nearest judge block.
// The judge grass block is dirt-textured on its sides and bottom, so underground dirt reads
// right the moment a disaster digs into it.
const ALIASES: Record<string, string> = {
	bed_red: "bed",
	bed_blue: "bed-blue",
	dirt: "grass",
	bush: "hedge",
	grass_mown: "grass",
	road_line: "plaster",
	concrete_dark: "concrete",
	timber_dark: "wood",
	trim_white: "plaster",
	lamp: "glass",
};

// --- pure core (exported for tests) --------------------------------------------------------

/** Greedy-mesh a grid into axis-aligned boxes of one block: extend along x, then z, then y
 * while the material matches and no cell is claimed yet. 0 is air and never fills. */
export function meshGrid(grid: Uint8Array, size: readonly [number, number, number]): ArenaFill[] {
	const [W, H, D] = size;
	const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
	const seen = new Uint8Array(grid.length);
	const fills: ArenaFill[] = [];
	for (let y = 0; y < H; y++)
		for (let z = 0; z < D; z++)
			for (let x = 0; x < W; x++) {
				const m = grid[idx(x, y, z)];
				if (m === 0 || seen[idx(x, y, z)]) continue;
				let x1 = x;
				while (x1 + 1 < W && !seen[idx(x1 + 1, y, z)] && grid[idx(x1 + 1, y, z)] === m) x1++;
				let z1 = z;
				rowZ: while (z1 + 1 < D) {
					for (let xx = x; xx <= x1; xx++)
						if (seen[idx(xx, y, z1 + 1)] || grid[idx(xx, y, z1 + 1)] !== m) break rowZ;
					z1++;
				}
				let y1 = y;
				rowY: while (y1 + 1 < H) {
					for (let zz = z; zz <= z1; zz++)
						for (let xx = x; xx <= x1; xx++)
							if (seen[idx(xx, y1 + 1, zz)] || grid[idx(xx, y1 + 1, zz)] !== m) break rowY;
					y1++;
				}
				for (let yy = y; yy <= y1; yy++)
					for (let zz = z; zz <= z1; zz++)
						for (let xx = x; xx <= x1; xx++) seen[idx(xx, yy, zz)] = 1;
				fills.push({ from: [x, y, z], to: [x1, y1, z1], block: m });
			}
	return fills;
}

const solid = (grid: Uint8Array, size: readonly [number, number, number], x: number, y: number, z: number): boolean => {
	if (x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) return false;
	return grid[x + size[0] * (z + size[2] * y)] !== 0;
};

/** True when the cell is a legal spawn: air at the cell, head room above, solid ground below. */
export function standsOn(
	grid: Uint8Array,
	size: readonly [number, number, number],
	[x, y, z]: readonly [number, number, number],
): boolean {
	return (
		y > 0 && !solid(grid, size, x, y, z) && !solid(grid, size, x, y + 1, z) && solid(grid, size, x, y - 1, z)
	);
}

const spaced = (a: readonly number[], b: readonly number[], minDist: number): boolean =>
	Math.hypot(a[0] - b[0], a[2] - b[2]) >= minDist;

/** Nearest cell to `want` (spiral over x/z, keeping the campus's own y) that is a legal spawn
 * and respects the spacing rule against `taken`; null when nothing legal is found nearby. */
export function findSpawn(
	grid: Uint8Array,
	size: readonly [number, number, number],
	want: readonly [number, number, number],
	taken: readonly (readonly [number, number, number])[],
	minDist: number,
): [number, number, number] | null {
	const [x0, y, z0] = want;
	for (let r = 0; r <= 8; r++)
		for (let dx = -r; dx <= r; dx++)
			for (let dz = -r; dz <= r; dz++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // the ring only
				const x = x0 + dx, z = z0 + dz;
				if (!standsOn(grid, size, [x, y, z])) continue;
				if (!taken.every((t) => spaced([x, y, z], t, minDist))) continue;
				return [x, y, z];
			}
	return null;
}

/** How built-up the ground around a spawn is: solid cells in the 5x5 at feet and head level.
 * The judge place/break gate needs a face within reach of the ring's first seats, so the port
 * leads with the most built-up campus seats and leaves the open field basin for last. */
export function builtUpAround(
	grid: Uint8Array,
	size: readonly [number, number, number],
	[x, y, z]: readonly [number, number, number],
): number {
	let n = 0;
	for (let dx = -2; dx <= 2; dx++)
		for (let dz = -2; dz <= 2; dz++)
			for (const dy of [0, 1]) if (solid(grid, size, x + dx, y + dy, z + dz)) n++;
	return n;
}

/** The zone label for a fill, by which campus zone rectangle holds its centre. */
export function zoneOf(fill: ArenaFill, zones: Record<string, CampusZone>): string {
	const cx = (fill.from[0] + fill.to[0]) / 2, cz = (fill.from[2] + fill.to[2]) / 2;
	for (const [name, zone] of Object.entries(zones)) {
		if (!zone || !Array.isArray(zone.x) || !Array.isArray(zone.z)) continue;
		if (cx >= zone.x[0] && cx <= zone.x[1] && cz >= zone.z[0] && cz <= zone.z[1]) return name;
	}
	return "grounds";
}

// --- the port ------------------------------------------------------------------------------
// Runs only when this file is the entry point: tests import the pure core above and must not
// trigger a port.

if (import.meta.main) {
	const checkOnly = process.argv.includes("--check");
	const campusIdx = process.argv.indexOf("--campus");
	const campusArg = campusIdx >= 0 ? process.argv[campusIdx + 1] : undefined;
	// a file:// URL, not a dos path: import() would read the drive colon as a URL scheme
	const campusUrl = campusArg
		? new URL(`file://${campusArg.replaceAll("\\", "/")}`)
		: new URL("../../spawn/blocked/scripts/lib/campus.js", import.meta.url);

	// @ts-ignore — plain JS from the spawn repo; it has no type declarations
	const campus = (await import(campusUrl.href)) as Campus;

	if (campus.SIZE.join() !== SIZE.join())
		throw new Error(`campus size ${campus.SIZE} does not fit the judge arena ${SIZE}`);

	// material names -> judge atlas ids, from the manifest's slug list
	interface ManifestBlock {
		id: number;
		slug: string;
	}
	const manifest = JSON.parse(readFileSync(new URL("../client/textures/manifest.json", import.meta.url), "utf8")) as {
		blocks: ManifestBlock[];
	};
	const slugToId = new Map(manifest.blocks.map((b) => [b.slug, b.id]));
	const matToId = new Map<number, number>();
	const unmapped: string[] = [];
	campus.MATS.forEach((name, i) => {
		if (name == null) return;
		const slug = ALIASES[name] ?? name.replaceAll("_", "-");
		const id = slugToId.get(slug);
		if (id == null) {
			unmapped.push(name);
			return;
		}
		matToId.set(i, id);
	});
	if (unmapped.length) throw new Error(`campus materials with no judge atlas tile: ${unmapped.join(", ")}`);

	const grid = campus.build().map((m) => (m === 0 ? 0 : matToId.get(m) ?? 0));

	// the two bedwars beds: block 6 on solid ground (the campus has no beds of its own)
	for (const team of ["red", "blue"] as const) {
		const [bx, by, bz] = BEDS[team];
		if (!solid(grid, SIZE, bx, by - 1, bz)) throw new Error(`${team} bed at ${bx},${by},${bz} has no ground below`);
		grid[bx + SIZE[0] * (bz + SIZE[2] * by)] = BED_BLOCK;
	}

	// the survival ring: the campus's own eight, most built-up seats first (verify.ts places a
	// block within reach of the early seats), nudged only where the judge gate's spacing rule says so
	const ring = [...campus.FFA].sort((a, b) => builtUpAround(grid, SIZE, b) - builtUpAround(grid, SIZE, a));
	const ffa: [number, number, number][] = [];
	const nudges: string[] = [];
	for (const want of ring) {
		const got = findSpawn(grid, SIZE, want, ffa, FFA_MIN_DIST);
		if (!got) throw new Error(`no legal spawn near ${want.join(",")} (air, head room, ground, ${FFA_MIN_DIST} spacing)`);
		if (got.join() !== want.join()) nudges.push(`[${want.join(",")}] -> [${got.join(",")}]`);
		ffa.push(got);
	}
	for (const team of ["red", "blue"] as const) {
		if (!standsOn(grid, SIZE, BED_SPAWN[team]))
			throw new Error(`${team} spawn ${BED_SPAWN[team].join(",")} does not stand on the ported campus`);
		if (grid[BEDS[team][0] + SIZE[0] * (BEDS[team][2] + SIZE[2] * BEDS[team][1])] !== BED_BLOCK)
			throw new Error(`${team} bed did not land`);
	}

	// fills, tagged by campus zone
	const fills = meshGrid(grid, SIZE).map((f) => ({ ...f, zone: zoneOf(f, campus.ZONES) }));
	for (const f of fills)
		for (const c of [f.from, f.to])
			if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= SIZE[0] || c[1] >= SIZE[1] || c[2] >= SIZE[2])
				throw new Error(`fill out of bounds: ${f.zone} ${f.from}-${f.to}`);

	const usedMats = [...new Set(fills.map((f) => f.block))].sort((a, b) => a - b);
	console.log(
		`campus: ${fills.length} fills, ${usedMats.length} blocks (ids ${usedMats.join(",")}), ` +
			`8 ffa spawns (${nudges.length ? `nudged: ${nudges.join("; ")}` : "all as authored"})`,
	);

	if (checkOnly) {
		console.log("--check: validated only, client/arena.json untouched");
		process.exit(0);
	}

	const q = (s: string) => JSON.stringify(s);
	const doc = `{
  "v": 1,
  "size": [${SIZE.join(", ")}],
  "fills": [
${fills
	.map(
		(f) =>
			`    { "zone": ${q(f.zone ?? "")}, "from": [${f.from.join(", ")}], "to": [${f.to.join(", ")}], "block": ${f.block} }`,
	)
	.join(",\n")}
  ],
  "spawns": {
    "ffa": [${ffa.map((s) => `[${s.join(", ")}]`).join(", ")}],
    "red": [[${BED_SPAWN.red.join(", ")}]],
    "blue": [[${BED_SPAWN.blue.join(", ")}]]
  },
  "beds": { "red": [${BEDS.red.join(", ")}], "blue": [${BEDS.blue.join(", ")}] }
}
`;
	writeFileSync(new URL("../client/arena.json", import.meta.url), doc);
	console.log("wrote client/arena.json");
}
