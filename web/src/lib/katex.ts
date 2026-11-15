// AI-assisted (Claude Code); reviewed by the author.
import type katexType from 'katex';
export async function loadKatex(): Promise<typeof katexType> {
  const [k] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  return (k as unknown as { default: typeof katexType }).default ?? (k as unknown as typeof katexType);
}
/** Render TeX into an element: await renderMath(el, 'S = 100\\,e^{-D}', { display: true }) */
export async function renderMath(el: HTMLElement, tex: string, opts: { display?: boolean } = {}) {
  const katex = await loadKatex();
  katex.render(tex, el, { displayMode: !!opts.display, throwOnError: false, output: 'htmlAndMathml' });
}
