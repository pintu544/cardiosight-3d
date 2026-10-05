const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface FeatureMeta { name: string; label: string; unit: string; min: number; max: number }
export interface Attribution { feature: string; label: string; value: number; typical_value: number; contribution: number; direction: 'up' | 'down' }
export interface PredictResult {
  probabilities: { lad: number; lcx: number; rca: number; cath: number; stratum: string };
  attributions: Record<string, Attribution[]>;
  attribution_method: string;
}

async function j<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export const api = {
  features: () => j<FeatureMeta[]>('/features'),
  presets: () => j<Record<string, Record<string, number>>>('/presets'),
  metrics: () => j<any>('/metrics'),
  predict: (features: Record<string, number>) =>
    j<PredictResult>('/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features }) }),
};
