"""T-1: load Z-Alizadeh Sani extension, clean, encode, baseline CV metrics."""
import json
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

SRC = 'data/extention of Z-Alizadeh sani dataset.xlsx'
TARGETS = ['LAD', 'LCX', 'RCA', 'Cath']
YN = {'Y': 1, 'N': 0}

df = pd.read_excel(SRC, sheet_name=0)
print('raw shape:', df.shape)

# --- target encoding: Stenotic/CAD -> 1, Normal -> 0 ---
for t in TARGETS:
    df[t] = (df[t] != 'Normal').astype(int)

# --- feature encoding ---
obj_cols = [c for c in df.columns if df[c].dtype == object or str(df[c].dtype).startswith('str')]
obj_cols = [c for c in obj_cols if c not in TARGETS]
for c in obj_cols:
    vals = set(df[c].unique())
    if vals <= {'Y', 'N'}:
        df[c] = df[c].map(YN).astype(int)
    elif c == 'Sex':
        df[c] = df[c].map({'Male': 1, 'Female': 0, 'Fmale': 0}).astype(int)
    elif c == 'BBB':
        df[c] = df[c].map({'N': 0, 'LBBB': 1, 'RBBB': 2}).astype(int)
    elif c == 'VHD':
        df[c] = df[c].map({'N': 0, 'mild': 1, 'Moderate': 2, 'Severe': 3}).astype(int)
    else:
        raise ValueError(f'unhandled string col {c}: {vals}')

# --- drop zero-variance columns ---
nunique = df.nunique()
const = [c for c in df.columns if nunique[c] <= 1 and c not in TARGETS]
print('dropped constant cols:', const)
df = df.drop(columns=const)

print('clean shape:', df.shape, '| nulls:', int(df.isnull().sum().sum()))
df.to_csv('data/clean.csv', index=False)

# --- baseline: logistic regression, stratified 5-fold ---
feats = [c for c in df.columns if c not in TARGETS]
metrics = {}
for t in TARGETS:
    X, y = df[feats], df[t]
    clf = LogisticRegression(max_iter=5000)
    cv = StratifiedKFold(5, shuffle=True, random_state=42)
    auc = cross_val_score(clf, X, y, cv=cv, scoring='roc_auc')
    acc = cross_val_score(clf, X, y, cv=cv, scoring='accuracy')
    f1 = cross_val_score(clf, X, y, cv=cv, scoring='f1')
    metrics[t] = {'auc': round(float(auc.mean()), 3), 'auc_std': round(float(auc.std()), 3),
                  'acc': round(float(acc.mean()), 3), 'f1': round(float(f1.mean()), 3),
                  'pos_rate': round(float(y.mean()), 3)}
    print(f"{t}: AUC={auc.mean():.3f}±{auc.std():.3f} ACC={acc.mean():.3f} F1={f1.mean():.3f} pos={y.mean():.3f}")

with open('data/baseline_metrics.json', 'w') as f:
    json.dump({'model': 'logistic_regression', 'cv': 'stratified-5fold', 'metrics': metrics,
               'n_features': len(feats), 'features': feats}, f, indent=2)
print('baseline metrics -> data/baseline_metrics.json')
