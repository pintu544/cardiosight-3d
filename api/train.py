"""T-2: compare LR/RF/GBM per target, calibrate winner, SHAP, export artifacts."""
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_curve
from sklearn.model_selection import StratifiedKFold, cross_val_score, cross_val_predict

TARGETS = ['LAD', 'LCX', 'RCA', 'Cath']
SEED = 42

df = pd.read_csv('data/clean.csv')
feats = [c for c in df.columns if c not in TARGETS]
X = df[feats].values

MODELS = {
    'logreg': LogisticRegression(max_iter=5000),
    'rf': RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=-1),
    'gbm': HistGradientBoostingClassifier(random_state=SEED),
}

cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
results, winners = {}, {}
for t in TARGETS:
    y = df[t].values
    best, best_auc = None, -1
    for name, mdl in MODELS.items():
        auc = cross_val_score(mdl, X, y, cv=cv, scoring='roc_auc', n_jobs=-1)
        results.setdefault(t, {})[name] = round(float(auc.mean()), 3)
        if auc.mean() > best_auc:
            best, best_auc = name, float(auc.mean())
    winners[t] = best
    print(f'{t}: ' + '  '.join(f'{n}={a:.3f}' for n, a in results[t].items()) + f'  -> {best}')

# --- train winners on full data, calibrate, export ---
artifacts = {'features': feats, 'targets': {}}
for t in TARGETS:
    y = df[t].values
    base = MODELS[winners[t]]
    # calibrate on 5-fold (cv='prefit' needs separate fit; use full CV calibration)
    cal = CalibratedClassifierCV(base, method='sigmoid', cv=5)
    cal.fit(X, y)
    joblib.dump(cal, f'models/{t.lower()}.pkl')

    # final honest estimate: CV of the calibrated pipeline
    auc = cross_val_score(CalibratedClassifierCV(MODELS[winners[t]], method='sigmoid', cv=5),
                          X, y, cv=cv, scoring='roc_auc')
    acc = cross_val_score(CalibratedClassifierCV(MODELS[winners[t]], method='sigmoid', cv=5),
                          X, y, cv=cv, scoring='accuracy')
    artifacts['targets'][t] = {
        'model': winners[t], 'calibrated': True,
        'cv_auc': round(float(auc.mean()), 3), 'cv_auc_std': round(float(auc.std()), 3),
        'cv_acc': round(float(acc.mean()), 3), 'pos_rate': round(float(y.mean()), 3),
    }
    print(f'{t} [{winners[t]}+cal]: AUC={auc.mean():.3f}±{auc.std():.3f} ACC={acc.mean():.3f}')

    # --- ROC + calibration curves from honest out-of-fold predictions ---
    oof = cross_val_predict(CalibratedClassifierCV(MODELS[winners[t]], method='sigmoid', cv=5),
                            X, y, cv=cv, method='predict_proba')[:, 1]
    fpr, tpr, _ = roc_curve(y, oof)
    # downsample ROC to ~50 points for JSON size
    idx = np.linspace(0, len(fpr) - 1, min(50, len(fpr))).astype(int)
    # calibration: 10 bins of predicted prob -> mean pred vs observed rate
    bins = np.linspace(0, 1, 11)
    cal_pts = []
    for b in range(10):
        m = (oof >= bins[b]) & (oof < bins[b + 1] if b < 9 else oof <= bins[b + 1])
        if m.sum() > 0:
            cal_pts.append([round(float(oof[m].mean()), 3), round(float(y[m].mean()), 3), int(m.sum())])
    artifacts['targets'][t]['roc'] = {
        'fpr': [round(float(v), 3) for v in fpr[idx]],
        'tpr': [round(float(v), 3) for v in tpr[idx]],
    }
    artifacts['targets'][t]['calibration'] = cal_pts

# --- sample patients for frontend presets (low / moderate / high overall risk) ---
proba_cath = joblib.load('models/cath.pkl').predict_proba(X)[:, 1]
order = np.argsort(proba_cath)
presets = {
    'low': df.iloc[[order[5]]],
    'moderate': df.iloc[[order[len(order)//2]]],
    'high': df.iloc[[order[-6]]],
}
preset_out = {}
for k, pdf in presets.items():
    row = pdf.iloc[0]
    preset_out[k] = {f: (float(row[f]) if isinstance(row[f], np.floating) else int(row[f]))
                     for f in feats}
with open('models/presets.json', 'w') as f:
    json.dump(preset_out, f)

with open('models/metrics.json', 'w') as f:
    json.dump({'seed': SEED, 'cv': 'stratified-5fold', 'comparison': results,
               'winners': winners, **artifacts}, f, indent=2)
print('artifacts -> models/*.pkl, models/metrics.json, models/presets.json')
