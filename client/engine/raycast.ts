import { blockDef } from "./blocks";
import type { World } from "./world";

/** Faces in PROTOCOL.md's order: [+x, -x, +y, -y, +z, -z]. */
export type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface BlockHit {
	x: number;
	y: number;
	z: number;
	/** Face the ray entered through, indexed like PROTOCOL.md. */
	face: FaceIndex;
	/** Outward normal of that face, for the placement cell. */
	normal: [number, number, number];
	distance: number;
}

const NORMALS: [number, number, number][] = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1],
];

/**
 * Amanatides-Woo voxel traversal: step cell by cell along the ray and return the
 * first solid cell, with the face it was entered through. Glass is targetable;
 * water and other non-solid blocks are not.
 */
export function raycast(
	world: World,
	origin: readonly [number, number, number],
	dir: readonly [number, number, number],
	maxDist = 6,
): BlockHit | null {
	const len = Math.hypot(dir[0], dir[1], dir[2]);
	if (len === 0) return null;
	const d: [number, number, number] = [dir[0] / len, dir[1] / len, dir[2] / len];

	let x = Math.floor(origin[0]);
	let y = Math.floor(origin[1]);
	let z = Math.floor(origin[2]);

	const step: [number, number, number] = [Math.sign(d[0]), Math.sign(d[1]), Math.sign(d[2])];
	const delta: [number, number, number] = [
		d[0] === 0 ? Infinity : Math.abs(1 / d[0]),
		d[1] === 0 ? Infinity : Math.abs(1 / d[1]),
		d[2] === 0 ? Infinity : Math.abs(1 / d[2]),
	];
	const axisDistance = (o: number, cell: number, s: number, dt: number) =>
		s === 0 ? Infinity : ((s > 0 ? cell + 1 - o : o - cell) || 1) * dt;
	const tMax: [number, number, number] = [
		axisDistance(origin[0], x, step[0], delta[0]),
		axisDistance(origin[1], y, step[1], delta[1]),
		axisDistance(origin[2], z, step[2], delta[2]),
	];

	let face: FaceIndex = 0;
	let distance = 0;
	while (distance <= maxDist) {
		if (world.inBounds(x, y, z)) {
			const def = blockDef(world.get(x, y, z));
			if (def.solid) return { x, y, z, face, normal: NORMALS[face], distance };
		}
		// Advance across the nearest cell boundary.
		if (tMax[0] <= tMax[1] && tMax[0] <= tMax[2]) {
			distance = tMax[0];
			x += step[0];
			tMax[0] += delta[0];
			face = step[0] > 0 ? 1 : 0;
		} else if (tMax[1] <= tMax[2]) {
			distance = tMax[1];
			y += step[1];
			tMax[1] += delta[1];
			face = step[1] > 0 ? 3 : 2;
		} else {
			distance = tMax[2];
			z += step[2];
			tMax[2] += delta[2];
			face = step[2] > 0 ? 5 : 4;
		}
	}
	return null;
}
