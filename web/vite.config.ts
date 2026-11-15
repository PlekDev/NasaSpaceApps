import { defineConfig } from 'vite';
// BASE_PATH: "/" (default) or e.g. "/NasaSpaceApps/" for GitHub Pages
const base = (process.env.BASE_PATH || '/').replace(/^(?!\/)/, '/').replace(/(?<!\/)$/, '/');
export default defineConfig({ base, build: { target: 'es2020', chunkSizeWarningLimit: 900 } });
