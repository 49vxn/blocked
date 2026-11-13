// server/movement.ts — the authoritative body controller.
// The server owns position: clients send intent only. Fixed 20 Hz, per-tick velocities,
// axis-separated AABB collision (Y, then X, then Z) so a fast body cannot tunnel.
import { PLAYER_HALF, PLAYER_HEIGHT } from "./constants";

/** True when the cell is a block a body cannot enter (water is not). */
export type CollisionWorld = (x: number, y: number, z: number) => boolean;

export type Body = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  onGround: boolean;
};

export type Intent = {
  /** -1 back, 1 forward */
  forward: number;
  /** -1 left, 1 right */
  strafe: number;
  jump: boolean;
  sprint: boolean;
};

type Box = [number, number, number, number, number, number];

const GRAVITY = 0.08; // per tick^2 (32 blocks/s^2 at 20 Hz)
const JUMP_VELOCITY = 0.62; // ~2.4 blocks of clearance
const WALK_SPEED = 0.21; // 4.2 blocks/s
const SPRINT_SPEED = 0.27; // 5.4 blocks/s
const GROUND_FRICTION = 0.55; // replace part of the old velocity each tick: instant turns
const AIR_DRAG = 0.96;
const AIR_CONTROL = 0.04;
const MAX_FALL = 1.2;
const STEP = 0.05; // collision sub-step, smaller than any block

const EPS = 1e-7;

function bodyBox(b: Body): Box {
  return [b.x - PLAYER_HALF, b.y, b.z - PLAYER_HALF, b.x + PLAYER_HALF, b.y + PLAYER_HEIGHT, b.z + PLAYER_HALF];
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
}

function collides(world: CollisionWorld, box: Box): boolean {
  for (let y = Math.floor(box[1]); y <= Math.floor(box[4] - EPS); y++)
    for (let z = Math.floor(box[2]); z <= Math.floor(box[5] - EPS); z++)
      for (let x = Math.floor(box[0]); x <= Math.floor(box[3] - EPS); x++)
        if (world(x, y, z) && overlaps(box, [x, y, z, x + 1, y + 1, z + 1])) return true;
  return false;
}

/** Move one axis in small steps; stop at the first contact. Returns true when blocked. */
function moveAxis(world: CollisionWorld, b: Body, axis: "x" | "y" | "z", d: number): boolean {
  if (d === 0) return false;
  const dir = Math.sign(d);
  let left = d;
  while (Math.abs(left) > 1e-6) {
    const inc = Math.abs(left) > STEP ? dir * STEP : left;
    b[axis] += inc;
    left -= inc;
    if (collides(world, bodyBox(b))) {
      b[axis] -= inc;
      return true;
    }
  }
  return false;
}

const clamp1 = (n: number) => Math.max(-1, Math.min(1, Number(n) || 0));

/**
 * One simulation tick. Mutates the body. `speedScale` is 1 on land and < 1 in water.
 * Jumping only from the ground; a body that walks off an edge falls.
 */
export function moveBody(world: CollisionWorld, b: Body, intent: Intent, speedScale = 1): void {
  const forward = clamp1(intent.forward);
  const strafe = clamp1(intent.strafe);
  const len = Math.hypot(forward, strafe);
  const f = len > 1 ? forward / len : forward;
  const s = len > 1 ? strafe / len : strafe;

  const sin = Math.sin(b.yaw);
  const cos = Math.cos(b.yaw);
  // Forward is -z at yaw 0, matching the client's camera convention.
  const wx = f * -sin + s * cos;
  const wz = f * -cos + s * -sin;
  const speed = (intent.sprint ? SPRINT_SPEED : WALK_SPEED) * speedScale;

  if (b.onGround) {
    b.vx = b.vx * GROUND_FRICTION + wx * speed * (1 - GROUND_FRICTION);
    b.vz = b.vz * GROUND_FRICTION + wz * speed * (1 - GROUND_FRICTION);
  } else {
    b.vx = b.vx * AIR_DRAG + wx * speed * AIR_CONTROL;
    b.vz = b.vz * AIR_DRAG + wz * speed * AIR_CONTROL;
  }

  if (intent.jump && b.onGround) {
    b.vy = JUMP_VELOCITY;
    b.onGround = false;
  }

  b.vy = Math.max(-MAX_FALL, b.vy - GRAVITY);
  b.onGround = false;
  if (moveAxis(world, b, "y", b.vy)) {
    if (b.vy < 0) b.onGround = true;
    b.vy = 0;
  }

  if (moveAxis(world, b, "x", b.vx)) b.vx = 0;
  if (moveAxis(world, b, "z", b.vz)) b.vz = 0;

  if (Math.abs(b.vx) < 0.003) b.vx = 0;
  if (Math.abs(b.vz) < 0.003) b.vz = 0;
}
