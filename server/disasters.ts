// server/disasters.ts — the three disasters as pure block operations.
// Each returns the cells it changed; the room applies them and broadcasts `disaster`.
import type { BlockDelta } from "../shared/protocol";
import { AIR, WATER } from "../shared/constants";

export type WorldView = {
  size: [number, number, number];
  blockAt(x: number, y: number, z: number): number;
};

export type DisasterResult = {
  cells: BlockDelta[];
  /** Meteor impact points / earthquake centre, for damage and client effects. */
  impacts: { x: number; y: number; z: number }[];
};

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

function collect(changes: Map<string, BlockDelta>): BlockDelta[] {
  return [...changes.values()];
}

// The library footprint, in map coordinates. MAP.md: the demo beat is the roof coming off.

/**
 * Five 3x3 impacts through the library. For every column under an impact the top three
 * solid blocks are deleted, so the iron roof, the lantern and the ceiling go before the
 * walls do — a hole you can drop through, not a flattened building.
 */
export function meteor(world: WorldView, rng: () => number): DisasterResult {
  const [, H] = world.size;
  const changes = new Map<string, BlockDelta>();
  const impacts: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < 5; i++) {
    // Concentrated on the middle of the library, not sprayed over its whole footprint: the
    // demo beat is one big central hole with the roof and lantern coming down.
    const ix = 30 + Math.floor(rng() * 7);
    const iz = 28 + Math.floor(rng() * 7);
    impacts.push({ x: ix, y: 7, z: iz });

    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const x = ix + dx;
        const z = iz + dz;
        let removed = 0;
        for (let y = H - 1; y >= 1 && removed < 3; y--) {
          if (world.blockAt(x, y, z) === AIR) continue;
          changes.set(key(x, y, z), { x, y, z, block: AIR });
          removed++;
        }
      }
  }
  return { cells: collect(changes), impacts };
}

/**
 * The quad fills like a basin. `level` is the lowest corner (0 in this map); water rises
 * to level + 4. Only air is replaced, so buildings, trunks and benches stay standing.
 */
export function flood(world: WorldView, level = 0): DisasterResult {
  const [W, , D] = world.size;
  const changes = new Map<string, BlockDelta>();
  const top = level + 4;
  for (let z = 43; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++)
      for (let y = level + 1; y <= top; y++)
        if (world.blockAt(x, y, z) === AIR)
          changes.set(key(x, y, z), { x, y, z, block: WATER });
  return { cells: collect(changes), impacts: [] };
}

/**
 * A radius-6 sphere centred on the science corridor. Ground (y 0) is left alone so the
 * arena does not become a hole; everything above it can come down.
 */
export function earthquake(world: WorldView): DisasterResult {
  const [W, H, D] = world.size;
  const centre = { x: 33, y: 2, z: 10 };
  const changes = new Map<string, BlockDelta>();
  const r2 = 6 * 6;
  for (let x = Math.max(0, centre.x - 6); x <= Math.min(W - 1, centre.x + 6); x++)
    for (let y = 1; y < Math.min(H, centre.y + 6); y++)
      for (let z = Math.max(0, centre.z - 6); z <= Math.min(D - 1, centre.z + 6); z++) {
        const dx = x - centre.x, dy = y - centre.y, dz = z - centre.z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        if (world.blockAt(x, y, z) === AIR) continue;
        changes.set(key(x, y, z), { x, y, z, block: AIR });
      }
  return { cells: collect(changes), impacts: [centre] };
}
