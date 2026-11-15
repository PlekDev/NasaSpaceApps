// Production build for GitHub Pages without shell syntax: node tools/build-pages.mjs [base]  (default /NasaSpaceApps/)
// Works on Windows cmd, PowerShell, macOS and Linux; sets BASE_PATH for vite.config.ts in-process.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.BASE_PATH = process.argv[2] || process.env.BASE_PATH || '/NasaSpaceApps/';
const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit'], { stdio: 'inherit' });
if (tsc.status) process.exit(tsc.status);
const { build } = await import('vite');
await build();
console.log(`built with base ${process.env.BASE_PATH}`);
