# CLIF Cluster — 2-PC Deployment Guide

Deploy all 22+ CLIF services at full scale across two Windows PCs on the same LAN.

## Architecture

```
┌──────────────────────────────────────┐    LAN    ┌──────────────────────────────────────┐
│  PC1  —  DATA TIER  (~12 GB)        │◄──────────►│  PC2  —  COMPUTE TIER  (~8 GB)       │
│                                      │           │                                      │
│  Redpanda ×3   (19092/29092/39092)   │           │  Vector          (1514, 8687)        │
│  ClickHouse ×2 (8123, 9000)         │           │  Triage Agent    (8300)               │
│  CH Keeper     (12181)               │           │  Hunter Agent    (8400)               │
│  MinIO ×3      (9002)               │           │  Verifier Agent  (8500)               │
│  Consumer ×3   (internal)           │           │  AI Classifier   (8200)               │
│  Redpanda Init (one-shot)           │           │  LanceDB         (8100)               │
│  MinIO Init    (one-shot)           │           │  Merkle Service                       │
│                                      │           │  Redpanda Console(8080)               │
│  12 services (3 one-shot)           │           │  Dashboard       (3001, native npm)   │
│                                      │           │  [opt] Prometheus(9090) + Grafana     │
│                                      │           │                                      │
│                                      │           │  8-10 services + Next.js dashboard    │
└──────────────────────────────────────┘           └──────────────────────────────────────┘
```

**Data flow:** Logs → Vector (PC2:1514) → Redpanda (PC1) → Consumer (PC1) → ClickHouse (PC1) → Dashboard (PC2:3001)

## Prerequisites

| Requirement | Both PCs |
|---|---|
| OS | Windows 10/11 |
| Docker Desktop | ≥ 4.25 (Compose v2) |
| RAM | ≥ 14 GB each |
| Network | Same LAN, can ping each other |
| Repo | CLIF repo cloned to same path |

## Quick Start

### Step 1 — PC1 (Data Tier)

```powershell
cd C:\CLIF

# Auto-detect LAN IP and configure cluster
.\cluster\setup.ps1 -Role pc1

# Open firewall for PC2 (run as Administrator)
.\cluster\firewall-pc1.ps1

# Start data services
docker compose -f docker-compose.pc1.yml --env-file .env --env-file cluster\.env up -d

# Wait for healthy (all should show "healthy" in 60-90s)
docker compose -f docker-compose.pc1.yml ps
```

### Step 2 — PC2 (Compute Tier)

```powershell
cd C:\CLIF

# Configure with PC1's IP (e.g., 192.168.1.100)
.\cluster\setup.ps1 -Role pc2 -DataIP 192.168.1.100

# Start compute services
docker compose -f docker-compose.pc2.yml --env-file .env --env-file cluster\.env up -d

# (Optional) Include Prometheus + Grafana:
docker compose -f docker-compose.pc2.yml --env-file .env --env-file cluster\.env --profile monitoring up -d

# Start the dashboard
cd dashboard
# Edit .env.local → set CH_HOST to PC1's IP (e.g., 192.168.1.100)
npm run dev
```

### Step 3 — Verify

```powershell
# Run from PC2 (tests both tiers + end-to-end pipeline)
.\cluster\health-check.ps1 -Role all -DataIP 192.168.1.100
```

## Dashboard Configuration

Edit `dashboard/.env.local` on PC2:

```env
CH_HOST=192.168.1.100    # ← PC1's LAN IP (was localhost)
CH_PORT=8123
CH_USER=clif_admin
CH_PASSWORD=Cl1f_Ch@ngeM3_2026!
LANCEDB_URL=http://localhost:8100
```

## Key Port Mappings (PC1 → LAN)

| Port | Service | Purpose |
|------|---------|---------|
| 19092 | Redpanda 01 | Kafka external |
| 29092 | Redpanda 02 | Kafka external |
| 39092 | Redpanda 03 | Kafka external |
| 8123 | ClickHouse 01 | HTTP API |
| 8124 | ClickHouse 02 | HTTP API |
| 9000 | ClickHouse 01 | Native protocol |
| 9001 | ClickHouse 02 | Native protocol |
| 9002 | MinIO 1 | S3 data |
| 9003 | MinIO 1 | Console |
| 9363 | ClickHouse 01 | Prometheus metrics |
| 9364 | ClickHouse 02 | Prometheus metrics |
| 9644 | Redpanda 01 | Admin API |
| 9645 | Redpanda 02 | Admin API |
| 9646 | Redpanda 03 | Admin API |

## Memory Budget

### PC1 — Data Tier (~12 GB)

| Service | Reservation | Limit |
|---------|------------|-------|
| ClickHouse Keeper | 256 MB | 512 MB |
| ClickHouse 01 | 2 GB | 4 GB |
| ClickHouse 02 | 2 GB | 4 GB |
| Redpanda ×3 | 2 GB each (6 GB) | 3 GB each |
| MinIO ×3 | 256 MB each (768 MB) | 1 GB each |
| Consumer ×3 | 256 MB each (768 MB) | 1 GB each |
| **Total** | **~10.8 GB** | — |

### PC2 — Compute Tier (~6 GB)

| Service | Reservation | Limit |
|---------|------------|-------|
| Vector | 1 GB | 4 GB |
| LanceDB | 1 GB | 3 GB |
| Triage Agent | 1 GB | 4 GB |
| Hunter Agent | 512 MB | 3 GB |
| Verifier Agent | 512 MB | 2 GB |
| AI Classifier | 512 MB | 2 GB |
| Merkle | 128 MB | 512 MB |
| RP Console | — | 256 MB |
| Dashboard (npm) | ~500 MB | — |
| **Total** | **~5.2 GB** | — |

## Running the Benchmark

```powershell
# Send logs to Vector on PC2 (from either PC)
# If running from PC1, target PC2's IP:
.\scripts\benchmark.ps1 -TargetHost <PC2_IP> -TargetPort 1514 -Duration 30

# If running from PC2 (localhost):
.\scripts\benchmark.ps1 -TargetHost localhost -TargetPort 1514 -Duration 30
```

## Troubleshooting

### PC2 services can't reach PC1
1. Check Windows Firewall: `Get-NetFirewallRule -DisplayName 'CLIF-*' | Format-Table`
2. Test connectivity: `Test-NetConnection -ComputerName <PC1_IP> -Port 19092`
3. Ensure both PCs are on same subnet (e.g., 192.168.1.x)

### Redpanda Console shows no brokers
- The console uses hostnames `pc1-rp01:19092` etc. resolved via `extra_hosts`
- Verify `DATA_IP` in `cluster/.env` is correct
- Restart: `docker compose -f docker-compose.pc2.yml restart redpanda-console`

### Dashboard shows "connection refused"
- Edit `dashboard/.env.local` → `CH_HOST` must be PC1's LAN IP, not `localhost`
- Restart dashboard: `npm run dev`

### Falling back to single-machine mode
```powershell
# Stop cluster
docker compose -f docker-compose.pc1.yml down   # on PC1
docker compose -f docker-compose.pc2.yml down   # on PC2

# Use original single-machine compose
docker compose up -d
```

## File Reference

```
CLIF/
├── docker-compose.yml          ← Original single-machine (unchanged)
├── docker-compose.pc1.yml      ← PC1 data tier
├── docker-compose.pc2.yml      ← PC2 compute tier
├── .env                        ← Shared credentials (both PCs)
└── cluster/
    ├── .env                    ← Cluster-specific (DATA_IP, memory tuning)
    ├── setup.ps1               ← Interactive setup script
    ├── health-check.ps1        ← Cross-cluster health verification
    ├── firewall-pc1.ps1        ← Windows Firewall rules (run as Admin)
    ├── monitoring/
    │   ├── prometheus.yml      ← Prometheus config (cross-host targets)
    │   └── grafana-datasources.yml
    └── redpanda/
        └── console-config.yml  ← Console broker config (uses pc1-rpXX hosts)
```
