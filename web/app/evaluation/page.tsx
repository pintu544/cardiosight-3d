'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function Evaluation() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { api.metrics().then(setM).catch(() => {}); }, []);
  if (!m) return <p className="text-slate-400">Loading metrics…</p>;
  const rows = Object.entries(m.targets) as [string, any][];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model evaluation</h1>
        <p className="text-slate-400 text-sm mt-1">Honest numbers: stratified 5-fold cross-validation on 303 patients, calibrated probabilities.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="py-2 pr-4">Target</th><th className="pr-4">Model</th><th className="pr-4">CV AUC</th><th className="pr-4">CV Accuracy</th><th>Positive rate</th>
          </tr></thead>
          <tbody>
            {rows.map(([t, v]) => (
              <tr key={t} className="border-b border-slate-800/50">
                <td className="py-2 pr-4 font-medium">{t === 'Cath' ? 'Overall CAD' : `${t} stenosis`}</td>
                <td className="pr-4 text-slate-400">{v.model}{v.calibrated ? ' + calibration' : ''}</td>
                <td className="pr-4">{v.cv_auc} ± {v.cv_auc_std}</td>
                <td className="pr-4">{v.cv_acc}</td>
                <td>{Math.round(v.pos_rate * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card space-y-3 text-sm text-slate-300">
        <h2 className="font-semibold text-base">Methodology</h2>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>Dataset: UCI "Extension of Z-Alizadeh Sani" — 303 patients, 54 clinical features, ground-truth angiography labels.</li>
          <li>Four independent binary classifiers (LAD / LCX / RCA stenosis, overall CAD). Per the dataset authors' note, the other three labels are excluded when training each target to avoid leakage.</li>
          <li>Model selection: Logistic Regression vs Random Forest vs Gradient Boosting by 5-fold CV AUC; winner calibrated with sigmoid (Platt) scaling.</li>
          <li>Explanations: feature ablation vs the median patient profile — each factor is set to the dataset median while all others are held fixed; the reported contribution is the change in predicted probability. Chosen over SHAP for serving reliability: same predictions, directly interpretable units, no heavy native dependencies.</li>
          <li>Reproducible: <code className="text-slate-300">api/train.py --seed 42</code>; artifacts versioned in <code className="text-slate-300">models/</code>.</li>
        </ul>
        <h2 className="font-semibold text-base pt-2">Limitations</h2>
        <ul className="list-disc pl-5 space-y-1 text-slate-400">
          <li>303 records is small — confidence intervals are wide, especially for LCX (AUC 0.73).</li>
          <li>Single-center data (Iran); generalization to other populations is unvalidated.</li>
          <li>The 3D territory map is illustrative anatomy, not derived from patient imaging.</li>
          <li>Educational visualization only — not a diagnostic device, not medical advice.</li>
        </ul>
      </div>
    </div>
  );
}
