/**
 * 3D voxel renderer for the game client (B2).
 *
 * `engine/` meshes 16^3 chunks with per-vertex ambient occlusion and smooth
 * sunlight, propagates sunlight through the grid, and shades with the chunk and
 * sky shaders. The atlas geometry (`engine/render/atlas.ts`) and the block table
 * (`engine/blocks.ts`) follow the 544x48 contract atlas and `shared/blocks.ts` ids.
 *
 * `main.ts` only needs:
 *
 *   const view = await createVoxelRenderer(canvas, world)
 *   view.render()
 *
 * and then `view.world.set(...)` for snapshot edits and `view.flush()` after them.
 */
import {
	Color,
	NearestFilter,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	Vector3,
	WebGLRenderer,
} from "three";
import { ChunkRenderer } from "./engine/render/chunks";
import { atlasLayout } from "./engine/render/atlas";
import { createChunkMaterial, defaultEnvironment, type Environment } from "./engine/render/shaders";
import { createSky } from "./engine/render/sky";
import type { World } from "./engine/world";

export interface VoxelRenderer {
	renderer: WebGLRenderer;
	scene: Scene;
	camera: PerspectiveCamera;
	chunks: ChunkRenderer;
	/** Render one frame and advance the sky. */
	render(): void;
	/** Mesh anything changed since the last call (after block edits). */
	flush(): void;
	resize(width: number, height: number): void;
	fps(): number;
	dispose(): void;
}

/** Atlas and manifest are served next to the client (`/textures/...`). */
export async function loadAtlas(atlasUrl = "/textures/atlas.png"): Promise<Texture> {
	const texture = await new TextureLoader().loadAsync(atlasUrl);
	texture.magFilter = NearestFilter;
	texture.minFilter = NearestFilter;
	texture.generateMipmaps = false;
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

export async function createVoxelRenderer(canvas: HTMLCanvasElement, world: World): Promise<VoxelRenderer> {
	const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
	renderer.setClearColor(new Color("#9dc7ef"));
	renderer.outputColorSpace = SRGBColorSpace;

	const scene = new Scene();
	const camera = new PerspectiveCamera(72, 1, 0.1, 600);

	const env: Environment = defaultEnvironment();
	// A 64-block campus needs no horizon haze; the defaults are tuned for 256-block worlds.
	env.fogNear = 90;
	env.fogFar = 220;
	env.sunDirection = new Vector3(0.45, 1, 0.3).normalize();

	const atlas = await loadAtlas();
	const image = atlas.image as { width: number; height: number };
	const layout = atlasLayout(image.width, image.height);
	const opaque = createChunkMaterial(atlas, layout.width, env);
	const translucent = createChunkMaterial(atlas, layout.width, env, true);

	const chunks = new ChunkRenderer(world, layout, opaque, translucent);
	scene.add(chunks.group);

	const sky = createSky(env, 90, [world.sx / 2, world.sz / 2]);
	scene.add(sky.root);

	chunks.flush();

	let frames = 0;
	let fps = 0;
	let since = performance.now();

	return {
		renderer,
		scene,
		camera,
		chunks,
		flush: () => chunks.flush(),
		render() {
			renderer.render(scene, camera);
			sky.update(camera.position.x, camera.position.y, camera.position.z, performance.now() / 1000);
			frames++;
			const now = performance.now();
			if (now - since >= 500) {
				fps = Math.round((frames * 1000) / (now - since));
				frames = 0;
				since = now;
			}
		},
		resize(width, height) {
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		},
		fps: () => fps,
		dispose() {
			chunks.dispose();
			opaque.dispose();
			translucent.dispose();
			atlas.dispose();
			renderer.dispose();
		},
	};
}
