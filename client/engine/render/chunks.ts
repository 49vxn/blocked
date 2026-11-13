import { BufferAttribute, BufferGeometry, Group, Mesh, type ShaderMaterial } from 'three'
import type { World } from '../world'
import type { AtlasLayout } from './atlas'
import { ChunkMesher } from './chunk-mesher'
import type { ChunkGeometry } from './mesher'

/**
 * One mesh per 16^3 chunk, meshed on this thread. The arena is 4x2x4 chunks and is
 * built once, so there is no worker to sequence: edits remesh only the chunks they
 * touch.
 */
export class ChunkRenderer {
	readonly group = new Group()
	private readonly mesher: ChunkMesher
	private readonly meshes = new Map<string, Mesh>()
	private readonly unsubscribe: () => void
	private edits: number[] = []

	constructor(
		readonly world: World,
		private readonly layout: AtlasLayout,
		private readonly material: ShaderMaterial,
		private readonly translucent: ShaderMaterial = material,
	) {
		this.mesher = new ChunkMesher({
			t: 'init',
			seq: 0,
			sx: world.sx,
			sy: world.sy,
			sz: world.sz,
			cells: world.cells,
			layout,
		})
		this.unsubscribe = world.onChange((x, y, z) => this.edits.push(x, y, z, world.raw(x, y, z)))
	}

	get meshCount(): number {
		return this.meshes.size
	}

	/** Mesh everything still dirty; call once before the first frame, and after edits. */
	flush(): void {
		if (this.edits.length > 0) {
			this.mesher.handle({ t: 'edits', seq: 0, edits: Int32Array.from(this.edits) })
			this.edits = []
		}
		if (!this.mesher.busy) return
		for (const chunk of this.mesher.step(Infinity).chunks) this.build(`${chunk.cx},${chunk.cy},${chunk.cz}`, chunk.geometry)
	}

	private build(key: string, g: ChunkGeometry): void {
		const old = this.meshes.get(key)
		if (g.indices.length === 0) {
			if (old) {
				this.group.remove(old)
				old.geometry.dispose()
				this.meshes.delete(key)
			}
			return
		}
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(g.positions, 3))
		geometry.setAttribute('normal', new BufferAttribute(g.normals, 3))
		geometry.setAttribute('uv', new BufferAttribute(g.uvs, 2))
		geometry.setAttribute('light', new BufferAttribute(g.lights, 1))
		geometry.setIndex(new BufferAttribute(g.indices, 1))
		// Opaque faces first, then translucent ones with the blended material.
		geometry.addGroup(0, g.translucentStart, 0)
		if (g.indices.length > g.translucentStart) geometry.addGroup(g.translucentStart, g.indices.length - g.translucentStart, 1)
		geometry.computeBoundingSphere()
		if (old) {
			old.geometry.dispose()
			old.geometry = geometry
			return
		}
		const mesh = new Mesh(geometry, [this.material, this.translucent])
		mesh.matrixAutoUpdate = false
		this.meshes.set(key, mesh)
		this.group.add(mesh)
	}

	dispose(): void {
		this.unsubscribe()
		for (const mesh of this.meshes.values()) mesh.geometry.dispose()
		this.meshes.clear()
		this.group.clear()
	}
}
