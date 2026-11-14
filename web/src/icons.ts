/** One stroke weight (1.5), 24 px grid, currentColor. */
const p = (d: string) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const icon = {
  crosshair: p('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  layers: p('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  moon: p('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
  mars: p('<circle cx="10" cy="14" r="6"/><path d="m14.5 9.5 6-6M15 3.5h5.5V9"/>'),
  lowsun: p('<path d="M3 18h18M7 18a5 5 0 0 1 10 0"/><path d="M12 8V5M5.6 11.6 3.8 9.8M18.4 11.6l1.8-1.8"/>'),
  info: p('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
  close: p('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: p('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  chevron: p('<path d="m9 6 6 6-6 6"/>'),
  sun: p('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
};
