/** Tiny store: one state object, subscribers called on set(). */
export interface State {
  target: string;
  weights: Record<string, number>;
  minScore: number;
  regions: Set<string>;       // active Earth regions
  hover: number | null;       // window index hovered in the list or on the map
  selected: number | null;    // window index with the detail sheet open
  expanded: string | null;    // region id expanded in Top matches (legacy list)
  zone: number | null;        // Earth zone (region index) shown in the Explore panel; null = overview of the globe
}
type Listener = (changed: (keyof State)[]) => void;
export function createStore(initial: State) {
  const state = initial; const subs = new Set<Listener>();
  return {
    state,
    set(patch: Partial<State>) {
      const changed = (Object.keys(patch) as (keyof State)[]).filter(k => patch[k] !== state[k]);
      if (!changed.length) return;
      Object.assign(state, patch); subs.forEach(f => f(changed));
    },
    subscribe(f: Listener) { subs.add(f); return () => subs.delete(f); },
  };
}
export type Store = ReturnType<typeof createStore>;
