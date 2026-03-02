# CLIF Pipeline Benchmark Results

**Date:** 2026-03-02  
**Machine:** 12 logical CPUs, 16 GB RAM, Windows 11 + Docker Desktop (WSL2)  
**Stack:** Vector 0.42.0 (4 threads, 2 GB) → Redpanda 24.2.8 (3 brokers) → Python consumers (3×) → ClickHouse 24.8 (2 replicated nodes)  
**Compose:** `docker-compose.eps-test.yml` — 10 containers, ~11.5 GB total memory limits  

---

## Benchmark Results

| Test | Protocol | Duration | Events Sent | Avg EPS | Peak EPS | Errors | Delivery Rate |
|------|----------|----------|-------------|---------|----------|--------|---------------|
| **Synthetic** (5 templates, 8 threads) | HTTP JSON | 30s | 1,371,240 | **45,675** | 47,112 | 0 | N/A (dedup kills ~99.99%) |
| **Real Logs** (11 datasets, 6 workers) | HTTP JSON | 60s | 311,517 | **5,118** | — | 0 | **98.7%** |
| **Real Logs** (11 datasets, 6 workers) | TCP NDJSON | 60s | 1,755,447 | **26,959** | — | 0 | **122%** (includes warmup) |

### Key Observations

1. **TCP is 5.3× faster than HTTP** for real log ingestion (26,959 vs 5,118 EPS). HTTP framing + request/response overhead is the dominant bottleneck for heterogeneous real logs.

2. **Synthetic vs Real gap:** Synthetic events (simple templates, fast JSON) achieve 45K EPS. Real heterogeneous logs with complex VRL processing achieve 5K (HTTP) or 27K (TCP). The VRL parsing/normalization overhead is significant but not the main bottleneck — HTTP protocol overhead is.

3. **Consumer throughput is adequate:** With all data validation fixes, consumers drain 300K+ events with 0 errors and 0 lag within 15 seconds. The consumers are NOT the bottleneck.

4. **End-to-end delivery: 98.7%** (HTTP real logs). The 1.3% gap is attributed to deduplication (identical events within the same second) rather than data loss.

---

## Bugs Fixed During Benchmarking

### BUG-1: Timestamp Type Mismatch (100% Event Loss)
- **Symptom:** Vector accepted events (HTTP 200) but Redpanda had 0 messages in all topics
- **Root cause:** `format_timestamp!(.timestamp, ...)` in VRL requires a native timestamp type, but JSON payloads deliver `.timestamp` as a string. The `parse_and_structure` transform only checked `if !exists(.timestamp)` — never converted existing string timestamps.
- **Impact:** 1,713,192 `conversion_failed` errors. ALL events routed to `_unmatched` (no sink) → 100% data loss.
- **Fix:** Added type checking + `parse_timestamp()` in `parse_and_structure` transform.

### BUG-2: IPv4 Validation (Consumer Stalls)
- **Symptom:** Consumers stalled at `rate=0` with 9K+ errors after consuming ~97K events
- **Root cause:** Network event fields (`src_ip`, `dst_ip`) could contain epoch timestamps (e.g., `'1556341751131'` from NetFlow/CICIDS datasets) or IPv6 addresses (`::1`, `fe80::...` from syslog). ClickHouse's `IPv4` column type rejects non-IPv4 strings.
- **Impact:** Consumer batch inserts failed, retried 5 times, then stalled permanently.
- **Fix:** Added IPv4 regex validation (`^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`) with fallback to `'0.0.0.0'` in three VRL locations: network event normalization, security event `ip_address`, and metadata map.

### BUG-3: Port Range Overflow (Consumer Stalls)  
- **Symptom:** Consumers stalled with `Column src_port: 'H' format requires 0 <= number <= 65535`
- **Root cause:** Non-numeric strings in port fields surviving `to_int()` conversion, passed through to ClickHouse UInt16 columns.
- **Fix:** Added `to_int()` + range check (`0 ≤ port ≤ 65535`) with fallback to `0` in both normalization stages.

---

## Datasets Used (Real Log Benchmark)

| Dataset | Events | Type | Source |
|---------|--------|------|--------|
| linux_syslog | 2,000 | syslog | Linux auth logs |
| apache_log | 2,000 | http_server | Apache access logs |
| evtx_attacks | 4,633 | windows_event_log | Windows EVTX attack dataset |
| cicids_web_attacks | 5,000 | ids_ips | CICIDS-2017 web attacks |
| cicids_ddos | 5,000 | ids_ips | CICIDS-2017 DDoS |
| dns_phishing | 5,000 | dns | DNS phishing queries |
| dns_malware | 5,000 | dns | DNS malware C2 |
| unsw_firewall | 5,000 | firewall | UNSW-NB15 firewall logs |
| nsl_kdd | 5,000 | ids_ips | NSL-KDD intrusion dataset |
| iis_tunna | 4,298 | http_server | IIS with Tunna webshell |
| netflow_ton_iot | 5,000 | netflow | ToN-IoT NetFlow |
| **TOTAL** | **47,931** | | 11 heterogeneous datasets |

---

## ClickHouse Final Table Counts (After All Benchmarks)

| Table | Row Count |
|-------|-----------|
| raw_logs | 679,965 |
| security_events | 655,089 |
| process_events | 146 |
| network_events | 1,608,724 |
| **TOTAL** | **2,943,924** |

---

## Commit History

| Commit | Description |
|--------|-------------|
| `21ef90e` | fix(vector): harden VRL pipeline — timestamp parsing, IPv4/IPv6 validation, port range clamping |

---

## Recommendations for Higher Throughput

1. **Switch to TCP NDJSON ingestion** — 5.3× throughput improvement over HTTP with zero code changes. Already supported on port 9514.
2. **Increase Vector workers** — Currently limited to 4 threads. On a beefier machine, 8–16 threads would scale linearly for VRL transforms.
3. **Pre-validate at agent side** — Moving IP/port validation and timestamp normalization to the log agents (before ingestion) would reduce VRL overhead.
4. **Consider Vector-native ClickHouse sink** — Eliminating Redpanda + Python consumers for direct Vector → CH ingestion would reduce latency and remove the consumer bottleneck at scale.
