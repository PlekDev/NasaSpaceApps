// AI-assisted (Claude Code); reviewed by the author.
// Placeholder until the Proof view is built (docs/plan/chamba.md, section 3): renders the existing validation view so nothing is lost.
import type { Manifest } from '../types';
import type { Params } from '../lib/routes';

export async function render(el: HTMLElement, m: Manifest, _params: Params): Promise<void> {
  const { renderValidation } = await import('./validation');
  await renderValidation(el, m);
}
