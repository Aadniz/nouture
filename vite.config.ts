import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    minify: false,
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 3113,
    // Live-reload builds on Android load this exact port: fail instead of
    // quietly moving to another one when it's taken
    strictPort: true,
    // Builds write there; reloading the app for them is just noise
    watch: { ignored: ["**/android/**", "**/dist/**"] },
  },
});
