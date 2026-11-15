import { md } from '../markdown';
import { getText } from '../data';
export async function renderMethod(el: HTMLElement) {
  const src = await getText('method.md');
  el.innerHTML = `<div class="page-in prose"><h1>Method &amp; data</h1>${md(src.replace(/^## Method\s*/, ''))}</div>`;
}
