# =============================================================================
# CLIF Hunter Agent — Placeholder Dockerfile
# =============================================================================
# This service will house:
#   - Deep investigation of escalated anomalies from Triage
#   - ClickHouse temporal correlation queries (30-min window)
#   - Multi-event kill chain reconstruction
#   - MITRE ATT&CK tactic/technique mapping
#   - Evidence gathering for Verifier
#
# Input:  hunter-tasks
# Output: hunter-results, verifier-tasks
# =============================================================================
FROM python:3.11-slim

WORKDIR /app
RUN pip install --no-cache-dir flask

RUN echo 'from flask import Flask, jsonify\nimport os\napp = Flask(__name__)\n@app.route("/health")\ndef health(): return jsonify({"status":"placeholder","service":"hunter-agent"})\nif __name__=="__main__": app.run(host="0.0.0.0",port=int(os.environ.get("HUNTER_PORT","8400")))' > health.py

EXPOSE 8400
CMD ["python", "health.py"]
