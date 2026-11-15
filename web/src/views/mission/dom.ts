// AI-assisted (Claude Code); reviewed by the author.
/**
 * Lightweight hyperscript helper scoped to Mission Rehearsal views.
 */
export type Child = Node | string | number | boolean | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, unknown> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'tabIndex' && typeof v === 'number') {
        el.tabIndex = v;
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const ch of children) {
    if (ch === null || ch === undefined || ch === false || ch === true) continue;
    el.appendChild(typeof ch === 'object' ? ch : document.createTextNode(String(ch)));
  }
  return el;
}
