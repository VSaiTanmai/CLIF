"""CLIF AI Service - FastAPI REST API for ML Classification & Agent Orchestration
================================================================================
Exposes HTTP endpoints for ML classification and AI agent investigation pipeline.

Endpoints:
  POST /classify              - Classify a single event (with XAI)
  POST /classify/batch        - Classify multiple events
  POST /explain               - Full SHAP-based XAI explanation
  POST /explain/clif          - SHAP explanation for CLIF events
  POST /investigate           - Full 4-agent investigation pipeline
  POST /investigate/triage    - Quick triage only
  POST /chat                  - Chat with CLIF AI (Ollama qwen)
  GET  /agents/status         - All agent statuses
  GET  /agents/investigations - Recent investigation history
  GET  /agents/investigations/{id} - Get specific investigation detail
  GET  /health                - Health check
  GET  /model/info            - Model metadata
  GET  /model/features        - Global feature importance
  GET  /model/leaderboard     - Training leaderboard
  GET  /xai/status            - XAI/SHAP integration status

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
from agents.orchestrator import Orchestrator
from agents.llm import get_llm_status, is_llm_available

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

class XAIFeature(BaseModel):
    """A single SHAP feature attribution."""
    feature: str
    display_name: str
    shap_value: float
    abs_shap_value: float = 0.0
    feature_value: Optional[float] = None
    raw_value: Optional[Any] = None
    impact: str = "positive"  # positive or negative
    category: str = "other"


class XAIWaterfall(BaseModel):
    """Waterfall data showing base value → prediction."""
    base_value: float = 0.0
    output_value: float = 0.0
    features: List[Dict[str, Any]] = []


class XAIData(BaseModel):
    """Explainable AI data from SHAP analysis."""
    top_features: List[XAIFeature] = []
    feature_contributions: Optional[Dict[str, float]] = None
    waterfall: Optional[XAIWaterfall] = None
    prediction_drivers: str = ""
    category_attribution: Optional[Dict[str, float]] = None
    model_type: str = ""
    explainer_type: str = "SHAP TreeExplainer"
    top_k: int = 10
    error: Optional[str] = None


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
    xai: Optional[XAIData] = None

class BatchClassifyRequest(BaseModel):
    events: List[EventFeatures]

class BatchCLIFRequest(BaseModel):
    events: List[CLIFEvent]

class GenericEvent(BaseModel):
    """
    Accepts ANY log event (Sysmon, Windows Security, auth, firewall, generic).
    All fields are optional — the Triage Agent auto-detects the log type.
    """
    model_config = {"extra": "allow"}

    # Common optional fields for auto-detection
    EventID: Optional[int] = None
    Channel: Optional[str] = None
    source: Optional[str] = None
    message: Optional[str] = None
    timestamp: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    user_id: Optional[str] = None
    level: Optional[str] = None
    log_type: Optional[str] = None  # explicit hint: sysmon, auth, firewall, etc.

class BatchClassifyResponse(BaseModel):
    results: List[ClassifyResponse]
    count: int
    latency_ms: float

# ── App ─────────────────────────────────────────────────────────────────────

classifier: Optional[CLIFClassifier] = None
orchestrator: Optional[Orchestrator] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML model and initialise agent orchestrator on startup."""
    global classifier, orchestrator
    try:
        classifier = CLIFClassifier()
        print("[AI-Service] ML classifier loaded successfully")
    except Exception as e:
        print(f"[AI-Service] WARNING: Could not load ML classifier: {e}")
        classifier = None

    # Initialise orchestrator (shares the same classifier instance)
    try:
        ch_url = os.getenv("CLICKHOUSE_HTTP_URL", "http://localhost:8123")
        ch_user = os.getenv("CLICKHOUSE_USER", "clif_admin")
        ch_pass = os.getenv("CLICKHOUSE_PASSWORD", "Cl1f_Ch@ngeM3_2026!")
        ch_db = os.getenv("CLICKHOUSE_DB", "clif_logs")
        lance_url = os.getenv("LANCEDB_URL", "http://localhost:8100")
        ollama_model = os.getenv("OLLAMA_MODEL", None)
        ollama_url = os.getenv("OLLAMA_BASE_URL", None)

        orchestrator = Orchestrator(
            classifier=classifier,
            clickhouse_url=ch_url,
            clickhouse_user=ch_user,
            clickhouse_password=ch_pass,
            clickhouse_db=ch_db,
            lancedb_url=lance_url,
            ollama_model=ollama_model,
            ollama_base_url=ollama_url,
        )
        print("[AI-Service] Agent orchestrator initialised (4 agents + DSPy/Ollama LLM)")
    except Exception as e:
        print(f"[AI-Service] WARNING: Could not init orchestrator: {e}")
        orchestrator = None

    yield
    # Cleanup
    classifier = None
    orchestrator = None

app = FastAPI(
    title="CLIF AI Classification & Agent Service",
    description="Tier-2 ML classifier + 4-agent investigation pipeline for security analysis",
    version="2.0.0",
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
    llm = get_llm_status()
    return {
        "status": "healthy" if classifier else "degraded",
        "model_loaded": classifier is not None,
        "orchestrator_ready": orchestrator is not None,
        "agents": len(orchestrator.agents) if orchestrator else 0,
        "llm_available": llm.get("available", False),
        "llm_model": llm.get("model", ""),
        "service": "clif-ai-service",
    }


@app.get("/llm/status")
async def llm_status():
    """Return DSPy/Ollama LLM integration status."""
    return get_llm_status()


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
    """Classify a single event using NSL-KDD features.

    Returns classification with SHAP-based XAI feature attribution
    when the SHAP explainer is available.
    """
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    result = classifier.classify(event.model_dump())
    return result


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

# ── XAI / Explainability Endpoints ────────────────────────────────────────────

@app.post("/explain")
async def explain_event(event: EventFeatures):
    """Classify + generate full SHAP-based XAI explanation for a single event.

    Returns classification result with detailed SHAP feature attribution,
    waterfall data for visualization, and human-readable prediction drivers.
    """
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not classifier.xai_available:
        raise HTTPException(
            status_code=501,
            detail="XAI unavailable — SHAP not installed. pip install shap",
        )

    result = classifier.explain_event(event.model_dump())
    return result


@app.post("/explain/clif")
async def explain_clif_event(event: CLIFEvent):
    """Explain a CLIF pipeline event with SHAP attribution."""
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not classifier.xai_available:
        raise HTTPException(status_code=501, detail="XAI unavailable")

    features = map_clif_event_to_features(event.model_dump())
    result = classifier.explain_event(features)
    return result


@app.get("/model/features")
async def model_feature_importance():
    """Return global feature importance from the model (Gini importance).

    Useful for understanding which features the model considers most
    important across all predictions.
    """
    if not classifier:
        raise HTTPException(status_code=503, detail="Model not loaded")

    importance = classifier.get_global_feature_importance()
    return {
        "features": importance,
        "total_features": len(classifier.encoded_features),
        "xai_available": classifier.xai_available,
    }


@app.get("/xai/status")
async def xai_status():
    """Return XAI/SHAP integration status."""
    if not classifier:
        return {
            "available": False,
            "reason": "ML classifier not loaded",
        }
    return {
        "available": classifier.xai_available,
        "explainer_type": "SHAP TreeExplainer" if classifier.xai_available else None,
        "feature_count": len(classifier.encoded_features),
        "top_k": classifier._explainer.top_k if classifier._explainer else None,
        "model_types": {
            "binary": classifier.config['binary_model']['name'],
            "multiclass": classifier.config['multiclass_model']['name'],
        },
    }

# ── Agent Endpoints ─────────────────────────────────────────────────────────

@app.post("/investigate")
async def investigate(event: EventFeatures):
    """Run the full 4-agent investigation pipeline (NSL-KDD features)."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")

    result = await orchestrator.investigate(event.model_dump(), source="api")
    return result


@app.post("/investigate/clif")
async def investigate_clif(event: CLIFEvent):
    """Run full investigation on a CLIF pipeline event."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")

    features = map_clif_event_to_features(event.model_dump())
    result = await orchestrator.investigate(features, source="clif")
    return result


@app.post("/investigate/generic")
async def investigate_generic(event: GenericEvent):
    """Run full investigation on ANY log type (auto-detects log type).

    Accepts Sysmon, Windows Security, auth (SSH/sudo/PAM),
    firewall, and generic/unknown log events.  The Triage Agent
    internally routes to the correct rule-based classifier.
    """
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")

    # Pass through all fields including extras
    event_dict = event.model_dump()
    # Also include any extra fields (pydantic v2 extra="allow")
    if hasattr(event, "model_extra") and event.model_extra:
        event_dict.update(event.model_extra)

    result = await orchestrator.investigate(event_dict, source="generic")
    return result


@app.post("/investigate/triage")
async def investigate_triage_only(event: EventFeatures):
    """Quick triage only — no deep investigation."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")

    result = await orchestrator.triage_only(event.model_dump())
    return result


@app.get("/agents/status")
async def agent_status():
    """Return the status of all AI agents."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")
    return {
        "agents": orchestrator.get_agent_statuses(),
        "total_agents": len(orchestrator.agents),
    }


@app.get("/agents/investigations")
async def recent_investigations(limit: int = 20):
    """Return recent investigation summaries."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")
    return {
        "investigations": orchestrator.get_recent_investigations(limit),
    }


@app.get("/agents/investigations/{investigation_id}")
async def get_investigation(investigation_id: str):
    """Retrieve a specific investigation's full context by ID."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator not loaded")
    result = orchestrator.get_investigation_by_id(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return result


# ── Chat Endpoint ───────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None  # optional: event / log for context


@app.post("/chat")
async def chat(request: ChatRequest):
    """Chat with the CLIF AI assistant using the local Ollama LLM.

    If LLM is unavailable, returns a helpful fallback response
    explaining what CLIF can do without LLM.
    """
    from agents.llm import is_llm_available, OLLAMA_BASE_URL, OLLAMA_MODEL

    messages = request.messages
    context = request.context

    # Build system prompt
    system_prompt = (
        "You are CLIF AI, a security operations assistant for the CLIF "
        "(Cognitive Log Investigation Framework) platform. You help SOC analysts "
        "investigate security events, understand attack patterns, interpret MITRE ATT&CK mappings, "
        "explain SHAP-based XAI results, and provide remediation advice.\n\n"
        "You have access to:\n"
        "- ML classifiers (ExtraTrees / LightGBM for attack detection on NSL-KDD features)\n"
        "- 4-agent investigation pipeline (Triage → Hunter → Verifier → Reporter)\n"
        "- SHAP-based Explainable AI for model transparency\n"
        "- ClickHouse log storage and LanceDB vector search\n\n"
        "Be concise, technical, and actionable. Use proper security terminology.\n"
        "When discussing events, reference MITRE ATT&CK framework where applicable."
    )

    if context:
        system_prompt += f"\n\nCurrent context (security event or log):\n{json.dumps(context, indent=2, default=str)}"

    if not is_llm_available():
        # Fallback — generate a helpful response without LLM
        user_msg = messages[-1].content if messages else ""
        fallback = _generate_fallback_response(user_msg, context)
        return {
            "response": fallback,
            "model": OLLAMA_MODEL,
            "llm_used": False,
            "note": "LLM unavailable — using built-in response engine",
        }

    # Call Ollama directly for chat (not via DSPy — free-form chat)
    try:
        import httpx
        ollama_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            ollama_messages.append({"role": msg.role, "content": msg.content})

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": ollama_messages,
                    "stream": False,
                    "options": {"temperature": 0.4, "num_predict": 1024},
                },
            )
            if resp.status_code != 200:
                raise Exception(f"Ollama returned {resp.status_code}")
            data = resp.json()
            answer = data.get("message", {}).get("content", "")
            return {
                "response": answer,
                "model": OLLAMA_MODEL,
                "llm_used": True,
            }
    except Exception as e:
        # Fallback on error
        user_msg = messages[-1].content if messages else ""
        fallback = _generate_fallback_response(user_msg, context)
        return {
            "response": fallback,
            "model": OLLAMA_MODEL,
            "llm_used": False,
            "note": f"LLM error ({str(e)[:80]}) — using built-in response engine",
        }


def _generate_fallback_response(user_msg: str, context: Optional[Dict] = None) -> str:
    """Generate a helpful response without LLM access."""
    lower = user_msg.lower()

    if context:
        cat = context.get("category", context.get("event_type", ""))
        sev = context.get("severity", "")
        return (
            f"I can see you're looking at a **{cat}** event (severity: {sev}).\n\n"
            "Here's what I recommend:\n"
            "1. **Send to Investigation** — Run the full 4-agent pipeline for deep analysis\n"
            "2. **Check XAI** — View SHAP feature attributions on the Explainability page\n"
            "3. **Correlate** — Search for related events by source IP or hostname\n\n"
            "*Note: The LLM (qwen3) is currently offline. Start Ollama for enhanced analysis.*"
        )

    if any(w in lower for w in ["mitre", "att&ck", "tactic", "technique"]):
        return (
            "CLIF maps detected attacks to the **MITRE ATT&CK** framework automatically.\n\n"
            "Each investigation's Triage Agent identifies relevant tactics and techniques:\n"
            "- **Tactics**: Initial Access, Execution, Persistence, etc.\n"
            "- **Techniques**: E.g., T1059 (Command & Scripting), T1078 (Valid Accounts)\n\n"
            "Check the investigation detail page for full ATT&CK mapping."
        )

    if any(w in lower for w in ["xai", "shap", "explain", "feature"]):
        return (
            "CLIF uses **SHAP TreeExplainer** for model transparency.\n\n"
            "For any classified event, SHAP computes exact Shapley values showing:\n"
            "- Which features pushed the prediction toward attack/benign\n"
            "- Category-level attribution (traffic, connection, error rates)\n"
            "- Decision waterfall from base prediction to final output\n\n"
            "Visit the **Explainability** page for interactive visualization."
        )

    if any(w in lower for w in ["investigate", "pipeline", "agent"]):
        return (
            "CLIF's 4-agent investigation pipeline:\n\n"
            "1. **Triage Agent** — Classifies the event (ML + rules), assigns severity/priority\n"
            "2. **Hunter Agent** — Correlates with ClickHouse + LanceDB semantic search\n"
            "3. **Verifier Agent** — Validates findings, checks false positive patterns\n"
            "4. **Reporter Agent** — Generates structured investigation report\n\n"
            "Click any log → **Send to Investigation** to run the full pipeline."
        )

    return (
        "I'm **CLIF AI**, your security operations assistant.\n\n"
        "I can help you with:\n"
        "- **Investigating events** — Analyse logs through the 4-agent pipeline\n"
        "- **Understanding attacks** — MITRE ATT&CK mapping and context\n"
        "- **Explaining detections** — SHAP-based XAI feature attribution\n"
        "- **Security guidance** — Remediation advice and best practices\n\n"
        "*Start Ollama with `ollama serve` for full LLM-powered analysis.*"
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", "8200"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
