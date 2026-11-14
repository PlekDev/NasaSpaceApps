export interface Target { id: string; body: 'moon' | 'mars' | string; label: string; name: string; detail: string; tags: string[]; center: [number, number]; thumb: string | null; credit: string | null }
export interface Region { id: string; label: string; name: string; place: string; cc: string; center: [number, number] }
export interface Manifest {
  data_hash: string; git_commit: string;
  window_km: number; dims: Record<string, string[]>; feature_labels: Record<string, string>;
  scale: { lonlat: number; score: number; d: number }; targets: Target[]; regions: Region[]; windows_per_target: number;
}
/** Columnar per-target data, integer-scaled (see manifest.scale). */
export interface TargetData { n: number; site: number[]; i: number[]; j: number[]; lon: number[]; lat: number[]; combined: number[];
  [col: string]: number[] | number }
