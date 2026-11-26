import { defineConfig } from 'vite';
import { aliases } from './vite.aliases.mts';

export default defineConfig({
    base: './',
    resolve: { alias: aliases },
    build: {
        sourcemap: true,
        // Card definitions look up ability parts by their registered class names.
        rolldownOptions: { output: { keepNames: true } },
    },
});
