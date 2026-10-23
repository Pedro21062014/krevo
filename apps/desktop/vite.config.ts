import { defineConfig } from "vite";

// O Tauri injeta a URL do dev server; liberamos o host do preview e o app.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
});
