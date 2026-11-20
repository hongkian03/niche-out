import { defineConfig } from 'vitest/config';

// Investigation/download caches may contain upstream test suites. Only execute
// this repository's owned application suites; standalone .check.mjs use node:test.
export default defineConfig({
  test: { include: ['tests/**/*.test.{js,mjs,cjs,ts,tsx}'] },
});
