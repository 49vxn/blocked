// The authoritative body: it stands on ground, jumps about one block, falls back, and
// cannot walk through a wall.
import { describe, expect, test } from "bun:test";
import { moveBody, type Body, type Intent } from "../shared/movement";

const ground = (x: number, y: number, z: number) => y < 1;
const groundAndWall = (x: number, y: number, z: number) => y < 1 || x === 2;

function bodyAt(x: number, y: number, z: number, yaw = 0): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, onGround: false };
}

const idle: Intent = { forward: 0, strafe: 0, jump: false, sprint: false };
const tick = (world: (x: number, y: number, z: number) => boolean, b: Body, intent: Intent) =>
  moveBody(world, b, intent);

describe("gravity", () => {
  test("a body dropped over ground settles on it", () => {
    const b = bodyAt(8.5, 4, 8.5);
    for (let i = 0; i < 30; i++) tick(ground, b, idle);
    expect(b.onGround).toBe(true);
    expect(b.y).toBeGreaterThanOrEqual(1);
    expect(b.y).toBeLessThan(1.1);
  });

  test("walking off an edge falls", () => {
    const b = bodyAt(8.5, 1, 8.5);
    tick(ground, b, idle);
    expect(b.onGround).toBe(true);
    // Remove the ground from under it for one tick.
    moveBody((x, y, z) => y < 0, b, idle);
    expect(b.onGround).toBe(false);
    expect(b.y).toBeLessThan(1);
  });
});

describe("jump", () => {
  test("rises about one block and lands again", () => {
    const b = bodyAt(8.5, 1, 8.5);
    tick(ground, b, idle);
    const start = b.y;
    let peak = start;
    tick(ground, b, { ...idle, jump: true });
    for (let i = 0; i < 40; i++) {
      tick(ground, b, idle);
      peak = Math.max(peak, b.y);
      if (i > 5 && b.onGround) break;
    }
    expect(peak - start).toBeGreaterThan(1.8);
    expect(peak - start).toBeLessThan(2.8);
    expect(b.onGround).toBe(true);
  });
});

describe("collision", () => {
  test("a wall stops horizontal movement", () => {
    // yaw -PI/2 faces +x.
    const b = bodyAt(1.5, 1, 8.5, -Math.PI / 2);
    for (let i = 0; i < 40; i++) tick(groundAndWall, b, { ...idle, forward: 1 });
    expect(b.x).toBeLessThan(2 - 0.3 + 1e-6);
    expect(b.x).toBeGreaterThan(1.5);
  });

  test("can walk through a doorway two blocks high", () => {
    // Wall at x=2 with a y1..2 gap at z 8..9.
    const doorway = (x: number, y: number, z: number) =>
      y < 1 || (x === 2 && (y > 2 || z < 8 || z > 9));
    const b = bodyAt(1.5, 1, 8.5, -Math.PI / 2);
    for (let i = 0; i < 40; i++) tick(doorway, b, { ...idle, forward: 1 });
    expect(b.x).toBeGreaterThan(2.5);
  });
});
