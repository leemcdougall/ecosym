import { defineConfig } from "vite";

// GitHub Pages serves the site from /ecosym/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ecosym/" : "/",
  build: { outDir: "../../dist", emptyOutDir: true },
}));
