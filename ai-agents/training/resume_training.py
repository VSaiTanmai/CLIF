"""
Resume CLIF Training Pipeline
==============================
Loads saved binary models, builds binary ensemble, then trains multiclass.
Avoids re-training binary models that were already saved.
"""

import sys
import json
import time
import warnings
import numpy as np
import joblib
from pathlib import Path

# Reuse everything from the main training script
sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_classifier import (
    load_data, preprocess_features, apply_smote,
    run_training_pipeline, build_ensemble, save_best_model,
    print_final_summary, MODEL_DIR,
    FEATURE_COLS, CATEGORICAL_COLS, NUMERICAL_COLS
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, roc_auc_score
)

warnings.filterwarnings('ignore')


def evaluate_loaded_model(name, model, X_test, y_test, n_classes, label_names):
    """Evaluate a pre-loaded model on test data and return result dict."""
    t0 = time.time()
    y_pred = model.predict(X_test)
    inference_time = (time.time() - t0) / len(X_test) * 1000

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

    print(f"  {name}: Acc={acc:.4f}, F1={f1:.4f}, Prec={prec:.4f}, Rec={rec:.4f}")

    if label_names:
        report = classification_report(y_test, y_pred, target_names=label_names)
        for line in report.split('\n'):
            print(f"    {line}")

    auc = None
    if n_classes == 2 and hasattr(model, 'predict_proba'):
        y_prob = model.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, y_prob)
        print(f"    AUC-ROC: {auc:.4f}")

    return {
        'name': name,
        'model': model,
        'best_params': {},
        'cv_accuracy': acc,  # Use test acc as proxy since we don't have CV from loaded model
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
    print("║   CLIF Training Pipeline - RESUME MODE                ║")
    print("║   Loading saved binary models, training multiclass    ║")
    print("╚════════════════════════════════════════════════════════╝")

    # Load and preprocess data (needed for evaluation and multiclass training)
    train, test = load_data()
    (X_train, X_test, y_train_bin, y_test_bin,
     y_train_multi, y_test_multi, scaler, le_multi,
     feature_names, all_encoded_cols) = preprocess_features(train, test)

    # ──────────────────────────────────────────
    # PHASE 1: Load saved binary models
    # ──────────────────────────────────────────
    print("\n" + "=" * 60)
    print("PHASE 1: LOADING SAVED BINARY MODELS")
    print("=" * 60)

    binary_model_files = {
        'XGBoost (binary)': 'xgboost_binary.joblib',
        'LightGBM (binary)': 'lightgbm_binary.joblib',
        'RandomForest (binary)': 'randomforest_binary.joblib',
        'ExtraTrees (binary)': 'extratrees_binary.joblib',
        'GradientBoosting (binary)': 'gradientboosting_binary.joblib',
    }

    results_binary = []
    for name, filename in binary_model_files.items():
        path = MODEL_DIR / filename
        if path.exists():
            print(f"\n  Loading {filename}...")
            model = joblib.load(path)
            result = evaluate_loaded_model(
                name, model, X_test, y_test_bin,
                n_classes=2, label_names=['Normal', 'Attack']
            )
            results_binary.append(result)
        else:
            print(f"  WARNING: {filename} not found, skipping")

    print(f"\n  Loaded {len(results_binary)} binary models")

    # Build binary ensemble
    if len(results_binary) >= 3:
        print("\n  Building binary ensemble from loaded models...")
        # Apply SMOTE for ensemble fitting
        X_train_sm, y_train_sm = apply_smote(X_train, y_train_bin, "binary")
        ensemble_result = build_ensemble(
            results_binary, X_train_sm, y_train_sm, X_test, y_test_bin,
            n_classes=2, label_names=['Normal', 'Attack']
        )
        results_binary.append(ensemble_result)
        # Save ensemble too
        joblib.dump(ensemble_result['model'], MODEL_DIR / "votingensemble_binary.joblib")
        print("    [SAVED] votingensemble_binary.joblib")

    # ──────────────────────────────────────────
    # PHASE 2: Train multiclass models (fresh)
    # ──────────────────────────────────────────
    print("\n" + "=" * 60)
    print("PHASE 2: TRAINING MULTICLASS MODELS")
    print("=" * 60)

    results_multi = run_training_pipeline(
        'multiclass', X_train, y_train_multi, X_test, y_test_multi,
        n_classes=len(le_multi.classes_), label_names=list(le_multi.classes_)
    )

    # ──────────────────────────────────────────
    # PHASE 3: Save best models + leaderboard
    # ──────────────────────────────────────────
    best_binary, best_multi = save_best_model(
        results_binary, results_multi, scaler, le_multi,
        feature_names, all_encoded_cols
    )

    print_final_summary(results_binary, results_multi, best_binary, best_multi)

    elapsed = time.time() - start_time
    print(f"\n  Total time: {elapsed / 60:.1f} minutes")
    print(f"    (Binary: loaded from disk, Multiclass: trained fresh)")
    print("  Done! Models saved to ai-agents/models/")


if __name__ == '__main__':
    main()
