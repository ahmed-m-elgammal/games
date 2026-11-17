/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works on GitHub Pages subpaths and any static host
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
