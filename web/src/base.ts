/** Deploy base path (Vite `base`): "/" by default, "/NasaSpaceApps/" on GitHub Pages. Every asset, data and font URL goes through it. */
export const BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
