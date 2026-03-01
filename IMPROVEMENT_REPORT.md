# CLIF Triage Agent — Comprehensive Improvement Report
**Date:** March 1, 2026  
**Current Commit:** `fd09f4d` (EIF anomaly override + novel attack test)  
**Current F1 Score:** 0.9593 | **Novel Anomaly Detection:** 15/15 (100%)

---

## TABLE OF CONTENTS
1. [Current State Summary](#1-current-state-summary)
2. [Identified Gaps & Weaknesses](#2-identified-gaps--weaknesses)
3. [Dataset Improvements (What to Add/Increase)](#3-dataset-improvements)
4. [Model Training Improvements](#4-model-training-improvements)
5. [Architecture Improvements](#5-architecture-improvements)
6. [Step-by-Step Retraining Plan](#6-step-by-step-retraining-plan)
7. [Expected Results After Improvements](#7-expected-results-after-improvements)

---

## 1. CURRENT STATE SUMMARY

### 1.1 Training Data (131,640 rows from 9 datasets)

| # | Dataset | Current Rows | Available in Zip | % Used | Type |
|---|---------|-------------|-----------------|--------|------|
| 1 | CICIDS2017 (stratified) | 30,193 | 2,830,743 | **1.1%** | Network flow |
| 2 | NSL-KDD (stratified) | 24,607 | 24,607 | 100% | IDS features |
| 3 | UNSW-NB15 (stratified) | 20,233 | 700,000 | **2.9%** | Network flow |
| 4 | NF-UNSW-NB15-v3 | 12,000 | 12,000 | 100% | NetFlow |
| 5 | NF-ToN-IoT | 11,341 | 27,520,260 | **0.04%** | IoT NetFlow |
| 6 | CSIC 2010 | 20,000 (capped) | 61,065 | 33% | HTTP attacks |
| 7 | EVTX Attack Samples | 9,266 (4.6K + 4.6K synth) | 9,886 attacks | 100% | Windows Events |
| 8 | Loghub Linux | 2,000 | 2,000 | 100% | Syslog |
| 9 | Loghub Apache | 2,000 | 2,000 | 100% | Web server |
| **Total** | | **131,640** | **31+ million** | **~0.4%** | |

### 1.2 Current Model Performance

| Metric | Score |
|--------|-------|
| Overall F1 | 0.9593 |
| Overall AUC | 0.9936 |
| Accuracy | 0.9597 |
| LightGBM best iteration | 997/1000 |

**Per-Dataset Detection (validation set):**

| Dataset | Detection Rate | FPR | Issue |
|---------|---------------|-----|-------|
| CICIDS2017 | 99.6% | 0.3% | Good |
| NSL-KDD | 99.4% | 1.8% | Good |
| UNSW-NB15 | 99.5% | 0.5% | Good |
| NF-UNSW | 87.3% | 2.1% | Moderate |
| **NF-ToN-IoT** | **63.5%** | 1.2% | **POOR — needs more data** |
| CSIC 2010 | ~95% | **20.75%** | **HIGH FALSE POSITIVE RATE** |
| EVTX | 100% | 0% | Synthetic normals mask reality |
| Loghub Linux | ~90% | ~5% | Tiny dataset |
| Loghub Apache | ~85% | ~8% | Tiny dataset |

### 1.3 Per-Model Anomaly Detection (15 Novel Attack Scenarios)

| Model | Novel Attacks Caught | Role |
|-------|---------------------|------|
| **EIF (unsupervised)** | **14/15 (93%)** | Main anomaly detector |
| LightGBM (supervised) | 7/15 (47%) | Known pattern classifier |
| ARF (online) | 4/15 (27%) | Weak at cold start |
| Raw combined (no override) | 10/15 (67%) | LightGBM drowns EIF |
| **With EIF override (production)** | **15/15 (100%)** | Override saves 5 scenarios |

---

## 2. IDENTIFIED GAPS & WEAKNESSES

### GAP 1: SEVERE UNDERSAMPLING (Critical)
- Using only **131K out of 31+ million available rows** (0.4%)
- CICIDS2017: 30K out of 2.8M (1.1%) — the richest attack dataset barely touched
- NF-ToN-IoT: 11K out of 27.5M (0.04%) — explains the 63.5% detection rate
- UNSW-NB15: 20K out of 700K (2.9%)

### GAP 2: MISSING DNS DATASET (Critical)
- **CIC-Bell-DNS-EXFil dataset exists in the zip** (514K rows: 500K benign, 5K phishing, 5K malware, 4K spam) but is **NOT loaded by any trainer**
- `source_type_numeric=5` (DNS) has **zero training samples**
- Production receives DNS logs → model has never seen them → unpredictable behavior
- This directly explains why completely novel DNS patterns score inconsistently

### GAP 3: HIGH CSIC FALSE POSITIVE RATE (Major)
- 20.75% FPR means **1 in 5 normal HTTP requests trigger false alarms**
- Root cause: after leakage fix, HTTP features overlap heavily between normal and attack
- `src_bytes` (content length) and `template_rarity` (URL length) are the only discriminators
- Need richer HTTP features or more diverse HTTP normal data

### GAP 4: SYNTHETIC EVTX NORMALS (Major)
- 4,633 "normal" EVTX events are **randomly generated**, not from real Windows baselines
- Synthetic normals have `hour_of_day` restricted to business hours, `event_freq_1m` in [5,60]
- Real Windows events have much more varied patterns → model learns artificial boundary
- Production Windows events may look nothing like synthetic normals

### GAP 5: TINY LOG DATASETS (Moderate)
- Loghub Linux: only 2,000 rows (syslog)
- Loghub Apache: only 2,000 rows (web server)
- These are too small for the model to learn robust syslog/web patterns
- Production likely sees 10,000x more diverse syslog patterns

### GAP 6: NO SMTP/FTP/VOIP PROTOCOL DATA (Moderate)
- Normal SMTP email (port 587) scores 0.959 on LightGBM → **false positive**
- No FTP (port 21), SIP (port 5060), or RDP (port 3389) in normal training data
- Any legitimate traffic on these ports looks "anomalous" to the model

### GAP 7: WEAK EIF DISCRIMINATION (Moderate — Mitigated)
- EIF delta = -0.068 (inverted, corrected via score_flip)
- After flip: normal_mean=0.487, malicious_mean=0.553 — only 0.066 gap
- **Mitigated** by EIF override (forces floor when EIF ≥ 0.65), but fundamentally weak
- Root cause: EIF trained on heterogeneous normal data from 9 datasets — the "multi-log" diversity makes normal data spread wide in feature space

### GAP 8: ARF COLD-START WEAKNESS (Minor)
- ARF catches only 4/15 novel attacks at cold start
- After warm restart with 15K rows, still weak until it learns online from production traffic
- This is by design (ARF improves over time) but means first hours are vulnerable

### GAP 9: `threat_intel_flag` ALWAYS ZERO IN TRAINING (Minor)
- Feature is always 0 in all 9 datasets
- LightGBM cannot learn from it → relies entirely on post-model IOC boost
- Not critical (IOC boost works) but wastes a feature slot

### GAP 10: NO CROSS-VALIDATION (Minor)
- Single 80/20 train/test split
- Risk of unlucky split biasing results, especially for small datasets (EVTX, Loghub)

---

## 3. DATASET IMPROVEMENTS

### 3.1 INCREASE EXISTING DATASETS

| Dataset | Current → Target | How to Change in `retrain_all.py` |
|---------|-----------------|----------------------------------|
| **CICIDS2017** | 30K → **150K** | Load ALL 8 daily CSVs instead of only `cicids2017_stratified.csv`. Sample 150K from 2.8M with stratified sampling by attack type. |
| **UNSW-NB15** | 20K → **100K** | Load `UNSW-NB15_1.csv` (700K rows). Sample 100K stratified by attack category. |
| **NF-ToN-IoT** | 11K → **100K** | Load `NF-ToN-IoT-v3.csv` (27.5M rows). Sample 100K stratified. **This will fix the 63.5% detection rate.** |
| **CSIC 2010** | 20K → **50K** | Remove the `n=10000` cap. Load all 61K rows directly. More normal HTTP examples will reduce 20.75% FPR. |
| **NF-UNSW** | 12K → **50K** | Load from full `NF-UNSW-NB15-v3.csv` (currently using stratified 12K). |

**Code changes needed in `retrain_all.py`:**
```python
# CICIDS2017: load ALL day files, not just stratified
def load_cicids2017(zf):
    day_files = [n for n in zf.namelist() 
                 if 'CICIDS2017' in n and n.endswith('.csv') 
                 and 'stratified' not in n and '01_syslog' in n]
    frames = [pd.read_csv(io.StringIO(zf.read(f).decode('utf-8', errors='replace'))) 
              for f in day_files]
    df = pd.concat(frames, ignore_index=True)
    # Stratified sample: 150K rows balanced by attack_type
    ...

# CSIC: remove the n=10000 cap
# Change lines 360-363:
if len(df_n) > 25000:
    df_n = df_n.sample(n=25000, random_state=42)
if len(df_a) > 25000:
    df_a = df_a.sample(n=25000, random_state=42)
```

### 3.2 ADD NEW DATASETS (ALREADY IN ZIP)

#### A. CIC-Bell-DNS-EXFil (Priority: CRITICAL)
- **Location in zip:** `datasets/05_dns_logs/path_a_lightgbm/CIC-Bell-DNS-EXFil/`
- **Files:** `CSV_benign.csv` (500K), `CSV_phishing.csv` (5K), `CSV_malware.csv` (5K), `CSV_spam.csv` (4K)
- **Target:** 30K rows (20K benign, 5K phishing, 5K malware/spam)
- **source_type_numeric:** 5 (dns)
- **Why:** Fills the DNS protocol gap. Production receives DNS logs but model has ZERO DNS training data.

**New loader needed:**
```python
def load_dns_exfil(zf):
    # Load benign DNS (sample 20K from 500K)
    # Load phishing + malware + spam DNS (all ~14K)
    # Map DNS features → 20 canonical features:
    #   - src_bytes = query length
    #   - dst_bytes = response length  
    #   - dst_port = 53
    #   - protocol = 17 (UDP)
    #   - template_rarity from entropy column
    #   - event_freq_1m from TTL/timing
    #   - source_type_numeric = 5
```

#### B. FULL CICIDS2017 DAYS (Priority: HIGH)
- Currently loading only the pre-stratified 30K CSV
- The zip contains ALL 8 daily PCAP CSVs totaling 2.8M rows
- Each day has different attack types:
  - Monday: Normal only (529K benign baseline!)
  - Tuesday: FTP-Patator, SSH-Patator (445K)
  - Wednesday: DoS, Heartbleed (692K)
  - Thursday AM: Web Attacks (170K), Thursday PM: Infiltration (288K)
  - Friday AM: Normal + Botnet (191K), Friday PM: DDoS + PortScan (512K)
- **Action:** Load all 8 files, sample 150K stratified

### 3.3 DATASETS TO SOURCE EXTERNALLY (if time permits)

| Dataset | Why Needed | Rows Needed | Where to Get |
|---------|-----------|-------------|--------------|
| **Real Windows Event Logs** | Replace synthetic EVTX normals | 10K+ normal events | `windows-itpro-docs` Microsoft samples, or generate from a clean VM with `wevtutil` |
| **SMTP/Email traffic** | Eliminate SMTP false positive | 5K normal + 2K attacks | CIRA-CIC SMTP dataset, or Enron email headers |
| **FTP traffic** | Cover missing protocol | 3K+ | NSL-KDD already has FTP — extract and upweight |
| **Larger syslog corpus** | Replace tiny Loghub Linux (2K) | 20K+ | Loghub full datasets (HDFS 11M, Hadoop 11M, etc.) or generate from live systems |

---

## 4. MODEL TRAINING IMPROVEMENTS

### 4.1 LIGHTGBM IMPROVEMENTS

#### A. Remove 10K Per-Class Cap
The CSIC loader caps both normal and attack to 10,000 rows each (lines 360-363). This discards 21K useful HTTP rows.

**Change:**
```python
# retrain_all.py lines 360-363: increase or remove caps
if len(df_n) > 30000:
    df_n = df_n.sample(n=30000, random_state=42)
if len(df_a) > 30000:
    df_a = df_a.sample(n=30000, random_state=42)
```

#### B. Add K-Fold Cross-Validation
Replace single 80/20 split with 5-fold stratified CV for reliable metrics:
```python
from sklearn.model_selection import StratifiedKFold
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
# Train on each fold, report mean ± std F1/AUC
```

#### C. Per-Dataset Sample Weights
Small datasets (Loghub 2K, EVTX 9K) get drowned by large ones (CICIDS 150K). Add sample weights:
```python
# Weight inversely proportional to dataset size
dataset_sizes = df.groupby('source_dataset').size()
df['sample_weight'] = df['source_dataset'].map(1.0 / dataset_sizes)
df['sample_weight'] /= df['sample_weight'].sum()  # normalize
# Pass to LightGBM:
train_data = lgb.Dataset(X_train, label=y_train, weight=weights_train)
```

#### D. Tune Hyperparameters with Optuna
Current hyperparameters are manually set. Use automated search:
```python
import optuna
def objective(trial):
    params = {
        'num_leaves': trial.suggest_int('num_leaves', 20, 63),
        'max_depth': trial.suggest_int('max_depth', 4, 10),
        'learning_rate': trial.suggest_float('lr', 0.01, 0.1, log=True),
        'min_child_samples': trial.suggest_int('min_child', 20, 100),
        'reg_lambda': trial.suggest_float('reg_lambda', 1.0, 10.0),
        'colsample_bytree': trial.suggest_float('colsample', 0.6, 0.9),
        'subsample': trial.suggest_float('subsample', 0.6, 0.9),
    }
    # 5-fold CV, return mean F1
study = optuna.create_study(direction='maximize')
study.optimize(objective, n_trials=50)
```

#### E. Feature Engineering
Add derived features to improve discrimination:
```python
# Byte ratio: asymmetric traffic indicator
byte_ratio = src_bytes / (dst_bytes + 1)

# Packets-per-second: activity intensity
pps = count / (duration_sec + 0.001)

# Port category: well-known (0-1023), registered (1024-49151), ephemeral (49152+)
port_category = np.where(dst_port <= 1023, 0, np.where(dst_port <= 49151, 1, 2))

# Time-of-day risk: business hours vs off-hours
is_business_hours = ((hour_of_day >= 8) & (hour_of_day <= 18) & (day_of_week < 5)).astype(float)

# Entropy proxy (for DNS): high entropy domain names indicate tunneling
# (already available in CIC-Bell-DNS-EXFil as 'entropy' column)
```

### 4.2 EIF IMPROVEMENTS

#### A. Increase Normal Training Samples
Current: 66,889 normal samples. Target: **200,000+** after dataset expansion.

More diverse normals = tighter normal envelope = better anomaly discrimination.

#### B. Increase Tree Count
```python
# Current: ntrees=300, sample_size=256
# Improved:
eif = iForest(X_normal, ntrees=500, sample_size=512, ExtensionLevel=1)
```
More trees = more stable isolation boundaries. `sample_size=512` captures more structure.

#### C. Per-Source-Type EIF Models
Train separate EIF models for each source type instead of one combined model:
```python
eif_models = {}
for source_type in [1, 2, 5, 8, 9]:  # syslog, windows, dns, web, netflow
    normal_src = normal_df[normal_df['source_type_numeric'] == source_type]
    eif_models[source_type] = iForest(normal_src[FEATURE_COLS].values, 
                                       ntrees=300, sample_size=256, ExtensionLevel=1)
```
**Why:** A single EIF struggles because "normal" syslog looks completely different from "normal" netflow. Per-source models have tighter boundaries.

#### D. Improve Calibration
Current z-score + sigmoid calibration has weak discrimination. Use percentile-based calibration:
```python
# Instead of z = (raw - mean) / std → sigmoid
# Use percentile mapping:
percentiles = np.percentile(raw_normal, np.arange(0, 101))
# Map raw score to 0-1 based on where it falls in the normal distribution
score = np.searchsorted(percentiles, raw_score) / 100.0
```

### 4.3 ARF IMPROVEMENTS

#### A. Increase Stream CSV Size
Current: 15,000 rows. Target: **50,000 rows** for richer cold-start replay.
```python
# retrain_all.py line 922
MAX_ROWS = 50000
```

#### B. Increase Model Count
```python
# Current: n_models=10
# Improved:
arf = ARFClassifier(
    n_models=25,                    # more ensemble members
    drift_detector=ADWIN(delta=0.001),  # more sensitive drift detection
    warning_detector=ADWIN(delta=0.005),
    seed=42,
)
```

#### C. Class Weighting
ARF sees balanced data (50/50 normal/attack) but production is heavily skewed normal. Apply class weights:
```python
# During learn_one, replay attack samples 3x to prevent drift toward "always normal"
```

---

## 5. ARCHITECTURE IMPROVEMENTS

### 5.1 SCORE FUSION ENHANCEMENTS

#### A. EIF Anomaly Override (DONE ✅)
Already implemented: when EIF ≥ 0.65, enforce combined score floor of 0.45.

#### B. Model Disagreement Escalation
When LightGBM says "safe" but EIF says "anomalous" (std_dev ≥ 0.30), always escalate:
```python
# Already partially implemented, but strengthen:
if eif_score >= 0.60 and lgbm_score < 0.30:
    action = "escalate"  # EIF-only anomaly, LightGBM never saw this pattern
    reason = "novel_anomaly_eif_only"
```

#### C. Dynamic Threshold Per Source Type
Different source types have different baseline risk levels:
```python
SOURCE_THRESHOLDS = {
    1: (0.35, 0.65),  # syslog: lower threshold (auth failures common)
    2: (0.45, 0.75),  # windows: higher threshold (noisy baseline)
    5: (0.30, 0.60),  # dns: lower threshold (DNS tunneling is subtle)
    8: (0.40, 0.70),  # web: standard
    9: (0.40, 0.70),  # netflow: standard
}
```

### 5.2 FEATURE PIPELINE IMPROVEMENTS

#### A. Real Template Rarity from Drain3
Currently `template_rarity` is approximated during training. In production, Drain3 computes real rarity. Ensure training data uses similar distribution.

#### B. Connection Tracking Features
`ConnectionTracker` in `feature_extractor.py` computes real-time `same_srv_rate`, `diff_srv_rate`, etc. Training data should reflect similar distributions.

---

## 6. STEP-BY-STEP RETRAINING PLAN

### PHASE 1: EXPAND DATASETS (~30 minutes coding)

1. **Add DNS loader** (`load_dns_exfil`) in `retrain_all.py`
   - Load `CSV_benign.csv` (sample 20K), `CSV_phishing.csv` (all 5K), `CSV_malware.csv` (all 5K), `CSV_spam.csv` (all 4K)
   - Map: `source_type_numeric=5`, `protocol=17`, `dst_port=53`
   - Map `entropy` → `template_rarity` (inverted: high entropy = rare)
   - Map DNS query length → `src_bytes`, response length → `dst_bytes`

2. **Expand CICIDS loader** to use ALL 8 daily CSVs
   - Load all files matching `CICIDS2017/*.pcap_ISCX.csv`
   - Combine into one DataFrame (~2.8M rows)
   - Stratified sample: 150K rows balanced by `Label` column

3. **Expand UNSW loader** to use full `UNSW-NB15_1.csv`
   - Load 700K rows, sample 100K stratified by attack category

4. **Expand NF-ToN-IoT loader** to sample 100K from 27.5M
   - Read in chunks (50MB at a time), stratified sample
   - This is the **single biggest accuracy improvement** (63.5% → expected 85%+)

5. **Remove CSIC 10K cap** — use all 61K rows
   - Change `n=10000` to `n=30000` on lines 360-363

6. **Add loaders to the pipeline:**
   ```python
   loaders = [
       load_cicids2017, load_nsl_kdd, load_unsw_nb15,
       load_nf_unsw, load_ton_iot, load_csic2010,
       load_evtx, load_loghub_linux, load_loghub_apache,
       load_dns_exfil,  # NEW
   ]
   ```

### PHASE 2: ADD SAMPLE WEIGHTS (~10 minutes)

7. Compute per-dataset sample weights (inverse frequency)
8. Pass weights to LightGBM `Dataset()`

### PHASE 3: ADD DERIVED FEATURES (~20 minutes)

9. Add `byte_ratio`, `pps`, `port_category`, `is_business_hours` to feature extraction
10. Update `FEATURE_COLS` from 20 → 24 features
11. Update `feature_extractor.py` to compute same features in production

### PHASE 4: RETRAIN ALL MODELS (~15 minutes runtime)

12. Run `python scripts/retrain_all.py`
    - Expected: ~500K+ total rows
    - LightGBM: ~5 minutes with GPU
    - EIF: ~3 minutes with 150K+ normals
    - ARF: ~5 minutes with 50K stream

### PHASE 5: VALIDATE (~5 minutes)

13. Run `python scripts/validate_v2_models.py` — known attack scenarios
14. Run `python scripts/test_anomaly_detection.py` — novel anomaly test
15. Check per-dataset metrics — all should be >85% detection, <10% FPR
16. Verify SMTP false positive is eliminated (with DNS training data)

### PHASE 6: DEPLOY (~5 minutes)

17. Copy models to Docker volume
18. Restart triage-agent container
19. Verify health endpoint

---

## 7. EXPECTED RESULTS AFTER IMPROVEMENTS

### Target Dataset Size
| Dataset | Current | After | Change |
|---------|---------|-------|--------|
| CICIDS2017 | 30K | 150K | +120K |
| NSL-KDD | 24K | 24K | — |
| UNSW-NB15 | 20K | 100K | +80K |
| NF-UNSW | 12K | 50K | +38K |
| NF-ToN-IoT | 11K | 100K | +89K |
| CSIC 2010 | 20K | 50K | +30K |
| EVTX | 9K | 9K | — |
| Loghub Linux | 2K | 2K | — |
| Loghub Apache | 2K | 2K | — |
| **DNS (NEW)** | **0** | **34K** | **+34K** |
| **TOTAL** | **131K** | **~521K** | **+390K (4x)** |

### Target Performance

| Metric | Current | Target | How |
|--------|---------|--------|-----|
| Overall F1 | 0.9593 | **≥ 0.97** | More data + sample weights |
| NF-ToN-IoT detection | 63.5% | **≥ 85%** | 100K samples instead of 11K |
| CSIC FPR | 20.75% | **≤ 8%** | All 61K rows + richer features |
| SMTP FP | 0.959 score | **< 0.40** | DNS dataset fills protocol gap |
| EIF discrimination delta | 0.066 | **≥ 0.15** | More normals + per-source EIF |
| Novel anomaly detection | 15/15 | **15/15** | Maintain with EIF override |
| Normal false positive rate | 4/5 (80%) | **5/5 (100%)** | DNS training eliminates SMTP FP |

### Priority Order (Highest Impact First)

1. 🔴 **Add DNS dataset** — eliminates biggest blind spot, fixes SMTP FP
2. 🔴 **Expand NF-ToN-IoT to 100K** — fixes worst detection rate (63.5%)
3. 🟠 **Expand CICIDS to 150K** — major diversity improvement
4. 🟠 **Expand UNSW to 100K** — more attack pattern variety
5. 🟡 **Remove CSIC cap** — fixes 20.75% FPR
6. 🟡 **Add sample weights** — prevents large datasets drowning small ones
7. 🟢 **Add derived features** — incremental accuracy improvement
8. 🟢 **Optuna hyperparameter tuning** — 1-3% F1 improvement
9. 🟢 **Per-source EIF** — better anomaly discrimination
10. 🟢 **K-fold cross-validation** — more reliable metrics

---

## SUMMARY

The triage agent is **functional and detects 100% of novel anomalies** with the EIF override, but has 3 critical gaps:

1. **Massive undersampling** — using 0.4% of available data (131K out of 31M)
2. **Missing DNS protocol** — 514K DNS rows exist in the zip but are not loaded
3. **NF-ToN-IoT at 63.5%** — only 11K samples from a 27.5M row dataset

Implementing improvements #1-5 from the priority list (expand datasets + add DNS) would take **~1 hour of coding + 15 minutes retraining** and is expected to push F1 from 0.9593 to **≥ 0.97** while eliminating false positives on normal SMTP/DNS traffic.
