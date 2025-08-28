import { defineConfig } from 'vitest/config';
import {fileURLToPath, URL} from "url";

export default defineConfig({
    resolve: {
        alias: [
            { find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
            { find: '@engine', replacement: fileURLToPath(new URL('./src/engine', import.meta.url)) },
            { find: '@utility', replacement: fileURLToPath(new URL('./src/utility', import.meta.url)) },
            { find: '@ui', replacement: fileURLToPath(new URL('./src/ui', import.meta.url)) },
            { find: '@electron', replacement: fileURLToPath(new URL('./src/electron', import.meta.url)) },
        ]
    },
    test: {
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
    },
});