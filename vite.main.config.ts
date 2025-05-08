import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        sourcemap: true,
        rollupOptions: {
            input: 'src/electron/main.ts',
        },
    },
})