# CLIF Demo Video Script — SIH 1733
## Cognitive Log Investigation Framework

---

**Total Duration: 8–10 minutes**  
**Resolution: 1920×1080 (Full HD)**  
**Tool: OBS Studio / ShareX (screen recording + mic)**  
**Tip: Use browser zoom at 90% so the full dashboard is visible without scrolling**

---

## PRE-RECORDING CHECKLIST

Before you hit record, make sure:

1. **Docker services are running** — all 18 containers healthy  
   ```powershell
   docker compose ps   # all should show "healthy"
   ```
2. **Producer is running** in a separate terminal for live data:  
   ```powershell
   python run_sysmon_eps_demo.py --duration 600
   ```
   Wait ~10 seconds so the dashboard has live data flowing.
3. **Next.js dev server** on `http://localhost:3001`  
   ```powershell
   cd dashboard && npm run dev
   ```
4. **Browser**: Chrome/Edge, dark mode enabled on OS, fullscreen (F11)
5. **Close** all other tabs, notifications, and distracting apps
6. **Bookmarks bar**: Hidden (Ctrl+Shift+B)

---

## SCRIPT

---

### SCENE 1 — Title Card (0:00 – 0:20)

> **[Show a slide or overlay with:]**
>
> **CLIF — Cognitive Log Investigation Framework**  
> **Smart India Hackathon 2024 — Problem Statement SIH 1733**  
> **Team Name / College Name**

**VOICEOVER:**

> "Hi, this is a demonstration of CLIF — the Cognitive Log Investigation Framework — built for Smart India Hackathon problem statement SIH 1733. CLIF is an AI-powered, real-time log analysis and cyber investigation platform that ingests tens of thousands of security events per second, classifies them using machine learning, and lets investigators examine threats through an intuitive web interface. Let's walk through it."

---

### SCENE 2 — Architecture Overview (0:20 – 1:00)

> **[Show the architecture diagram — you can use a pre-made slide or just mention it verbally while the dashboard loads]**

**VOICEOVER:**

> "Under the hood, CLIF runs a 20-service distributed pipeline. Sysmon and endpoint telemetry flows into a 3-node Redpanda cluster — a Kafka-compatible streaming platform. Three parallel consumers ingest events at over 60,000 events per second into a replicated ClickHouse cluster for analytics. An AI classifier powered by XGBoost runs real-time threat scoring. Every evidence batch is Merkle-tree anchored for forensic integrity, and all storage is backed by distributed MinIO object storage. The frontend is Next.js 14 with real-time polling."

> *(Optional: briefly flash the terminal showing `docker compose ps` — 18 services healthy)*

---

### SCENE 3 — Dashboard (1:00 – 2:30) ⭐ KEY SCENE

> **[Navigate to: `/dashboard`]**

**VOICEOVER:**

> "This is the Security Operations Center dashboard — the command centre for CLIF."

**ACTIONS + NARRATION:**

1. **Point to the KPI row** (6 cards at the top):
   > "At the top we have six real-time KPIs. Total Events ingested — you can see we're at over 20 million events. The Ingestion Rate shows our current throughput — right now we're sustaining around 40 to 60 thousand events per second, updating live every 2 seconds. Active Alerts, Active Incidents from our AI pipeline, the overall Risk Score computed from alert severity distribution, and Mean Time To Respond."

2. **Point to the Events/Minute chart**:
   > "This area chart shows real-time ingestion traffic — events per minute, with a live indicator. You can see the spikes as our producer pushes data through Redpanda into ClickHouse."

3. **Point to the Severity bar chart**:
   > "The severity distribution breaks down alerts by level — Info, Low, Medium, High, Critical — colour-coded for quick triage."

4. **Point to Live Alerts panel**:
   > "On the right, live alerts stream in real-time. Each alert card is colour-coded by severity — red border for critical, orange for high. You can see the category, description, and hostname."

5. **Scroll down to the bottom row**:
   > "Below, we have a MITRE ATT&CK tactics heatmap showing which attack techniques are most active — lateral movement, execution, persistence — with alert counts. Next to it, Risky Entities ranked by risk score — these are the hosts and users generating the most alerts. And finally, Recent Investigations — these are AI-driven cases that our agent pipeline has analyzed."

6. **Click the time range picker** (top right) and switch between ranges:
   > "The time range picker lets you scope all metrics — last 1 hour, 6 hours, 24 hours, 7 days."

7. **Right-click on an alert card** to show the context menu:
   > "Right-clicking any event anywhere in CLIF opens a context menu — you can start an AI investigation, search for similar events, copy the event ID, or pivot to related data."

---

### SCENE 4 — Live Feed (2:30 – 3:15)

> **[Navigate to: `/live-feed`]**

**VOICEOVER:**

> "The Live Feed page shows raw events streaming in real-time from all four tables — Raw Logs, Security Events, Process Events, and Network Events."

**ACTIONS + NARRATION:**

1. **Let it stream for 5-10 seconds** so events visibly scroll:
   > "Events are color-coded by severity and auto-scroll as they arrive. The counter at the top shows how many events have been received and the current ingestion rate."

2. **Click the Pause button**:
   > "You can pause the stream to examine events in detail without losing them."

3. **Type a filter** (e.g., "brute-force" or a hostname):
   > "There's a text filter to narrow down to specific patterns — hostnames, IPs, categories."

4. **Switch the table filter dropdown** from "All Tables" to "Security":
   > "And you can filter by table type — here I'm looking at only Security Events."

5. **Resume the stream** (click Play):
   > "Resume, and the feed continues."

---

### SCENE 5 — Alerts (3:15 – 4:00)

> **[Navigate to: `/alerts`]**

**VOICEOVER:**

> "The Alerts page provides a full, sortable, searchable alert management interface."

**ACTIONS + NARRATION:**

1. **Show the alert summary KPIs at the top** (total, critical, unacknowledged):
   > "At the top — total alerts, critical count, and unacknowledged alerts."

2. **Demonstrate the search bar** — type a hostname or category:
   > "Full-text search across all alert fields."

3. **Click severity filter badges** to filter by Critical / High:
   > "One-click severity filtering — I'll filter to just Critical alerts."

4. **Click on an individual alert row** to expand/acknowledge:
   > "Each alert can be expanded for details, acknowledged, or escalated. The severity badge, category, description, MITRE technique, and timestamp are all visible."

5. **Select multiple alerts using checkboxes** and show bulk actions:
   > "Bulk selection lets you acknowledge or dismiss multiple alerts at once."

---

### SCENE 6 — Search & Log Investigation (4:00 – 4:45)

> **[Navigate to: `/search`]**

**VOICEOVER:**

> "The Search page is where investigators conduct deep-dive queries across all log tables."

**ACTIONS + NARRATION:**

1. **Select a table** (e.g., "Security Events") from the dropdown.
2. **Type a search query** (e.g., an IP address like `10.` or a keyword like `brute-force`):
   > "I'll search for brute-force events in the security events table."
3. **Show results populating** with severity badges, timestamps, and metadata:
   > "Results come back with full detail — event ID, severity, category, hostname, IP addresses, MITRE mapping, and AI confidence scores."
4. **Click the Semantic Search toggle** (the sparkle icon):
   > "CLIF also supports semantic search — powered by vector embeddings in LanceDB — so you can search by meaning, not just keywords. For example, searching 'suspicious lateral movement' returns conceptually related events."
5. **Show pagination** (next/previous):
   > "Results are paginated for performance even on millions of rows."

---

### SCENE 7 — AI Agents & ML Pipeline (4:45 – 6:00) ⭐ KEY SCENE

> **[Navigate to: `/ai-agents`]**

**VOICEOVER:**

> "This is the AI Agents page — the heart of CLIF's automated investigation pipeline."

**ACTIONS + NARRATION:**

1. **Show the Agent Pipeline Architecture** (the visual pipeline at the top):
   > "CLIF uses a four-agent pipeline. The Triage Agent receives a raw event and determines if it's malicious using an XGBoost classifier. The Hunter Agent performs deep investigation — correlating with similar events, checking IPs, analysing patterns. The Verifier Agent cross-checks the findings for accuracy. And the Reporter Agent generates a structured investigation report with verdict, confidence score, and MITRE ATT&CK mapping."

2. **Show the agent status cards** (cases handled, response time, error count):
   > "Each agent's status is tracked — cases handled, average response time, and error rate."

3. **Click "Run Investigation"** on one of the sample events:
   > "Let me trigger a live investigation. I'll pick this suspicious network event..."

4. **Show the investigation running** (progress steps, animated):
   > "Watch the pipeline execute in real-time — Triage is analyzing... Hunter is investigating... Verifier is confirming... Reporter is generating the final report."

5. **When complete, show the investigation result**:
   > "The investigation is complete. We get a verdict — in this case, 'true positive' with 87% confidence. It's mapped to MITRE technique T1059 — Command-Line Interface execution. The full report shows triage analysis, hunter findings, verification results, and a narrative summary."

6. **Show the Leaderboard** at the bottom:
   > "The leaderboard tracks all past investigations — sortable by confidence, severity, verdict, and duration."

---

### SCENE 8 — Explainability / XAI (6:00 – 6:40)

> **[Navigate to: `/explainability`]**

**VOICEOVER:**

> "Explainability is critical for trustworthy AI. This page shows how our XGBoost model makes decisions using SHAP — SHapley Additive exPlanations."

**ACTIONS + NARRATION:**

1. **Show the SHAP waterfall chart**:
   > "The waterfall chart visualises how each feature pushes the model's prediction. Red features push toward 'malicious', blue features push toward 'benign'. For example, a high connection rate from a single source IP strongly increases the attack probability."

2. **Show the global feature importance bar chart**:
   > "Below that, global feature importance shows which features matter most across all predictions — connection duration, service type, protocol flags, byte counts."

3. **Point out the prediction summary**:
   > "The summary shows the final prediction, confidence score, and which features were decisive — making AI decisions transparent and auditable."

---

### SCENE 9 — CLIF AI Chat (6:40 – 7:10)

> **[Navigate to: `/chat`]**

**VOICEOVER:**

> "CLIF also includes a conversational AI assistant."

**ACTIONS + NARRATION:**

1. **Click a suggested prompt** (e.g., "How does the investigation pipeline work?"):
   > "You can ask natural language questions about the system, about security concepts, about specific events."

2. **Type a custom question** like "What are the top threat categories in the last hour?":
   > "The AI leverages the full context of CLIF's pipeline, data models, and security knowledge to provide detailed answers."

3. **Show the response rendering** (Markdown formatted):
   > "Responses are formatted with proper structure, code blocks, and references."

---

### SCENE 10 — Chain of Custody / Evidence (7:10 – 7:50)

> **[Navigate to: `/evidence`]**

**VOICEOVER:**

> "For forensic integrity, every evidence batch in CLIF is cryptographically anchored using Merkle trees."

**ACTIONS + NARRATION:**

1. **Show the Evidence KPI cards** (total batches, anchored events, verification rate):
   > "We've anchored over 15 million events across hundreds of batches. The verification rate shows integrity status."

2. **Show an evidence batch row** and expand it:
   > "Each batch has a Merkle root hash, batch ID, event count, and timestamp. You can expand to see the full hash chain."

3. **Click Verify** on a batch:
   > "Clicking Verify runs a cryptographic integrity check — recomputing the Merkle tree to confirm no data has been tampered with. Green checkmark means intact."

4. **Mention the forensic significance**:
   > "This ensures that log evidence is court-admissible and tamper-proof — critical for real-world cyber forensics."

---

### SCENE 11 — Reports (7:50 – 8:20)

> **[Navigate to: `/reports`]**

**VOICEOVER:**

> "The Reports page provides automated, data-driven security reports."

**ACTIONS + NARRATION:**

1. **Show the report list** with pre-generated reports (Executive Summary, Incident, Compliance, etc.):
   > "CLIF generates multiple report types — Executive Summary, Incident Report, Technical Analysis, Compliance Report, Threat Intelligence, and Forensic Reports — all populated with real data from ClickHouse."

2. **Click on a report** to expand details:
   > "Each report includes key metrics, severity breakdown, top threats, MITRE mapping, and actionable recommendations."

3. **Click Download** and show format options (PDF, JSON, CSV, Markdown):
   > "Reports can be exported in multiple formats — PDF for executives, JSON for integration, CSV for analysts, Markdown for documentation."

---

### SCENE 12 — Threat Intel & Attack Graph (8:20 – 8:50)

> **[Navigate to: `/threat-intel`]**

**VOICEOVER:**

> "The Threat Intelligence page aggregates Indicators of Compromise — IOCs — and threat patterns."

**ACTIONS + NARRATION:**

1. **Show the IOC table** (IPs, domains, hashes with confidence, threat level, source):
   > "Each IOC shows type, value, confidence level, associated threat actor, and MITRE technique. Analysts can search, filter, and correlate."

2. **Quickly switch to `/attack-graph`**:
   > "The Attack Graph page visualizes relationships between investigations, entities, and attack techniques using an interactive node graph — you can zoom, pan, and click nodes to drill down."

---

### SCENE 13 — System Health (8:50 – 9:10)

> **[Navigate to: `/system`]**

**VOICEOVER:**

> "Finally, System Health gives full observability into the infrastructure."

**ACTIONS + NARRATION:**

1. **Show the service status grid** (all green):
   > "All 18 services are monitored — ClickHouse, Redpanda brokers, consumers, MinIO, AI classifier, Merkle tree service — all showing healthy."

2. **Point to Redpanda cluster details**:
   > "Redpanda shows 3 brokers, 48 partitions, controller ID, and health status."

3. **Point to ClickHouse metrics**:
   > "ClickHouse shows total inserted rows and cluster status — both nodes healthy."

---

### SCENE 14 — Performance Proof (9:10 – 9:30)

> **[Show the terminal where the producer is running]**

**VOICEOVER:**

> "To prove performance — this terminal shows our Sysmon event producer sustaining over 60,000 events per second with peaks above 100,000 EPS. Zero errors, zero data loss. This is a single Python process pushing to a 3-node Redpanda cluster with 3 parallel consumers landing data in a replicated ClickHouse cluster."

> *(Let the terminal output scroll for 3-5 seconds showing the EPS numbers)*

---

### SCENE 15 — Closing (9:30 – 9:50)

> **[Return to the Dashboard page — let it auto-refresh once]**

**VOICEOVER:**

> "To summarize — CLIF is a complete, production-grade cognitive log investigation framework. Real-time streaming ingestion at 60K+ EPS, AI-powered multi-agent investigation, SHAP-based explainabilty, Merkle-tree forensic integrity, MITRE ATT&CK integration, and a modern SOC dashboard — all open source, all running on commodity hardware. Thank you for watching."

> **[Fade to the title card or team slide]**

---

## TIMING BREAKDOWN

| Scene | Section | Duration |
|-------|---------|----------|
| 1 | Title Card | 0:20 |
| 2 | Architecture Overview | 0:40 |
| 3 | Dashboard | 1:30 |
| 4 | Live Feed | 0:45 |
| 5 | Alerts | 0:45 |
| 6 | Search | 0:45 |
| 7 | AI Agents (Run Investigation) | 1:15 |
| 8 | Explainability / XAI | 0:40 |
| 9 | CLIF AI Chat | 0:30 |
| 10 | Chain of Custody | 0:40 |
| 11 | Reports | 0:30 |
| 12 | Threat Intel + Attack Graph | 0:30 |
| 13 | System Health | 0:20 |
| 14 | Performance Proof (Terminal) | 0:20 |
| 15 | Closing | 0:20 |
| **TOTAL** | | **~9:30** |

---

## PRO TIPS FOR RECORDING

1. **Run the producer 30 seconds BEFORE recording** so the dashboard is already populated with live data and the EPS numbers are warm.

2. **Mouse movements**: Move slowly and deliberately. Hover over elements to let tooltips appear. Don't click frantically.

3. **Pause on each screen** for 2-3 seconds before narrating — gives the viewer time to absorb the visuals.

4. **Right-click context menu**: Practice this — it's a powerful demo moment. Right-click an alert on the dashboard, then show the "Investigate with AI" option.

5. **AI Investigation**: This is your **showstopper moment**. Make sure the AI classify endpoint is responsive. Pre-test one run before recording.

6. **If something loads slow**: Don't panic. Say "As this loads, let me explain..." and fill with architecture/design explanation.

7. **Dark mode**: Keep the dashboard in dark mode — it looks more professional on video and screams "SOC analyst tool."

8. **Browser zoom**: Set to 90% (`Ctrl + -`) so the full page width is visible without horizontal scrolling.

9. **Terminal font size**: Increase to 14-16pt so EPS numbers are readable on video.

10. **Export one report** before recording so you can show the downloaded file.

---

## KEYWORDS TO EMPHASIZE

These are SIH evaluation keywords you should naturally mention:

- **Real-time streaming** (Redpanda + SSE)
- **60,000+ Events Per Second** (scalability)
- **AI/ML-powered** (XGBoost, multi-agent pipeline)
- **Explainable AI** (SHAP values)
- **MITRE ATT&CK framework** (industry standard)
- **Merkle tree** / forensic integrity / tamper-proof
- **Chain of custody** (court-admissible)
- **Distributed architecture** (ClickHouse replication, 3-node Redpanda)
- **Zero data loss** (0 errors in producer)
- **Open source** technologies
- **SOC analyst** / incident response workflow
