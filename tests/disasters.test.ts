// The three disasters as pure block operations: what they delete, what they fill, and
// what they must never touch (the ground and everything outside their zone).
import { describe, expect, test } from "bun:test";
import { earthquake, flood, meteor, type WorldView } from "../server/disasters";

const SIZE: [number, number, number] = [64, 32, 64];
const k = (x: number, y: number, z: number) => `${x},${y},${z}`;

function makeWorld(): { world: WorldView; set: (x: number, y: number, z: number, b: number) => void } {
  const cells = new Map<string, number>();
  return {
    world: { size: SIZE, blockAt: (x, y, z) => cells.get(k(x, y, z)) ?? 0 },
    set: (x, y, z, b) => cells.set(k(x, y, z), b),
  };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("meteor", () => {
  test("strips the top three blocks under each impact and nothing below", () => {
    const { world, set } = makeWorld();
    for (let x = 28; x <= 38; x++)
      for (let z = 26; z <= 36; z++)
        for (let y = 1; y <= 7; y++) set(x, y, z, 2);

    const { cells } = meteor(world, seeded(7));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.block).toBe(0);
      expect(c.x).toBeGreaterThanOrEqual(28);
      expect(c.x).toBeLessThanOrEqual(38);
      expect(c.z).toBeGreaterThanOrEqual(26);
      expect(c.z).toBeLessThanOrEqual(36);
      // The top three of a 1..7 stack are exactly y 5, 6, 7.
      expect(c.y).toBeGreaterThanOrEqual(5);
      expect(c.y).toBeLessThanOrEqual(7);
    }
  });

  test("leaves the ground alone when the impact lands on grass", () => {
    const { world } = makeWorld();
    const { cells } = meteor(world, seeded(1));
    expect(cells.some((c) => c.y === 0)).toBe(false);
  });
});

describe("flood", () => {
  test("fills the quad's air to level + 4 and never replaces solids", () => {
    const { world, set } = makeWorld();
    set(10, 2, 50, 2); // a wall inside the quad must survive
    const { cells } = flood(world);
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.block).toBe(8);
      expect(c.y).toBeGreaterThanOrEqual(1);
      expect(c.y).toBeLessThanOrEqual(4);
      expect(c.z).toBeGreaterThanOrEqual(43);
    }
    expect(cells.some((c) => c.x === 10 && c.y === 2 && c.z === 50)).toBe(false);
  });
});

describe("earthquake", () => {
  test("cuts a radius-6 sphere above the ground only", () => {
    const { world, set } = makeWorld();
    for (let x = 26; x <= 40; x++)
      for (let z = 4; z <= 16; z++)
        for (let y = 1; y <= 4; y++) set(x, y, z, 2);

    const { cells, impacts } = earthquake(world);
    expect(impacts).toHaveLength(1);
    const c = impacts[0];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.block).toBe(0);
      expect(cell.y).toBeGreaterThanOrEqual(1);
      expect(Math.hypot(cell.x - c.x, cell.y - c.y, cell.z - c.z)).toBeLessThanOrEqual(6);
    }
    expect(cells.some((cell) => cell.y === 0)).toBe(false);
  });
});
