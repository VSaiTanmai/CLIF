#!/usr/bin/env python3
"""
CLIF Triage Agent — Complete Model Retraining Pipeline (Vectorized)
=====================================================================
Builds training data from ALL available datasets, retrains all 3 models,
computes calibration, validates accuracy, and exports production artifacts.

9 DATASETS (all vectorized — ~30 seconds total extraction):
  1. CICIDS2017 stratified (30K)   — network flow
  2. NSL-KDD stratified (24K)      — IDS (native KDD features)
  3. UNSW-NB15 stratified (20K)    — network flow
  4. NF-UNSW-NB15-v3 stratified (12K) — NetFlow
  5. NF-ToN-IoT temporal (11K)     — IoT NetFlow
  6. CSIC 2010 (61K -> 20K sampled) — HTTP web attacks
  7. EVTX Attack Samples (4.6K + 4.6K synthetic normal) — Windows Events
  8. Loghub Linux (2K)             — Syslog auth logs
  9. Loghub Apache (2K)            — Web server error logs

Usage:
    python scripts/retrain_all.py
"""

import io
import json
import logging
import math
import os
import pickle
import sys
import time
import warnings
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# Force unbuffered stdout so output appears immediately
class _FlushHandler(logging.StreamHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[_FlushHandler(sys.stdout)],
)
log = logging.getLogger("retrain")

# -- Paths ----------------------------------------------------------------

BASE_DIR    = Path(__file__).resolve().parent.parent
DATA_DIR    = BASE_DIR / "agents" / "Data"
MODEL_DIR   = BASE_DIR / "agents" / "triage" / "models"
ZIP_PATH    = DATA_DIR / "datasets.zip"

# -- 20 canonical features (MUST match feature_extractor.py) --------------

FEATURE_COLS = [
    "hour_of_day", "day_of_week", "severity_numeric", "source_type_numeric",
    "src_bytes", "dst_bytes", "event_freq_1m", "protocol", "dst_port",
    "template_rarity", "threat_intel_flag", "duration",
    "same_srv_rate", "diff_srv_rate", "serror_rate", "rerror_rate",
    "count", "srv_count", "dst_host_count", "dst_host_srv_count",
]

PROTO_MAP = {"tcp": 6, "udp": 17, "icmp": 1, "igmp": 2, "gre": 47, "esp": 50, "sctp": 132}


# =========================================================================
#  HELPERS
# =========================================================================

def _safe_col(df, name, default=0.0):
    """Get column as float64, filling NaN/Inf with default."""
    if name in df.columns:
        s = pd.to_numeric(df[name], errors="coerce").fillna(default)
        s = s.replace([np.inf, -np.inf], default)
        return s.astype(np.float64)
    return pd.Series(default, index=df.index, dtype=np.float64)


def _proto_col(df, colname):
    """Convert protocol column to IANA numbers."""
    if colname not in df.columns:
        return pd.Series(0.0, index=df.index, dtype=np.float64)
    s = df[colname].astype(str).str.strip().str.lower()
    mapped = s.map(PROTO_MAP)
    numeric = pd.to_numeric(s, errors="coerce")
    result = mapped.fillna(numeric).fillna(0.0)
    return result.astype(np.float64)


def _read_csv_from_zip(zf, pattern, require_in_path=None):
    """Find and read a CSV from the zip by filename pattern."""
    for n in zf.namelist():
        if n.endswith(pattern):
            if require_in_path and require_in_path not in n:
                continue
            raw = zf.read(n).decode("utf-8", errors="replace")
            return pd.read_csv(io.StringIO(raw), low_memory=False)
    return None


def _make_frame(n, **col_arrays):
    """Build a DataFrame with FEATURE_COLS + label + attack_type + source_dataset."""
    out = pd.DataFrame(index=range(n))
    for col in FEATURE_COLS + ["label", "attack_type", "source_dataset"]:
        if col in col_arrays:
            v = col_arrays[col]
            if isinstance(v, pd.Series):
                out[col] = v.values
            else:
                out[col] = v
        elif col in ("attack_type", "source_dataset"):
            out[col] = "unknown"
        else:
            out[col] = 0.0
    return out


# =========================================================================
#  DATASET LOADERS (all vectorized -- NO iterrows)
# =========================================================================

def load_cicids2017(zf):
    log.info("Loading CICIDS2017 stratified...")
    df = _read_csv_from_zip(zf, "cicids2017_stratified.csv", "01_syslog")
    if df is None:
        return pd.DataFrame()
    n = len(df)
    log.info(f"  {n} rows")

    is_attack = df["binary_label"].astype(int) == 1
    labels = is_attack.astype(int)
    attack_type = df["attack_type"].fillna(df.get("Label", pd.Series("unknown", index=df.index)))
    attack_type = attack_type.astype(str)
    attack_type[~is_attack] = "normal"

    fwd_pkts = _safe_col(df, "Total Fwd Packets", 1).clip(lower=1)

    return _make_frame(
        n,
        hour_of_day       = np.random.randint(0, 24, n).astype(float),
        day_of_week       = np.random.randint(0, 7, n).astype(float),
        severity_numeric  = np.where(is_attack, 3.0, 1.0),
        source_type_numeric = np.full(n, 9.0),
        src_bytes         = _safe_col(df, "Total Length of Fwd Packets").clip(0, 1e9).values,
        dst_bytes         = _safe_col(df, "Total Length of Bwd Packets").clip(0, 1e9).values,
        event_freq_1m     = _safe_col(df, "Flow Packets/s").clip(0, 1e5).values,
        protocol          = np.full(n, 6.0),
        dst_port          = _safe_col(df, "Destination Port").clip(0, 65535).values,
        template_rarity   = np.full(n, 0.5),
        threat_intel_flag = np.zeros(n),
        duration          = _safe_col(df, "Flow Duration").clip(0, 1e12).values,
        same_srv_rate     = (_safe_col(df, "Subflow Fwd Packets") / fwd_pkts).clip(0, 1).values,
        diff_srv_rate     = np.zeros(n),
        serror_rate       = (_safe_col(df, "SYN Flag Count") / fwd_pkts).clip(0, 1).values,
        rerror_rate       = (_safe_col(df, "RST Flag Count") / fwd_pkts).clip(0, 1).values,
        count             = (_safe_col(df, "Total Fwd Packets") + _safe_col(df, "Total Backward Packets")).values,
        srv_count         = _safe_col(df, "Total Fwd Packets").values,
        dst_host_count    = np.ones(n),
        dst_host_srv_count = np.ones(n),
        label             = labels.values,
        attack_type       = attack_type.values,
        source_dataset    = np.full(n, "cicids2017", dtype=object),
    )


def load_nsl_kdd(zf):
    log.info("Loading NSL-KDD stratified...")
    df = _read_csv_from_zip(zf, "nsl_kdd_stratified.csv")
    if df is None:
        return pd.DataFrame()
    n = len(df)
    log.info(f"  {n} rows")

    labels = df["binary_label"].astype(int)
    attack_type = df["attack_type"].astype(str)
    attack_type[labels == 0] = "normal"

    return _make_frame(
        n,
        hour_of_day       = np.random.randint(0, 24, n).astype(float),
        day_of_week       = np.random.randint(0, 7, n).astype(float),
        severity_numeric  = np.where(labels == 1, 3.0, 1.0),
        source_type_numeric = np.full(n, 10.0),
        src_bytes         = _safe_col(df, "src_bytes").clip(0, 1e9).values,
        dst_bytes         = _safe_col(df, "dst_bytes").clip(0, 1e9).values,
        event_freq_1m     = _safe_col(df, "count").values,
        protocol          = _proto_col(df, "protocol_type").values,
        dst_port          = np.zeros(n),
        template_rarity   = np.full(n, 0.5),
        threat_intel_flag = np.zeros(n),
        duration          = _safe_col(df, "duration").values,
        same_srv_rate     = _safe_col(df, "same_srv_rate").clip(0, 1).values,
        diff_srv_rate     = _safe_col(df, "diff_srv_rate").clip(0, 1).values,
        serror_rate       = _safe_col(df, "serror_rate").clip(0, 1).values,
        rerror_rate       = _safe_col(df, "rerror_rate").clip(0, 1).values,
        count             = _safe_col(df, "count").values,
        srv_count         = _safe_col(df, "srv_count").values,
        dst_host_count    = _safe_col(df, "dst_host_count").values,
        dst_host_srv_count = _safe_col(df, "dst_host_srv_count").values,
        label             = labels.values,
        attack_type       = attack_type.values,
        source_dataset    = np.full(n, "nsl_kdd", dtype=object),
    )


def load_unsw_nb15(zf):
    log.info("Loading UNSW-NB15 stratified...")
    df = _read_csv_from_zip(zf, "unsw_stratified.csv", "03_firewall")
    if df is None:
        return pd.DataFrame()
    n = len(df)
    log.info(f"  {n} rows")

    if "binary_label" in df.columns:
        labels = _safe_col(df, "binary_label", 0).astype(int)
    else:
        labels = _safe_col(df, "label", 0).astype(int)

    if "attack_type" in df.columns:
        attack_type = df["attack_type"].astype(str)
    elif "attack_cat" in df.columns:
        attack_type = df["attack_cat"].astype(str)
    else:
        attack_type = pd.Series("unknown", index=df.index)
    attack_type[labels == 0] = "normal"

    ct_srv_src = _safe_col(df, "ct_srv_src").clip(lower=1)

    return _make_frame(
        n,
        hour_of_day       = np.random.randint(0, 24, n).astype(float),
        day_of_week       = np.random.randint(0, 7, n).astype(float),
        severity_numeric  = np.where(labels == 1, 3.0, 1.0),
        source_type_numeric = np.full(n, 3.0),
        src_bytes         = _safe_col(df, "sbytes").clip(0, 1e9).values,
        dst_bytes         = _safe_col(df, "dbytes").clip(0, 1e9).values,
        event_freq_1m     = ct_srv_src.values,
        protocol          = _proto_col(df, "proto").values,
        dst_port          = _safe_col(df, "dsport").clip(0, 65535).values,
        template_rarity   = np.full(n, 0.5),
        threat_intel_flag = np.zeros(n),
        duration          = _safe_col(df, "dur").clip(0, 1e9).values,
        same_srv_rate     = (_safe_col(df, "ct_dst_ltm") / ct_srv_src).clip(0, 1).values,
        diff_srv_rate     = (_safe_col(df, "ct_dst_sport_ltm") / ct_srv_src).clip(0, 1).values,
        serror_rate       = np.zeros(n),
        rerror_rate       = np.zeros(n),
        count             = ct_srv_src.values,
        srv_count         = _safe_col(df, "ct_srv_dst").values,
        dst_host_count    = _safe_col(df, "ct_dst_ltm").values,
        dst_host_srv_count = _safe_col(df, "ct_src_ltm").values,
        label             = labels.values,
        attack_type       = attack_type.values,
        source_dataset    = np.full(n, "unsw_nb15", dtype=object),
    )


def _load_netflow_format(df, source_dataset):
    """Shared vectorized loader for NetFlow-format datasets."""
    n = len(df)
    df.columns = [c.strip().strip("\r") for c in df.columns]

    label_col = "binary_label" if "binary_label" in df.columns else "Label"
    labels = _safe_col(df, label_col, 0).astype(int)
    attack_col = "Attack" if "Attack" in df.columns else "attack_type"
    if attack_col in df.columns:
        attack_type = df[attack_col].astype(str)
    else:
        attack_type = pd.Series("unknown", index=df.index)
    benign_mask = attack_type.str.lower().isin(["benign", "normal", "0"])
    labels[benign_mask] = 0
    attack_type[benign_mask] = "normal"

    ts_ms = _safe_col(df, "FLOW_START_MILLISECONDS", 0)
    valid_ts = ts_ms > 1e12
    hour = pd.Series(np.random.randint(0, 24, n).astype(float), index=df.index)
    dow  = pd.Series(np.random.randint(0, 7, n).astype(float), index=df.index)
    if valid_ts.any():
        ts_sec = ts_ms[valid_ts] / 1000.0
        dt = pd.to_datetime(ts_sec, unit="s", utc=True, errors="coerce")
        valid_dt = dt.notna()
        if valid_dt.any():
            hour.loc[valid_ts] = dt[valid_dt].dt.hour.astype(float).values[:valid_ts.sum()]
            dow.loc[valid_ts]  = dt[valid_dt].dt.dayofweek.astype(float).values[:valid_ts.sum()]

    return _make_frame(
        n,
        hour_of_day       = hour.values,
        day_of_week       = dow.values,
        severity_numeric  = np.where(labels == 1, 3.0, 1.0),
        source_type_numeric = np.full(n, 9.0),
        src_bytes         = _safe_col(df, "IN_BYTES").clip(0, 1e9).values,
        dst_bytes         = _safe_col(df, "OUT_BYTES").clip(0, 1e9).values,
        event_freq_1m     = (_safe_col(df, "IN_PKTS") + _safe_col(df, "OUT_PKTS")).values,
        protocol          = _safe_col(df, "PROTOCOL").values,
        dst_port          = _safe_col(df, "L4_DST_PORT").clip(0, 65535).values,
        template_rarity   = np.full(n, 0.5),
        threat_intel_flag = np.zeros(n),
        duration          = _safe_col(df, "FLOW_DURATION_MILLISECONDS").clip(0, 1e12).values,
        same_srv_rate     = np.zeros(n),
        diff_srv_rate     = np.zeros(n),
        serror_rate       = np.zeros(n),
        rerror_rate       = np.zeros(n),
        count             = _safe_col(df, "IN_PKTS").values,
        srv_count         = _safe_col(df, "OUT_PKTS").values,
        dst_host_count    = np.ones(n),
        dst_host_srv_count = np.ones(n),
        label             = labels.values,
        attack_type       = attack_type.values,
        source_dataset    = np.full(n, source_dataset, dtype=object),
    )


def load_nf_unsw(zf):
    log.info("Loading NF-UNSW-NB15-v3 stratified...")
    df = _read_csv_from_zip(zf, "nf_unsw_stratified.csv")
    if df is None:
        return pd.DataFrame()
    log.info(f"  {len(df)} rows")
    return _load_netflow_format(df, "nf_unsw_nb15_v3")


def load_ton_iot(zf):
    log.info("Loading NF-ToN-IoT temporal...")
    df = _read_csv_from_zip(zf, "nf_ton_iot_temporal.csv")
    if df is None:
        return pd.DataFrame()
    log.info(f"  {len(df)} rows")
    return _load_netflow_format(df, "nf_ton_iot")


def load_csic2010(zf):
    log.info("Loading CSIC 2010 (web attacks)...")
    df = _read_csv_from_zip(zf, "csic_database.csv", "08_nginx")
    if df is None:
        return pd.DataFrame()
    log.info(f"  {len(df)} rows, dist: {df['classification'].value_counts().to_dict()}")

    df_n = df[df["classification"] == 0]
    df_a = df[df["classification"] == 1]
    if len(df_n) > 10000:
        df_n = df_n.sample(n=10000, random_state=42)
    if len(df_a) > 10000:
        df_a = df_a.sample(n=10000, random_state=42)
    df = pd.concat([df_n, df_a], ignore_index=True)
    n = len(df)
    log.info(f"  Subsampled to {n}")

    labels = df["classification"].astype(int)
    is_attack = labels == 1

    content_len = _safe_col(df, "lenght", 0)
    content_str = df.get("content", pd.Series("", index=df.index)).astype(str)
    content_fb = content_str.str.len().astype(float)
    src_bytes = np.where(content_len > 0, content_len, content_fb)

    url_len = df.get("URL", pd.Series("", index=df.index)).astype(str).str.len().astype(float)
    template_rarity = np.where(is_attack, np.clip(url_len / 200.0, 0.0, 1.0), 0.5)

    return _make_frame(
        n,
        hour_of_day       = np.random.randint(8, 20, n).astype(float),
        day_of_week       = np.random.randint(0, 5, n).astype(float),
        severity_numeric  = np.where(is_attack, 3.0, 1.0),
        source_type_numeric = np.full(n, 8.0),
        src_bytes         = np.clip(src_bytes, 0, 1e9),
        dst_bytes         = np.zeros(n),
        event_freq_1m     = np.random.randint(1, 100, n).astype(float),
        protocol          = np.full(n, 6.0),
        dst_port          = np.full(n, 80.0),
        template_rarity   = template_rarity,
        threat_intel_flag = np.zeros(n),
        duration          = np.random.exponential(50, n),
        same_srv_rate     = np.ones(n),
        diff_srv_rate     = np.zeros(n),
        serror_rate       = np.zeros(n),
        rerror_rate       = np.zeros(n),
        count             = np.random.randint(1, 50, n).astype(float),
        srv_count         = np.random.randint(1, 50, n).astype(float),
        dst_host_count    = np.ones(n),
        dst_host_srv_count = np.ones(n),
        label             = labels.values,
        attack_type       = np.where(is_attack, "web_attack", "normal"),
        source_dataset    = np.full(n, "csic_2010", dtype=object),
    )


def load_evtx(zf):
    log.info("Loading EVTX attack samples + synthetic normals...")
    df = _read_csv_from_zip(zf, "evtx_data.csv", "02_windows")
    if df is None:
        return pd.DataFrame()
    n_attack = len(df)
    log.info(f"  {n_attack} attack rows")

    sev_map = {
        "Lateral Movement": 4.0, "Execution": 4.0,
        "Privilege Escalation": 4.0, "Credential Access": 4.0,
        "Command and Control": 3.0, "Defense Evasion": 3.0,
        "Persistence": 3.0, "Discovery": 2.0,
    }
    severity = df["EVTX_Tactic"].map(sev_map).fillna(3.0).values

    dst_port = _safe_col(df, "DestPort", 0)
    if "DestinationPort" in df.columns:
        dst_port = dst_port.where(dst_port > 0, _safe_col(df, "DestinationPort", 0))
    dst_port = dst_port.clip(0, 65535).values

    event_id = _safe_col(df, "EventID", 0).astype(int)
    common_eids = {4624, 4625, 4634, 4648, 4672, 4688, 4689, 7045, 1}
    tr_attack = np.where(event_id.isin(common_eids), 0.4, 0.1)

    attack_type = ("evtx_" + df["EVTX_Tactic"].str.lower().str.replace(" ", "_")).values

    attack_frame = _make_frame(
        n_attack,
        hour_of_day       = np.random.randint(0, 24, n_attack).astype(float),
        day_of_week       = np.random.randint(0, 7, n_attack).astype(float),
        severity_numeric  = severity,
        source_type_numeric = np.full(n_attack, 2.0),
        src_bytes         = np.zeros(n_attack),
        dst_bytes         = np.zeros(n_attack),
        event_freq_1m     = np.random.randint(1, 200, n_attack).astype(float),
        protocol          = np.where(dst_port > 0, 6.0, 0.0),
        dst_port          = dst_port,
        template_rarity   = tr_attack,
        threat_intel_flag = np.zeros(n_attack),
        duration          = np.zeros(n_attack),
        same_srv_rate     = np.zeros(n_attack),
        diff_srv_rate     = np.zeros(n_attack),
        serror_rate       = np.zeros(n_attack),
        rerror_rate       = np.zeros(n_attack),
        count             = np.ones(n_attack),
        srv_count         = np.ones(n_attack),
        dst_host_count    = np.ones(n_attack),
        dst_host_srv_count = np.ones(n_attack),
        label             = np.ones(n_attack, dtype=int),
        attack_type       = attack_type,
        source_dataset    = np.full(n_attack, "evtx", dtype=object),
    )

    n_norm = n_attack
    normal_frame = _make_frame(
        n_norm,
        hour_of_day       = np.random.choice([8,9,10,11,12,13,14,15,16,17], n_norm).astype(float),
        day_of_week       = np.random.randint(0, 5, n_norm).astype(float),
        severity_numeric  = np.ones(n_norm),
        source_type_numeric = np.full(n_norm, 2.0),
        src_bytes         = np.zeros(n_norm),
        dst_bytes         = np.zeros(n_norm),
        event_freq_1m     = np.random.randint(5, 60, n_norm).astype(float),
        protocol          = np.zeros(n_norm),
        dst_port          = np.zeros(n_norm),
        template_rarity   = np.clip(0.5 + np.random.normal(0, 0.05, n_norm), 0, 1),
        threat_intel_flag = np.zeros(n_norm),
        duration          = np.zeros(n_norm),
        same_srv_rate     = np.zeros(n_norm),
        diff_srv_rate     = np.zeros(n_norm),
        serror_rate       = np.zeros(n_norm),
        rerror_rate       = np.zeros(n_norm),
        count             = np.random.randint(1, 10, n_norm).astype(float),
        srv_count         = np.random.randint(1, 10, n_norm).astype(float),
        dst_host_count    = np.ones(n_norm),
        dst_host_srv_count = np.ones(n_norm),
        label             = np.zeros(n_norm, dtype=int),
        attack_type       = np.full(n_norm, "normal", dtype=object),
        source_dataset    = np.full(n_norm, "evtx", dtype=object),
    )

    result = pd.concat([attack_frame, normal_frame], ignore_index=True)
    log.info(f"  EVTX total: {len(result)} rows")
    return result


def load_loghub_linux(zf):
    log.info("Loading Loghub Linux syslog...")
    df = _read_csv_from_zip(zf, "Linux_2k.log_structured.csv", "path_a")
    if df is None:
        return pd.DataFrame()
    df.columns = [c.strip().strip("\r") for c in df.columns]
    n = len(df)
    log.info(f"  {n} rows")

    ATTACK_PATS = ["authentication failure", "failed password", "invalid user",
                   "failed login", "refused connect", "illegal user",
                   "did not receive identification", "connection closed"]

    content = df.get("Content", pd.Series("", index=df.index)).astype(str).str.lower()
    is_attack = pd.Series(False, index=df.index)
    for pat in ATTACK_PATS:
        is_attack = is_attack | content.str.contains(pat, na=False, regex=False)
    labels = is_attack.astype(int)

    has_failure = content.str.contains("failure|failed", na=False, regex=True)
    has_error = content.str.contains("error|refused", na=False, regex=True)
    severity = np.where(has_failure, 3.0, np.where(has_error, 2.0, 1.0))

    template_rarity = np.where(is_attack, 0.3, 0.6)

    time_col = df.get("Time", pd.Series("", index=df.index)).astype(str)
    hour = time_col.str.extract(r"(\d+):", expand=False)
    hour = pd.to_numeric(hour, errors="coerce").fillna(12).astype(float) % 24

    component = df.get("Component", pd.Series("", index=df.index)).astype(str).str.lower()
    has_ssh = component.str.contains("ssh", na=False)
    dst_port = np.where(has_ssh, 22.0, 0.0)

    attack_type = np.where(
        is_attack & has_ssh, "ssh_brute_force",
        np.where(is_attack, "auth_failure", "normal")
    )

    return _make_frame(
        n,
        hour_of_day       = hour.values,
        day_of_week       = np.random.randint(0, 7, n).astype(float),
        severity_numeric  = severity,
        source_type_numeric = np.full(n, 1.0),
        src_bytes         = np.zeros(n),
        dst_bytes         = np.zeros(n),
        event_freq_1m     = np.random.randint(1, 100, n).astype(float),
        protocol          = np.zeros(n),
        dst_port          = dst_port,
        template_rarity   = template_rarity,
        threat_intel_flag = np.zeros(n),
        duration          = np.zeros(n),
        same_srv_rate     = np.zeros(n),
        diff_srv_rate     = np.zeros(n),
        serror_rate       = np.zeros(n),
        rerror_rate       = np.zeros(n),
        count             = np.ones(n),
        srv_count         = np.ones(n),
        dst_host_count    = np.ones(n),
        dst_host_srv_count = np.ones(n),
        label             = labels.values,
        attack_type       = attack_type,
        source_dataset    = np.full(n, "loghub_linux", dtype=object),
    )


def load_loghub_apache(zf):
    log.info("Loading Loghub Apache...")
    df = _read_csv_from_zip(zf, "Apache_2k.log_structured.csv", "path_a")
    if df is None:
        return pd.DataFrame()
    df.columns = [c.strip().strip("\r") for c in df.columns]
    n = len(df)
    log.info(f"  {n} rows")

    ERROR_PATS = ["error", "failed", "denied", "not found", "timeout", "refused"]
    content = df.get("Content", pd.Series("", index=df.index)).astype(str).str.lower()
    level = df.get("Level", pd.Series("notice", index=df.index)).astype(str).str.lower()

    is_error_level = level.isin(["error", "crit", "alert", "emerg"])
    is_error_content = pd.Series(False, index=df.index)
    for pat in ERROR_PATS:
        is_error_content = is_error_content | content.str.contains(pat, na=False, regex=False)
    is_error = is_error_level | is_error_content
    labels = is_error.astype(int)

    severity = np.where(is_error_level, 3.0, np.where(level == "warn", 2.0, 1.0))
    template_rarity = np.where(is_error, 0.2, 0.6)

    return _make_frame(
        n,
        hour_of_day       = np.random.randint(0, 24, n).astype(float),
        day_of_week       = np.random.randint(0, 7, n).astype(float),
        severity_numeric  = severity,
        source_type_numeric = np.full(n, 8.0),
        src_bytes         = np.zeros(n),
        dst_bytes         = np.zeros(n),
        event_freq_1m     = np.random.randint(1, 200, n).astype(float),
        protocol          = np.full(n, 6.0),
        dst_port          = np.full(n, 80.0),
        template_rarity   = template_rarity,
        threat_intel_flag = np.zeros(n),
        duration          = np.zeros(n),
        same_srv_rate     = np.zeros(n),
        diff_srv_rate     = np.zeros(n),
        serror_rate       = np.zeros(n),
        rerror_rate       = np.zeros(n),
        count             = np.ones(n),
        srv_count         = np.ones(n),
        dst_host_count    = np.ones(n),
        dst_host_srv_count = np.ones(n),
        label             = labels.values,
        attack_type       = np.where(is_error, "web_error", "normal"),
        source_dataset    = np.full(n, "loghub_apache", dtype=object),
    )


# =========================================================================
#  PHASE 2: COMBINE & VALIDATE
# =========================================================================

def build_combined_dataset():
    log.info("=" * 70)
    log.info("PHASE 1: Building combined multi-log training dataset")
    log.info("=" * 70)

    zf = zipfile.ZipFile(str(ZIP_PATH))

    loaders = [
        load_cicids2017, load_nsl_kdd, load_unsw_nb15,
        load_nf_unsw, load_ton_iot, load_csic2010,
        load_evtx, load_loghub_linux, load_loghub_apache,
    ]

    frames = []
    for loader in loaders:
        try:
            result = loader(zf)
            if len(result) > 0:
                frames.append(result)
                log.info(f"  -> {loader.__name__}: {len(result)} rows OK")
        except Exception as e:
            log.error(f"  FAILED: {loader.__name__}: {e}", exc_info=True)

    zf.close()

    df = pd.concat(frames, ignore_index=True)
    log.info(f"\nCombined BEFORE validation: {len(df)} rows")

    # Validate & clean
    for col in FEATURE_COLS:
        if col not in df.columns:
            log.error(f"  MISSING COLUMN: {col}")
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(0.0)

    df["src_bytes"]  = df["src_bytes"].clip(0, 1e9)
    df["dst_bytes"]  = df["dst_bytes"].clip(0, 1e9)
    df["dst_port"]   = df["dst_port"].clip(0, 65535)
    for col in ["same_srv_rate", "diff_srv_rate", "serror_rate", "rerror_rate", "template_rarity"]:
        df[col] = df[col].clip(0.0, 1.0)

    df["label"] = pd.to_numeric(df["label"], errors="coerce").fillna(0).astype(int).clip(0, 1)
    df["attack_type"] = df["attack_type"].fillna("unknown")
    df.loc[(df["label"] == 0) & (df["attack_type"] == "unknown"), "attack_type"] = "normal"

    X = df[FEATURE_COLS].values
    assert not np.any(np.isnan(X)), "NaN found in features!"
    assert not np.any(np.isinf(X)), "Inf found in features!"

    log.info(f"\nCombined AFTER validation: {len(df)} rows")
    log.info(f"Label dist:    {df['label'].value_counts().to_dict()}")
    log.info(f"Datasets:      {df['source_dataset'].value_counts().to_dict()}")
    log.info(f"Attack types:  {df['attack_type'].nunique()} unique")
    log.info(f"Source types:  {sorted(df['source_type_numeric'].unique().tolist())}")
    log.info("Validation PASSED")
    return df


# =========================================================================
#  PHASE 3: TRAIN EIF (Normal-Only)
# =========================================================================

def train_eif(df):
    log.info("=" * 70)
    log.info("PHASE 2: Training Extended Isolation Forest (normal-only)")
    log.info("=" * 70)

    from eif import iForest

    normal_df = df[df["label"] == 0]
    X_normal = normal_df[FEATURE_COLS].values.astype(np.float64)
    log.info(f"Normal data: {len(X_normal)} samples from {normal_df['source_dataset'].nunique()} datasets")
    log.info(f"  Per-dataset: {normal_df['source_dataset'].value_counts().to_dict()}")

    sample_size = min(256, len(X_normal))
    log.info(f"Training EIF: ntrees=300, sample_size={sample_size}, ExtensionLevel=1")
    t0 = time.time()

    eif = iForest(X_normal, ntrees=300, sample_size=sample_size, ExtensionLevel=1)
    log.info(f"EIF training: {time.time()-t0:.1f}s")

    # Calibration stats on normal data (use 10K subsample for speed)
    n_cal = min(10000, len(X_normal))
    np.random.seed(42)
    idx = np.random.choice(len(X_normal), n_cal, replace=False) if n_cal < len(X_normal) else np.arange(len(X_normal))
    log.info(f"Computing EIF paths on {n_cal} normal samples...")
    raw_normal = eif.compute_paths(X_in=X_normal[idx])
    cal_mean = float(np.mean(raw_normal))
    cal_std  = float(np.std(raw_normal))
    log.info(f"Calibration: mean={cal_mean:.6f}, std={cal_std:.6f}")

    z_normal = (raw_normal - cal_mean) / max(cal_std, 1e-10)
    sig_normal = 1.0 / (1.0 + np.exp(z_normal))
    threshold = float(np.percentile(sig_normal, 99))
    log.info(f"EIF threshold (1%% FPR): {threshold:.4f}")

    # Score malicious data (5K subsample for speed)
    mal_df = df[df["label"] == 1]
    n_mal_sample = min(5000, len(mal_df))
    mal_sample = mal_df[FEATURE_COLS].sample(n=n_mal_sample, random_state=42).values.astype(np.float64)
    log.info(f"Computing EIF paths on {n_mal_sample} malicious samples...")
    raw_mal = eif.compute_paths(X_in=mal_sample)
    z_mal = (raw_mal - cal_mean) / max(cal_std, 1e-10)
    sig_mal = 1.0 / (1.0 + np.exp(z_mal))

    delta = float(sig_mal.mean() - sig_normal.mean())
    log.info(f"EIF discrimination:")
    log.info(f"  Normal:    mean={sig_normal.mean():.4f} +/- {sig_normal.std():.4f}")
    log.info(f"  Malicious: mean={sig_mal.mean():.4f} +/- {sig_mal.std():.4f}")
    log.info(f"  Delta: {delta:+.4f} ({'CORRECT' if delta > 0 else 'INVERTED'})")

    # Per-dataset EIF scores (fast: 200 samples each)
    log.info("Per-dataset EIF scores:")
    for ds in sorted(mal_df["source_dataset"].unique()):
        ds_df = mal_df[mal_df["source_dataset"] == ds]
        ds_sample = ds_df[FEATURE_COLS].sample(n=min(200, len(ds_df)), random_state=42).values.astype(np.float64)
        ds_raw = eif.compute_paths(X_in=ds_sample)
        ds_z = (ds_raw - cal_mean) / max(cal_std, 1e-10)
        ds_sig = 1.0 / (1.0 + np.exp(ds_z))
        log.info(f"  {ds:20s}: mean_score={ds_sig.mean():.4f}")

    # Save (compress=3 for faster write + smaller file)
    import joblib
    log.info("Saving EIF model...")
    joblib.dump(eif, str(MODEL_DIR / "eif_v2.0.0.pkl"), compress=3)
    # Save calibration with auto-detected flip flag for inverted discrimination
    score_flip = 1 if delta < 0 else 0
    np.savez(str(MODEL_DIR / "eif_calibration.npz"), path_mean=cal_mean, path_std=cal_std, score_flip=score_flip)
    np.save(str(MODEL_DIR / "eif_threshold.npy"), threshold)
    log.info(f"Saved: eif_v2.0.0.pkl, eif_calibration.npz (flip={score_flip}), eif_threshold.npy")

    return {
        "cal_mean": cal_mean, "cal_std": cal_std, "threshold": threshold,
        "normal_mean": float(sig_normal.mean()), "mal_mean": float(sig_mal.mean()),
        "delta": delta,
    }


# =========================================================================
#  PHASE 4: TRAIN LIGHTGBM
# =========================================================================

def train_lightgbm(df):
    log.info("=" * 70)
    log.info("PHASE 3: Training LightGBM (multi-log classifier)")
    log.info("=" * 70)

    import lightgbm as lgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df["label"].values.astype(int)
    indices = df.index.values

    X_train, X_val, y_train, y_val, idx_train, idx_val = train_test_split(
        X, y, indices, test_size=0.2, random_state=42, stratify=y,
    )
    log.info(f"Train: {len(X_train):,} ({(y_train==1).sum():,} pos, {(y_train==0).sum():,} neg)")
    log.info(f"Val:   {len(X_val):,} ({(y_val==1).sum():,} pos, {(y_val==0).sum():,} neg)")

    scale_pos = (y_train == 0).sum() / max(1, (y_train == 1).sum())
    log.info(f"scale_pos_weight: {scale_pos:.4f}")

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_COLS, free_raw_data=False)
    val_data   = lgb.Dataset(X_val, label=y_val, reference=train_data, feature_name=FEATURE_COLS, free_raw_data=False)

    params = {
        "objective": "binary",
        "metric": ["binary_logloss", "auc"],
        "boosting_type": "gbdt",
        "num_leaves": 63,
        "max_depth": 8,
        "learning_rate": 0.05,
        "min_child_samples": 20,
        "colsample_bytree": 0.8,
        "subsample": 0.8,
        "subsample_freq": 5,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "scale_pos_weight": scale_pos,
        "verbose": -1,
        "seed": 42,
        "num_threads": os.cpu_count(),
        "device": "gpu",
    }

    t0 = time.time()
    try:
        model = lgb.train(
            params, train_data, num_boost_round=1000,
            valid_sets=[train_data, val_data], valid_names=["train", "val"],
            callbacks=[lgb.early_stopping(50, verbose=True), lgb.log_evaluation(100)],
        )
        log.info(f"LightGBM (GPU): {time.time()-t0:.1f}s, best_iter={model.best_iteration}")
    except Exception as e:
        log.warning(f"GPU failed ({e}), falling back to CPU...")
        params.pop("device", None)
        t0 = time.time()
        model = lgb.train(
            params, train_data, num_boost_round=1000,
            valid_sets=[train_data, val_data], valid_names=["train", "val"],
            callbacks=[lgb.early_stopping(50, verbose=True), lgb.log_evaluation(100)],
        )
        log.info(f"LightGBM (CPU): {time.time()-t0:.1f}s, best_iter={model.best_iteration}")

    y_prob = model.predict(X_val)
    y_pred = (y_prob >= 0.5).astype(int)
    acc  = accuracy_score(y_val, y_pred)
    prec = precision_score(y_val, y_pred, zero_division=0)
    rec  = recall_score(y_val, y_pred, zero_division=0)
    f1   = f1_score(y_val, y_pred, zero_division=0)
    log.info(f"Validation: Acc={acc:.4f} Prec={prec:.4f} Rec={rec:.4f} F1={f1:.4f}")

    # Per-dataset detection
    val_ds = df.loc[idx_val, "source_dataset"].values
    log.info("Per-dataset detection rates:")
    for ds in sorted(set(val_ds)):
        m = val_ds == ds
        n_pos = (y_val[m] == 1).sum()
        n_neg = (y_val[m] == 0).sum()
        if n_pos == 0:
            continue
        det = (y_prob[m][y_val[m]==1] >= 0.5).mean()
        fpr = (y_prob[m][y_val[m]==0] >= 0.5).mean() if n_neg > 0 else 0.0
        log.info(f"  {ds:20s}  detect={det:6.1%}  FPR={fpr:.2%}  n={m.sum()}")

    # Feature importance
    imp = sorted(zip(FEATURE_COLS, model.feature_importance("gain")), key=lambda x: -x[1])
    log.info("Feature importance (gain):")
    for name, val in imp[:10]:
        log.info(f"  {name:25s}: {val:.1f}")

    # Save native
    model.save_model(str(MODEL_DIR / "lgbm_v2.0.0.txt"))

    # Export ONNX
    log.info("Exporting to ONNX...")
    try:
        import onnxmltools
        import onnxmltools.convert.common.data_types as onnx_types
        onnx_model = onnxmltools.convert_lightgbm(
            model,
            initial_types=[("input", onnx_types.FloatTensorType([None, len(FEATURE_COLS)]))],
            target_opset=11,
        )
        onnx_path = str(MODEL_DIR / "lgbm_v2.0.0.onnx")
        onnxmltools.utils.save_model(onnx_model, onnx_path)
        log.info(f"Saved ONNX: lgbm_v2.0.0.onnx")

        # Verify
        import onnxruntime as ort
        sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0].name
        out = sess.run(None, {inp: X_val[:10]})
        onnx_probs = np.array([d.get(1, d.get("1", 0.0)) for d in out[1]])
        native_probs = model.predict(X_val[:10])
        diff = np.max(np.abs(onnx_probs - native_probs))
        log.info(f"ONNX verify: max_diff={diff:.6f} {'PASS' if diff < 0.01 else 'FAIL'}")
    except Exception as e:
        log.error(f"ONNX export failed: {e}", exc_info=True)

    with open(MODEL_DIR / "feature_cols.pkl", "wb") as f:
        pickle.dump(FEATURE_COLS, f)

    return {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1, "best_iteration": model.best_iteration}


# =========================================================================
#  PHASE 5: ARF STREAM + CHECKPOINT
# =========================================================================

def build_arf_stream(df):
    log.info("=" * 70)
    log.info("PHASE 4: Building ARF stream CSV + checkpoint")
    log.info("=" * 70)

    MAX_ROWS = 15000

    groups = df.groupby(["source_dataset", "label"])
    per_group = MAX_ROWS // max(1, len(groups))
    samples = [g.sample(n=min(per_group, len(g)), random_state=42) for _, g in groups]
    arf_df = pd.concat(samples, ignore_index=True).sample(frac=1, random_state=42).head(MAX_ROWS)

    csv_path = MODEL_DIR / "features_arf_stream_features.csv"
    arf_df[FEATURE_COLS + ["label"]].to_csv(str(csv_path), index=False)
    log.info(f"Saved ARF stream: {len(arf_df)} rows")
    log.info(f"  Label dist: {arf_df['label'].value_counts().to_dict()}")
    log.info(f"  Datasets: {arf_df['source_dataset'].value_counts().to_dict()}")

    # Train ARF (inherently sequential)
    log.info("Training ARF checkpoint...")
    try:
        from river.forest import ARFClassifier
        from river.drift import ADWIN

        arf = ARFClassifier(
            n_models=10,
            drift_detector=ADWIN(delta=0.002),
            warning_detector=ADWIN(delta=0.01),
            seed=42,
        )

        t0 = time.time()
        for i, (_, row) in enumerate(arf_df.iterrows()):
            x = {col: float(row[col]) for col in FEATURE_COLS}
            arf.learn_one(x, int(row["label"]))
            if (i + 1) % 3000 == 0:
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed
                remaining = (len(arf_df) - i - 1) / rate
                log.info(f"  ARF: {i+1}/{len(arf_df)} ({rate:.0f} rows/s, ~{remaining:.0f}s left)")

        log.info(f"ARF trained: {len(arf_df)} samples in {time.time()-t0:.1f}s")

        # Verify varying output
        z = {c: 0.0 for c in FEATURE_COLS}
        h = {c: 100.0 for c in FEATURE_COLS}
        p0 = arf.predict_proba_one(z).get(1, 0.5)
        p1 = arf.predict_proba_one(h).get(1, 0.5)
        log.info(f"ARF verify: p(zeros)={p0:.4f}, p(100s)={p1:.4f}, delta={abs(p0-p1):.4f}")

        with open(MODEL_DIR / "arf_v2.0.0.pkl", "wb") as f:
            pickle.dump(arf, f)
        log.info("Saved: arf_v2.0.0.pkl")
    except Exception as e:
        log.error(f"ARF training failed: {e}", exc_info=True)

    return {"n_rows": len(arf_df)}


# =========================================================================
#  PHASE 6: COMPUTE THRESHOLDS
# =========================================================================

def compute_thresholds(df, eif_stats):
    log.info("=" * 70)
    log.info("PHASE 5: Computing calibrated thresholds")
    log.info("=" * 70)

    import onnxruntime as ort
    import joblib

    sess = ort.InferenceSession(str(MODEL_DIR / "lgbm_v2.0.0.onnx"), providers=["CPUExecutionProvider"])
    inp_name = sess.get_inputs()[0].name
    eif = joblib.load(str(MODEL_DIR / "eif_v2.0.0.pkl"))
    cal_mean, cal_std = eif_stats["cal_mean"], eif_stats["cal_std"]

    # Stratified 10K sample (fast threshold computation)
    sample_df = df.groupby("label", group_keys=False).apply(
        lambda x: x.sample(n=min(5000, len(x)), random_state=42)
    )
    X = sample_df[FEATURE_COLS].values.astype(np.float32)
    y = sample_df["label"].values
    log.info(f"Threshold computation on {len(X)} samples...")

    # LightGBM
    out = sess.run(None, {inp_name: X})
    lgbm_s = np.array([d.get(1, d.get("1", 0.0)) for d in out[1]], dtype=np.float64)

    # EIF
    raw = eif.compute_paths(X_in=X.astype(np.float64))
    z = (raw - cal_mean) / max(cal_std, 1e-10)
    eif_s = 1.0 / (1.0 + np.exp(z))

    # Flip EIF scores if discrimination is inverted (normal > malicious)
    eif_cal = np.load(str(MODEL_DIR / "eif_calibration.npz"))
    if "score_flip" in eif_cal and int(eif_cal["score_flip"]):
        eif_s = 1.0 - eif_s
        log.info("EIF scores FLIPPED (inverted discrimination correction)")

    # Combined with v2 weights (LGBM=60%, EIF=15%, cold-start ARF at default 0.5)
    # ARF conf=0 → ARF weight=0, redistributed: LGBM=0.80, EIF=0.20
    combined = 0.80 * lgbm_s + 0.20 * eif_s

    ns = combined[y == 0]
    ms = combined[y == 1]

    p95  = float(np.percentile(ns, 95))
    p99  = float(np.percentile(ns, 99))
    mp25 = float(np.percentile(ms, 25))
    mp50 = float(np.percentile(ms, 50))

    suspicious = round(p95, 2)
    anomalous  = round(mp50, 2)

    # Ensure suspicious < anomalous
    if suspicious >= anomalous:
        suspicious = round(p95, 2)
        anomalous = round(max(mp25, suspicious + 0.05), 2)

    det_susp = (ms >= suspicious).mean()
    det_anom = (ms >= anomalous).mean()
    fpr_susp = (ns >= suspicious).mean()
    fpr_anom = (ns >= anomalous).mean()

    log.info(f"Normal:    mean={ns.mean():.4f}, p95={p95:.4f}, p99={p99:.4f}")
    log.info(f"Malicious: mean={ms.mean():.4f}, p25={mp25:.4f}, p50={mp50:.4f}")
    log.info(f"LGBM:      normal={lgbm_s[y==0].mean():.4f}, mal={lgbm_s[y==1].mean():.4f}")
    log.info(f"EIF:       normal={eif_s[y==0].mean():.4f}, mal={eif_s[y==1].mean():.4f}")
    log.info(f"Thresholds:")
    log.info(f"  suspicious={suspicious} (detect={det_susp:.1%}, FPR={fpr_susp:.2%})")
    log.info(f"  anomalous={anomalous}  (detect={det_anom:.1%}, FPR={fpr_anom:.2%})")

    return {
        "suspicious": suspicious, "anomalous": anomalous,
        "lgbm_normal": float(lgbm_s[y==0].mean()),
        "lgbm_mal": float(lgbm_s[y==1].mean()),
        "eif_normal": float(eif_s[y==0].mean()),
        "eif_mal": float(eif_s[y==1].mean()),
    }


# =========================================================================
#  PHASE 7: MANIFEST
# =========================================================================

def save_manifest(thresholds, eif_stats, lgbm_stats):
    manifest = {
        "lgbm": {
            "active": "v2.0.0", "file": "lgbm_v2.0.0.onnx",
            "metrics": {k: round(lgbm_stats[k], 4) for k in ["accuracy", "precision", "recall", "f1"]},
        },
        "eif": {
            "active": "v2.0.0", "file": "eif_v2.0.0.pkl",
            "calibration": {"mean": round(eif_stats["cal_mean"], 6), "std": round(eif_stats["cal_std"], 6)},
            "threshold": round(eif_stats["threshold"], 4),
            "discrimination_delta": round(eif_stats["delta"], 4),
        },
        "arf": {
            "active": "v2.0.0", "file": "arf_v2.0.0.pkl",
            "stream_csv": "features_arf_stream_features.csv",
        },
        "thresholds": {"suspicious": thresholds["suspicious"], "anomalous": thresholds["anomalous"]},
        "datasets": ["cicids2017", "nsl_kdd", "unsw_nb15", "nf_unsw_nb15_v3",
                      "nf_ton_iot", "csic_2010", "evtx", "loghub_linux", "loghub_apache"],
        "feature_cols": FEATURE_COLS,
    }
    with open(MODEL_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    log.info("Saved: manifest.json")


# =========================================================================
#  MAIN
# =========================================================================

def main():
    log.info("CLIF Triage -- Complete Retraining Pipeline")
    log.info(f"ZIP: {ZIP_PATH} (exists={ZIP_PATH.exists()})")
    assert ZIP_PATH.exists(), f"datasets.zip not found: {ZIP_PATH}"
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    np.random.seed(42)

    t_total = time.time()

    # Phase 1: Build combined dataset
    df = build_combined_dataset()
    df.to_csv(str(DATA_DIR / "features_combined_v2.csv"), index=False)
    log.info(f"Saved combined CSV: {len(df)} rows\n")

    # Phase 2: Train EIF on normal-only
    eif_stats = train_eif(df)

    # Phase 3: Train LightGBM on all data
    lgbm_stats = train_lightgbm(df)

    # Phase 4: Build ARF stream + checkpoint
    arf_stats = build_arf_stream(df)

    # Phase 5: Compute calibrated thresholds
    thresholds = compute_thresholds(df, eif_stats)

    # Phase 6: Save manifest
    save_manifest(thresholds, eif_stats, lgbm_stats)

    elapsed = time.time() - t_total
    log.info("\n" + "=" * 70)
    log.info("  RETRAINING COMPLETE")
    log.info("=" * 70)
    log.info(f"Total time: {elapsed/60:.1f} min")
    log.info(f"Data:  {len(df):,} rows, {df['source_dataset'].nunique()} datasets, {df[df['label']==1]['attack_type'].nunique()} attack types")
    log.info(f"LGBM:  F1={lgbm_stats['f1']:.4f}, Acc={lgbm_stats['accuracy']:.4f}, Prec={lgbm_stats['precision']:.4f}, Rec={lgbm_stats['recall']:.4f}")
    log.info(f"EIF:   normal={eif_stats['normal_mean']:.4f}, mal={eif_stats['mal_mean']:.4f}, delta={eif_stats['delta']:+.4f}")
    log.info(f"Thresh: suspicious={thresholds['suspicious']}, anomalous={thresholds['anomalous']}")
    log.info(f"Files in: {MODEL_DIR}")

    log.info("\n--- UPDATE config.py ---")
    log.info(f'MODEL_LGBM_PATH       = "/models/lgbm_v2.0.0.onnx"')
    log.info(f'MODEL_EIF_PATH        = "/models/eif_v2.0.0.pkl"')
    log.info(f'MODEL_ARF_CHECKPOINT  = "/models/arf_v2.0.0.pkl"')
    log.info(f'SUSPICIOUS_THRESHOLD  = {thresholds["suspicious"]}')
    log.info(f'ANOMALOUS_THRESHOLD   = {thresholds["anomalous"]}')

    return 0


if __name__ == "__main__":
    sys.exit(main())
