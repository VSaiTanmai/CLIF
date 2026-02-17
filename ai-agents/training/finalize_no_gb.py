"""
Finalize CLIF Training (skip GB multiclass) - uses all saved models to produce final artifacts.
"""
import sys, json, time, warnings, numpy as np, joblib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_classifier import (
    load_data, preprocess_features, apply_smote,
    build_ensemble, save_best_model, print_final_summary, MODEL_DIR
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
)

warnings.filterwarnings('ignore')


def evaluate(name, model, X_test, y_test, n_classes):
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    auc = None
    if n_classes == 2 and hasattr(model, 'predict_proba'):
        auc = roc_auc_score(y_test, model.predict_proba(X_test)[:, 1])
    print(f"  {name}: Acc={acc:.4f}, F1={f1:.4f}" + (f", AUC={auc:.4f}" if auc else ""))
    return {
        'name': name, 'model': model, 'best_params': {},
        'cv_accuracy': acc, 'test_accuracy': acc,
        'test_precision': prec, 'test_recall': rec, 'test_f1': f1,
        'auc_roc': auc, 'train_time': 0, 'inference_ms': 0,
    }


def main():
    t0 = time.time()
    print("╔════════════════════════════════════════════════════════╗")
    print("║   CLIF - Finalize (skip GB multiclass)                ║")
    print("╚════════════════════════════════════════════════════════╝")

    train, test = load_data()
    (X_train, X_test, y_train_bin, y_test_bin,
     y_train_multi, y_test_multi, scaler, le_multi,
     feature_names, all_encoded_cols) = preprocess_features(train, test)

    # ── Binary ──
    print("\n" + "=" * 60 + "\nLOADING BINARY MODELS\n" + "=" * 60)
    bin_files = {
        'XGBoost (binary)': 'xgboost_binary.joblib',
        'LightGBM (binary)': 'lightgbm_binary.joblib',
        'RandomForest (binary)': 'randomforest_binary.joblib',
        'ExtraTrees (binary)': 'extratrees_binary.joblib',
        'GradientBoosting (binary)': 'gradientboosting_binary.joblib',
    }
    results_binary = []
    for name, fn in bin_files.items():
        results_binary.append(evaluate(name, joblib.load(MODEL_DIR / fn), X_test, y_test_bin, 2))

    print("\n  Building binary ensemble...")
    X_sm_bin, y_sm_bin = apply_smote(X_train, y_train_bin, "binary")
    ens_bin = build_ensemble(results_binary, X_sm_bin, y_sm_bin, X_test, y_test_bin, 2, ['Normal', 'Attack'])
    results_binary.append(ens_bin)

    # ── Multiclass (4 models, no GB) ──
    print("\n" + "=" * 60 + "\nLOADING MULTICLASS MODELS (4 models, skipping GB)\n" + "=" * 60)
    multi_files = {
        'XGBoost (multiclass)': 'xgboost_multiclass.joblib',
        'LightGBM (multiclass)': 'lightgbm_multiclass.joblib',
        'RandomForest (multiclass)': 'randomforest_multiclass.joblib',
        'ExtraTrees (multiclass)': 'extratrees_multiclass.joblib',
    }
    multi_labels = list(le_multi.classes_)
    n_multi = len(multi_labels)

    results_multi = []
    for name, fn in multi_files.items():
        results_multi.append(evaluate(name, joblib.load(MODEL_DIR / fn), X_test, y_test_multi, n_multi))

    print("\n  Building multiclass ensemble...")
    X_sm_m, y_sm_m = apply_smote(X_train, y_train_multi, "multiclass")
    ens_multi = build_ensemble(results_multi, X_sm_m, y_sm_m, X_test, y_test_multi, n_multi, multi_labels)
    results_multi.append(ens_multi)

    # ── Save everything ──
    best_binary, best_multi = save_best_model(
        results_binary, results_multi, scaler, le_multi, feature_names, all_encoded_cols
    )
    print_final_summary(results_binary, results_multi, best_binary, best_multi)

    print(f"\n  Total time: {(time.time() - t0) / 60:.1f} minutes")
    print("  Done!")


if __name__ == '__main__':
    main()
