/**
 * Block registry: ids must match `shared/blocks.ts` and `client/textures/manifest.json`
 * 1..34 in that order, so `defineBlock` assigning sequential ids keeps them in sync.
 * Only what a renderer needs lives here.
 */
export interface BlockDef {
	id: number;
	name: string;
	solid: boolean;
	/** Neighbours still draw faces against this block. */
	transparent: boolean;
	/** Drawn blended after everything opaque (glass). */
	translucent?: boolean;
	/** Collision and render height, 1 for a full block. */
	height: number;
	/** Sunlight lost passing through; opaque blocks stop it entirely. */
	lightCost?: number;
	lightLevel?: number;
}

export type BlockInput = Omit<BlockDef, "id" | "solid" | "transparent" | "height"> &
	Partial<Pick<BlockDef, "solid" | "transparent" | "height">>;

const defs: BlockDef[] = [];

export function defineBlock(input: BlockInput): number {
	const id = defs.length;
	defs.push({ solid: true, transparent: false, height: 1, ...input, id });
	return id;
}

export const AIR = defineBlock({ name: "Air", solid: false, transparent: true });

/** id 1..34, in manifest order. */
const TABLE: [name: string, extra?: Partial<BlockInput>][] = [
	["Grass", {}],
	["Brick", {}],
	["Wood", {}],
	["Glass", { transparent: true, translucent: true }],
	["Concrete", {}],
	["Bed (red)", { height: 0.5 }],
	["Iron", {}],
	["Water", { solid: false, transparent: true, translucent: true }],
	["Stone", {}],
	["Stone (cracked)", {}],
	["Stone (mossy)", {}],
	["Plaster", {}],
	["Plaster (dirty)", {}],
	["Roof (slate)", {}],
	["Roof (worn)", {}],
	["Door", {}],
	["Pavers", {}],
	["Pavers (wet)", {}],
	["Hedge", {}],
	["Steel panel", {}],
	["Steel (rusted)", {}],
	["Glass (green)", { transparent: true, translucent: true }],
	["Glass (dark)", { transparent: true, translucent: true }],
	["Carpet", {}],
	["Shelves", {}],
	["Court", {}],
	["Turf", {}],
	["Gravel", {}],
	["Blackboard", {}],
	["Roof (terracotta)", {}],
	["Brick (aged)", {}],
	["Brick (mossy)", {}],
	["Brick (gold cap)", {}],
	["Bed (blue)", { height: 0.5 }],
];

for (const [name, extra] of TABLE) defineBlock({ name, ...extra });

export const BLOCKS: readonly BlockDef[] = defs;

export function blockDef(id: number): BlockDef {
	return defs[id] ?? defs[AIR];
}

/** Full opaque cubes hide neighbouring faces, cast ambient occlusion and stop sunlight. */
export function isOpaqueCube(def: BlockDef): boolean {
	return def.solid && !def.transparent && def.height === 1;
}
