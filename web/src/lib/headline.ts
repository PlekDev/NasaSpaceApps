// AI-assisted (Claude); reviewed by the author.
/** The blind-test headline target (computed by lib/home.ts from the stats and the blind ranks, not typed by hand):
 *  every view that opens without ?target= defaults to it, so Home, Explore, Mission, Limits and Dossier tell the same
 *  story. Never throws: without the data it returns null and the view keeps its own default. */
import type { Manifest } from '../types';
import { loadHome } from './homeload';

export async function headlineTarget(m: Manifest): Promise<string | null> {
  try { return (await loadHome(m)).facts?.target.id ?? null; } catch { return null; }
}
