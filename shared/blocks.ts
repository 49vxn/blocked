// shared/blocks.ts — pure voxel helpers both the server and the tests use.
import type { ArenaSnapshot } from "./protocol";
import { PLAYER_HALF, PLAYER_HEIGHT } from "./constants";

// face: 0..5 = +x, −x, +y, −y, +z, −z (PROTOCOL.md encodings)
export const FACE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

export const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export function inBounds(
  x: number,
  y: number,
  z: number,
  size: readonly [number, number, number],
): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < size[0] && y < size[1] && z < size[2];
}

// The empty cell a `place` targets: adjacent to the named block, along its face.
export function adjacentCell(
  face: number,
  x: number,
  y: number,
  z: number,
  size: readonly [number, number, number],
): { x: number; y: number; z: number } | null {
  const dir = FACE_DIRS[face];
  if (!dir) return null;
  const [nx, ny, nz] = [x + dir[0], y + dir[1], z + dir[2]];
  return inBounds(nx, ny, nz, size) ? { x: nx, y: ny, z: nz } : null;
}

// Expand fills to a sparse grid; later fills overwrite earlier ones (MAP.md carve rule).
export function buildGrid(arena: ArenaSnapshot): Map<string, number> {
  const grid = new Map<string, number>();
  for (const f of arena.fills) {
    for (let x = f.from[0]; x <= f.to[0]; x++) {
      for (let y = f.from[1]; y <= f.to[1]; y++) {
        for (let z = f.from[2]; z <= f.to[2]; z++) {
          grid.set(cellKey(x, y, z), f.block);
        }
      }
    }
  }
  return grid;
}

// Does the cell overlap a player's hitbox (0.6 × 1.8 × 0.6 on the feet position)?
export function hitsPlayer(
  cx: number,
  cy: number,
  cz: number,
  p: { x: number; y: number; z: number },
): boolean {
  return (
    cx + 1 > p.x - PLAYER_HALF &&
    cx < p.x + PLAYER_HALF &&
    cy + 1 > p.y &&
    cy < p.y + PLAYER_HEIGHT &&
    cz + 1 > p.z - PLAYER_HALF &&
    cz < p.z + PLAYER_HALF
  );
}
