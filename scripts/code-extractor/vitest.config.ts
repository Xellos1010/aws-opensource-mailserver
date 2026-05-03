import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: workspaceDir,
  test: {
    name: 'code-extractor',
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    watch: false,
    passWithNoTests: true,
    reporters: ['default'],
  },
});

