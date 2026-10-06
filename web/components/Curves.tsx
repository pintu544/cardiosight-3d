'use client';

function pts(fpr: number[], tpr: number[], w: number, h: number, pad: number): string {
  return fpr.map((f, i) =>
    `${pad + f * (w - 2 * pad)},${h - pad - tpr[i] * (h - 2 * pad)}`).join(' ');
}

export function RocChart({ fpr, tpr, auc, label }: {
  fpr: number[]; tpr: number[]; auc: number; label: string;
}) {
  const w = 260, h = 200, pad = 28;
  return (
    <div className="card">
      <h3 className="font-semibold mb-1 text-sm">{label} — ROC curve</h3>
      <p className="text-xs text-slate-500 mb-2">AUC {auc} (out-of-fold predictions)</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* diagonal = chance */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={pad}
          stroke="#475569" strokeDasharray="4 3" strokeWidth={1} />
        <polyline points={pts(fpr, tpr, w, h, pad)} fill="none"
          stroke="#38bdf8" strokeWidth={2.5} strokeLinejoin="round" />
        {/* axes */}
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#334155" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" />
        <text x={w / 2} y={h - 6} textAnchor="middle" fill="#64748b" fontSize={10}>
          False positive rate
        </text>
        <text x={10} y={h / 2} textAnchor="middle" fill="#64748b" fontSize={10}
          transform={`rotate(-90 10 ${h / 2})`}>
          True positive rate
        </text>
      </svg>
    </div>
  );
}

export function CalibrationChart({ points, label }: {
  points: [number, number, number][]; label: string;
}) {
  const w = 260, h = 200, pad = 28;
  const dots = points.map(([pred, obs]) =>
    `${pad + pred * (w - 2 * pad)},${h - pad - obs * (h - 2 * pad)}`).join(' ');
  return (
    <div className="card">
      <h3 className="font-semibold mb-1 text-sm">{label} — calibration</h3>
      <p className="text-xs text-slate-500 mb-2">Predicted vs observed rate per bin (n in tooltip)</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* perfect calibration diagonal */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={pad}
          stroke="#475569" strokeDasharray="4 3" strokeWidth={1} />
        <polyline points={dots} fill="none"
          stroke="#a78bfa" strokeWidth={2} strokeLinejoin="round" />
        {points.map(([pred, obs, n], i) => (
          <circle key={i}
            cx={pad + pred * (w - 2 * pad)} cy={h - pad - obs * (h - 2 * pad)}
            r={3 + Math.min(4, n / 12)} fill="#a78bfa" opacity={0.85}>
            <title>{`pred ${pred}, observed ${obs}, n=${n}`}</title>
          </circle>
        ))}
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#334155" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#334155" />
        <text x={w / 2} y={h - 6} textAnchor="middle" fill="#64748b" fontSize={10}>
          Mean predicted probability
        </text>
        <text x={10} y={h / 2} textAnchor="middle" fill="#64748b" fontSize={10}
          transform={`rotate(-90 10 ${h / 2})`}>
          Observed positive rate
        </text>
      </svg>
    </div>
  );
}
