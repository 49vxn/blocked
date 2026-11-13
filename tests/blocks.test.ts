import { describe, expect, test } from "bun:test";
import {
  FACE_DIRS,
  adjacentCell,
  buildGrid,
  cellKey,
  hitsPlayer,
  inBounds,
} from "../shared/blocks";

const SIZE: [number, number, number] = [64, 32, 64];

describe("face directions", () => {
  test("six faces in protocol order +x,−x,+y,−y,+z,−z", () => {
    expect(FACE_DIRS.length).toBe(6);
    expect(FACE_DIRS[0]).toEqual([1, 0, 0]);
    expect(FACE_DIRS[1]).toEqual([-1, 0, 0]);
    expect(FACE_DIRS[2]).toEqual([0, 1, 0]);
    expect(FACE_DIRS[3]).toEqual([0, -1, 0]);
    expect(FACE_DIRS[4]).toEqual([0, 0, 1]);
    expect(FACE_DIRS[5]).toEqual([0, 0, -1]);
  });
});

describe("adjacentCell", () => {
  test("targets the empty cell along the face", () => {
    expect(adjacentCell(0, 5, 1, 5, SIZE)).toEqual({ x: 6, y: 1, z: 5 });
    expect(adjacentCell(1, 5, 1, 5, SIZE)).toEqual({ x: 4, y: 1, z: 5 });
    expect(adjacentCell(2, 5, 1, 5, SIZE)).toEqual({ x: 5, y: 2, z: 5 });
    expect(adjacentCell(4, 5, 1, 5, SIZE)).toEqual({ x: 5, y: 1, z: 6 });
    expect(adjacentCell(5, 5, 1, 5, SIZE)).toEqual({ x: 5, y: 1, z: 4 });
  });
  test("null outside the arena or for a bad face", () => {
    expect(adjacentCell(0, 63, 1, 5, SIZE)).toBeNull(); // +x edge
    expect(adjacentCell(3, 5, 0, 5, SIZE)).toBeNull(); // below y=0
    expect(adjacentCell(9, 5, 1, 5, SIZE)).toBeNull();
  });
});

describe("buildGrid", () => {
  test("fills cells; later fills overwrite earlier ones", () => {
    const arena = {
      v: 1 as const,
      size: [4, 3, 4] as [number, number, number],
      fills: [
        { from: [0, 0, 0] as [number, number, number], to: [3, 0, 3] as [number, number, number], block: 1 },
        { from: [1, 0, 1] as [number, number, number], to: [1, 0, 1] as [number, number, number], block: 2 },
      ],
      spawns: { red: [], blue: [] },
      beds: { red: [0, 0, 0] as [number, number, number], blue: [3, 0, 3] as [number, number, number] },
    };
    const grid = buildGrid(arena);
    expect(grid.get(cellKey(0, 0, 0))).toBe(1);
    expect(grid.get(cellKey(1, 0, 1))).toBe(2); // overwritten by the later fill
    expect(grid.get(cellKey(2, 1, 2))).toBeUndefined(); // air above
  });
});

describe("hitsPlayer", () => {
  const p = { x: 8.5, y: 1, z: 8.5 }; // hitbox x 8.2..8.8, y 1..2.8
  test("hit", () => {
    expect(hitsPlayer(8, 1, 8, p)).toBe(true); // cell 8..9 overlaps 8.2..8.8
  });
  test("miss", () => {
    expect(hitsPlayer(10, 1, 8, p)).toBe(false);
    expect(hitsPlayer(8, 3, 8, p)).toBe(false); // above the head
  });
});

describe("inBounds", () => {
  test("edges", () => {
    expect(inBounds(0, 0, 0, SIZE)).toBe(true);
    expect(inBounds(63, 31, 63, SIZE)).toBe(true);
    expect(inBounds(64, 0, 0, SIZE)).toBe(false);
    expect(inBounds(0, 32, 0, SIZE)).toBe(false);
    expect(inBounds(-1, 0, 0, SIZE)).toBe(false);
  });
});
