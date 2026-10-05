"""CardioSight 3D inference API — vessel-level CAD risk + local explanations.

Attribution method: feature ablation against the median patient profile.
For each clinical factor we ask: what would this patient's predicted risk be
if this one factor were typical (dataset median) instead? The difference
(p_full - p_ablated) is reported as that factor's contribution, in units of
predicted probability. This is a model-agnostic local explanation that
directly answers the clinically intuitive question, without the heavy
native dependencies a Shapley-value library would require at serving time.
"""
import json
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent.parent
TARGETS = ['LAD', 'LCX', 'RCA', 'Cath']

# Human-readable labels + input hints for the frontend form
FEATURE_META = {
    'Age': ('Age', 'years', 30, 90),
    'Weight': ('Weight', 'kg', 40, 130),
    'Length': ('Height', 'cm', 140, 200),
    'Sex': ('Sex', '0=female, 1=male', 0, 1),
    'BMI': ('BMI', 'kg/m²', 15, 45),
    'DM': ('Diabetes', '0/1', 0, 1),
    'HTN': ('Hypertension', '0/1', 0, 1),
    'Current Smoker': ('Current smoker', '0/1', 0, 1),
    'EX-Smoker': ('Ex-smoker', '0/1', 0, 1),
    'FH': ('Family history', '0/1', 0, 1),
    'Obesity': ('Obesity', '0/1', 0, 1),
    'CRF': ('Chronic renal failure', '0/1', 0, 1),
    'CVA': ('Cerebrovascular accident', '0/1', 0, 1),
    'Airway disease': ('Airway disease', '0/1', 0, 1),
    'Thyroid Disease': ('Thyroid disease', '0/1', 0, 1),
    'CHF': ('Congestive heart failure', '0/1', 0, 1),
    'DLP': ('Dyslipidemia', '0/1', 0, 1),
    'BP': ('Blood pressure high', '0/1', 0, 1),
    'PR': ('Pulse rate', 'bpm', 40, 140),
    'Edema': ('Edema', '0/1', 0, 1),
    'Weak Peripheral Pulse': ('Weak peripheral pulse', '0/1', 0, 1),
    'Lung rales': ('Lung rales', '0/1', 0, 1),
    'Systolic Murmur': ('Systolic murmur', '0/1', 0, 1),
    'Diastolic Murmur': ('Diastolic murmur', '0/1', 0, 1),
    'Typical Chest Pain': ('Typical chest pain', '0/1', 0, 1),
    'Dyspnea': ('Dyspnea', '0/1', 0, 1),
    'Function Class': ('Function class', '0-3', 0, 3),
    'Atypical': ('Atypical chest pain', '0/1', 0, 1),
    'Nonanginal': ('Nonanginal pain', '0/1', 0, 1),
    'LowTH Ang': ('Low threshold angina', '0/1', 0, 1),
    'Q Wave': ('Q wave', '0/1', 0, 1),
    'St Elevation': ('ST elevation', '0/1', 0, 1),
    'St Depression': ('ST depression', '0/1', 0, 1),
    'Tinversion': ('T inversion', '0/1', 0, 1),
    'LVH': ('LV hypertrophy', '0/1', 0, 1),
    'Poor R Progression': ('Poor R progression', '0/1', 0, 1),
    'BBB': ('Bundle branch block', '0=none,1=LBBB,2=RBBB', 0, 2),
    'FBS': ('Fasting blood sugar', 'mg/dL', 60, 400),
    'CR': ('Creatinine', 'mg/dL', 0.4, 3.0),
    'TG': ('Triglycerides', 'mg/dL', 40, 600),
    'LDL': ('LDL cholesterol', 'mg/dL', 40, 300),
    'HDL': ('HDL cholesterol', 'mg/dL', 20, 120),
    'BUN': ('BUN', 'mg/dL', 5, 60),
    'ESR': ('ESR', 'mm/h', 1, 100),
    'HB': ('Hemoglobin', 'g/dL', 8, 20),
    'K': ('Potassium', 'mEq/L', 3.0, 6.0),
    'Na': ('Sodium', 'mEq/L', 125, 150),
    'WBC': ('WBC', '×10³/µL', 3, 20),
    'Lymph': ('Lymphocytes', '%', 5, 60),
    'Neut': ('Neutrophils', '%', 30, 90),
    'PLT': ('Platelets', '×10³/µL', 100, 500),
    'EF-TTE': ('Ejection fraction (TTE)', '%', 15, 65),
    'Region RWMA': ('Regional wall motion abnormality', '0-4', 0, 4),
    'VHD': ('Valvular heart disease', '0=none,1=mild,2=moderate,3=severe', 0, 3),
}

MODELS, METRICS, PRESETS, FEATURES, MEDIANS = {}, {}, {}, [], {}

ATTRIBUTION_METHOD = (
    'Feature ablation vs the median patient profile: each factor is set to the '
    'dataset median while all others are held fixed; the reported contribution '
    'is the change in predicted probability. Positive contributions raise the '
    'predicted risk, negative ones lower it.'
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with open(BASE / 'models' / 'metrics.json') as f:
        METRICS.update(json.load(f))
    FEATURES.extend(METRICS['features'])
    with open(BASE / 'models' / 'presets.json') as f:
        PRESETS.update(json.load(f))
    with open(BASE / 'models' / 'background.json') as f:
        MEDIANS.update(json.load(f)['median_profile'])
    for t in TARGETS:
        MODELS[t] = joblib.load(BASE / 'models' / f'{t.lower()}.pkl')
    print(f'loaded {len(MODELS)} models + median background profile')
    yield


app = FastAPI(title='CardioSight 3D API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'],
                   allow_headers=['*'])


class PredictIn(BaseModel):
    features: dict


def stratum(p: float) -> str:
    return 'low' if p < 0.33 else 'moderate' if p < 0.66 else 'high'


@app.get('/health')
def health():
    return {'ok': True, 'models': list(MODELS)}


@app.get('/metrics')
def metrics():
    return METRICS


@app.get('/attribution-method')
def attribution_method():
    return {'method': ATTRIBUTION_METHOD}


@app.get('/features')
def features():
    return [{'name': f, 'label': FEATURE_META.get(f, (f, '', 0, 1))[0],
             'unit': FEATURE_META.get(f, (f, '', 0, 1))[1],
             'min': FEATURE_META.get(f, (f, '', 0, 1))[2],
             'max': FEATURE_META.get(f, (f, '', 0, 1))[3]} for f in FEATURES]


@app.get('/presets')
def presets():
    return PRESETS


@app.post('/predict')
def predict(inp: PredictIn):
    missing = [f for f in FEATURES if f not in inp.features]
    if missing:
        raise HTTPException(400, f'missing features: {missing[:5]}...')
    try:
        x = np.array([[float(inp.features[f]) for f in FEATURES]])
    except (TypeError, ValueError):
        raise HTTPException(400, 'all features must be numeric')
    # Batched ablation: row 0 = patient as-is, rows 1..54 = one feature
    # set to the median (typical) value. One predict_proba per target.
    med = np.array([MEDIANS[f] for f in FEATURES])
    X = np.tile(x, (1 + len(FEATURES), 1))
    for i in range(len(FEATURES)):
        X[1 + i, i] = med[i]
    out, attrs = {}, {}
    for t in TARGETS:
        # models were fitted on plain arrays (no feature names); pass numpy
        p = MODELS[t].predict_proba(X)[:, 1]
        p_full = float(p[0])
        out[t.lower()] = round(p_full, 4)
        contrib = p_full - p[1:]
        idx = np.argsort(-np.abs(contrib))[:8]
        attrs[t.lower()] = [
            {'feature': FEATURES[i],
             'label': FEATURE_META.get(FEATURES[i], (FEATURES[i], '', 0, 1))[0],
             'value': float(x[0][i]),
             'typical_value': float(med[i]),
             'contribution': round(float(contrib[i]), 4),
             'direction': 'up' if contrib[i] > 0 else 'down'}
            for i in idx
        ]
    out['stratum'] = stratum(out['cath'])
    return {'probabilities': out, 'attributions': attrs,
            'attribution_method': ATTRIBUTION_METHOD}
