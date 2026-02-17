"""
CLIF Tier-2 ML Classifier Training Pipeline
============================================
Trains multiple ML models on NSL-KDD dataset for network intrusion detection.
Optimizes for maximum accuracy using Optuna hyperparameter tuning.

Models: XGBoost, LightGBM, Random Forest, Extra Trees, Gradient Boosting
Tasks: Binary (normal vs attack) + Multi-class (5 attack categories)

Output: Best model saved to ai-agents/models/ with scaler and feature config
"""

import os
import sys
import json
import time
import warnings
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from datetime import datetime

# ML imports
from sklearn.model_selection import (
    cross_val_score, StratifiedKFold, train_test_split
)
from sklearn.preprocessing import LabelEncoder, StandardScaler, OneHotEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix, roc_auc_score
)
from sklearn.ensemble import (
    RandomForestClassifier, ExtraTreesClassifier, GradientBoostingClassifier,
    VotingClassifier
)
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import xgboost as xgb
import lightgbm as lgb
import optuna
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline

warnings.filterwarnings('ignore')
optuna.logging.set_verbosity(optuna.logging.WARNING)

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

N_OPTUNA_TRIALS = 50        # Hyperparameter search trials per model
CV_FOLDS = 5                # Cross-validation folds
RANDOM_STATE = 42
N_JOBS = -1                 # Use all CPU cores

# NSL-KDD column names
FEATURE_COLS = [
    'duration', 'protocol_type', 'service', 'flag', 'src_bytes', 'dst_bytes',
    'land', 'wrong_fragment', 'urgent', 'hot', 'num_failed_logins', 'logged_in',
    'num_compromised', 'root_shell', 'su_attempted', 'num_root',
    'num_file_creations', 'num_shells', 'num_access_files', 'num_outbound_cmds',
    'is_host_login', 'is_guest_login', 'count', 'srv_count', 'serror_rate',
    'srv_serror_rate', 'rerror_rate', 'srv_rerror_rate', 'same_srv_rate',
    'diff_srv_rate', 'srv_diff_host_rate', 'dst_host_count', 'dst_host_srv_count',
    'dst_host_same_srv_rate', 'dst_host_diff_srv_rate',
    'dst_host_same_src_port_rate', 'dst_host_srv_diff_host_rate',
    'dst_host_serror_rate', 'dst_host_srv_serror_rate', 'dst_host_rerror_rate',
    'dst_host_srv_rerror_rate'
]
ALL_COLS = FEATURE_COLS + ['label', 'difficulty_level']

CATEGORICAL_COLS = ['protocol_type', 'service', 'flag']
NUMERICAL_COLS = [c for c in FEATURE_COLS if c not in CATEGORICAL_COLS]

# Attack category mapping (fine-grained label -> 5-class category)
ATTACK_MAP = {
    'normal': 'Normal',
    # DoS
    'neptune': 'DoS', 'back': 'DoS', 'land': 'DoS', 'pod': 'DoS',
    'smurf': 'DoS', 'teardrop': 'DoS', 'mailbomb': 'DoS', 'apache2': 'DoS',
    'processtable': 'DoS', 'udpstorm': 'DoS',
    # Probe
    'ipsweep': 'Probe', 'nmap': 'Probe', 'portsweep': 'Probe', 'satan': 'Probe',
    'mscan': 'Probe', 'saint': 'Probe',
    # R2L
    'ftp_write': 'R2L', 'guess_passwd': 'R2L', 'imap': 'R2L', 'multihop': 'R2L',
    'phf': 'R2L', 'spy': 'R2L', 'warezclient': 'R2L', 'warezmaster': 'R2L',
    'sendmail': 'R2L', 'named': 'R2L', 'snmpgetattack': 'R2L', 'snmpguess': 'R2L',
    'xlock': 'R2L', 'xsnoop': 'R2L', 'worm': 'R2L',
    # U2R
    'buffer_overflow': 'U2R', 'loadmodule': 'U2R', 'perl': 'U2R', 'rootkit': 'U2R',
    'httptunnel': 'U2R', 'ps': 'U2R', 'sqlattack': 'U2R', 'xterm': 'U2R',
}

# CLIF SIEM category mapping (5-class -> CLIF event categories)
CLIF_CATEGORY_MAP = {
    'Normal': 'benign',
    'DoS': 'denial_of_service',
    'Probe': 'reconnaissance',
    'R2L': 'remote_access',
    'U2R': 'privilege_escalation',
}


def load_data():
    """Load and prepare NSL-KDD train/test data."""
    print("=" * 60)
    print("LOADING NSL-KDD DATASET")
    print("=" * 60)

    train = pd.read_csv(DATA_DIR / "nsl_kdd_train.txt", header=None, names=ALL_COLS)
    test = pd.read_csv(DATA_DIR / "nsl_kdd_test.txt", header=None, names=ALL_COLS)

    print(f"  Training: {train.shape[0]:,} rows x {train.shape[1]} cols")
    print(f"  Testing:  {test.shape[0]:,} rows x {test.shape[1]} cols")

    # Create binary label (0=Normal, 1=Attack)
    train['binary_label'] = (train['label'] != 'normal').astype(int)
    test['binary_label'] = (test['label'] != 'normal').astype(int)

    # Create multi-class category
    train['category'] = train['label'].map(ATTACK_MAP).fillna('Unknown')
    test['category'] = test['label'].map(ATTACK_MAP).fillna('Unknown')

    # Handle unknown categories in test (novel attacks) -> map to nearest
    unknown_mask = test['category'] == 'Unknown'
    if unknown_mask.sum() > 0:
        print(f"  Unknown labels in test: {unknown_mask.sum()} -> mapped to nearest category")
        # Map unknown attack labels as generic attack
        test.loc[unknown_mask, 'category'] = 'DoS'  # Default unknown attacks

    print(f"\n  Binary distribution (train): Normal={train['binary_label'].value_counts()[0]:,}, Attack={train['binary_label'].value_counts()[1]:,}")
    print(f"  Category distribution (train):")
    for cat, cnt in train['category'].value_counts().items():
        print(f"    {cat:20s}: {cnt:,}")

    return train, test


def preprocess_features(train, test):
    """Feature engineering and preprocessing."""
    print("\n" + "=" * 60)
    print("FEATURE ENGINEERING")
    print("=" * 60)

    # Combine for consistent encoding
    combined = pd.concat([train[FEATURE_COLS], test[FEATURE_COLS]], axis=0, ignore_index=True)

    # One-hot encode categorical features
    print("  One-hot encoding categorical features...")
    combined_encoded = pd.get_dummies(combined, columns=CATEGORICAL_COLS, drop_first=False)

    # Split back
    X_train = combined_encoded.iloc[:len(train)].copy()
    X_test = combined_encoded.iloc[len(train):].copy()

    # Scale numerical features
    print("  Scaling numerical features...")
    scaler = StandardScaler()
    X_train[NUMERICAL_COLS] = scaler.fit_transform(X_train[NUMERICAL_COLS])
    X_test[NUMERICAL_COLS] = scaler.transform(X_test[NUMERICAL_COLS])

    # Ensure all columns are float
    X_train = X_train.astype(np.float32)
    X_test = X_test.astype(np.float32)

    feature_names = list(X_train.columns)
    print(f"  Total features after encoding: {len(feature_names)}")
    print(f"  Numerical: {len(NUMERICAL_COLS)}, One-hot: {len(feature_names) - len(NUMERICAL_COLS)}")

    # Binary labels
    y_train_binary = train['binary_label'].values
    y_test_binary = test['binary_label'].values

    # Multi-class labels
    le_multi = LabelEncoder()
    y_train_multi = le_multi.fit_transform(train['category'].values)
    y_test_multi = le_multi.transform(test['category'].values)

    print(f"  Multi-class labels: {list(le_multi.classes_)}")

    return (X_train.values, X_test.values, y_train_binary, y_test_binary,
            y_train_multi, y_test_multi, scaler, le_multi, feature_names,
            X_train.columns.tolist())


def apply_smote(X_train, y_train, task_name=""):
    """Apply SMOTE for class imbalance handling."""
    print(f"  Applying SMOTE for {task_name}...")
    unique, counts = np.unique(y_train, return_counts=True)
    min_count = counts.min()

    # Only apply SMOTE if there's significant imbalance
    if counts.max() / min_count > 3:
        # Set k_neighbors based on smallest class size
        k = min(5, min_count - 1) if min_count > 1 else 1
        smote = SMOTE(random_state=RANDOM_STATE, k_neighbors=k)
        X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
        print(f"    Before: {len(X_train):,} -> After: {len(X_resampled):,}")
        return X_resampled, y_resampled
    else:
        print(f"    Balanced enough, skipping SMOTE")
        return X_train, y_train


# ============================================================
# OPTUNA OBJECTIVES
# ============================================================
def xgb_objective(trial, X, y, n_classes, cv):
    """Optuna objective for XGBoost."""
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
        'max_depth': trial.suggest_int('max_depth', 3, 12),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
        'gamma': trial.suggest_float('gamma', 0.0, 1.0),
        'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
        'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
        'random_state': RANDOM_STATE,
        'n_jobs': N_JOBS,
        'tree_method': 'hist',
        'device': 'cuda',
    }

    if n_classes == 2:
        params['objective'] = 'binary:logistic'
        params['eval_metric'] = 'logloss'
        model = xgb.XGBClassifier(**params)
    else:
        params['objective'] = 'multi:softmax'
        params['num_class'] = n_classes
        params['eval_metric'] = 'mlogloss'
        model = xgb.XGBClassifier(**params)

    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=1)
    return scores.mean()


def lgb_objective(trial, X, y, n_classes, cv):
    """Optuna objective for LightGBM."""
    num_leaves = trial.suggest_int('num_leaves', 16, 256)
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
        'num_leaves': num_leaves,
        'max_depth': -1,  # unlimited, controlled by num_leaves
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
        'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
        'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
        'random_state': RANDOM_STATE,
        'n_jobs': N_JOBS,
        'verbose': -1,
    }

    if n_classes == 2:
        model = lgb.LGBMClassifier(**params, objective='binary')
    else:
        model = lgb.LGBMClassifier(**params, objective='multiclass', num_class=n_classes)

    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=1)
    return scores.mean()


def rf_objective(trial, X, y, n_classes, cv):
    """Optuna objective for Random Forest."""
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 400),
        'max_depth': trial.suggest_int('max_depth', 5, 20),
        'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
        'min_samples_leaf': trial.suggest_int('min_samples_leaf', 1, 10),
        'max_features': trial.suggest_categorical('max_features', ['sqrt', 'log2']),
        'bootstrap': True,
        'random_state': RANDOM_STATE,
        'n_jobs': N_JOBS,
    }

    model = RandomForestClassifier(**params)
    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=1)
    return scores.mean()


def et_objective(trial, X, y, n_classes, cv):
    """Optuna objective for Extra Trees."""
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 400),
        'max_depth': trial.suggest_int('max_depth', 5, 20),
        'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
        'min_samples_leaf': trial.suggest_int('min_samples_leaf', 1, 10),
        'max_features': trial.suggest_categorical('max_features', ['sqrt', 'log2']),
        'random_state': RANDOM_STATE,
        'n_jobs': N_JOBS,
    }

    model = ExtraTreesClassifier(**params)
    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=1)
    return scores.mean()


def gb_objective(trial, X, y, n_classes, cv):
    """Optuna objective for Gradient Boosting."""
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 50, 300),
        'max_depth': trial.suggest_int('max_depth', 3, 8),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
        'min_samples_leaf': trial.suggest_int('min_samples_leaf', 1, 10),
        'max_features': trial.suggest_categorical('max_features', ['sqrt', 'log2']),
        'random_state': RANDOM_STATE,
    }

    model = GradientBoostingClassifier(**params)
    scores = cross_val_score(model, X, y, cv=cv, scoring='accuracy', n_jobs=1)
    return scores.mean()


# ============================================================
# TRAINING PIPELINE
# ============================================================
def train_and_evaluate_model(name, objective_fn, X_train, y_train, X_test, y_test,
                             n_classes, label_names=None, n_trials=None):
    """Train a model with Optuna HPO and evaluate on test set."""
    if n_trials is None:
        n_trials = N_OPTUNA_TRIALS
    print(f"\n  {'─' * 50}")
    print(f"  Training {name}... ({n_trials} trials)")
    print(f"  {'─' * 50}")

    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)

    # Optuna study
    study = optuna.create_study(direction='maximize')
    study.optimize(
        lambda trial: objective_fn(trial, X_train, y_train, n_classes, cv),
        n_trials=n_trials,
        show_progress_bar=True,
        catch=(ValueError, Exception),
    )

    best_params = study.best_params
    best_cv_score = study.best_value
    print(f"    Best CV accuracy: {best_cv_score:.4f}")
    print(f"    Best params: {json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in best_params.items()}, indent=6)}")

    # Build final model with best params
    if 'XGBoost' in name:
        final_params = {**best_params, 'random_state': RANDOM_STATE, 'n_jobs': N_JOBS,
                        'tree_method': 'hist', 'device': 'cuda'}
        if n_classes == 2:
            final_params['objective'] = 'binary:logistic'
            final_params['eval_metric'] = 'logloss'
        else:
            final_params['objective'] = 'multi:softmax'
            final_params['num_class'] = n_classes
            final_params['eval_metric'] = 'mlogloss'
        model = xgb.XGBClassifier(**final_params)
    elif 'LightGBM' in name:
        final_params = {**best_params, 'random_state': RANDOM_STATE, 'n_jobs': N_JOBS,
                        'verbose': -1}
        if n_classes == 2:
            model = lgb.LGBMClassifier(**final_params, objective='binary')
        else:
            model = lgb.LGBMClassifier(**final_params, objective='multiclass', num_class=n_classes)
    elif 'RandomForest' in name:
        model = RandomForestClassifier(**best_params, random_state=RANDOM_STATE,
                                       n_jobs=N_JOBS, bootstrap=True)
    elif 'ExtraTrees' in name:
        model = ExtraTreesClassifier(**best_params, random_state=RANDOM_STATE, n_jobs=N_JOBS)
    elif 'GradientBoosting' in name:
        model = GradientBoostingClassifier(**best_params, random_state=RANDOM_STATE)
    else:
        raise ValueError(f"Unknown model: {name}")

    # Train on full training set
    t0 = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - t0
    print(f"    Training time: {train_time:.1f}s")

    # Predict
    t0 = time.time()
    y_pred = model.predict(X_test)
    inference_time = (time.time() - t0) / len(X_test) * 1000  # ms per sample
    print(f"    Inference time: {inference_time:.4f} ms/sample")

    # Metrics
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

    print(f"    Test Accuracy:  {acc:.4f}")
    print(f"    Test Precision: {prec:.4f}")
    print(f"    Test Recall:    {rec:.4f}")
    print(f"    Test F1-Score:  {f1:.4f}")

    if label_names:
        print(f"\n    Classification Report:")
        report = classification_report(y_test, y_pred, target_names=label_names)
        for line in report.split('\n'):
            print(f"    {line}")

    # AUC-ROC (if binary)
    auc = None
    if n_classes == 2:
        if hasattr(model, 'predict_proba'):
            y_prob = model.predict_proba(X_test)[:, 1]
            auc = roc_auc_score(y_test, y_prob)
            print(f"    AUC-ROC: {auc:.4f}")

    return {
        'name': name,
        'model': model,
        'best_params': best_params,
        'cv_accuracy': best_cv_score,
        'test_accuracy': acc,
        'test_precision': prec,
        'test_recall': rec,
        'test_f1': f1,
        'auc_roc': auc,
        'train_time': train_time,
        'inference_ms': inference_time,
    }


def build_ensemble(results, X_train, y_train, X_test, y_test, n_classes, label_names=None):
    """Build a voting ensemble from top models."""
    print(f"\n  {'─' * 50}")
    print(f"  Building Voting Ensemble (Top 3 models)")
    print(f"  {'─' * 50}")

    # Take top 3 by CV accuracy
    sorted_results = sorted(results, key=lambda r: r['cv_accuracy'], reverse=True)[:3]
    estimators = [(r['name'].replace(' ', '_'), r['model']) for r in sorted_results]
    print(f"    Components: {[e[0] for e in estimators]}")

    # Soft voting for probability-based ensemble (n_jobs=1 to avoid _posixsubprocess bug on Windows/Py3.13)
    ensemble = VotingClassifier(estimators=estimators, voting='soft', n_jobs=1)

    t0 = time.time()
    ensemble.fit(X_train, y_train)
    train_time = time.time() - t0

    y_pred = ensemble.predict(X_test)
    inference_time = 0  # Ensemble inference time

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)

    print(f"    Ensemble Accuracy:  {acc:.4f}")
    print(f"    Ensemble Precision: {prec:.4f}")
    print(f"    Ensemble Recall:    {rec:.4f}")
    print(f"    Ensemble F1-Score:  {f1:.4f}")

    if label_names:
        print(f"\n    Classification Report:")
        report = classification_report(y_test, y_pred, target_names=label_names)
        for line in report.split('\n'):
            print(f"    {line}")

    auc = None
    if n_classes == 2 and hasattr(ensemble, 'predict_proba'):
        y_prob = ensemble.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, y_prob)
        print(f"    AUC-ROC: {auc:.4f}")

    return {
        'name': 'VotingEnsemble',
        'model': ensemble,
        'best_params': {},
        'cv_accuracy': np.mean([r['cv_accuracy'] for r in sorted_results]),
        'test_accuracy': acc,
        'test_precision': prec,
        'test_recall': rec,
        'test_f1': f1,
        'auc_roc': auc,
        'train_time': train_time,
        'inference_ms': 0,
    }


def run_training_pipeline(task, X_train, y_train, X_test, y_test, n_classes, label_names):
    """Run full training pipeline for a task (binary or multiclass)."""
    print("\n" + "=" * 60)
    print(f"TRAINING PIPELINE: {task.upper()}")
    print(f"  Classes: {n_classes}, Labels: {label_names}")
    print(f"  Train: {X_train.shape}, Test: {X_test.shape}")
    print("=" * 60)

    # Apply SMOTE
    X_train_sm, y_train_sm = apply_smote(X_train, y_train, task)

    # Define models to train (name, objective_fn, n_trials)
    # Fast models (GPU/optimized): 50 trials. Slow CPU models: 20 trials.
    model_configs = [
        ("XGBoost", xgb_objective, 50),
        ("LightGBM", lgb_objective, 50),
        ("RandomForest", rf_objective, 20),
        ("ExtraTrees", et_objective, 20),
        ("GradientBoosting", gb_objective, 20),
    ]

    results = []
    for name, obj_fn, n_trials in model_configs:
        result = train_and_evaluate_model(
            f"{name} ({task})", obj_fn,
            X_train_sm, y_train_sm, X_test, y_test,
            n_classes, label_names, n_trials=n_trials
        )
        results.append(result)
        # Incremental save: persist each model immediately after training
        safe_name = name.lower().replace(" ", "_")
        joblib.dump(result['model'], MODEL_DIR / f"{safe_name}_{task}.joblib")
        print(f"    [SAVED] {safe_name}_{task}.joblib")

    # Build ensemble from top 3
    ensemble_result = build_ensemble(
        results, X_train_sm, y_train_sm, X_test, y_test, n_classes, label_names
    )
    results.append(ensemble_result)

    return results


def save_best_model(results_binary, results_multi, scaler, le_multi, feature_names,
                    all_encoded_cols):
    """Save the best models and all artifacts."""
    print("\n" + "=" * 60)
    print("SAVING BEST MODELS")
    print("=" * 60)

    # Find best binary model
    best_binary = max(results_binary, key=lambda r: r['test_f1'])
    print(f"\n  Best Binary: {best_binary['name']}")
    print(f"    Accuracy: {best_binary['test_accuracy']:.4f}")
    print(f"    F1-Score: {best_binary['test_f1']:.4f}")

    # Find best multi-class model
    best_multi = max(results_multi, key=lambda r: r['test_f1'])
    print(f"\n  Best Multi-class: {best_multi['name']}")
    print(f"    Accuracy: {best_multi['test_accuracy']:.4f}")
    print(f"    F1-Score: {best_multi['test_f1']:.4f}")

    # Save models
    joblib.dump(best_binary['model'], MODEL_DIR / "binary_classifier.joblib")
    joblib.dump(best_multi['model'], MODEL_DIR / "multiclass_classifier.joblib")
    joblib.dump(scaler, MODEL_DIR / "scaler.joblib")
    joblib.dump(le_multi, MODEL_DIR / "label_encoder.joblib")

    # Save config
    config = {
        'version': '1.0.0',
        'created': datetime.now().isoformat(),
        'dataset': 'NSL-KDD',
        'feature_cols': FEATURE_COLS,
        'categorical_cols': CATEGORICAL_COLS,
        'numerical_cols': NUMERICAL_COLS,
        'encoded_feature_names': all_encoded_cols,
        'binary_model': {
            'name': best_binary['name'],
            'file': 'binary_classifier.joblib',
            'accuracy': best_binary['test_accuracy'],
            'f1': best_binary['test_f1'],
            'precision': best_binary['test_precision'],
            'recall': best_binary['test_recall'],
            'auc_roc': best_binary['auc_roc'],
            'params': {k: (round(v, 6) if isinstance(v, float) else v)
                       for k, v in best_binary['best_params'].items()},
        },
        'multiclass_model': {
            'name': best_multi['name'],
            'file': 'multiclass_classifier.joblib',
            'classes': list(le_multi.classes_),
            'clif_category_map': CLIF_CATEGORY_MAP,
            'accuracy': best_multi['test_accuracy'],
            'f1': best_multi['test_f1'],
            'precision': best_multi['test_precision'],
            'recall': best_multi['test_recall'],
            'params': {k: (round(v, 6) if isinstance(v, float) else v)
                       for k, v in best_multi['best_params'].items()},
        },
        'attack_map': ATTACK_MAP,
    }

    with open(MODEL_DIR / "model_config.json", 'w') as f:
        json.dump(config, f, indent=2)

    # Save all results as leaderboard
    leaderboard = {
        'binary': [
            {k: v for k, v in r.items() if k != 'model'}
            for r in sorted(results_binary, key=lambda r: r['test_f1'], reverse=True)
        ],
        'multiclass': [
            {k: v for k, v in r.items() if k != 'model'}
            for r in sorted(results_multi, key=lambda r: r['test_f1'], reverse=True)
        ],
    }
    with open(MODEL_DIR / "leaderboard.json", 'w') as f:
        json.dump(leaderboard, f, indent=2)

    print(f"\n  Saved to {MODEL_DIR}:")
    for f in MODEL_DIR.iterdir():
        print(f"    {f.name} ({f.stat().st_size:,} bytes)")

    return best_binary, best_multi


def print_final_summary(results_binary, results_multi, best_binary, best_multi):
    """Print final summary of all results."""
    print("\n" + "=" * 60)
    print("FINAL LEADERBOARD")
    print("=" * 60)

    print("\n  Binary Classification (Normal vs Attack):")
    print(f"  {'Model':<35} {'CV Acc':>8} {'Test Acc':>9} {'F1':>8} {'Prec':>8} {'Rec':>8}")
    print(f"  {'─' * 78}")
    for r in sorted(results_binary, key=lambda r: r['test_f1'], reverse=True):
        marker = " ★" if r['name'] == best_binary['name'] else ""
        print(f"  {r['name']:<35} {r['cv_accuracy']:>8.4f} {r['test_accuracy']:>9.4f} "
              f"{r['test_f1']:>8.4f} {r['test_precision']:>8.4f} {r['test_recall']:>8.4f}{marker}")

    print("\n  Multi-class Classification (5 categories):")
    print(f"  {'Model':<35} {'CV Acc':>8} {'Test Acc':>9} {'F1':>8} {'Prec':>8} {'Rec':>8}")
    print(f"  {'─' * 78}")
    for r in sorted(results_multi, key=lambda r: r['test_f1'], reverse=True):
        marker = " ★" if r['name'] == best_multi['name'] else ""
        print(f"  {r['name']:<35} {r['cv_accuracy']:>8.4f} {r['test_accuracy']:>9.4f} "
              f"{r['test_f1']:>8.4f} {r['test_precision']:>8.4f} {r['test_recall']:>8.4f}{marker}")

    print(f"\n  ★ = Best model (saved)")
    print(f"\n  WINNER Binary:     {best_binary['name']} -> {best_binary['test_accuracy']:.4f} accuracy, {best_binary['test_f1']:.4f} F1")
    print(f"  WINNER Multiclass: {best_multi['name']} -> {best_multi['test_accuracy']:.4f} accuracy, {best_multi['test_f1']:.4f} F1")


def main():
    start_time = time.time()
    print("╔════════════════════════════════════════════════════════╗")
    print("║   CLIF Tier-2 ML Classifier Training Pipeline         ║")
    print("║   Dataset: NSL-KDD | Models: XGB/LGBM/RF/ET/GB       ║")
    print("║   Optimizer: Optuna ({} trials/model)              ║".format(N_OPTUNA_TRIALS))
    print("╚════════════════════════════════════════════════════════╝")

    # Load data
    train, test = load_data()

    # Feature engineering
    (X_train, X_test, y_train_bin, y_test_bin,
     y_train_multi, y_test_multi, scaler, le_multi,
     feature_names, all_encoded_cols) = preprocess_features(train, test)

    # Train binary classifiers
    results_binary = run_training_pipeline(
        'binary', X_train, y_train_bin, X_test, y_test_bin,
        n_classes=2, label_names=['Normal', 'Attack']
    )

    # Train multi-class classifiers
    results_multi = run_training_pipeline(
        'multiclass', X_train, y_train_multi, X_test, y_test_multi,
        n_classes=len(le_multi.classes_), label_names=list(le_multi.classes_)
    )

    # Save best models
    best_binary, best_multi = save_best_model(
        results_binary, results_multi, scaler, le_multi,
        feature_names, all_encoded_cols
    )

    # Print leaderboard
    print_final_summary(results_binary, results_multi, best_binary, best_multi)

    elapsed = time.time() - start_time
    print(f"\n  Total training time: {elapsed / 60:.1f} minutes")
    print("  Done! Models saved to ai-agents/models/")


if __name__ == '__main__':
    main()
