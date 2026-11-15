"""Machine-learning sand detector for the drone's laser map.

Why: on the real route, the hand-written ripple rule gets sand IoU ~0.14-0.24 (natural bumps look like ripples).
What: obstacles and steep slopes stay rule-based (their ground truth IS that rule on noise-free ground).
      ML decides only SAND vs CLEAR, on bins the rule calls clear or sand.

Techniques:
  - train / validation / test split BY FLIGHT SEGMENT (GroupKFold), never by row: neighbouring bins are
    almost identical, a row split would leak the answer.
  - hold-out test = 5 route segments never seen in training, evaluated on their real (non-augmented) flights
  - class weights (sand is ~7% of bins), early stopping, data augmentation (4 variants of every flight)
  - metric: IoU, pooled over all bins; sand IoU is the one that matters for safety
  - decision threshold chosen on out-of-fold validation predictions, NOT on the test set

Input : sim/data/ml_bins.csv (from export_bins.js)
Output: sim/data/sand_model.json (trees for the web page), sim/results/ml_results.json
"""
import json, time
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import GroupKFold

P = Path(__file__).resolve().parents[2]
d = pd.read_csv(P / "sim/data/ml_bins.csv")
FEATS = [c for c in d.columns if c not in ("set", "group", "flight", "seed", "x", "truth", "rule")]
d = d[d.rule.isin([0, 1])].copy()                 # obstacle/steep bins stay with the rule
d["y"] = (d.truth == 1).astype(int)

TEST_GROUPS = ["F02", "F05", "F08", "F11", "F14"]  # every third route segment, mixed terrain
train = d[~d.group.isin(TEST_GROUPS)]
test = d[d.group.isin(TEST_GROUPS) & (d.set == "base")]
print(f"train rows {len(train)} ({train.y.mean():.1%} sand), test rows {len(test)} ({test.y.mean():.1%} sand), "
      f"test groups {TEST_GROUPS}")

def iou(y, p):
    i = int(((y == 1) & (p == 1)).sum()); u = int(((y == 1) | (p == 1)).sum())
    return i / u if u else float("nan")
def scores(y, p):
    tp = int(((y == 1) & (p == 1)).sum()); fp = int(((y == 0) & (p == 1)).sum()); fn = int(((y == 1) & (p == 0)).sum())
    return dict(sand_iou=round(iou(y, p), 3), clear_iou=round(iou(1 - y, 1 - p), 3),
                precision=round(tp / (tp + fp), 3) if tp + fp else None, recall=round(tp / (tp + fn), 3) if tp + fn else None)

def weights(y):
    w = np.ones(len(y)); pos = y.mean(); w[y == 1] = 0.5 / pos; w[y == 0] = 0.5 / (1 - pos); return w

models = {
    "logistic": lambda: make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced")),
    "random_forest": lambda: make_pipeline(SimpleImputer(strategy="median"), RandomForestClassifier(n_estimators=200, min_samples_leaf=20, class_weight="balanced", n_jobs=-1, random_state=0)),
    "gradient_boosting": lambda: HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=15, max_depth=5, min_samples_leaf=40,
                                                               l2_regularization=1.0, early_stopping=True, validation_fraction=0.15, n_iter_no_change=15, random_state=0),
}

gkf = GroupKFold(n_splits=5)
X, y, groups = train[FEATS].to_numpy(float), train.y.to_numpy(), train.group.to_numpy()
results = {"rule": {"cv": scores(y, train.rule.to_numpy()), "test": scores(test.y.to_numpy(), test.rule.to_numpy())}}
oof_all = {}
for name, mk in models.items():
    t0 = time.time(); oof = np.zeros(len(y))
    for tr, va in gkf.split(X, y, groups):
        mdl = mk()
        if name == "gradient_boosting": mdl.fit(X[tr], y[tr], sample_weight=weights(y[tr]))
        else: mdl.fit(X[tr], y[tr])
        oof[va] = mdl.predict_proba(X[va])[:, 1]
    # threshold picked on validation (out-of-fold) predictions only
    ths = np.linspace(0.05, 0.95, 37); best = max(ths, key=lambda t: iou(y, (oof >= t).astype(int)))
    final = mk()
    if name == "gradient_boosting": final.fit(X, y, sample_weight=weights(y))
    else: final.fit(X, y)
    pt = final.predict_proba(test[FEATS].to_numpy(float))[:, 1]
    results[name] = {"threshold": round(float(best), 3), "cv": scores(y, (oof >= best).astype(int)),
                     "test": scores(test.y.to_numpy(), (pt >= best).astype(int)), "seconds": round(time.time() - t0, 1)}
    oof_all[name] = (final, best)
    print(name, results[name])
print("rule", results["rule"])

# per-test-segment breakdown for the chosen model
gb, thr = oof_all["gradient_boosting"]
test = test.assign(p_gb=(gb.predict_proba(test[FEATS].to_numpy(float))[:, 1] >= thr).astype(int))
per_group = {g: {"sand_bins": int(t.y.sum()), "rule_iou": round(iou(t.y.to_numpy(), t.rule.to_numpy()), 3),
                 "gb_iou": round(iou(t.y.to_numpy(), t.p_gb.to_numpy()), 3),
                 "rule_false_alarm_bins": int(((t.y == 0) & (t.rule == 1)).sum()), "gb_false_alarm_bins": int(((t.y == 0) & (t.p_gb == 1)).sum())}
             for g, t in test.groupby("group")}
results["per_test_segment"] = per_group

# feature importance (permutation on test is leakage-free since test was never used for fitting/threshold)
from sklearn.inspection import permutation_importance
pi = permutation_importance(gb, test[FEATS].to_numpy(float), test.y.to_numpy(), n_repeats=5, random_state=0, scoring="balanced_accuracy")
results["importance"] = dict(sorted(((f, round(float(v), 4)) for f, v in zip(FEATS, pi.importances_mean)), key=lambda kv: -kv[1]))
print("importance", list(results["importance"].items())[:6])

# export the gradient-boosting trees for the browser (binary: one tree per iteration)
def export_tree(pred):
    n = pred.nodes
    return {"f": n["feature_idx"].tolist(), "t": [float(v) for v in n["num_threshold"]], "m": [int(v) for v in n["missing_go_to_left"]],
            "l": n["left"].tolist(), "r": n["right"].tolist(), "leaf": [int(v) for v in n["is_leaf"]], "v": [round(float(v), 6) for v in n["value"]]}
model = {"kind": "sand-binary", "features": FEATS, "threshold": float(thr),
         "baseline": float(np.ravel(gb._baseline_prediction)[0]), "trees": [export_tree(it[0]) for it in gb._predictors],
         "trained_on": "route segments except " + ",".join(TEST_GROUPS) + " (base + 4 augmented variants) + synthetic world",
         "test_sand_iou": results["gradient_boosting"]["test"]["sand_iou"], "rule_test_sand_iou": results["rule"]["test"]["sand_iou"]}
assert model["features"] == FEATS
# self-check: the exported trees must give the same probabilities as sklearn
def js_like(row):
    raw = model["baseline"]
    for t in model["trees"]:
        k = 0
        while not t["leaf"][k]:
            v = row[t["f"][k]]
            k = (t["l"][k] if t["m"][k] else t["r"][k]) if np.isnan(v) else (t["l"][k] if v <= t["t"][k] else t["r"][k])
        raw += t["v"][k]
    return 1 / (1 + np.exp(-raw))
sample = test[FEATS].to_numpy(float)[:2000]
diff = np.abs(np.array([js_like(r) for r in sample]) - gb.predict_proba(sample)[:, 1]).max()
print("export self-check max |p diff|:", diff); assert diff < 1e-4  # leaf values are rounded to 6 decimals
results["n_trees"] = len(model["trees"])
json.dump(model, open(P / "sim/data/sand_model.json", "w"), separators=(",", ":"))
json.dump(results, open(P / "sim/results/ml_results.json", "w"), indent=1)
print("trees", len(model["trees"]), "model kB", round((P / "sim/data/sand_model.json").stat().st_size / 1024))
