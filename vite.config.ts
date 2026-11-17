import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  css: { postcss: { plugins: [] } }, // isolate from ancestor PostCSS configs
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
