import { defineConfig } from 'vitest/config';
import { aliases } from './vite.aliases.mts';

export default defineConfig({
    resolve: { alias: aliases },
    test: {
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
    },
});
