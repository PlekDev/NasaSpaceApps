/** Minimal Markdown to HTML for docs/METHOD.md: headings, paragraphs, lists, tables, bold/italic/code/links. Input is escaped first. */
import { esc } from './format.ts';
const inline = (s: string) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
export function md(src: string): string {
  const L = src.replace(/\r/g, '').split('\n'); const out: string[] = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = Math.min(h[1].length + 1, 4); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < L.length && L[i].startsWith('|')) { if (!/^\|[\s:|-]+\|?$/.test(L[i])) rows.push(L[i].replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++; }
      out.push(`<div class="tbl"><table><thead><tr>${rows[0].map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < L.length && (/^\s*[-*]\s+/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) { if (/^\s*[-*]\s+/.test(L[i])) items.push(L[i].replace(/^\s*[-*]\s+/, '')); else items[items.length - 1] += ' ' + L[i].trim(); i++; }
      out.push(`<ul>${items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`); continue;
    }
    const para = [l.trim()]; i++;
    while (i < L.length && L[i].trim() && !/^(#{1,4}\s|\||\s*[-*]\s)/.test(L[i])) para.push(L[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
