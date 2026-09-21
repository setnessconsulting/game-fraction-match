import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // The production artifact must not assume it is mounted at the domain root. games-site serves
  // immutable artifacts from a versioned nested prefix such as
  // `/game-assets/fraction-match/<version>/`, so every emitted reference stays relative to the
  // document instead of being rooted at "/".
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: resolve(projectRoot, "index.html"),
    },
  },
});
