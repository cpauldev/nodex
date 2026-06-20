import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/__nodex": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__nodex/, "")
      }
    }
  },
  build: { outDir: "dist" }
});
