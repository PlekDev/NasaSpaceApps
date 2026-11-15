// AI-assisted (Claude Code); reviewed by the author.
/** Lazy loaders for the heavy libraries. Import THESE from views, never the packages directly from main/pages/router:
 *  each call creates its own chunk that is fetched only when a view asks for it (first-load budget).
 *    const THREE = await loadThree();           // three.js (Mission 3D)
 *    const katex = await loadKatex();           // KaTeX + its CSS and fonts (Method)
 *    const scrollama = await loadScrollama();   // Scrollama (Tour); scrollama().setup({ step: '.step' }).onStepEnter(...) */
export const loadThree = () => import('three');
