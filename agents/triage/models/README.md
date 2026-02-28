# Triage Agent Model Artifacts

This directory must contain the following files before the triage agent can start:

| File | Description | Source |
|------|-------------|--------|
| `lgbm_v1.0.0.onnx` | LightGBM classifier exported to ONNX format | Training notebook `04_train_lgbm.py` |
| `eif_v1.0.0.pkl` | Extended Isolation Forest (joblib serialized) | Training notebook `05_train_eif.py` |
| `eif_threshold.npy` | EIF anomaly score threshold (numpy scalar) | Training notebook `05_train_eif.py` |
| `feature_cols.pkl` | Ordered list of 20 feature column names (pickle) | Training notebook `06_extract_features.py` |
| `manifest.json` | Model metadata (version, training date, metrics) | Training pipeline |
| `features_arf_stream_features.csv` | ARF cold-start CSV (optional — used when ClickHouse replay buffer is empty) | Training notebook `07_arf_stream.py` |

## How to generate these files

```bash
# From the training environment (Jupyter / Colab)
# 1. Run the training pipeline notebooks in order (01–07)
# 2. Copy the output artifacts into this directory
# 3. Verify with:
python -c "
import pickle, json, joblib, numpy as np
import onnxruntime as ort

# Verify LightGBM ONNX
sess = ort.InferenceSession('lgbm_v1.0.0.onnx')
print(f'LightGBM: input={sess.get_inputs()[0].name}, shape={sess.get_inputs()[0].shape}')

# Verify EIF
eif = joblib.load('eif_v1.0.0.pkl')
print(f'EIF: type={type(eif).__name__}')

# Verify threshold
th = np.load('eif_threshold.npy')
print(f'EIF threshold: {th}')

# Verify feature columns
with open('feature_cols.pkl', 'rb') as f:
    cols = pickle.load(f)
print(f'Feature columns ({len(cols)}): {cols}')

# Verify manifest
with open('manifest.json') as f:
    m = json.load(f)
print(f'Manifest: version={m.get(\"version\")}, trained={m.get(\"trained_at\")}')
"
```

## Notes

- `arf_v1.0.0.pkl` is **NOT used at runtime** — the ARF model is rebuilt via warm restart
  from ClickHouse `arf_replay_buffer`. It exists only as an offline reference.
- The `feature_cols.pkl` is the **single authoritative source** of feature column ordering.
  All 3 models must use this exact order.
- This directory is mounted as a read-only volume at `/models` in the container.
