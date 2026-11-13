/**
 * Atlas geometry for the game's 544x48 contract atlas: 34 columns (column = id - 1)
 * by three face rows (top 0, side 1, bottom 2), 16 px cells, no padding.
 * The mesher only needs `rect`.
 */
export interface AtlasLayout {
	width: number;
	height: number;
	/** [u0, v0, u1, v1] for a block id and face row (0 top, 1 side, 2 bottom). */
	rect(id: number, face: 0 | 1 | 2): [number, number, number, number];
}

const TILE = 16;
const COLUMNS = 34;

/**
 * Half-texel inset: with NearestFilter the boundary texel can otherwise bleed
 * from the neighbouring cell on interpolated UVs.
 */
const INSET_U = 0.5 / (TILE * COLUMNS);
const INSET_V = 0.5 / (TILE * 3);

export function atlasLayout(width = TILE * COLUMNS, height = TILE * 3): AtlasLayout {
	return {
		width,
		height,
		rect(id, face) {
			const col = Math.max(0, Math.min(COLUMNS - 1, id - 1));
			const row = face;
			const u0 = col / COLUMNS + INSET_U;
			const u1 = (col + 1) / COLUMNS - INSET_U;
			// v grows upward: row 0 is the top strip of the image.
			const v1 = 1 - row / 3 - INSET_V;
			const v0 = 1 - (row + 1) / 3 + INSET_V;
			return [u0, v0, u1, v1];
		},
	};
}
