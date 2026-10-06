# CardioSight 3D 🫀

Vessel-level coronary artery disease risk prediction on an interactive 3D heart.
Built for **Multimodal AI Hackathon 2026 — Track A** (Kamand Prompt, IIT Mandi).

Enter a patient profile → get stenosis probabilities for **LAD / LCX / RCA** +
overall CAD → see them mapped on a 3D heart with **plain-language explanations** of what
drives the risk.

> Educational visualization only — not a diagnostic device, not medical advice.

## How it works

- **Data:** UCI "Extension of Z-Alizadeh Sani" — 303 patients, 54 clinical
  features, ground-truth angiography labels for LAD/LCX/RCA stenosis + CAD.
- **Models:** 4 calibrated binary classifiers (Random Forest for LAD/LCX,
  Logistic Regression for RCA/CAD — winners by 5-fold CV AUC).
- **Explainability:** feature-ablation attributions per prediction (each factor set to the median-patient value; reported contribution = change in predicted probability), plain-language factor lists.
- **3D:** react-three-fiber anatomical heart (Human Atlas Project 3D Reference
  Object Library, CC BY 4.0) with coronary territories mapped to mesh groups
  (LAD→left ventricle + septum, LCX→left atrium, RCA→right heart),
  color-coded by predicted risk. Territory map is illustrative, based on
  standard coronary anatomy.
- **What-if simulator:** adjust modifiable risk factors (BMI, LDL, HDL, TG,
  blood sugar, weight, smoking, hypertension) with sliders and see predicted
  risk update live with per-vessel deltas.
- **Plain-language summaries:** auto-generated narrative explaining the
  prediction, highest-risk vessel, and key factors in non-technical terms.
- **Why ablation, not SHAP:** per-patient Shapley values need a heavy native
  dependency chain (shap → numba/llvmlite) that made production builds fragile.
  Feature ablation against the median patient profile answers the clinically
  intuitive question directly — "how much does this factor change *this*
  patient's predicted risk vs a typical patient?" — with no serving-time
  native dependencies and identical predicted probabilities.

## Validated metrics (stratified 5-fold CV)

| Target | Model | AUC | Accuracy |
|---|---|---|---|
| LAD stenosis | Random Forest + calibration | 0.86 | 0.80 |
| LCX stenosis | Random Forest + calibration | 0.73 | 0.69 |
| RCA stenosis | Logistic Regression + calibration | 0.73 | 0.66 |
| Overall CAD | Logistic Regression + calibration | 0.93 | 0.84 |

Full methodology, assumptions, and limitations: `/evaluation` in the app.

## Run locally

**API** (Python 3.12):
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train.py        # reproduces models/ (needs data/*.xlsx from UCI id 411)
uvicorn app:app --port 8000
```

**Web** (Node 20+):
```bash
cd web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## API

- `POST /predict` `{features: {...}}` → probabilities + ablation attributions
- `GET /features` → input schema for the form
- `GET /presets` → sample patients (low/moderate/high)
- `GET /metrics` → cross-validated scores
- `GET /health`

Interactive docs: `/docs` on the API.

## AI assistance disclosure

Per the hackathon rules: built with AI coding assistants (Muse). All model
choices, validation, and clinical framing were reviewed by the author, who is
responsible for everything submitted.

## License

MIT
