import { defineConfig } from "vite";

// Dev server for the client: `bun run dev` serves client/ and proxies /ws to the game server
// (`bun run server/index.ts` in another terminal). Vite takes over serving from B1 onward.
export default defineConfig({
  root: "client",
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
