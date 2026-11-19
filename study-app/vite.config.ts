import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the whole app into ONE self-contained HTML file (dist/index.html).
// You can open it straight from your disk – no server, no hosting, no account.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
  },
  worker: { format: "es" },
});
