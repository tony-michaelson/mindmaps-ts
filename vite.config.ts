import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "MindMapsTS",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["konva", "lodash", "uuid"],
      output: {
        globals: {
          konva: "Konva",
          lodash: "_",
          uuid: "uuid",
        },
      },
    },
    sourcemap: true,
  },
  server: {
    open: true,
  },
});
