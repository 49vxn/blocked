// shared/protocol.ts — the wire contract, transcribed from PROTOCOL.md. One owner: A.

export type ClientMsg =
  | { t: "join"; v: 1; name: string; room: string; id?: string }
  | { t: "setup"; mode?: Mode; bots?: number } // host only, lobby only
  | { t: "input"; seq: number; move: [number, number]; yaw: number; pitch: number; keys: number; look?: boolean }
  | { t: "place"; x: number; y: number; z: number; block: number; face: number }
  | { t: "break"; x: number; y: number; z: number }
  | { t: "attack"; x: number; y: number; z: number } // a cell, resolved to a player or a bed
  | { t: "chat"; text: string }
  | { t: "start" }
  | { t: "rematch" };

export type ServerMsg =
  | { t: "welcome"; v: 1; id: string; mode: Mode; team: Team | null; arena: ArenaSnapshot; serverTime: number }
  | {
      t: "snapshot";
      tick: number;
      seq: number;
      serverTime: number;
      players: PlayerState[];
      blocks: BlockDelta[];
      beds: BedState[];
      phase: Phase;
    }
  | { t: "disaster"; kind: "meteor" | "flood" | "earthquake"; at: number; cells: BlockDelta[] }
  | { t: "event"; kind: "join" | "leave" | "death" | "bed" | "chat"; name?: string; killer?: string; text?: string }
  | {
      t: "round";
      phase: Phase;
      winner?: "red" | "blue";
      winnerId?: string;
      winnerName?: string;
      endsAt: number;
      startsAt?: number;
    }
  | { t: "error"; code: string; message: string };

export type PlayerState = {
  id: string;
  name: string;
  bot: boolean;
  team: Team | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
};

export type BlockDelta = { x: number; y: number; z: number; block: number };
export type BedState = { team: Team; x: number; y: number; z: number; hp: number; alive: boolean };
export type Phase = "lobby" | "countdown" | "live" | "over";
export type Mode = "survival" | "bedwars";
export type Team = "red" | "blue";

// The arena.json document itself, sent on `welcome` — shape is the MAP.md fill format.
export type ArenaSnapshot = {
  v: 1;
  size: [number, number, number];
  fills: { zone?: string; from: [number, number, number]; to: [number, number, number]; block: number }[];
  spawns: {
    red: [number, number, number][];
    blue: [number, number, number][];
    ffa?: [number, number, number][];
  };
  beds: { red: [number, number, number]; blue: [number, number, number] };
};
