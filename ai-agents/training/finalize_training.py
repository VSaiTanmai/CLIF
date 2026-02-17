"""
Finalize CLIF Training: Train GB multiclass (3 trials), build ensembles, save all artifacts.
"""
import sys
import json
import time
import warnings
import numpy as np
import joblib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_classifier import (
    load_data, preprocess_features, apply_smote,
    build_ensemble, save_best_model, print_final_summary,
    MODEL_DIR, gb_objective, train_and_evaluate_model,
    RANDOM_STATE, N_JOBS
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, roc_auc_score
)

warnings.filterwarnings('ignore')


def evaluate_model(name, model, X_test, y_test, n_classes, label_names):
    """Evaluate a loaded model."""
    y_pred = model.predict(X_test)
    t0 = time.time()
    _ = model.predict(X_test)
    inference_time = (time.time() - t0) / len(X_test) * 1000

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

    auc = None
    if n_classes == 2 and hasattr(model, 'predict_proba'):
        y_prob = model.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, y_prob)

    print(f"  {name}: Acc={acc:.4f}, F1={f1:.4f}" + (f", AUC={auc:.4f}" if auc else ""))

    return {
        'name': name,
        'model': model,
        'best_params': {},
        'cv_accuracy': acc,
        'test_accuracy': acc,
        'test_precision': prec,
        'test_recall': rec,
        'test_f1': f1,
        'auc_roc': auc,
        'train_time': 0,
        'inference_ms': inference_time,
    }


def main():
    start_time = time.time()
    print("╔════════════════════════════════════════════════════════╗")
    print("║   CLIF Training - FINALIZE                            ║")
    print("║   Load all saved models + quick GB multiclass + save  ║")
    print("╚════════════════════════════════════════════════════════╝")

    train, test = load_data()
    (X_train, X_test, y_train_bin, y_test_bin,
     y_train_multi, y_test_multi, scaler, le_multi,
     feature_names, all_encoded_cols) = preprocess_features(train, test)

    multi_labels = list(le_multi.classes_)
    n_multi = len(multi_labels)

    # ── Load all binary models ──
    print("\n" + "=" * 60)
    print("LOADING BINARY MODELS")
    print("=" * 60)
    binary_files = {
        'XGBoost (binary)': 'xgboost_binary.joblib',
        'LightGBM (binary)': 'lightgbm_binary.joblib',
        'RandomForest (binary)': 'randomforest_binary.joblib',
        'ExtraTrees (binary)': 'extratrees_binary.joblib',
        'GradientBoosting (binary)': 'gradientboosting_binary.joblib',
    }
    results_binary = []
    for name, fn in binary_files.items():
        model = joblib.load(MODEL_DIR / fn)
        result = evaluate_model(name, model, X_test, y_test_bin, 2, ['Normal', 'Attack'])
        results_binary.append(result)

    # Binary ensemble
    print("\n  Building binary ensemble...")
    X_train_sm_bin, y_train_sm_bin = apply_smote(X_train, y_train_bin, "binary")
    ens_bin = build_ensemble(results_binary, X_train_sm_bin, y_train_sm_bin,
                             X_test, y_test_bin, 2, ['Normal', 'Attack'])
    results_binary.append(ens_bin)

    # ── Load saved multiclass models ──
    print("\n" + "=" * 60)
    print("LOADING MULTICLASS MODELS")
    print("=" * 60)
    multi_files = {
        'XGBoost (multiclass)': 'xgboost_multiclass.joblib',
        'LightGBM (multiclass)': 'lightgbm_multiclass.joblib',
        'RandomForest (multiclass)': 'randomforest_multiclass.joblib',
        'ExtraTrees (multiclass)': 'extratrees_multiclass.joblib',
    }
    results_multi = []
    for name, fn in multi_files.items():
        model = joblib.load(MODEL_DIR / fn)
        result = evaluate_model(name, model, X_test, y_test_multi, n_multi, multi_labels)
        results_multi.append(result)

    # ── Quick GB multiclass (3 trials only) ──
    print("\n" + "=" * 60)
    print("QUICK-TRAINING GB MULTICLASS (3 trials)")
    print("=" * 60)
    X_train_sm, y_train_sm = apply_smote(X_train, y_train_multi, "multiclass")
    gb_result = train_and_evaluate_model(
        "GradientBoosting (multiclass)", gb_objective,
        X_train_sm, y_train_sm, X_test, y_test_multi,
        n_multi, multi_labels, n_trials=3
    )
    results_multi.append(gb_result)
    joblib.dump(gb_result['model'], MODEL_DIR / "gradientboosting_multiclass.joblib")
    print("    [SAVED] gradientboosting_multiclass.joblib")

    # Multiclass ensemble
    print("\n  Building multiclass ensemble...")
    ens_multi = build_ensemble(results_multi, X_train_sm, y_train_sm,
                               X_test, y_test_multi, n_multi, multi_labels)
    results_multi.append(ens_multi)

    # ── Save final artifacts ──
    best_binary, best_multi = save_best_model(
        results_binary, results_multi, scaler, le_multi,
        feature_names, all_encoded_cols
    )

    print_final_summary(results_binary, results_multi, best_binary, best_multi)

    elapsed = time.time() - start_time
    print(f"\n  Total time: {elapsed / 60:.1f} minutes")
    print("  Done! All models finalized.")


if __name__ == '__main__':
    main()
