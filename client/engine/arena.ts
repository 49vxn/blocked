import { World } from './world'

export interface ArenaFill {
	from: [number, number, number]
	to: [number, number, number]
	block: number
	zone?: string
}

export interface Arena {
	size: [number, number, number]
	fills: ArenaFill[]
}

/**
 * Expand `arena.json` into a voxel grid: MAP.md's fill format is two inclusive
 * corners with later fills overwriting earlier ones. Coordinates are [x, y, z].
 */
export function buildWorld(arena: Arena): World {
	const [sx, sy, sz] = arena.size
	const world = new World(sx, sy, sz)
	for (const fill of arena.fills) {
		world.fill(fill.from[0], fill.from[1], fill.from[2], fill.to[0], fill.to[1], fill.to[2], fill.block)
	}
	return world
}
