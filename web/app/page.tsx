'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api, FeatureMeta, PredictResult } from '@/lib/api';
import type { VesselKey } from '@/components/Heart3D';

const Heart3D = dynamic(() => import('@/components/Heart3D'), { ssr: false });

const VESSEL_NAMES: Record<VesselKey, string> = { lad: 'LAD', lcx: 'LCX', rca: 'RCA' };

const KEY_FIELDS = ['Age', 'Sex', 'Typical Chest Pain', 'Atypical', 'HTN', 'DM',
  'Current Smoker', 'FBS', 'LDL', 'HDL', 'TG', 'BMI', 'BP', 'PR',
  'ST Depression', 'ST Elevation', 'Q Wave', 'LVH', 'EF-TTE', 'Region RWMA',
  'Function Class', 'BBB', 'VHD', 'Dyspnea'];

const CATEGORICAL: Record<string, [string, number][]> = {
  'Sex': [['Female', 0], ['Male', 1]],
  'BBB': [['None', 0], ['LBBB', 1], ['RBBB', 2]],
  'VHD': [['None', 0], ['Mild', 1], ['Moderate', 2], ['Severe', 3]],
};

// Modifiable risk factors for the what-if simulator
const WHATIF_FIELDS = ['BMI', 'LDL', 'HDL', 'TG', 'FBS', 'Weight', 'Current Smoker', 'HTN'];

function Gauge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value < 0.33 ? 'bg-emerald-500' : value < 0.66 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="card">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-3xl font-bold mt-1">{pct}<span className="text-base text-slate-500">%</span></div>
      <div className="h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function plainSummary(prob: { lad: number; lcx: number; rca: number; cath: number; stratum: string },
    attrs: Record<string, { label: string; direction: string; contribution: number }[]>): string {
  const pct = (v: number) => Math.round(v * 100);
  const vessels = [
    { name: 'left anterior descending artery (LAD)', v: prob.lad },
    { name: 'left circumflex artery (LCX)', v: prob.lcx },
    { name: 'right coronary artery (RCA)', v: prob.rca },
  ].sort((a, b) => b.v - a.v);
  const top = vessels[0];
  const raisers = attrs.cath.filter(a => a.direction === 'up').slice(0, 3).map(a => a.label.toLowerCase());
  const lowerers = attrs.cath.filter(a => a.direction === 'down').slice(0, 2).map(a => a.label.toLowerCase());
  let s = `The model predicts a ${pct(prob.cath)}% probability of coronary artery disease (${prob.stratum} risk). `;
  s += `Among the three vessel territories, the highest predicted stenosis risk is in the ${top.name} at ${pct(top.v)}%. `;
  if (raisers.length) s += `The factors most raising this patient's risk are ${raisers.join(', ')}. `;
  if (lowerers.length) s += `Factors associated with lower risk include ${lowerers.join(', ')}. `;
  s += `These are statistical associations from a 303-patient dataset, not a diagnosis.`;
  return s;
}

function AttrBars({ title, items }: { title: string; items: { label: string; contribution: number; direction: string }[] }) {
  const max = Math.max(...items.map(i => Math.abs(i.contribution)), 0.001);
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{title} — top risk factors</h3>
      <div className="space-y-2">
        {items.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-44 truncate text-slate-300" title={a.label}>{a.label}</span>
            <div className="flex-1 h-4 bg-slate-800 rounded relative">
              <div className={`absolute top-0 h-4 rounded ${a.direction === 'up' ? 'bg-rose-500 left-1/2' : 'bg-emerald-500 right-1/2'}`}
                style={{ width: `${(Math.abs(a.contribution) / max) * 50}%` }} />
              <div className="absolute left-1/2 top-0 h-4 w-px bg-slate-600" />
            </div>
            <span className={`w-16 text-right text-xs ${a.direction === 'up' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {a.direction === 'up' ? '▲ risk' : '▼ risk'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [meta, setMeta] = useState<FeatureMeta[]>([]);
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [vals, setVals] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [vessel, setVessel] = useState<VesselKey | null>(null);
  // what-if simulator state
  const [whatif, setWhatif] = useState<Record<string, number> | null>(null);
  const [whatifResult, setWhatifResult] = useState<PredictResult | null>(null);
  const [whatifLoading, setWhatifLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.features(), api.presets()]).then(([fm, pr]) => {
      setMeta(fm);
      const d = pr.moderate;
      setDefaults(d);
      const init: Record<string, number> = {};
      KEY_FIELDS.forEach(f => { if (d[f] !== undefined) init[f] = Math.round(d[f] * 100) / 100; });
      setVals(init);
    }).catch(() => setErr('Could not reach the prediction API. Is it running?'));
  }, []);

  const set = (f: string, v: number) => setVals(s => ({ ...s, [f]: v }));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const features = { ...defaults, ...vals };
      setResult(await api.predict(features));
    } catch { setErr('Prediction failed — check the API.'); }
    setLoading(false);
  }

  function loadPreset(name: string) {
    api.presets().then(pr => {
      const d = pr[name]; setDefaults(d);
      const init: Record<string, number> = {};
      KEY_FIELDS.forEach(f => { if (d[f] !== undefined) init[f] = Math.round(d[f] * 100) / 100; });
      setVals(init); setResult(null); setWhatif(null); setWhatifResult(null);
    });
  }

  // Initialize what-if sliders from the predicted patient's values
  useEffect(() => {
    if (result && !whatif) {
      const init: Record<string, number> = {};
      WHATIF_FIELDS.forEach(f => {
        const v = vals[f] ?? defaults[f];
        if (v !== undefined) init[f] = Math.round(v * 100) / 100;
      });
      setWhatif(init);
    }
  }, [result]);

  // Debounced what-if re-prediction
  useEffect(() => {
    if (!whatif || !result) return;
    setWhatifLoading(true);
    const t = setTimeout(async () => {
      try {
        const features = { ...defaults, ...vals, ...whatif };
        setWhatifResult(await api.predict(features));
      } catch { /* keep last good result */ }
      setWhatifLoading(false);
    }, 600);
    return () => clearTimeout(t);
  }, [whatif]);

  const setWhatifVal = (f: string, v: number) =>
    setWhatif(s => s ? { ...s, [f]: v } : s);

  const metaByName = Object.fromEntries(meta.map(m => [m.name, m]));
  const p = result?.probabilities;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coronary risk assessment</h1>
        <p className="text-slate-400 text-sm mt-1">Enter patient data → vessel-level stenosis predictions mapped on a 3D heart, with explanations.</p>
      </div>

      <div className="flex gap-2">
        {['low', 'moderate', 'high'].map(n => (
          <button key={n} type="button" onClick={() => loadPreset(n)}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 capitalize">
            Sample: {n} risk
          </button>
        ))}
      </div>

      <form onSubmit={run} className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {KEY_FIELDS.map(f => {
            const m = metaByName[f]; if (!m) return null;
            return (
              <div key={f}>
                <label className="label">{m.label} <span className="text-slate-600">({m.unit})</span></label>
                {CATEGORICAL[f] ? (
                  <select className="input" value={vals[f] ?? ''} onChange={e => set(f, Number(e.target.value))}>
                    {CATEGORICAL[f].map(([l, v]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : m.max <= 1 && m.min === 0 ? (
                  <select className="input" value={vals[f] ?? ''} onChange={e => set(f, Number(e.target.value))}>
                    <option value={0}>No</option><option value={1}>Yes</option>
                  </select>
                ) : (
                  <input type="number" className="input" min={m.min} max={m.max} step="any"
                    value={vals[f] ?? ''} onChange={e => set(f, Number(e.target.value))} />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-3">Remaining {Object.keys(defaults).length - KEY_FIELDS.length} features use population-typical values.</p>
        <button className="btn mt-4" disabled={loading || Object.keys(defaults).length === 0}>
          {loading ? 'Predicting…' : Object.keys(defaults).length === 0 ? 'Loading…' : 'Predict risk'}
        </button>
        {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      </form>

      {p && (
        <div className="space-y-6">
          <div className={`card border-l-4 ${p.stratum === 'high' ? 'border-l-rose-500' : p.stratum === 'moderate' ? 'border-l-amber-500' : 'border-l-emerald-500'}`}>
            <span className="text-sm text-slate-400">Overall risk stratum:</span>
            <span className="ml-2 text-xl font-bold capitalize">{p.stratum}</span>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              {plainSummary(p, result.attributions)}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Gauge label="LAD stenosis" value={p.lad} />
            <Gauge label="LCX stenosis" value={p.lcx} />
            <Gauge label="RCA stenosis" value={p.rca} />
            <Gauge label="Overall CAD" value={p.cath} />
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">3D heart — vessel territories by predicted risk</h3>
            <Heart3D risks={{ lad: p.lad, lcx: p.lcx, rca: p.rca }} onSelect={setVessel} />
            {vessel && (
              <div className="mt-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-sm">
                <span className="font-semibold">{VESSEL_NAMES[vessel]} territory</span>
                <span className="text-slate-400"> — stenosis probability {Math.round(p[vessel] * 100)}%</span>
                <div className="mt-2 text-slate-300">
                  Top factors: {result.attributions[vessel].slice(0, 3).map(a =>
                    `${a.label} (${a.direction === 'up' ? 'raising' : 'lowering'} risk)`).join(', ')}.
                </div>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <AttrBars title="LAD" items={result.attributions.lad} />
            <AttrBars title="LCX" items={result.attributions.lcx} />
            <AttrBars title="RCA" items={result.attributions.rca} />
            <AttrBars title="Overall CAD" items={result.attributions.cath} />
          </div>
          <p className="text-xs text-slate-500 mt-3 max-w-3xl">{result.attribution_method}</p>

          {whatif && (
            <div className="card border border-slate-700">
              <h3 className="font-semibold mb-1">What-if simulator</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-2xl">
                Adjust modifiable risk factors to see how the predicted risk changes.
                This is an educational illustration of the model's behavior, not medical advice.
              </p>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                {WHATIF_FIELDS.map(f => {
                  const m = metaByName[f]; if (!m || whatif[f] === undefined) return null;
                  const isBinary = m.max <= 1 && m.min === 0;
                  const base = vals[f] ?? defaults[f] ?? 0;
                  const cur = whatif[f];
                  const changed = Math.abs(cur - base) > 1e-9;
                  return (
                    <div key={f}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className={changed ? 'text-amber-300 font-medium' : 'text-slate-300'}>
                          {m.label} {changed && '●'}
                        </span>
                        <span className="text-slate-400 text-xs">
                          {isBinary ? (cur ? 'Yes' : 'No') : cur} <span className="text-slate-600">({m.unit})</span>
                        </span>
                      </div>
                      {isBinary ? (
                        <select className="input" value={cur} onChange={e => setWhatifVal(f, Number(e.target.value))}>
                          <option value={0}>No</option><option value={1}>Yes</option>
                        </select>
                      ) : (
                        <input type="range" className="w-full accent-rose-500"
                          min={m.min} max={m.max} step={(m.max - m.min) / 100}
                          value={cur} onChange={e => setWhatifVal(f, Number(e.target.value))} />
                      )}
                    </div>
                  );
                })}
              </div>
              {whatifResult && (
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <div className="text-sm text-slate-400 mb-3">
                    {whatifLoading ? 'Recalculating…' : 'Predicted risk with your adjustments:'}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(['lad', 'lcx', 'rca', 'cath'] as const).map(k => {
                      const base = p[k]; const cur = whatifResult.probabilities[k];
                      const d = Math.round((cur - base) * 100);
                      const label = { lad: 'LAD', lcx: 'LCX', rca: 'RCA', cath: 'Overall CAD' }[k];
                      return (
                        <div key={k} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <div className="text-xs text-slate-400">{label}</div>
                          <div className="text-2xl font-bold mt-1">{Math.round(cur * 100)}<span className="text-sm text-slate-500">%</span></div>
                          <div className={`text-xs mt-1 font-medium ${d > 0 ? 'text-rose-400' : d < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {d > 0 ? `▲ +${d}pp` : d < 0 ? `▼ ${d}pp` : '— no change'} vs baseline
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => {
                      const init: Record<string, number> = {};
                      WHATIF_FIELDS.forEach(f => {
                        const v = vals[f] ?? defaults[f];
                        if (v !== undefined) init[f] = Math.round(v * 100) / 100;
                      });
                      setWhatif(init); setWhatifResult(null);
                    }}
                    className="text-xs mt-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700">
                    Reset adjustments
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
