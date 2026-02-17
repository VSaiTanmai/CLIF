"""
CLIF AI Service — FastAPI REST API for ML Classification
=========================================================
Exposes HTTP endpoints for real-time security event classification.
Used by the CLIF dashboard and pipeline for AI-powered analysis.

Endpoints:
  POST /classify          - Classify a single event
  POST /classify/batch    - Classify multiple events
  GET  /health            - Health check
  GET  /model/info        - Model metadata
  GET  /model/leaderboard - Training leaderboard

Run:
  uvicorn ai_service:app --host 0.0.0.0 --port 8200 --workers 2
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent dirs to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from inference.inference import CLIFClassifier, map_clif_event_to_features

# ── Models ──────────────────────────────────────────────────────────────────

class EventFeatures(BaseModel):
    """Raw NSL-KDD features for direct classification."""
    duration: float = 0
    protocol_type: str = "tcp"
    service: str = "other"
    flag: str = "SF"
    src_bytes: float = 0
    dst_bytes: float = 0
    land: int = 0
    wrong_fragment: int = 0
    urgent: int = 0
    hot: int = 0
    num_failed_logins: int = 0
    logged_in: int = 0
    num_compromised: int = 0
    root_shell: int = 0
    su_attempted: int = 0
    num_root: int = 0
    num_file_creations: int = 0
    num_shells: int = 0
    num_access_files: int = 0
    num_outbound_cmds: int = 0
    is_host_login: int = 0
    is_guest_login: int = 0
    count: int = 1
    srv_count: int = 1
    serror_rate: float = 0.0
    srv_serror_rate: float = 0.0
    rerror_rate: float = 0.0
    srv_rerror_rate: float = 0.0
    same_srv_rate: float = 0.0
    diff_srv_rate: float = 0.0
    srv_diff_host_rate: float = 0.0
    dst_host_count: int = 0
    dst_host_srv_count: int = 0
    dst_host_same_srv_rate: float = 0.0
    dst_host_diff_srv_rate: float = 0.0
    dst_host_same_src_port_rate: float = 0.0
    dst_host_srv_diff_host_rate: float = 0.0
    dst_host_serror_rate: float = 0.0
    dst_host_srv_serror_rate: float = 0.0
    dst_host_rerror_rate: float = 0.0
    dst_host_srv_rerror_rate: float = 0.0

class CLIFEvent(BaseModel):
    """CLIF pipeline event (from Redpanda/ClickHouse)."""
    source_ip: str = ""
    dest_ip: str = ""
    source_port: int = 0
    dest_port: int = 0
    protocol: str = "tcp"
    service: str = ""
    duration: float = 0
    bytes_sent: int = 0
    bytes_received: int = 0
    connection_flag: str = "SF"
    failed_logins: int = 0
    logged_in: bool = False
    num_compromised: int = 0
    root_shell: bool = False
    su_attempted: bool = False
    connection_count: int = 1
    srv_count: int = 1
    serror_rate: float = 0.0
    srv_serror_rate: float = 0.0
    rerror_rate: float = 0.0
    srv_rerror_rate: float = 0.0
    same_srv_rate: float = 0.0
    diff_srv_rate: float = 0.0
    srv_diff_host_rate: float = 0.0
    dst_host_count: int = 0
    dst_host_srv_count: int = 0
    dst_host_same_srv_rate: float = 0.0
    dst_host_diff_srv_rate: float = 0.0
    dst_host_same_src_port_rate: float = 0.0
    dst_host_srv_diff_host_rate: float = 0.0
    dst_host_serror_rate: float = 0.0
    dst_host_srv_serror_rate: float = 0.0
    dst_host_rerror_rate: float = 0.0
    dst_host_srv_rerror_rate: float = 0.0
    # Additional CLIF fields
    hot_indicators: int = 0
    wrong_fragment: int = 0
    urgent: int = 0
    num_root: int = 0
    num_file_creations: int = 0
    num_shells: int = 0
    num_access_files: int = 0
    num_outbound_cmds: int = 0
    is_host_login: bool = False
    is_guest_login: bool = False

class ClassifyResponse(BaseModel):
    is_attack: bool
    confidence: float
    category: str
    category_confidence: float
    clif_category: str
    severity: str
    explanation: str
    binary_probs: Optional[Dict[str, float]] = None
    multi_probs: Optional[Dict[str, float]] = None

class BatchClassifyRequest(BaseModel):
    events: List[EventFeatures]

class BatchCLIFRequest(BaseModel):
    events: List[CLIFEvent]

class BatchClassifyResponse(BaseModel):
    results: List[ClassifyResponse]
    count: int
    latency_ms: float

# ── App ─────────────────────────────────────────────────────────────────────

classifier: Optional[CLIFClassifier] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML model on startup."""
    global classifier
    try:
        classifier = CLIFClassifier()
        print("[AI-Service] ML classifier loaded successfully")
    except Exception as e:
        print(f"[AI-Service] WARNING: Could not load ML classifier: {e}")
        classifier = None
    yield
    # Cleanup
    classifier = None

app = FastAPI(
    title="CLIF AI Classification Service",
    description="Tier-2 ML classifier for real-time security event analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy" if classifier else "degraded",
        "model_loaded": classifier is not None,
        "service": "clif-ai-classifier",
    }


@app.get("/model/info")
async def model_info():
    """Return model metadata."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return classifier.get_model_info()


@app.get("/model/leaderboard")
async def model_leaderboard():
    """Return training leaderboard."""
    lb_path = Path(__file__).resolve().parent / "models" / "leaderboard.json"
    if not lb_path.exists():
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    with open(lb_path) as f:
        return json.load(f)


@app.post("/classify", response_model=ClassifyResponse)
async def classify_event(event: EventFeatures):
    """Classify a single event using NSL-KDD features."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    result = classifier.classify(event.model_dump())
    return ClassifyResponse(**result)


@app.post("/classify/clif", response_model=ClassifyResponse)
async def classify_clif_event(event: CLIFEvent):
    """Classify a CLIF pipeline event (auto-maps to NSL-KDD features)."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Map CLIF event to NSL-KDD features
    features = map_clif_event_to_features(event.model_dump())
    result = classifier.classify(features)
    return ClassifyResponse(**result)


@app.post("/classify/batch", response_model=BatchClassifyResponse)
async def classify_batch(request: BatchClassifyRequest):
    """Classify a batch of events."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    events = [e.model_dump() for e in request.events]
    results = classifier.classify_batch(events)
    latency = (time.time() - t0) * 1000

    return BatchClassifyResponse(
        results=[ClassifyResponse(**r) for r in results],
        count=len(results),
        latency_ms=round(latency, 2),
    )


@app.post("/classify/clif/batch", response_model=BatchClassifyResponse)
async def classify_clif_batch(request: BatchCLIFRequest):
    """Classify a batch of CLIF pipeline events."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    features = [map_clif_event_to_features(e.model_dump()) for e in request.events]
    results = classifier.classify_batch(features)
    latency = (time.time() - t0) * 1000

    return BatchClassifyResponse(
        results=[ClassifyResponse(**r) for r in results],
        count=len(results),
        latency_ms=round(latency, 2),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", "8200"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
