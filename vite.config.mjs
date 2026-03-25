import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    configure: (proxy) => {
                        proxy.on('error', (_err, _req, res) => {
                            const message = JSON.stringify({
                                error: 'Backend API is unreachable. Start `npm run server` or `npm run dev:all`.',
                            });

                            if (!res.headersSent) {
                                res.writeHead(502, { 'Content-Type': 'application/json' });
                            }
                            res.end(message);
                        });
                    },
                },
            },
            open: false,
            middlewareMode: false,
        },
        preview: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react()],
        define: {
            'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
