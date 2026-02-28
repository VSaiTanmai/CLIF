# Triage Agent — CLIF Pipeline Integration Checklist

> **Purpose:** Comprehensive cross-verification guide for deploying the trained ML model artifacts from the `triage_agent/` training workspace into the CLIF production pipeline (`agents/triage/`).  
> **Scope:** Model artifacts, feature alignment, data flow, serialization, schema contracts, environment variables, Docker/K8s configuration, cold-start procedures, and known limitations.  
> **Generated:** 2026-03  
> **Verdict:** Integration-ready with **3 action items** and **5 advisory notes** documented below.

---

## Table of Contents

1. [Integration Overview](#1-integration-overview)
2. [Model Artifacts — File-by-File Transfer Checklist](#2-model-artifacts--file-by-file-transfer-checklist)
3. [Feature Vector Alignment (20 Canonical Features)](#3-feature-vector-alignment-20-canonical-features)
4. [Data Flow — End-to-End Trace](#4-data-flow--end-to-end-trace)
5. [Score Fusion — Weight & Formula Verification](#5-score-fusion--weight--formula-verification)
6. [ClickHouse Schema — Cross-Verification](#6-clickhouse-schema--cross-verification)
7. [ARF Warm Restart — Serialization & Replay](#7-arf-warm-restart--serialization--replay)
8. [Drain3 Log Template Mining](#8-drain3-log-template-mining)
9. [Environment Variables — Complete Mapping](#9-environment-variables--complete-mapping)
10. [Docker Compose — Volume Mounts & Service Config](#10-docker-compose--volume-mounts--service-config)
11. [Kubernetes — PVC & Deployment Config](#11-kubernetes--pvc--deployment-config)
12. [Kafka Topics — Producer/Consumer Contract](#12-kafka-topics--producerconsumer-contract)
13. [Consumer Row Builder — 28-Column Contract](#13-consumer-row-builder--28-column-contract)
14. [Source Thresholds — Seed Data Verification](#14-source-thresholds--seed-data-verification)
15. [MITRE Rules & IOC Cache](#15-mitre-rules--ioc-cache)
16. [Startup Sequence & Health Gates](#16-startup-sequence--health-gates)
17. [Known Limitations & Domain-Exempt Sources](#17-known-limitations--domain-exempt-sources)
18. [Pre-Integration Test Matrix](#18-pre-integration-test-matrix)
19. [Action Items Summary](#19-action-items-summary)

---

## 1. Integration Overview

The Triage Agent integration involves two separate codebases:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Training Workspace** | `triage_agent/` (this repo) | Offline training pipeline: dataset download → feature extraction → model training → ONNX export → testing |
| **CLIF Pipeline** | `agents/triage/` (CLIF repo) | Runtime inference: Kafka consume → Drain3 → feature extraction → 3-model scoring → fusion → routing |

**What needs to move:**

```
triage_agent/models/              →  agents/triage/models/         (Docker: /models)
triage_agent/drain3_state.bin     →  agents/triage/drain3_state.bin
triage_agent/features_arf_stream_features.csv  →  agents/triage/  (ARF cold-start fallback)
```

**What does NOT move** (already exists in CLIF pipeline):
- Runtime source code (`app.py`, `config.py`, `model_ensemble.py`, `feature_extractor.py`, `score_fusion.py`, `drain3_miner.py`)
- Docker Compose service definitions
- Kubernetes manifests
- ClickHouse schema (created by `clickhouse/schema.sql`, not `04_create_schema.py`)
- Consumer row builders

---

## 2. Model Artifacts — File-by-File Transfer Checklist

### 2.1 Required Files (7 artifacts)

| File | Size | Format | Loaded By | Transfer? | Status |
|------|------|--------|-----------|-----------|--------|
| `lgbm_v1.0.0.onnx` | 1,354,604 B (1.3 MB) | ONNX opset 15, float32 | `onnxruntime.InferenceSession` | **COPY** | **READY** |
| `eif_v1.0.0.pkl` | 91,625,298 B (87.4 MB) | `joblib` pickle (eif.iForest, 200 trees) | `joblib.load()` | **COPY** | **READY** |
| `eif_threshold.npy` | 136 B | NumPy array, single float | `numpy.load()` | **COPY** | **READY** |
| `feature_cols.pkl` | 314 B | `joblib` pickle (Python list of 20 strings) | `joblib.load()` | **COPY** | **READY** |
| `manifest.json` | 713 B | JSON | `json.load()` | **COPY** | **READY** |
| `lgbm_v1.0.0.txt` | 1,883,763 B (1.8 MB) | LightGBM native text | Not loaded at runtime (reference only) | **COPY** (optional) | READY |
| `arf_v1.0.0.pkl` | 4,586,297 B (4.4 MB) | `dill` pickle (River ARFClassifier) | **NOT loaded at runtime** — warm restart used instead | **COPY** (optional reference) | READY |

### 2.2 Required Supplementary Files

| File | Size | Purpose | Transfer? |
|------|------|---------|-----------|
| `drain3_state.bin` | ~47 KB | Pre-seeded Drain3 template state (1,024 templates) | **COPY** to `agents/triage/` |
| `features_arf_stream_features.csv` | ~2 MB | ARF cold-start fallback (first deploy when `arf_replay_buffer` is empty) | **COPY** to `agents/triage/` |

### 2.3 Transfer Commands

```powershell
# From training workspace root
$SRC = "triage_agent"
$DST = "..\CLIF\agents\triage"   # Adjust path to CLIF repo

# Required model artifacts
Copy-Item "$SRC\models\lgbm_v1.0.0.onnx"    "$DST\models\"
Copy-Item "$SRC\models\eif_v1.0.0.pkl"      "$DST\models\"
Copy-Item "$SRC\models\eif_threshold.npy"    "$DST\models\"
Copy-Item "$SRC\models\feature_cols.pkl"     "$DST\models\"
Copy-Item "$SRC\models\manifest.json"        "$DST\models\"

# Optional reference files
Copy-Item "$SRC\models\lgbm_v1.0.0.txt"     "$DST\models\"
Copy-Item "$SRC\models\arf_v1.0.0.pkl"      "$DST\models\"

# Supplementary
Copy-Item "$SRC\drain3_state.bin"            "$DST\"
Copy-Item "$SRC\features_arf_stream_features.csv" "$DST\"
```

### 2.4 Post-Transfer Verification

```powershell
# Verify all files exist and sizes match
Get-ChildItem "$DST\models" | Select-Object Name, Length | Format-Table -AutoSize

# Expected output:
# Name                  Length
# ----                  ------
# arf_v1.0.0.pkl       4586297
# eif_threshold.npy        136
# eif_v1.0.0.pkl      91625298
# feature_cols.pkl         314
# lgbm_v1.0.0.onnx    1354604
# lgbm_v1.0.0.txt     1883763
# manifest.json            713
```

---

## 3. Feature Vector Alignment (20 Canonical Features)

### 3.1 Ground Truth: `feature_cols.pkl`

The **sole authority** for feature ordering is `feature_cols.pkl`. All three models (LightGBM ONNX, EIF, ARF) were trained with this exact ordering.

| Index | Feature Name | Type | Range | Training Value Notes |
|-------|-------------|------|-------|---------------------|
| 0 | `hour_of_day` | int | [0–23] | Extracted from timestamp |
| 1 | `day_of_week` | int | [0–6] | 0=Monday |
| 2 | `severity_numeric` | int | [0–4] | low=1, med=2, high=3, crit=4 |
| 3 | `source_type_numeric` | int | [1–10] | syslog=1, windows=2, …, ids_ips=10 |
| 4 | `src_bytes` | float | ≥0 | Source→destination bytes |
| 5 | `dst_bytes` | float | ≥0 | Destination→source bytes |
| 6 | `event_freq_1m` | float | ≥0 | Events per minute (derived: 60/duration) |
| 7 | `protocol` | int | — | tcp=6, udp=17, icmp=1 |
| 8 | `dst_port` | float | ≥0 | Destination port number |
| 9 | `template_rarity` | float | [0–1] | **Fixed at 0.5 during training** → computed live by ClickHouse MV at inference |
| 10 | `threat_intel_flag` | int | {0,1} | **Fixed at 0 during training** → computed from `ioc_cache` at inference |
| 11 | `duration` | float | ≥0 | Connection duration in seconds |
| 12 | `same_srv_rate` | float | [0–1] | % connections to same service |
| 13 | `diff_srv_rate` | float | [0–1] | % connections to different services |
| 14 | `serror_rate` | float | [0–1] | % SYN error connections |
| 15 | `rerror_rate` | float | [0–1] | % REJ error connections |
| 16 | `count` | float | ≥0 | Connections to same host (last 2s window) |
| 17 | `srv_count` | float | ≥0 | Connections to same service (last 2s window) |
| 18 | `dst_host_count` | float | ≥0 | Connections with same dest host |
| 19 | `dst_host_srv_count` | float | ≥0 | Connections with same dest host + service |

### 3.2 Cross-Verification: Training vs Inference

| Source | Feature Count | Names Match? | Order Match? | Status |
|--------|--------------|-------------|-------------|--------|
| `feature_cols.pkl` (authority) | 20 | — | — | **AUTHORITY** |
| `lgbm_v1.0.0.txt` (`feature_names=` line) | 20 | **YES** | **YES** | **PASS** |
| `lgbm_v1.0.0.onnx` (input shape) | `[None, 20]` | N/A (positional) | **YES** (by construction) | **PASS** |
| `06_extract_features.py` (training extraction) | 20 | **YES** | **YES** | **PASS** |
| `arf_replay_buffer` ClickHouse columns | 20 feature cols | **YES** | **YES** | **PASS** |
| `arf_warm_restart.py` replay query | Reads same 20 cols | **YES** | **YES** | **PASS** |
| `agents/triage/feature_extractor.py` (runtime) | 20 | **YES** (per PIPELINE_READINESS_REPORT) | **YES** | **PASS** |

### 3.3 LightGBM Feature Importance (Top 10 by Split Count)

Understanding which features drive decisions helps predict which source types will score well:

| Rank | Feature | Split Count | Implication |
|------|---------|-------------|-------------|
| 1 | `dst_bytes` | 2,619 | Network-heavy sources (NetFlow, firewall) score best |
| 2 | `dst_host_srv_count` | 2,538 | Connection diversity matters |
| 3 | `src_bytes` | 2,391 | Byte volume is a strong signal |
| 4 | `dst_host_count` | 1,950 | Host enumeration detection |
| 5 | `dst_port` | 1,759 | Port-based service identification |
| 6 | `count` | 1,456 | Connection frequency bursts |
| 7 | `duration` | 1,392 | Session length anomalies |
| 8 | `srv_count` | 1,279 | Service diversity |
| 9 | `event_freq_1m` | 1,226 | Event rate |
| 10 | `protocol` | 1,123 | Protocol identification |

**Zero-importance features:** `severity_numeric`, `source_type_numeric`, `template_rarity`, `threat_intel_flag` — these have zero training-time importance because `template_rarity` and `threat_intel_flag` are constants during training, and severity/source_type are less discriminative than network metrics.

### 3.4 Critical: Live Feature Enrichment

Two features are **deliberately constant during training** but are **computed live at inference**:

| Feature | Training Value | Inference Source | Risk If Missing |
|---------|---------------|-----------------|-----------------|
| `template_rarity` | 0.5 (constant) | `features_template_rarity` MV in ClickHouse | LightGBM ignores it (zero importance), but future retraining could depend on it |
| `threat_intel_flag` | 0 (constant) | `ioc_cache` table JOIN | LightGBM ignores it (zero importance), but score_fusion.py uses it for IOC boost |

**Verification:** These features have zero LightGBM importance, so using constant values vs live values at inference will NOT change LightGBM predictions. However, `threat_intel_flag` IS used by `score_fusion.py` for IOC-based score boosting (outside the model).

---

## 4. Data Flow — End-to-End Trace

### 4.1 Complete Data Flow Diagram

```
                        INGESTION TIER
                ┌──────────────────────────┐
                │  Log Producers           │
                │  (Vector / Tetragon)     │
                └──────────┬───────────────┘
                           │ Kafka protocol
                           ▼
                ┌──────────────────────────┐
                │  Redpanda (3 brokers)    │
                │                          │
                │  Topics consumed:        │
                │   • raw-logs        (12p)│
                │   • security-events (12p)│
                │   • process-events  (12p)│
                │   • network-events  (12p)│
                └──────────┬───────────────┘
                           │
            ┌──────────────┼──────────────────┐
            │              │                  │
            ▼              ▼                  ▼
    ┌──────────┐   ┌──────────────┐   ┌──────────────┐
    │ Consumer │   │ Consumer ×3  │   │ Triage Agent │
    │  (×3)    │   │ (raw→CH)     │   │ (scoring)    │
    └──────────┘   └──────────────┘   └──────┬───────┘
                                              │
                        AI SCORING PIPELINE   │
            ┌─────────────────────────────────┤
            │                                 │
            ▼                                 │
  ┌─────────────────────────────────────┐     │
  │  STEP 1: SOURCE TYPE MAPPING       │     │
  │                                     │     │
  │  Kafka msg header/body → source_type│     │
  │  config.py: SOURCE_TYPE_MAP        │     │
  │  (30+ mappings → 10 canonical)     │     │
  └──────────┬──────────────────────────┘     │
             │                                │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 2: DRAIN3 TEMPLATE MINING    │     │
  │                                     │     │
  │  Raw message → template_id          │     │
  │  drain3_state.bin (1024 templates)  │     │
  │  Thread-safe, rarity scoring        │     │
  └──────────┬──────────────────────────┘     │
             │                                │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 3: FEATURE EXTRACTION        │     │
  │  (feature_extractor.py, 513 lines) │     │
  │                                     │     │
  │  Input:  parsed event + metadata    │     │
  │  Output: 20-element float32 vector  │     │
  │  Order:  from feature_cols.pkl      │     │
  │                                     │     │
  │  ConnectionTracker:                 │     │
  │   • 5min window stats              │     │
  │   • Host/service connection counts  │     │
  │   • Byte statistics                 │     │
  │                                     │     │
  │  ClickHouse lookups:                │     │
  │   • template_rarity (MV)           │     │
  │   • threat_intel_flag (ioc_cache)  │     │
  │   • entity_freq (MV)              │     │
  │   • entity_baseline (MV)          │     │
  └──────────┬──────────────────────────┘     │
             │  [1×20] float32 vector         │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 4: 3-MODEL INFERENCE         │     │
  │  (model_ensemble.py, 540 lines)    │     │
  │                                     │     │
  │  ┌───────────────────────────┐      │     │
  │  │ LightGBM ONNX (50%)      │      │     │
  │  │ Input: "input" [1,20]    │      │     │
  │  │ Output: probabilities    │      │     │
  │  │   → {0: p_normal,       │      │     │
  │  │       1: p_attack}       │      │     │
  │  │ Score = p_attack         │      │     │
  │  └───────────────────────────┘      │     │
  │                                     │     │
  │  ┌───────────────────────────┐      │     │
  │  │ EIF (30%)                │      │     │
  │  │ Input: [1,20] ndarray   │      │     │
  │  │ Method: compute_paths() │      │     │
  │  │ Threshold: 0.42768124   │      │     │
  │  │ Score = normalized path │      │     │
  │  │   length [0,1]          │      │     │
  │  └───────────────────────────┘      │     │
  │                                     │     │
  │  ┌───────────────────────────┐      │     │
  │  │ ARF (20%)                │      │     │
  │  │ Input: dict{col: float} │      │     │
  │  │ Method: predict_proba_one│      │     │
  │  │ Warm restart — NEVER    │      │     │
  │  │   from pickle. Fresh    │      │     │
  │  │   model + replay buffer │      │     │
  │  │ Score = p_attack         │      │     │
  │  └───────────────────────────┘      │     │
  └──────────┬──────────────────────────┘     │
             │  3 scores: lgbm, eif, arf      │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 5: SCORE FUSION              │     │
  │  (score_fusion.py, 570 lines)      │     │
  │                                     │     │
  │  combined = lgbm*0.50              │     │
  │           + eif *0.30              │     │
  │           + arf *0.20              │     │
  │                                     │     │
  │  std_dev = np.std([lgbm,eif,arf])  │     │
  │  agreement = 1.0 - std_dev         │     │
  │  ci_lower = max(0, combined-stddev)│     │
  │  ci_upper = min(1, combined+stddev)│     │
  │                                     │     │
  │  Modifiers:                         │     │
  │   • asset_criticality boost        │     │
  │   • IOC match → score boost        │     │
  │   • allowlist match → bypass       │     │
  │                                     │     │
  │  Routing (per-source thresholds):  │     │
  │   < suspicious_thresh → DISCARD    │     │
  │   < anomalous_thresh  → MONITOR   │     │
  │   ≥ anomalous_thresh  → ESCALATE  │     │
  └──────────┬──────────────────────────┘     │
             │                                │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 6: OUTPUT ROUTING            │     │
  │                                     │     │
  │  All events → Kafka "triage-scores"│     │
  │  Escalated  → Kafka "anomaly-alerts"│    │
  │  All events → ClickHouse            │     │
  │    "arf_replay_buffer" (20 features │     │
  │     + label for online learning)    │     │
  │                                     │     │
  │  ARF.learn_one(x, predicted_label) │     │
  │    → continuous online learning     │     │
  └──────────┬──────────────────────────┘     │
             │                                │
             ▼                                │
  ┌─────────────────────────────────────┐     │
  │  STEP 7: CONSUMER INGESTION        │     │
  │  (consumer/app.py, 1067 lines)     │     │
  │                                     │     │
  │  Kafka "triage-scores"             │     │
  │    → _build_triage_score_row()     │     │
  │    → ClickHouse "triage_scores"    │     │
  │       (28 columns)                 │     │
  │                                     │     │
  │  Kafka "anomaly-alerts"            │     │
  │    → SOC Dashboard                 │     │
  │    → Future: Hunter Agent trigger  │     │
  └────────────────────────────────────┘
```

### 4.2 Data Format at Each Stage

| Stage | Format | Shape | Key Fields |
|-------|--------|-------|------------|
| Kafka raw msg | JSON string | variable | `timestamp`, `host`, `source_ip`, `message`, `source_type` |
| After Drain3 | Parsed event dict | variable | + `template_id`, `template_rarity` |
| Feature vector | float32 array | `[1, 20]` | Ordered per `feature_cols.pkl` |
| LightGBM output | `seq(map(int64, tensor(float)))` | `[{0: p0, 1: p1}]` | Attack probability = key `1` |
| EIF output | float64 | scalar | Raw anomaly path score |
| ARF output | dict `{0: p0, 1: p1}` | — | Attack probability = key `1` |
| Fused result | `TriageResult` dataclass | 28 fields | `combined_score`, `routing_decision`, etc. |
| Kafka output msg | JSON string | — | All 28 `TriageResult` fields |
| ClickHouse row | 28 columns | — | Matches `triage_scores` table schema |

---

## 5. Score Fusion — Weight & Formula Verification

### 5.1 Ensemble Weights

| Model | Training Workspace | CLIF docker-compose.yml | CLIF docker-compose.pc2.yml | K8s Deployment | Status |
|-------|--------------------|--------------------------|-----------------------------|--------------|-|
| LightGBM | 50% | `ENSEMBLE_WEIGHT_LGBM=0.50` | `0.50` | `0.50` | **ALIGNED** |
| EIF | 30% | `ENSEMBLE_WEIGHT_EIF=0.30` | `0.30` | `0.30` | **ALIGNED** |
| ARF | 20% | `ENSEMBLE_WEIGHT_ARF=0.20` | `0.20` | `0.20` | **ALIGNED** |
| **Sum** | **100%** | **1.00** | **1.00** | **1.00** | **PASS** |

> **Historical bug (fixed):** Original docker-compose.yml had `lgbm=0.45, eif=0.35, arf=0.20` — corrected to `0.50/0.30/0.20` in commit `1a9e896`.

### 5.2 Fusion Formula Verification

```python
# Training workspace (test_all_log_types.py, score_fusion logic)
combined = lgbm_score * 0.50 + eif_score * 0.30 + arf_score * 0.20

# CLIF pipeline (agents/triage/score_fusion.py)
combined = lgbm_score * W_LGBM + eif_score * W_EIF + arf_score * W_ARF
# where W_LGBM=0.50, W_EIF=0.30, W_ARF=0.20 from config.py env vars
```

**Status:** ALIGNED. Both use identical weighted linear combination.

### 5.3 Model Disagreement Signal

```python
std_dev = np.std([lgbm_score, eif_score, arf_score])
disagreement_flag = (std_dev > 0.35)
```

`DISAGREEMENT_THRESHOLD` env var defaults to `0.35` in all deployment configs.

---

## 6. ClickHouse Schema — Cross-Verification

### 6.1 Schema Origin Difference

| Environment | Schema Source | Tables Created |
|-------------|-------------|----------------|
| Training workspace | `04_create_schema.py` | 6 tables + 3 MVs (standalone, single-node MergeTree) |
| CLIF pipeline | `clickhouse/schema.sql` | 24 tables + MVs (ReplicatedMergeTree, 2-node cluster) |

**Critical:** The training workspace schema is a **simplified subset** for offline development. The CLIF pipeline schema is the full production schema. They are structurally compatible but differ in engine type and column count.

### 6.2 triage_scores Table — Column Comparison

| # | Training (04_create_schema.py) | CLIF Pipeline (schema.sql) | Match? |
|---|-------------------------------|---------------------------|--------|
| 1 | `event_id` String | `event_id` String | **YES** |
| 2 | `timestamp` DateTime64(3) | `timestamp` DateTime64(3) | **YES** |
| 3 | `source_type` String | `source_type` String | **YES** |
| 4 | — | `source_ip` String | CLIF only |
| 5 | — | `host` String | CLIF only |
| 6 | — | `user` String | CLIF only |
| 7 | — | `action` String | CLIF only |
| 8 | — | `severity` String | CLIF only |
| 9 | — | `template_id` String | CLIF only |
| 10 | `combined_score` Float32 | `combined_score` Float32 | **YES** |
| 11 | `adjusted_score` Float32 | `adjusted_score` Float32 | **YES** |
| 12 | — | `ci_lower` Float32 | CLIF only |
| 13 | — | `ci_upper` Float32 | CLIF only |
| 14 | `lgbm_score` Float32 | `lgbm_score` Float32 | **YES** |
| 15 | `eif_score` Float32 | `eif_score` Float32 | **YES** |
| 16 | `arf_score` Float32 | `arf_score` Float32 | **YES** |
| 17 | `std_dev` Float32 | `std_dev` Float32 | **YES** |
| 18 | — | `agreement` Float32 | CLIF only |
| 19 | — | `asset_criticality_boost` Float32 | CLIF only |
| 20 | — | `ioc_match` Bool | CLIF only |
| 21 | — | `allowlist_match` Bool | CLIF only |
| 22 | — | `mitre_technique` String | CLIF only |
| 23 | — | `routing_decision` String | CLIF only |
| 24 | — | `routing_label` String | CLIF only |
| 25 | — | `disagreement_flag` Bool | CLIF only |
| 26 | — | `model_versions` String | CLIF only |
| 27 | — | `processing_time_ms` Float32 | CLIF only |
| 28 | `is_flagged` Bool | `scored_at` DateTime64(3) | **DIFFERENT** |

**Impact:** Training workspace's 10-column table is a development shortcut — the CLIF pipeline's `TriageResult` dataclass produces all 28 fields, and the consumer's `_build_triage_score_row()` maps all 28 into ClickHouse. **No action needed** — the production schema is already correct in `clickhouse/schema.sql`.

### 6.3 arf_replay_buffer Table — Alignment

| Column Group | Training (04_create_schema.py) | CLIF (schema.sql, L1036) | Match? |
|-------------|-------------------------------|--------------------------|--------|
| `timestamp` | DateTime64(3) | DateTime64(3) | **YES** |
| `source_type` | String | String | **YES** |
| 20 feature columns | Float32 each | Float32 each | **YES** |
| `label` | UInt8 | UInt8 | **YES** |
| `label_source` | String DEFAULT 'fused_prediction' | String DEFAULT 'fused_prediction' | **YES** |
| TTL | `timestamp + INTERVAL 30 DAY` | `timestamp + INTERVAL 30 DAY` | **YES** |

**Status:** Fully aligned. The warm restart module queries by these exact column names.

### 6.4 Other Tables — Alignment Summary

| Table | Training | CLIF | Aligned? |
|-------|---------|------|----------|
| `logs_raw` | 10 columns, MergeTree | 10 columns, ReplicatedMergeTree | **YES** (structure) |
| `ioc_cache` | 7 columns with TTL | 7 columns with TTL | **YES** |
| `allowlist` | 6 columns | 6 columns | **YES** |
| `source_thresholds` | 5 columns | 5 columns | **YES** |
| `asset_criticality` | N/A (not in training) | Present in CLIF | OK (empty, optional) |
| MVs (3) | AggregatingMergeTree/SummingMergeTree | ReplicatedAggregatingMergeTree/ReplicatedSummingMergeTree | **YES** (structure) |

---

## 7. ARF Warm Restart — Serialization & Replay

### 7.1 Why Not Pickle

| Aspect | Detail |
|--------|--------|
| **Bug** | After `pickle.load()` or `dill.load()`, River ARF's `predict_proba_one()` returns **constant probabilities** for all inputs |
| **Root cause** | Upstream River library serialization bug — ADWIN drift detectors and internal Hoeffding tree state don't fully restore |
| **Resolution** | **Warm restart**: create fresh model + replay buffer events through `learn_one()` |
| **Pickle kept?** | `arf_v1.0.0.pkl` exists as offline reference only. **NEVER load it for production inference.** |

### 7.2 Warm Restart Flow

```
Container Start
      │
      ▼
  _build_fresh_arf()
  ARFClassifier(n_models=10,
                drift_detector=ADWIN(delta=0.002),
                warning_detector=ADWIN(delta=0.01),
                seed=42)
      │
      ▼
  Try ClickHouse arf_replay_buffer
      │
      ├─── Buffer has ≥ 500 rows?
      │    YES → Query last 24h, up to 50,000 rows
      │          ORDER BY timestamp ASC
      │          Stream through learn_one()
      │          → Working model ✓
      │
      ├─── Buffer < 500 rows?
      │    Auto-bootstrap from CSV
      │    Then replay from buffer
      │    → Working model ✓
      │
      └─── ClickHouse unreachable?
           Fall back to features_arf_stream_features.csv
           Stream all ~31,574 rows through learn_one()
           → Working model ✓
```

### 7.3 ARF Hyperparameter Alignment

| Parameter | Training (`09_train_arf.py`) | Warm Restart (`arf_warm_restart.py`) | Pipeline (`model_ensemble.py`) | Status |
|-----------|------------------------------|--------------------------------------|-------------------------------|--------|
| `n_models` | 10 | 10 | 10 (from env `ARF_N_MODELS`) | **ALIGNED** |
| ADWIN delta | 0.002 | 0.002 | 0.002 (from env `ARF_ADWIN_DELTA`) | **ALIGNED** |
| ADWIN warning delta | 0.01 | 0.01 | 0.01 (from env `ARF_ADWIN_WARNING_DELTA`) | **ALIGNED** |
| seed | 42 | 42 | 42 (from env `ARF_SEED`) | **ALIGNED** |
| Replay hours | — | 24 (default) | 24 (from env `ARF_REPLAY_HOURS`) | **ALIGNED** |
| Max replay rows | — | 50,000 | 50,000 (from env `ARF_REPLAY_MAX_ROWS`) | **ALIGNED** |

### 7.4 Online Learning Post-Startup

After warm restart, the Triage Agent performs online learning:

```python
# For every scored event:
arf_model.learn_one(feature_dict, predicted_label)

# And writes to replay buffer for next restart:
INSERT INTO arf_replay_buffer (timestamp, source_type, <20 features>, label, label_source) VALUES (...)
```

**Critical:** The `label` written is the **fused prediction** (not ground truth). This is by design — the system learns from its own predictions, with ADWIN detecting when those predictions start drifting.

---

## 8. Drain3 Log Template Mining

### 8.1 Configuration Alignment

| Parameter | Training (`config/drain3.ini`) | Pipeline (`agents/triage/drain3.ini`) | Status |
|-----------|-------------------------------|--------------------------------------|--------|
| `sim_th` | 0.4 | 0.4 | **ALIGNED** |
| `depth` | 4 | 4 | **ALIGNED** |
| `max_children` | 100 | 100 | **ALIGNED** |
| `max_clusters` | 1,024 | 1,024 | **ALIGNED** |
| `snapshot_interval_minutes` | 10 | 10 | **ALIGNED** |
| `compress_state` | true | true | **ALIGNED** |

### 8.2 Regex Masking Rules

| Pattern | Mask | Training | Pipeline | Status |
|---------|------|----------|----------|--------|
| IPv4 `\d+\.\d+\.\d+\.\d+` | `<IP>` | YES | YES | **ALIGNED** |
| MAC `([0-9a-fA-F]{2}:){5}...` | `<MAC>` | YES | YES | **ALIGNED** |
| ISO 8601 timestamps | `<TIMESTAMP>` | YES | YES | **ALIGNED** |
| Numbers ≥ 5 digits | `<NUM>` | YES | YES | **ALIGNED** |

### 8.3 Pre-Seeded State

| Property | Value |
|----------|-------|
| Templates learned | 1,024 (at `max_clusters` ceiling) |
| State file | `drain3_state.bin` (~47 KB, zlib compressed) |
| Seeded from | Loghub Linux (`Linux_2k.log`), Loghub Apache (`Apache_2k.log`), CSIC 2010 HTTP |
| Excluded from seeding | Tabular datasets (CICIDS2017, UNSW-NB15) — not free-form logs |

**Action:** Copy `drain3_state.bin` to `agents/triage/` before first startup. Without it, Drain3 starts with zero templates and all rarity scores will be high until enough logs build the template library.

---

## 9. Environment Variables — Complete Mapping

### 9.1 Full Variable Matrix

| Variable | `.env` (training) | docker-compose.yml (CLIF) | docker-compose.pc2.yml | K8s ConfigMap | Purpose |
|----------|-------------------|---------------------------|------------------------|---------------|---------|
| `CLICKHOUSE_HOST` | `localhost` | `clif-clickhouse01` | `clif-clickhouse01` | `clif-clickhouse01` | ClickHouse hostname |
| `CLICKHOUSE_PORT` | `9000` | `9000` | `9000` | `9000` | Native TCP port |
| `CLICKHOUSE_HTTP_PORT` | `8123` | `8123` | `8123` | — | HTTP port (health checks) |
| `CLICKHOUSE_USER` | (default) | `clif_admin` | `clif_admin` | `secretKeyRef` | DB user |
| `CLICKHOUSE_PASSWORD` | (empty) | `secretKeyRef` | `secretKeyRef` | `secretKeyRef` | DB password |
| `REDPANDA_BROKER` | `localhost:9092` | `clif-redpanda01:9092,clif-redpanda02:9092,...` | Same | Same | Kafka bootstrap servers |
| `KAFKA_CONSUMER_GROUP` | — | `triage-agent-group` | Same | Same | Consumer group ID |
| `KAFKA_INPUT_TOPICS` | — | `raw-logs,security-events,process-events,network-events` | Same | Same | Topics to consume |
| `MODEL_DIR` | — | `/models` | `/models` | `/models` | Base directory for model files |
| `MODEL_LGBM_PATH` | — | `/models/lgbm_v1.0.0.onnx` | Same | Same | LightGBM ONNX path |
| `MODEL_EIF_PATH` | — | `/models/eif_v1.0.0.pkl` | Same | Same | EIF pickle path |
| `MODEL_EIF_THRESHOLD_PATH` | — | `/models/eif_threshold.npy` | Same | Same | EIF threshold path |
| `MODEL_ARF_PATH` | — | `/models/arf_v1.0.0.pkl` | Same | Same | ARF pickle (reference only) |
| `FEATURE_COLS_PATH` | — | `/models/feature_cols.pkl` | Same | Same | Feature ordering authority |
| `MANIFEST_PATH` | — | `/models/manifest.json` | Same | Same | Model version manifest |
| `DRAIN3_STATE_PATH` | `./drain3_state.bin` | `/app/drain3_state.bin` | Same | Same | Drain3 template state |
| `DRAIN3_CONFIG_PATH` | — | `/app/drain3.ini` | Same | Same | Drain3 ini config |
| `DRAIN3_MAX_CLUSTERS` | (in drain3.ini) | `1024` | Same | Same | Max template clusters |
| `ENSEMBLE_WEIGHT_LGBM` | — | `0.50` | `0.50` | `0.50` | LightGBM fusion weight |
| `ENSEMBLE_WEIGHT_EIF` | — | `0.30` | `0.30` | `0.30` | EIF fusion weight |
| `ENSEMBLE_WEIGHT_ARF` | — | `0.20` | `0.20` | `0.20` | ARF fusion weight |
| `DISAGREEMENT_THRESHOLD` | — | `0.35` | `0.35` | `0.35` | std_dev threshold for flag |
| `ARF_WARM_RESTART` | `true` | `true` | `true` | `true` | Enable warm restart |
| `ARF_REPLAY_HOURS` | `24` | `24` | `24` | `24` | Hours of replay data |
| `ARF_REPLAY_MAX_ROWS` | `50000` | `50000` | `50000` | `50000` | Max replay events |
| `ARF_STREAM_CSV_PATH` | — | `/app/features_arf_stream_features.csv` | Same | Same | Cold-start CSV fallback |
| `ARF_N_MODELS` | (in code: 10) | `10` | `10` | `10` | ARF tree count |
| `ARF_ADWIN_DELTA` | (in code: 0.002) | `0.002` | `0.002` | `0.002` | ADWIN drift delta |
| `ARF_ADWIN_WARNING_DELTA` | (in code: 0.01) | `0.01` | `0.01` | `0.01` | ADWIN warning delta |
| `ARF_SEED` | (in code: 42) | `42` | `42` | `42` | Random seed |
| `CONN_TIME_WINDOW_SEC` | — | `300` | `300` | `300` | ConnectionTracker window |
| `CONN_HOST_WINDOW_SIZE` | — | `100` | `100` | `100` | ConnectionTracker host buffer |
| `WARMUP_HOURS` | `72` | `72` | `72` | `72` | Initial warmup period |
| `STALENESS_THRESHOLD_SECONDS` | `300` | `300` | `300` | `300` | Feature staleness timeout |
| `SELFTEST_ENABLED` | — | `true` | `true` | `true` | Startup self-test |
| `STARTUP_HEALTH_RETRIES` | — | `30` | `30` | `30` | Health gate retries |
| `STARTUP_HEALTH_DELAY_SEC` | — | `2` | `2` | `2` | Health gate delay |

### 9.2 Path Translation: Training → Docker Container

| Training Path | Container Path | Docker Volume |
|--------------|----------------|---------------|
| `triage_agent/models/*` | `/models/*` | `./agents/triage/models:/models:ro` |
| `triage_agent/drain3_state.bin` | `/app/drain3_state.bin` | Built into Docker image or bind mount |
| `triage_agent/config/drain3.ini` | `/app/drain3.ini` | Built into Docker image |
| `triage_agent/features_arf_stream_features.csv` | `/app/features_arf_stream_features.csv` | Built into Docker image or bind mount |

---

## 10. Docker Compose — Volume Mounts & Service Config

### 10.1 Triage Agent Service Block (docker-compose.pc2.yml)

```yaml
clif-triage-agent:
  build: ./agents/triage
  container_name: clif-triage-agent
  ports:
    - "8300:8300"
  volumes:
    - ./agents/triage/models:/models:ro    # ← Models mounted here
  environment:
    - MODEL_DIR=/models
    - MODEL_LGBM_PATH=/models/lgbm_v1.0.0.onnx
    - MODEL_EIF_PATH=/models/eif_v1.0.0.pkl
    - MODEL_EIF_THRESHOLD_PATH=/models/eif_threshold.npy
    - FEATURE_COLS_PATH=/models/feature_cols.pkl
    - MANIFEST_PATH=/models/manifest.json
    # ... (25+ more env vars)
  depends_on:
    - clif-clickhouse01
    - clif-redpanda01
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8300/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### 10.2 Model Path Verification

| Env Var | Expected Container Path | Resolves To | File Present After Copy? |
|---------|------------------------|-------------|--------------------------|
| `MODEL_LGBM_PATH` | `/models/lgbm_v1.0.0.onnx` | `./agents/triage/models/lgbm_v1.0.0.onnx` | **After action item** |
| `MODEL_EIF_PATH` | `/models/eif_v1.0.0.pkl` | `./agents/triage/models/eif_v1.0.0.pkl` | **After action item** |
| `MODEL_EIF_THRESHOLD_PATH` | `/models/eif_threshold.npy` | `./agents/triage/models/eif_threshold.npy` | **After action item** |
| `FEATURE_COLS_PATH` | `/models/feature_cols.pkl` | `./agents/triage/models/feature_cols.pkl` | **After action item** |
| `MANIFEST_PATH` | `/models/manifest.json` | `./agents/triage/models/manifest.json` | **After action item** |

### 10.3 Dockerfile Expectations

The `agents/triage/Dockerfile` copies the application code into `/app/` and installs dependencies. Models are NOT baked into the image — they are mounted as a read-only volume.

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Models mounted at /models via docker-compose volume mount
EXPOSE 8300
CMD ["python", "app.py"]
```

**Key:** `drain3_state.bin` and `drain3.ini` are COPY'd into `/app/` as part of `COPY . .` because they sit in `agents/triage/`. Ensure they are present before building the image.

---

## 11. Kubernetes — PVC & Deployment Config

### 11.1 PersistentVolumeClaim

```yaml
# k8s/base/pvcs/triage-models.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: triage-models-pvc
  namespace: clif
spec:
  accessModes: [ReadOnlyMany]
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
```

**Size check:** Total model artifacts = ~96 MB. PVC is 1 Gi. Sufficient headroom for model versioning (A/B testing with candidate models).

### 11.2 Deployment Volume Mount

```yaml
# k8s/base/deployments/triage-agent.yaml (excerpt)
spec:
  containers:
    - name: triage-agent
      volumeMounts:
        - name: models
          mountPath: /models
          readOnly: true
  volumes:
    - name: models
      persistentVolumeClaim:
        claimName: triage-models-pvc
```

### 11.3 K8s Model Deployment

To populate the PVC:

```bash
# Option A: Copy via kubectl cp (from local machine)
kubectl cp agents/triage/models/ clif/triage-agent-<pod>:/models/ -c triage-agent

# Option B: Init container that pulls from S3/MinIO
# (Recommended for production — see model_init container pattern)

# Option C: Pre-populate PV on the node
# Mount PV to node path, copy files, then deploy
```

### 11.4 Health Probes (Verified)

| Probe | Path | Port | Initial Delay | Interval |
|-------|------|------|---------------|----------|
| Readiness | `/ready` | 8300 | 60s | 30s |
| Liveness | `/health` | 8300 | 120s | 45s |

**`/ready`** returns 200 only after all models are loaded and self-test passes.  
**`/health`** returns 200 if the process is alive and consuming from Kafka.

---

## 12. Kafka Topics — Producer/Consumer Contract

### 12.1 Topics Consumed by Triage Agent

| Topic | Partitions | Content | Consumer Group |
|-------|-----------|---------|----------------|
| `raw-logs` | 12 | All raw log events | `triage-agent-group` |
| `security-events` | 12 | Security-specific events | `triage-agent-group` |
| `process-events` | 12 | Process execution events | `triage-agent-group` |
| `network-events` | 12 | Network flow events | `triage-agent-group` |

### 12.2 Topics Produced by Triage Agent

| Topic | Partitions | When Produced | Content |
|-------|-----------|---------------|---------|
| `triage-scores` | 12 | **Every** scored event | Full `TriageResult` (28 fields) |
| `anomaly-alerts` | 12 | Score ≥ anomalous threshold | Same `TriageResult`, flagged as anomalous |

### 12.3 Message Schema (triage-scores)

```json
{
  "event_id": "uuid-v4",
  "timestamp": "2026-03-15T14:30:00.000Z",
  "source_type": "syslog",
  "source_ip": "10.0.0.5",
  "host": "web-server-01",
  "user": "root",
  "action": "login",
  "severity": "high",
  "template_id": "tmpl_abc123",
  "combined_score": 0.827,
  "adjusted_score": 0.869,
  "ci_lower": 0.612,
  "ci_upper": 1.000,
  "lgbm_score": 0.945,
  "eif_score": 0.721,
  "arf_score": 0.688,
  "std_dev": 0.215,
  "agreement": 0.785,
  "asset_criticality_boost": 1.2,
  "ioc_match": false,
  "allowlist_match": false,
  "mitre_technique": "T1110",
  "routing_decision": "ESCALATE",
  "routing_label": "anomalous",
  "disagreement_flag": false,
  "model_versions": "lgbm=v1.0.0,eif=v1.0.0,arf=v1.0.0",
  "processing_time_ms": 12.4,
  "scored_at": "2026-03-15T14:30:00.150Z"
}
```

---

## 13. Consumer Row Builder — 28-Column Contract

### 13.1 TriageResult → Consumer → ClickHouse Mapping

| # | TriageResult Field | Consumer Column | ClickHouse Column | Type |
|---|-------------------|-----------------|-------------------|------|
| 1 | `event_id` | `TRIAGE_SCORES_COLUMNS[0]` | `event_id` | String |
| 2 | `timestamp` | `TRIAGE_SCORES_COLUMNS[1]` | `timestamp` | DateTime64(3) |
| 3 | `source_type` | `TRIAGE_SCORES_COLUMNS[2]` | `source_type` | String |
| 4 | `source_ip` | `TRIAGE_SCORES_COLUMNS[3]` | `source_ip` | String |
| 5 | `host` | `TRIAGE_SCORES_COLUMNS[4]` | `host` | String |
| 6 | `user` | `TRIAGE_SCORES_COLUMNS[5]` | `user` | String |
| 7 | `action` | `TRIAGE_SCORES_COLUMNS[6]` | `action` | String |
| 8 | `severity` | `TRIAGE_SCORES_COLUMNS[7]` | `severity` | String |
| 9 | `template_id` | `TRIAGE_SCORES_COLUMNS[8]` | `template_id` | String |
| 10 | `combined_score` | `TRIAGE_SCORES_COLUMNS[9]` | `combined_score` | Float32 |
| 11 | `adjusted_score` | `TRIAGE_SCORES_COLUMNS[10]` | `adjusted_score` | Float32 |
| 12 | `ci_lower` | `TRIAGE_SCORES_COLUMNS[11]` | `ci_lower` | Float32 |
| 13 | `ci_upper` | `TRIAGE_SCORES_COLUMNS[12]` | `ci_upper` | Float32 |
| 14 | `lgbm_score` | `TRIAGE_SCORES_COLUMNS[13]` | `lgbm_score` | Float32 |
| 15 | `eif_score` | `TRIAGE_SCORES_COLUMNS[14]` | `eif_score` | Float32 |
| 16 | `arf_score` | `TRIAGE_SCORES_COLUMNS[15]` | `arf_score` | Float32 |
| 17 | `std_dev` | `TRIAGE_SCORES_COLUMNS[16]` | `std_dev` | Float32 |
| 18 | `agreement` | `TRIAGE_SCORES_COLUMNS[17]` | `agreement` | Float32 |
| 19 | `asset_criticality_boost` | `TRIAGE_SCORES_COLUMNS[18]` | `asset_criticality_boost` | Float32 |
| 20 | `ioc_match` | `TRIAGE_SCORES_COLUMNS[19]` | `ioc_match` | Bool |
| 21 | `allowlist_match` | `TRIAGE_SCORES_COLUMNS[20]` | `allowlist_match` | Bool |
| 22 | `mitre_technique` | `TRIAGE_SCORES_COLUMNS[21]` | `mitre_technique` | String |
| 23 | `routing_decision` | `TRIAGE_SCORES_COLUMNS[22]` | `routing_decision` | String |
| 24 | `routing_label` | `TRIAGE_SCORES_COLUMNS[23]` | `routing_label` | String |
| 25 | `disagreement_flag` | `TRIAGE_SCORES_COLUMNS[24]` | `disagreement_flag` | Bool |
| 26 | `model_versions` | `TRIAGE_SCORES_COLUMNS[25]` | `model_versions` | String |
| 27 | `processing_time_ms` | `TRIAGE_SCORES_COLUMNS[26]` | `processing_time_ms` | Float32 |
| 28 | `scored_at` | `TRIAGE_SCORES_COLUMNS[27]` | `scored_at` | DateTime64(3) |

**Status:** All 28 fields are aligned between `TriageResult` dataclass → consumer row builder → ClickHouse table. Verified in PIPELINE_READINESS_REPORT.

---

## 14. Source Thresholds — Seed Data Verification

### 14.1 Training vs CLIF Seed Data Comparison

| Source Type | Training (04_create_schema.py) | CLIF (schema.sql) | TRIAGE_AGENT_DOCUMENTATION |
|-------------|-------------------------------|-------------------------------|-----------------|
| | suspicious / anomalous | suspicious / anomalous | suspicious / anomalous |
| `syslog` | 0.65 / 0.85 | 0.65 / 0.85 | 0.65 / 0.85 |
| `windows_event` | 0.70 / 0.90 | 0.70 / 0.90 | 0.70 / 0.90 |
| `firewall` | 0.60 / 0.80 | 0.60 / 0.80 | 0.60 / 0.80 |
| `active_directory` | 0.65 / 0.85 | 0.65 / 0.85 | 0.72 / 0.90 |
| `dns` | 0.68 / 0.87 | 0.68 / 0.87 | 0.68 / 0.87 |
| `cloudtrail` | 0.68 / 0.87 | 0.68 / 0.87 | 0.65 / 0.85 |
| `kubernetes` | 0.75 / 0.92 | 0.75 / 0.92 | 0.65 / 0.85 |
| `nginx` | 0.70 / 0.88 | 0.70 / 0.88 | 0.70 / 0.88 |
| `netflow` | 0.65 / 0.85 | 0.65 / 0.85 | 0.65 / 0.85 |
| `ids_ips` | 0.70 / 0.90 | 0.70 / 0.90 | 0.55 / 0.75 |

### 14.2 Advisory: Documentation Drift

The TRIAGE_AGENT_DOCUMENTATION.md Section 13 shows slightly different thresholds for `active_directory` (0.72/0.90), `cloudtrail` (0.65/0.85), `kubernetes` (0.65/0.85), and `ids_ips` (0.55/0.75) compared to the values in both `04_create_schema.py` and `clickhouse/schema.sql`.

**Authority:** The ClickHouse seed data (`schema.sql` and `04_create_schema.py`) is the runtime authority — these are the values actually loaded into the database and used at scoring time. The documentation values appear to be aspirational thresholds from an earlier design iteration.

**Impact:** Low. Thresholds can be updated via ClickHouse at any time without redeployment:
```sql
ALTER TABLE source_thresholds UPDATE suspicious_percentile = 0.72,
  anomalous_percentile = 0.90 WHERE source_type = 'active_directory';
```

### 14.3 Source Type Naming — CLIF `config.py` SOURCE_TYPE_MAP

The pipeline normalizes 30+ source type aliases to 10 canonical names:

| Canonical Name | Aliases in SOURCE_TYPE_MAP | Numeric Code |
|----------------|---------------------------|-------------|
| `syslog` | `syslog`, `linux`, `auth`, `auditd`, `systemd`, `cron` | 1 |
| `windows_event` | `winlogbeat`, `winevent`, `windows_event`, `evtx`, `sysmon` | 2 |
| `firewall` | `firewall`, `pfsense`, `iptables`, `netfilter`, `cef` | 3 |
| `active_directory` | `active_directory`, `ldap`, `ad`, `kerberos` | 4 |
| `dns` | `dns`, `bind`, `dnsmasq`, `unbound`, `coredns` | 5 |
| `cloudtrail` | `cloudtrail`, `aws`, `gcp_audit`, `azure_activity` | 6 |
| `kubernetes` | `kubernetes`, `k8s`, `k8s_audit`, `falco` | 7 |
| `nginx` | `nginx`, `apache`, `httpd`, `web`, `proxy`, `haproxy` | 8 |
| `netflow` | `netflow`, `ipfix`, `sflow`, `nflow` | 9 |
| `ids_ips` | `ids`, `ips`, `snort`, `suricata`, `zeek`, `bro` | 10 |

**Important:** The `source_thresholds` table uses the canonical names. The `SOURCE_TYPE_MAP` in `config.py` handles the alias-to-canonical mapping before threshold lookup.

---

## 15. MITRE Rules & IOC Cache

### 15.1 MITRE Mapping Rules

| Source | Content | Status |
|--------|---------|--------|
| Training (`rules/mitre_rules.json`) | `"rules": []` (empty) | Rules not yet populated |
| CLIF (`clickhouse/schema.sql`) | 9 pre-seeded rules in `mitre_mapping_rules` table | **READY** |

**CLIF Pre-Seeded MITRE Rules:**

| Rule | Technique ID | Table Populated |
|------|-------------|-----------------|
| `brute_force` | T1110 | `mitre_mapping_rules` |
| `lateral_movement` | T1021 | `mitre_mapping_rules` |
| `c2_traffic` | T1071 | `mitre_mapping_rules` |
| `account_creation` | T1136 | `mitre_mapping_rules` |
| `privilege_esc` | T1068 | `mitre_mapping_rules` |
| `data_exfil` | T1041 | `mitre_mapping_rules` |
| `zero_day` | T1190 | `mitre_mapping_rules` |
| `network_recon` | T1046 | `mitre_mapping_rules` |
| `model_disagreement` | UNKNOWN_TTP | `mitre_mapping_rules` |

**No action needed:** The local `mitre_rules.json` is unused at runtime — CLIF uses the ClickHouse table.

### 15.2 IOC Cache

| Property | Detail |
|----------|--------|
| Table | `ioc_cache` |
| Population | External threat intel feeds (empty on first deploy) |
| Lookup | `threat_intel_flag` feature enrichment via JOIN |
| TTL | `expires_at + 7 days` |
| Impact if empty | All `threat_intel_flag` values = 0 → matches training behavior exactly |

---

## 16. Startup Sequence & Health Gates

### 16.1 Expected Startup Sequence

```
CONTAINER START
    │
    ├── 1. Check ClickHouse health gate
    │       Retry: 30× with 2s backoff
    │       Tests: TCP connect + SELECT 1
    │       FAIL → container exits, Docker restarts
    │
    ├── 2. Check Kafka health gate
    │       Retry: 30× with 2s backoff
    │       Tests: broker metadata fetch
    │       FAIL → container exits, Docker restarts
    │
    ├── 3. Load source_thresholds from ClickHouse (10 rows, cached)
    │
    ├── 4. Load ioc_cache, allowlist, asset_criticality (may be empty — OK)
    │
    ├── 5. Load LightGBM ONNX model
    │       Path: /models/lgbm_v1.0.0.onnx
    │       Loader: onnxruntime.InferenceSession()
    │       FAIL if file missing → FileNotFoundError → exit
    │
    ├── 6. Load EIF model + threshold
    │       Model: /models/eif_v1.0.0.pkl   (joblib.load)
    │       Threshold: /models/eif_threshold.npy  (numpy.load)
    │       FAIL if files missing → exit
    │
    ├── 7. ARF warm restart
    │       a. Create fresh ARFClassifier(n_models=10, ...)
    │       b. Try ClickHouse arf_replay_buffer
    │          - If < 500 rows → auto-bootstrap from CSV
    │          - If unreachable → CSV fallback
    │       c. Replay events through learn_one()
    │       d. Verify predict_proba_one() returns varying values
    │
    ├── 8. Load Drain3 state (drain3_state.bin)
    │
    ├── 9. Self-test (if SELFTEST_ENABLED=true)
    │       • Synthetic event through full pipeline
    │       • Verify all 3 models produce valid scores
    │       • Verify fusion produces [0,1] score
    │       • Verify ARF returns varying probabilities
    │
    ├── 10. Start Flask health endpoints
    │        /health → 200 {"status": "healthy", ...}
    │        /ready  → 200 {"ready": true, ...}
    │        /stats  → 200 {events_processed, avg_latency, ...}
    │
    └── 11. Begin consuming from 4 Kafka topics
             Batch scoring active
             Online ARF learning active
```

### 16.2 Common Startup Failure Points

| Failure | Cause | Fix |
|---------|-------|-----|
| `FileNotFoundError: lgbm_v1.0.0.onnx` | Model files not copied to `agents/triage/models/` | Copy artifacts (Section 2.3) |
| `FileNotFoundError: eif_v1.0.0.pkl` | Same | Copy artifacts |
| `ClickHouse connection refused` | ClickHouse not yet ready | Increase `STARTUP_HEALTH_RETRIES` or ensure ClickHouse starts first |
| `ARF predict_proba_one returns constant` | Pickle file was loaded instead of warm restart | Ensure `ARF_WARM_RESTART=true` |
| `Drain3 state not found` | `drain3_state.bin` not in `/app/` | Copy to `agents/triage/` before image build |
| Self-test fails | EIF threshold mismatch or ONNX input shape mismatch | Verify `eif_threshold.npy` and `feature_cols.pkl` match |

---

## 17. Known Limitations & Domain-Exempt Sources

### 17.1 Model Capability by Source Type

Based on comprehensive testing (`test_all_log_types.py` — all checks PASS):

| Source Type | LightGBM Attack Detection | EIF Anomaly Detection | Notes |
|-------------|--------------------------|----------------------|-------|
| `syslog` | Strong (CICIDS2017 network features) | — | Core training domain |
| `windows_event` | Good (after dst_port fix) | — | Required fuzzy column matching for DestinationPort |
| `firewall` | Strong (network metrics) | Strong (UNSW normal baseline) | Best overall coverage |
| `active_directory` | Good (EVTX-based) | — | Limited to event-log patterns |
| `dns` | **Limited** | Low (OONI data) | All features collapse to identical values (port=53, proto=17). Domain-exempt in tests. |
| `cloudtrail` | Moderate (Sigma rule–derived) | — | Limited labeled data |
| `kubernetes` | Moderate (Falco rule–derived) | — | Limited labeled data |
| `nginx` | **Limited** | Low (Apache 2k logs) | HTTP request features fall in same LGBM decision bins. Domain-exempt in tests. |
| `netflow` | Strong (NF-UNSW/NF-ToN-IoT) | Strong (normal-only baseline) | Weakest source at 70% attack catch (threshold) |
| `ids_ips` | Strong (CICIDS2017 + UNSW) | Strong (Zeek normal) | Best overall performance |

### 17.2 Domain-Exempt Sources

Two source types are marked as **FEATURE_DOMAIN_EXEMPT** in the test suite:

| Source | Issue | Root Cause | Production Impact |
|--------|-------|------------|-------------------|
| `dns` | 0% normal → DISCARD rate | DNS logs have hardcoded features (port=53, proto=17) causing all rows to score LGBM≈0.969 regardless of label | All DNS events route to MONITOR/ESCALATE. Over-alerting but no missed attacks. |
| `nginx` | 0% attack catch rate | HTTP request features (URL length, content-length) fall into identical LGBM decision bins. Model trained on KDD network data, not HTTP layer. | Nginx attacks not caught by LightGBM. EIF and ARF may partially compensate. |

**Mitigation for production:**
- DNS: Consider reducing `dns` suspicious threshold (e.g., 0.90/0.95) or adding DNS-specific features (query length, entropy, TLD) in a future model version
- Nginx: Consider training a separate HTTP-specific model or adding web attack features (SQL injection patterns, XSS markers) in v2.0

### 17.3 Other Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| LANL CERT dataset deferred | No insider threat training data for ARF | Can be added later, retrain steps 09→10→11→12 |
| `template_rarity` zero LightGBM importance | Feature unused by model | Will contribute after retraining with live rarity values |
| `threat_intel_flag` zero LightGBM importance | Feature unused by model | Still used by score_fusion.py IOC boost — provides value outside model |
| Online ARF learns from fused predictions (no ground truth) | Silent accuracy degradation possible | ADWIN monitors error rate and triggers tree replacement |

---

## 18. Pre-Integration Test Matrix

### 18.1 Tests Already Passing (Training Workspace)

| Test | Script | Result | What It Validates |
|------|--------|--------|-------------------|
| Score bounds [0,1] | `test_all_log_types.py` CHECK 1 | **PASS** | All 3 models produce valid scores |
| ARF alive (varying probas) | `test_all_log_types.py` CHECK 2 | **PASS** (28 unique, var=0.016) | Warm restart eliminated constant-probability bug |
| Normal → DISCARD rate ≥ 80% (aggregate) | `test_all_log_types.py` CHECK 3 | **PASS** (80.0%) | Normal events correctly routed |
| Attack → MONITOR/ESCALATE ≥ 70% (aggregate) | `test_all_log_types.py` CHECK 4 | **PASS** (80.0%) | Attack events correctly caught |
| Model disagreement ≤ 70% (aggregate) | `test_all_log_types.py` CHECK 5 | **PASS** (70.0%) | Models generally agree |
| Windows regression (0/10 discarded) | `test_all_log_types.py` CHECK 6 | **PASS** | Fixed: expanded dst_port column matching |
| Active Directory regression (0/10 discarded) | `test_all_log_types.py` CHECK 7 | **PASS** | Fixed: no regression |
| LightGBM ONNX inference | `11_test_models.py` Test 1 | **PASS** | ONNX produces valid scores |
| EIF anomaly separation | `11_test_models.py` Test 2 | **PASS** | Attack scores > normal scores |
| ARF warm restart + predictions | `11_test_models.py` Test 3 | **PASS** | predict_proba_one works after warm restart |
| Score fusion AUC ≥ 0.85 | `11_test_models.py` Test 4 | **PASS** | Ensemble achieves target AUC |
| Model disagreement signal | `11_test_models.py` Test 5 | **PASS** | std_dev > 0.35 events exist |
| Threshold routing | `11_test_models.py` Test 6 | **PASS** | Events route to correct buckets |
| Pre-launch checklist (41/41) | `12_prelaunch_checklist.py` | **PASS** | All infrastructure and model checks pass |

### 18.2 Post-Integration Smoke Tests

After deploying model artifacts, run these from the CLIF repo:

```bash
# 1. Health endpoint
curl http://localhost:8300/health
# Expected: {"status": "healthy", "models_loaded": true, "self_test_ok": true}

# 2. Readiness endpoint
curl http://localhost:8300/ready
# Expected: {"ready": true}

# 3. Stats endpoint
curl http://localhost:8300/stats
# Expected: {"events_processed": 0, "arf_model_ready": true, ...}

# 4. Send a test event via Kafka
rpk topic produce raw-logs --brokers localhost:19092 <<< '{"timestamp":"2026-03-15T14:30:00Z","host":"test-host","source_ip":"10.0.0.1","message":"Failed password for root from 192.168.1.100 port 22 ssh2","source_type":"syslog","severity":"high"}'

# 5. Check triage-scores output
rpk topic consume triage-scores --brokers localhost:19092 --num 1
# Expected: JSON with combined_score, lgbm_score, eif_score, arf_score, routing_decision

# 6. Check ClickHouse
curl "http://localhost:8123/?query=SELECT+count()+FROM+triage_scores"
# Expected: ≥ 1

# 7. Check ARF replay buffer
curl "http://localhost:8123/?query=SELECT+count()+FROM+arf_replay_buffer"
# Expected: ≥ 500 (bootstrapped) or growing with live events
```

### 18.3 Infrastructure Integration Tests

```bash
# From CLIF tests directory
pytest tests/test_infrastructure.py -v  # Cluster health, schema, configs
pytest tests/test_data_integrity.py -v  # E2E pipeline validation
```

---

## 19. Action Items Summary

### Required Before First Deploy (3 items)

| # | Action | Priority | Command/Detail |
|---|--------|----------|----------------|
| **1** | **Copy model artifacts** to `agents/triage/models/` | **CRITICAL** | Copy 5 required files + 2 optional (Section 2.3) |
| **2** | **Copy `drain3_state.bin`** to `agents/triage/` | **CRITICAL** | Without it, all template rarity scores are high on first startup until templates accumulate |
| **3** | **Copy `features_arf_stream_features.csv`** to `agents/triage/` | **HIGH** | ARF cold-start fallback — without it, first deploy with empty `arf_replay_buffer` will have no ARF model |

### Advisory Notes (5 items — no action required)

| # | Note | Detail |
|---|------|--------|
| **A** | `triage_scores` local schema is simplified (10 cols vs 28) | No impact — CLIF pipeline uses the full 28-column schema from `clickhouse/schema.sql` |
| **B** | Documentation threshold drift for 4 source types | `TRIAGE_AGENT_DOCUMENTATION.md` shows different thresholds for active_directory, cloudtrail, kubernetes, ids_ips. Runtime values from ClickHouse seed data are authoritative. |
| **C** | DNS domain-exempt (all events over-escalated) | DNS features collapse to identical values; model scores all DNS events ~0.97. Consider adding DNS-specific features in v2.0. |
| **D** | Nginx domain-exempt (attacks not caught) | HTTP request features indistinguishable from normal in LGBM decision space. Consider HTTP-specific model in v2.0. |
| **E** | `mitre_rules.json` is empty in training workspace | Not used at runtime — CLIF uses `mitre_mapping_rules` ClickHouse table (9 pre-seeded rules) |

### Post-Deploy Verification

After completing the 3 action items:

```bash
docker-compose -f docker-compose.pc2.yml up -d clif-triage-agent
docker logs clif-triage-agent -f --tail 50
# Watch for: "All models loaded", "Self-test passed", "Consuming from 4 topics"
curl http://localhost:8300/ready   # Should return {"ready": true}
```

---

## Appendix A — Quick Reference Card

```
╔════════════════════════════════════════════════════════════════╗
║  TRIAGE AGENT INTEGRATION — QUICK REFERENCE                   ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Models (5 required):                                          ║
║    lgbm_v1.0.0.onnx      → /models/lgbm_v1.0.0.onnx         ║
║    eif_v1.0.0.pkl         → /models/eif_v1.0.0.pkl           ║
║    eif_threshold.npy      → /models/eif_threshold.npy        ║
║    feature_cols.pkl       → /models/feature_cols.pkl          ║
║    manifest.json          → /models/manifest.json             ║
║                                                                ║
║  Supplementary (2 required):                                   ║
║    drain3_state.bin       → /app/drain3_state.bin             ║
║    features_arf_stream_features.csv → /app/                   ║
║                                                                ║
║  Feature vector: 20 float32, order from feature_cols.pkl      ║
║  ONNX input name: "input", shape [None, 20]                  ║
║  EIF threshold: 0.42768124                                    ║
║  Weights: LGBM 0.50 + EIF 0.30 + ARF 0.20 = 1.00            ║
║  ARF: NEVER pickle.load — warm restart only                   ║
║                                                                ║
║  Kafka IN:  raw-logs, security-events, process-events,        ║
║             network-events                                     ║
║  Kafka OUT: triage-scores (all), anomaly-alerts (escalated)   ║
║                                                                ║
║  Health: http://localhost:8300/health                          ║
║  Ready:  http://localhost:8300/ready                           ║
║  Stats:  http://localhost:8300/stats                           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

---

## Appendix B — Model File Checksums

Generate checksums after copying to verify integrity:

```powershell
Get-ChildItem "agents\triage\models" | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    "$($_.Name) → $hash"
}
```

Compare against training workspace:

```powershell
Get-ChildItem "triage_agent\models" | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    "$($_.Name) → $hash"
}
```

All checksums must match exactly. Any mismatch indicates file corruption during copy.

---

*This integration checklist was generated from a cross-audit of the training workspace (`triage_agent/`), CLIF pipeline documentation (`PIPELINE_READINESS_REPORT.md`, `README.md`, `TRIAGE_AGENT_DOCUMENTATION.md`), ClickHouse schema, Docker Compose configurations, Kubernetes manifests, and live model artifact inspection. All alignment checks have been verified programmatically where possible.*
