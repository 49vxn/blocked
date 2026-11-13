// shared/constants.ts — the numbers every module agrees on. Source of truth: PROTOCOL.md.

export const TICK_HZ = 20;
export const SNAPSHOT_HZ = 10;
export const ROUND_SECONDS = 480; // 8 minutes, both modes
export const MAX_PLAYERS = 8;
export const BOT_MAX = 7;
export const DEFAULT_PORT = 8080;
export const COUNTDOWN_SECONDS = 3;

export const REACH = 5; // "within 5 blocks": eye → target cell centre, Euclidean
export const PLACE_BUDGET = 32; // refilled each round, never refunded on break
export const PLAYER_HP = 100;
export const ATTACK_DAMAGE = 20; // player hit
export const BED_DAMAGE = 25; // bedwars bed hit
export const ATTACK_COOLDOWN_MS = 400;
export const INTENT_DECAY_MS = 500; // silent client stops, never drifts

export const EYE_HEIGHT = 1.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_HALF = 0.3; // hitbox 0.6 × 1.8 × 0.6
export const MOVE_SPEED = 4.3; // blocks per second

// Disaster clock in game-seconds from round start (meteor takes the library roof).
export const DISASTER_AT = { meteor: 120, flood: 240, earthquake: 360 } as const;

export const AIR = 0;
export const GRASS = 1;
export const BRICK = 2;
export const WOOD = 3; // what the server places while the runner has no inventory
export const GLASS = 4;
export const CONCRETE = 5;
export const BED = 6;
export const IRON = 7;
export const WATER = 8;
