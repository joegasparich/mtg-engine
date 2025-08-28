import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config
export default defineConfig({
    resolve: {
        alias: [
            { find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
            { find: '@engine', replacement: fileURLToPath(new URL('./src/engine', import.meta.url)) },
            { find: '@utility', replacement: fileURLToPath(new URL('./src/utility', import.meta.url)) },
            { find: '@ui', replacement: fileURLToPath(new URL('./src/ui', import.meta.url)) },
            { find: '@electron', replacement: fileURLToPath(new URL('./src/electron', import.meta.url)) },
        ]
    }
});
