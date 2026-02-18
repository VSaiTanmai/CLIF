/**
 * ═══════════════════════════════════════════════════════════════════════
 * CLIF Demo Data — Pre-built responses for every API route
 *
 * When DEMO_MODE is true, API routes return these objects instantly
 * (no ClickHouse, no Prometheus, no AI service calls) making every
 * page load in <50ms.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || true; // ← flip to false

/* ── Helpers ── */
function ts(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString().replace("Z", "");
}
function uuid(i: number): string {
  return `d3m0-${String(i).padStart(4, "0")}-4a5b-8c9d-e1f2a3b4c5d6`;
}
function sha256(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return (hex + hex + hex + hex + hex + hex + hex + hex).slice(0, 64);
}

/* ═══════════════════════════════════════════════════════════════
   /api/metrics
   ═══════════════════════════════════════════════════════════════ */
export function demoMetrics(_range = "24h") {
  const now = Date.now();
  const seed = Math.floor(now / 5000); // changes every 5s
  const r = pseudoRand(seed);

  // Generate beautiful events timeline (36 points, 10-min intervals)
  const timeline: Array<{ time: string; count: number }> = [];
  for (let i = 35; i >= 0; i--) {
    const t = new Date(now - i * 10 * 60_000);
    const hour = t.getHours();
    const dayFactor = hour >= 9 && hour <= 18 ? 1.0 : hour >= 6 && hour <= 21 ? 0.7 : 0.4;
    const wave = Math.sin((i / 36) * Math.PI * 2.5) * 0.15;
    const noise = (pseudoRand(seed + i)() - 0.5) * 0.12;
    const base = 3_600_000;
    timeline.push({
      time: t.toISOString().replace("Z", ""),
      count: Math.max(800_000, Math.round(base * dayFactor * (1 + wave + noise))),
    });
  }

  return {
    totalEvents: 21_427_583 + Math.floor(seed * 73) % 10000,
    ingestRate: Math.round(60_000 + r() * 40_000),
    activeAlerts: Math.round(1200 + r() * 1600),
    topSources: [
      { source: "Sysmon", count: Math.round(780_000 + r() * 50000) },
      { source: "Windows Security", count: Math.round(620_000 + r() * 40000) },
      { source: "Firewall", count: Math.round(510_000 + r() * 35000) },
      { source: "IDS/IPS", count: Math.round(390_000 + r() * 30000) },
      { source: "Endpoint Agent", count: Math.round(280_000 + r() * 25000) },
    ],
    severityDistribution: [
      { severity: 1, count: Math.round(12000 + r() * 4000) },
      { severity: 2, count: Math.round(6000 + r() * 2500) },
      { severity: 3, count: Math.round(1800 + r() * 800) },
      { severity: 4, count: Math.round(120 + r() * 180) },
    ],
    eventsTimeline: timeline,
    uptime: "99.97",
    criticalAlertCount: Math.round(28 + r() * 35),
    tableCounts: {
      raw_logs: 4_765_558 + Math.floor(r() * 10000),
      security_events: 5_674_661 + Math.floor(r() * 8000),
      process_events: 4_788_297 + Math.floor(r() * 9000),
      network_events: 6_191_079 + Math.floor(r() * 11000),
    },
    evidenceBatches: 847,
    evidenceAnchored: 18_432_109,
    mitreTopTechniques: [
      { technique: "T1059.001", tactic: "execution", count: Math.round(890 + r() * 100) },
      { technique: "T1055.012", tactic: "defense_evasion", count: Math.round(670 + r() * 80) },
      { technique: "T1003.001", tactic: "credential_access", count: Math.round(420 + r() * 60) },
      { technique: "T1071.001", tactic: "command_and_control", count: Math.round(380 + r() * 50) },
      { technique: "T1566.001", tactic: "initial_access", count: Math.round(310 + r() * 40) },
      { technique: "T1021.001", tactic: "lateral_movement", count: Math.round(260 + r() * 35) },
      { technique: "T1547.001", tactic: "persistence", count: Math.round(195 + r() * 28) },
      { technique: "T1078.003", tactic: "persistence", count: Math.round(165 + r() * 22) },
      { technique: "T1027", tactic: "defense_evasion", count: Math.round(140 + r() * 20) },
      { technique: "T1082", tactic: "discovery", count: Math.round(120 + r() * 18) },
    ],
    riskScore: Math.round(42 + r() * 26),
    riskTrend: Math.round(-5 + r() * 18),
    mttr: Math.round(420 + r() * 300),
    mttrTrend: Math.round(-12 + r() * 8),
    riskyEntities: [
      { entity: "svc-admin", type: "user", riskScore: Math.round(4200 + r() * 800), alertCount: Math.round(180 + r() * 60) },
      { entity: "DC-PRIMARY", type: "host", riskScore: Math.round(3600 + r() * 700), alertCount: Math.round(145 + r() * 50) },
      { entity: "jthompson", type: "user", riskScore: Math.round(2800 + r() * 500), alertCount: Math.round(98 + r() * 40) },
      { entity: "WKS-FIN-042", type: "host", riskScore: Math.round(2200 + r() * 400), alertCount: Math.round(72 + r() * 30) },
      { entity: "SQL-PROD-01", type: "host", riskScore: Math.round(1600 + r() * 350), alertCount: Math.round(55 + r() * 25) },
      { entity: "m.chen", type: "user", riskScore: Math.round(1100 + r() * 250), alertCount: Math.round(38 + r() * 15) },
      { entity: "EXCH-EDGE", type: "host", riskScore: Math.round(800 + r() * 200), alertCount: Math.round(25 + r() * 12) },
      { entity: "backup-svc", type: "user", riskScore: Math.round(500 + r() * 150), alertCount: Math.round(18 + r() * 8) },
    ],
    mitreTacticHeatmap: [
      { tactic: "initial_access", techniques: 5, alerts: Math.round(420 + r() * 100) },
      { tactic: "execution", techniques: 7, alerts: Math.round(890 + r() * 150) },
      { tactic: "persistence", techniques: 4, alerts: Math.round(340 + r() * 80) },
      { tactic: "privilege_escalation", techniques: 3, alerts: Math.round(215 + r() * 60) },
      { tactic: "defense_evasion", techniques: 6, alerts: Math.round(760 + r() * 120) },
      { tactic: "credential_access", techniques: 4, alerts: Math.round(380 + r() * 70) },
      { tactic: "discovery", techniques: 8, alerts: Math.round(1100 + r() * 200) },
      { tactic: "lateral_movement", techniques: 3, alerts: Math.round(190 + r() * 50) },
      { tactic: "collection", techniques: 2, alerts: Math.round(145 + r() * 35) },
      { tactic: "command_and_control", techniques: 3, alerts: Math.round(95 + r() * 25) },
      { tactic: "exfiltration", techniques: 2, alerts: Math.round(42 + r() * 15) },
      { tactic: "impact", techniques: 2, alerts: Math.round(28 + r() * 10) },
    ],
    prevTotalEvents: 20_200_000,
    prevActiveAlerts: Math.round(1400 + r() * 400),
    prevIngestRate: Math.round(55_000 + r() * 20_000),
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/alerts
   ═══════════════════════════════════════════════════════════════ */
export function demoAlerts() {
  return {
    summary: [
      { severity: 4, count: 47 },
      { severity: 3, count: 312 },
      { severity: 2, count: 1_873 },
    ],
    alerts: [
      { event_id: uuid(1), timestamp: ts(0.7), severity: 4, category: "Credential Dumping", source: "Sysmon", description: "LSASS memory access detected from unsigned process on DC-PRIMARY", hostname: "DC-PRIMARY", user_id: "svc-admin", mitre_tactic: "credential_access", mitre_technique: "T1003.001" },
      { event_id: uuid(2), timestamp: ts(2), severity: 4, category: "Lateral Movement", source: "Sysmon", description: "PsExec service installation on WKS-FIN-042 from svc-admin account", hostname: "WKS-FIN-042", user_id: "svc-admin", mitre_tactic: "lateral_movement", mitre_technique: "T1021.002" },
      { event_id: uuid(3), timestamp: ts(3.5), severity: 3, category: "Suspicious PowerShell", source: "Sysmon", description: "Encoded PowerShell command with network callback to external C2 IP 185.220.101.42", hostname: "WKS-DEV-019", user_id: "jthompson", mitre_tactic: "execution", mitre_technique: "T1059.001" },
      { event_id: uuid(4), timestamp: ts(5.5), severity: 3, category: "Privilege Escalation", source: "Windows Security", description: "Token impersonation via SeDebugPrivilege on SQL-PROD-01", hostname: "SQL-PROD-01", user_id: "SYSTEM", mitre_tactic: "privilege_escalation", mitre_technique: "T1134.001" },
      { event_id: uuid(5), timestamp: ts(8), severity: 3, category: "Defense Evasion", source: "Sysmon", description: "Timestomping detected — PE file creation time set to 2019 on EXCH-EDGE", hostname: "EXCH-EDGE", user_id: "m.chen", mitre_tactic: "defense_evasion", mitre_technique: "T1070.006" },
      { event_id: uuid(6), timestamp: ts(9.2), severity: 2, category: "Anomalous DNS", source: "DNS Logs", description: "High-entropy DNS queries to .xyz TLD — possible DNS tunneling via iodine", hostname: "WKS-MKT-007", user_id: "a.davis", mitre_tactic: "command_and_control", mitre_technique: "T1071.004" },
      { event_id: uuid(7), timestamp: ts(11.3), severity: 4, category: "Ransomware Indicator", source: "Sysmon", description: "Mass file rename with .encrypted extension across shared drive \\\\FS-SHARE-01\\finance", hostname: "FS-SHARE-01", user_id: "SYSTEM", mitre_tactic: "impact", mitre_technique: "T1486" },
      { event_id: uuid(8), timestamp: ts(13), severity: 3, category: "Brute Force", source: "Windows Security", description: "127 failed logins in 5 minutes for jthompson from 3 unique IPs", hostname: "DC-PRIMARY", user_id: "jthompson", mitre_tactic: "credential_access", mitre_technique: "T1110.001" },
      { event_id: uuid(9), timestamp: ts(15), severity: 2, category: "Data Exfiltration", source: "Firewall", description: "Unusual 2.3GB upload to cloud storage bucket from backup-svc", hostname: "BKP-SVR-02", user_id: "backup-svc", mitre_tactic: "exfiltration", mitre_technique: "T1567.002" },
      { event_id: uuid(10), timestamp: ts(18), severity: 3, category: "Persistence", source: "Sysmon", description: "New scheduled task created with SYSTEM privileges — dropper.exe", hostname: "WKS-HR-014", user_id: "SYSTEM", mitre_tactic: "persistence", mitre_technique: "T1053.005" },
      { event_id: uuid(11), timestamp: ts(22), severity: 4, category: "Process Injection", source: "Sysmon", description: "Process hollowing detected in svchost.exe — cobalt strike beacon signature", hostname: "WKS-FIN-042", user_id: "svc-admin", mitre_tactic: "defense_evasion", mitre_technique: "T1055.012" },
      { event_id: uuid(12), timestamp: ts(28), severity: 3, category: "Suspicious Network", source: "IDS/IPS", description: "C2 beaconing pattern detected — 60s interval to 185.220.101.42:443", hostname: "WKS-DEV-019", user_id: "jthompson", mitre_tactic: "command_and_control", mitre_technique: "T1071.001" },
      { event_id: uuid(13), timestamp: ts(35), severity: 2, category: "Account Manipulation", source: "Windows Security", description: "Service account svc-admin added to Domain Admins group", hostname: "DC-PRIMARY", user_id: "m.chen", mitre_tactic: "persistence", mitre_technique: "T1098" },
      { event_id: uuid(14), timestamp: ts(42), severity: 3, category: "DLL Side-Loading", source: "Sysmon", description: "Unsigned DLL loaded by legitimate Windows process calc.exe", hostname: "WKS-MKT-007", user_id: "a.davis", mitre_tactic: "defense_evasion", mitre_technique: "T1574.002" },
      { event_id: uuid(15), timestamp: ts(50), severity: 2, category: "Reconnaissance", source: "Firewall", description: "Internal port scan detected from 10.10.15.42 — 847 ports in 12 seconds", hostname: "WKS-DEV-019", user_id: "jthompson", mitre_tactic: "discovery", mitre_technique: "T1046" },
      { event_id: uuid(16), timestamp: ts(55), severity: 3, category: "Suspicious Binary", source: "Sysmon", description: "Certutil used to download executable from paste.ee — living-off-the-land", hostname: "WKS-HR-014", user_id: "r.kumar", mitre_tactic: "defense_evasion", mitre_technique: "T1140" },
      { event_id: uuid(17), timestamp: ts(62), severity: 4, category: "Kerberoasting", source: "Windows Security", description: "TGS requests for 14 service accounts in 3 seconds from WKS-DEV-019", hostname: "DC-PRIMARY", user_id: "jthompson", mitre_tactic: "credential_access", mitre_technique: "T1558.003" },
      { event_id: uuid(18), timestamp: ts(70), severity: 2, category: "Network Anomaly", source: "IDS/IPS", description: "SMB traffic to non-standard port 8445 — potential tunnel", hostname: "WKS-FIN-042", user_id: "svc-admin", mitre_tactic: "lateral_movement", mitre_technique: "T1021.002" },
      { event_id: uuid(19), timestamp: ts(80), severity: 3, category: "WMI Execution", source: "Sysmon", description: "Remote WMI process creation on 3 workstations from DC-PRIMARY", hostname: "DC-PRIMARY", user_id: "svc-admin", mitre_tactic: "execution", mitre_technique: "T1047" },
      { event_id: uuid(20), timestamp: ts(90), severity: 2, category: "Registry Modification", source: "Sysmon", description: "Run key persistence added: HKLM\\...\\Run\\WindowsUpdate → C:\\Temp\\update.exe", hostname: "WKS-MKT-007", user_id: "a.davis", mitre_tactic: "persistence", mitre_technique: "T1547.001" },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/events/stream  (live feed)
   ═══════════════════════════════════════════════════════════════ */
export function demoEventsStream() {
  const events = [];
  const tables = ["raw_logs", "security_events", "process_events", "network_events"];
  const hostnames = ["DC-PRIMARY", "WKS-FIN-042", "WKS-DEV-019", "SQL-PROD-01", "EXCH-EDGE", "WKS-MKT-007", "FS-SHARE-01", "BKP-SVR-02", "WKS-HR-014"];
  const categories = ["Credential Dumping", "Lateral Movement", "Brute Force", "Suspicious PowerShell", "Process Injection", "Defense Evasion", "C2 Beaconing", "Anomalous DNS", "Privilege Escalation", "Persistence"];
  const protocols = ["TCP", "UDP", "TCP", "TCP", "TCP", "UDP"];
  const binaries = ["C:\\Windows\\System32\\svchost.exe", "C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\powershell.exe", "C:\\Program Files\\agent\\sensor.exe", "C:\\Temp\\update.exe", "C:\\Windows\\System32\\rundll32.exe"];

  for (let i = 0; i < 100; i++) {
    const tableIdx = i % 4;
    const table = tables[tableIdx];
    const host = hostnames[i % hostnames.length];
    const t = ts(i * 0.3); // events every ~18 seconds

    if (table === "raw_logs") {
      events.push({
        event_id: uuid(100 + i),
        timestamp: t,
        log_source: ["Sysmon", "Windows Security", "Firewall", "IDS/IPS"][i % 4],
        hostname: host,
        severity: [1, 2, 1, 3, 2, 1, 2, 1, 1, 2][i % 10],
        raw: `[${host}] Event ${1000 + i}: ${categories[i % categories.length]} — audit log entry processed`,
        _table: "raw_logs",
      });
    } else if (table === "security_events") {
      events.push({
        event_id: uuid(100 + i),
        timestamp: t,
        log_source: "Sysmon",
        hostname: host,
        severity: [2, 3, 2, 4, 3, 2, 3, 2, 3, 4][i % 10],
        raw: `${categories[i % categories.length]} detected on ${host}`,
        _table: "security_events",
      });
    } else if (table === "process_events") {
      events.push({
        event_id: uuid(100 + i),
        timestamp: t,
        log_source: "",
        hostname: host,
        severity: i % 7 === 0 ? 1 : 0,
        raw: `${binaries[i % binaries.length]} -NoProfile -WindowStyle Hidden -EncodedCommand ${sha256(String(i)).slice(0, 20)}`,
        _table: "process_events",
      });
    } else {
      const srcIp = `10.10.${15 + (i % 5)}.${40 + (i % 20)}`;
      const dstIp = i % 5 === 0 ? `185.220.101.${40 + (i % 10)}` : `10.10.${20 + (i % 3)}.${100 + (i % 50)}`;
      events.push({
        event_id: uuid(100 + i),
        timestamp: t,
        log_source: protocols[i % protocols.length],
        hostname: host,
        severity: i % 8 === 0 ? 1 : 0,
        raw: `${srcIp}:${40000 + (i * 7) % 25000} → ${dstIp}:${[443, 80, 8443, 3389, 445, 53, 8080][i % 7]} ${i % 10 === 0 ? "dns:" + host.toLowerCase() + ".corp.local" : ""}`,
        _table: "network_events",
      });
    }
  }

  return { data: events };
}

/* ═══════════════════════════════════════════════════════════════
   /api/events/search
   ═══════════════════════════════════════════════════════════════ */
export function demoEventsSearch(query: string, table: string, limit = 50, offset = 0) {
  const events: Record<string, unknown>[] = [];
  const total = query ? 234 : 5674;

  for (let i = 0; i < Math.min(limit, 50); i++) {
    const idx = offset + i;
    const host = ["DC-PRIMARY", "WKS-FIN-042", "WKS-DEV-019", "SQL-PROD-01", "EXCH-EDGE"][idx % 5];
    if (table === "security_events") {
      events.push({
        event_id: uuid(500 + idx),
        timestamp: ts(idx * 2),
        severity: [2, 3, 2, 4, 3, 2, 3, 2, 2, 4][idx % 10],
        category: ["Brute Force", "Lateral Movement", "Credential Dumping", "Suspicious PowerShell", "C2 Beaconing", "Defense Evasion", "Process Injection", "Anomalous DNS", "Privilege Escalation", "Persistence"][idx % 10],
        log_source: "Sysmon",
        raw: `${query ? `[Match: ${query}] ` : ""}Security event on ${host} — ${["access violation", "authentication failure", "policy change", "privilege use", "suspicious activity"][idx % 5]}`,
        hostname: host,
        user_id: ["svc-admin", "jthompson", "m.chen", "a.davis", "SYSTEM"][idx % 5],
        mitre_tactic: ["credential_access", "lateral_movement", "execution", "defense_evasion", "discovery"][idx % 5],
        mitre_technique: ["T1003.001", "T1021.002", "T1059.001", "T1055.012", "T1082"][idx % 5],
      });
    } else if (table === "process_events") {
      events.push({
        event_id: uuid(500 + idx),
        timestamp: ts(idx * 2),
        hostname: host,
        pid: 1000 + idx * 4,
        ppid: 600 + (idx % 10),
        binary_path: ["C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\powershell.exe", "C:\\Windows\\System32\\svchost.exe", "C:\\Temp\\update.exe", "C:\\Program Files\\agent\\sensor.exe"][idx % 5],
        raw: `${query ? `[Match: ${query}] ` : ""}-NoProfile -ExecutionPolicy Bypass -File C:\\scripts\\task_${idx}.ps1`,
        container_id: "",
        is_suspicious: idx % 4 === 0 ? 1 : 0,
      });
    } else if (table === "network_events") {
      events.push({
        event_id: uuid(500 + idx),
        timestamp: ts(idx * 2),
        hostname: host,
        src_ip: `10.10.15.${40 + (idx % 20)}`,
        src_port: 40000 + (idx * 7) % 25000,
        dst_ip: idx % 5 === 0 ? `185.220.101.${40 + (idx % 10)}` : `10.10.20.${100 + (idx % 50)}`,
        dst_port: [443, 80, 8443, 3389, 445, 53][idx % 6],
        protocol: ["TCP", "UDP", "TCP", "TCP"][idx % 4],
        direction: idx % 2 === 0 ? "outbound" : "inbound",
        bytes_sent: Math.round(1000 + Math.random() * 50000),
        bytes_received: Math.round(500 + Math.random() * 30000),
        dns_query: idx % 5 === 0 ? `${host.toLowerCase()}.corp.local` : "",
      });
    } else {
      // raw_logs
      events.push({
        event_id: uuid(500 + idx),
        timestamp: ts(idx * 2),
        level: [3, 2, 1, 4, 2][idx % 5],
        log_source: ["Sysmon", "Windows Security", "Firewall", "IDS/IPS", "DNS"][idx % 5],
        raw: `${query ? `[Match: ${query}] ` : ""}[${host}] Log entry ${1000 + idx}: ${["Authentication event", "Network connection", "Process creation", "File modification", "Registry access"][idx % 5]}`,
        user_id: ["svc-admin", "jthompson", "m.chen", "a.davis", "SYSTEM"][idx % 5],
        ip_address: `10.10.15.${40 + (idx % 20)}`,
        request_id: uuid(900 + idx),
      });
    }
  }

  return { data: events, total, limit, offset };
}

/* ═══════════════════════════════════════════════════════════════
   /api/system
   ═══════════════════════════════════════════════════════════════ */
export function demoSystem() {
  return {
    services: [
      { name: "ClickHouse", status: "Healthy", metric: "clickhouse01:8123" },
      { name: "ClickHouse", status: "Healthy", metric: "clickhouse02:8124" },
      { name: "redpanda", status: "Healthy", metric: "redpanda01:9644" },
      { name: "redpanda", status: "Healthy", metric: "redpanda02:9644" },
      { name: "redpanda", status: "Healthy", metric: "redpanda03:9644" },
      { name: "clif-consumer", status: "Healthy", metric: "consumer:9090" },
      { name: "clif-consumer-2", status: "Healthy", metric: "consumer-2:9090" },
      { name: "clif-consumer-3", status: "Healthy", metric: "consumer-3:9090" },
      { name: "minio", status: "Healthy", metric: "minio:9000" },
      { name: "ai-classifier", status: "Healthy", metric: "ai-classifier:8200" },
      { name: "merkle-service", status: "Healthy", metric: "merkle:8300" },
      { name: "lancedb", status: "Healthy", metric: "lancedb:8100" },
      { name: "prometheus", status: "Healthy", metric: "prometheus:9090" },
      { name: "node-exporter", status: "Healthy", metric: "node-exporter:9100" },
      { name: "clickhouse-exporter", status: "Healthy", metric: "ch-exporter:9363" },
      { name: "grafana", status: "Healthy", metric: "grafana:3000" },
      { name: "clif-dashboard", status: "Healthy", metric: "dashboard:3001" },
      { name: "zookeeper", status: "Healthy", metric: "zookeeper:2181" },
    ],
    clickhouseInserted: "21427583",
    redpandaBrokers: "3",
    redpanda: {
      brokers: 3,
      brokerDetails: [
        { nodeId: 0, cores: 2, status: "active", alive: true },
        { nodeId: 1, cores: 2, status: "active", alive: true },
        { nodeId: 2, cores: 2, status: "active", alive: true },
      ],
      totalPartitions: 48,
      topics: ["raw-logs", "security-events", "process-events", "network-events"],
      isHealthy: true,
      controllerId: 0,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/threat-intel
   ═══════════════════════════════════════════════════════════════ */
export function demoThreatIntel() {
  return {
    mitreStats: [
      { technique: "T1059.001", tactic: "execution", count: 892, maxSeverity: 4 },
      { technique: "T1055.012", tactic: "defense_evasion", count: 671, maxSeverity: 4 },
      { technique: "T1003.001", tactic: "credential_access", count: 423, maxSeverity: 4 },
      { technique: "T1071.001", tactic: "command_and_control", count: 384, maxSeverity: 3 },
      { technique: "T1566.001", tactic: "initial_access", count: 315, maxSeverity: 3 },
      { technique: "T1021.002", tactic: "lateral_movement", count: 267, maxSeverity: 4 },
      { technique: "T1547.001", tactic: "persistence", count: 198, maxSeverity: 3 },
      { technique: "T1134.001", tactic: "privilege_escalation", count: 178, maxSeverity: 3 },
      { technique: "T1027", tactic: "defense_evasion", count: 142, maxSeverity: 3 },
      { technique: "T1082", tactic: "discovery", count: 124, maxSeverity: 2 },
      { technique: "T1110.001", tactic: "credential_access", count: 108, maxSeverity: 3 },
      { technique: "T1486", tactic: "impact", count: 34, maxSeverity: 4 },
      { technique: "T1558.003", tactic: "credential_access", count: 87, maxSeverity: 4 },
      { technique: "T1046", tactic: "discovery", count: 156, maxSeverity: 2 },
      { technique: "T1047", tactic: "execution", count: 92, maxSeverity: 3 },
    ],
    topIOCs: [
      { value: "DC-PRIMARY", type: "Hostname", hits: 1245, maxSeverity: 4 },
      { value: "WKS-FIN-042", type: "Hostname", hits: 987, maxSeverity: 4 },
      { value: "WKS-DEV-019", type: "Hostname", hits: 876, maxSeverity: 3 },
      { value: "SQL-PROD-01", type: "Hostname", hits: 654, maxSeverity: 3 },
      { value: "EXCH-EDGE", type: "Hostname", hits: 543, maxSeverity: 3 },
      { value: "WKS-MKT-007", type: "Hostname", hits: 432, maxSeverity: 2 },
      { value: "FS-SHARE-01", type: "Hostname", hits: 321, maxSeverity: 4 },
      { value: "BKP-SVR-02", type: "Hostname", hits: 234, maxSeverity: 2 },
      { value: "WKS-HR-014", type: "Hostname", hits: 198, maxSeverity: 3 },
      { value: "APP-WEB-01", type: "Hostname", hits: 167, maxSeverity: 2 },
    ],
    recentAttacks: (() => {
      const attacks = [];
      const techniques = ["T1059.001", "T1055.012", "T1003.001", "T1071.001", "T1566.001"];
      for (let i = 0; i < 24; i++) {
        const h = new Date(Date.now() - i * 3600_000);
        for (let t = 0; t < 2; t++) {
          attacks.push({
            hour: h.toISOString().slice(0, 13) + ":00:00",
            technique: techniques[(i + t) % techniques.length],
            count: Math.round(15 + Math.random() * 40),
          });
        }
      }
      return attacks;
    })(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/evidence/chain
   ═══════════════════════════════════════════════════════════════ */
export function demoEvidenceChain() {
  const tables = ["raw_logs", "security_events", "process_events", "network_events"];
  const batches = [];
  for (let i = 0; i < 50; i++) {
    const table = tables[i % 4];
    const batchTs = new Date(Date.now() - i * 15 * 60_000);
    const count = Math.round(3000 + Math.random() * 7000);
    batches.push({
      id: `batch-${String(i + 1).padStart(4, "0")}`,
      timestamp: batchTs.toISOString(),
      tableName: table,
      timeFrom: new Date(batchTs.getTime() - 15 * 60_000).toISOString(),
      timeTo: batchTs.toISOString(),
      eventCount: count,
      merkleRoot: sha256(`merkle-root-${i}`),
      merkleDepth: Math.ceil(Math.log2(count)),
      s3Key: `evidence/${table}/batch-${String(i + 1).padStart(4, "0")}.parquet`,
      status: "Verified",
      prevMerkleRoot: i > 0 ? sha256(`merkle-root-${i - 1}`) : "0".repeat(64),
    });
  }

  return {
    batches,
    summary: {
      totalAnchored: 18_432_109,
      totalBatches: 847,
      verificationRate: 100,
      avgBatchSize: 21_763,
      chainLength: 847,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/reports
   ═══════════════════════════════════════════════════════════════ */
export function demoReports() {
  return {
    summary: {
      totalEvents: 21_427_583,
      totalAlerts24h: 2_232,
      criticalAlerts: 47,
      highAlerts: 312,
      mediumAlerts: 1_873,
      evidenceBatches: 847,
      evidenceAnchored: 18_432_109,
      evidenceVerified: 847,
    },
    eventsByTable: [
      { table: "raw_logs", count: 4_765_558 },
      { table: "security_events", count: 5_674_661 },
      { table: "process_events", count: 4_788_297 },
      { table: "network_events", count: 6_191_079 },
    ],
    topCategories: [
      { category: "Brute Force", count: 2_341 },
      { category: "Suspicious PowerShell", count: 1_876 },
      { category: "Lateral Movement", count: 1_234 },
      { category: "Process Injection", count: 987 },
      { category: "Credential Dumping", count: 876 },
      { category: "Defense Evasion", count: 765 },
      { category: "C2 Beaconing", count: 654 },
      { category: "Persistence", count: 543 },
      { category: "Privilege Escalation", count: 432 },
      { category: "Anomalous DNS", count: 321 },
    ],
    severityDistribution: [
      { severity: 4, count: 47 },
      { severity: 3, count: 312 },
      { severity: 2, count: 1_873 },
      { severity: 1, count: 12_456 },
      { severity: 0, count: 45_678 },
    ],
    recentCriticalAlerts: [
      { eventId: uuid(1), timestamp: ts(0.7), severity: 4, category: "Credential Dumping", source: "Sysmon", description: "LSASS memory access from unsigned process", hostname: "DC-PRIMARY", mitreTactic: "credential_access", mitreTechnique: "T1003.001" },
      { eventId: uuid(2), timestamp: ts(2), severity: 4, category: "Lateral Movement", source: "Sysmon", description: "PsExec service installation from svc-admin", hostname: "WKS-FIN-042", mitreTactic: "lateral_movement", mitreTechnique: "T1021.002" },
      { eventId: uuid(7), timestamp: ts(11.3), severity: 4, category: "Ransomware Indicator", source: "Sysmon", description: "Mass file rename .encrypted on shared drive", hostname: "FS-SHARE-01", mitreTactic: "impact", mitreTechnique: "T1486" },
      { eventId: uuid(11), timestamp: ts(22), severity: 4, category: "Process Injection", source: "Sysmon", description: "Process hollowing in svchost.exe — cobalt strike beacon", hostname: "WKS-FIN-042", mitreTactic: "defense_evasion", mitreTechnique: "T1055.012" },
      { eventId: uuid(17), timestamp: ts(62), severity: 4, category: "Kerberoasting", source: "Windows Security", description: "TGS requests for 14 service accounts in 3 seconds", hostname: "DC-PRIMARY", mitreTactic: "credential_access", mitreTechnique: "T1558.003" },
    ],
    mitreTopTechniques: [
      { technique: "T1059.001", tactic: "execution", count: 892 },
      { technique: "T1055.012", tactic: "defense_evasion", count: 671 },
      { technique: "T1003.001", tactic: "credential_access", count: 423 },
      { technique: "T1071.001", tactic: "command_and_control", count: 384 },
      { technique: "T1566.001", tactic: "initial_access", count: 315 },
      { technique: "T1021.002", tactic: "lateral_movement", count: 267 },
      { technique: "T1547.001", tactic: "persistence", count: 198 },
      { technique: "T1134.001", tactic: "privilege_escalation", count: 178 },
    ],
    generatedAt: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/ai/agents
   ═══════════════════════════════════════════════════════════════ */
export function demoAiAgents() {
  return {
    agents: [
      { name: "Triage Agent", status: "active", cases_handled: 1_247, avg_response_time: 0.34, error_count: 0, last_active: ts(0.5) },
      { name: "Hunter Agent", status: "active", cases_handled: 1_198, avg_response_time: 1.82, error_count: 2, last_active: ts(0.8) },
      { name: "Verifier Agent", status: "active", cases_handled: 1_156, avg_response_time: 0.67, error_count: 0, last_active: ts(1.2) },
      { name: "Reporter Agent", status: "active", cases_handled: 1_089, avg_response_time: 0.91, error_count: 1, last_active: ts(1.5) },
    ],
    total_agents: 4,
    investigations: [
      { investigation_id: "inv-001", created_at: ts(5), status: "completed", category: "Credential Dumping", severity: "critical", priority: "P1", confidence: 0.94, verdict: "true_positive" },
      { investigation_id: "inv-002", created_at: ts(12), status: "completed", category: "Lateral Movement", severity: "critical", priority: "P1", confidence: 0.91, verdict: "true_positive" },
      { investigation_id: "inv-003", created_at: ts(20), status: "completed", category: "Suspicious PowerShell", severity: "high", priority: "P2", confidence: 0.87, verdict: "true_positive" },
      { investigation_id: "inv-004", created_at: ts(35), status: "completed", category: "C2 Beaconing", severity: "high", priority: "P2", confidence: 0.82, verdict: "true_positive" },
      { investigation_id: "inv-005", created_at: ts(48), status: "completed", category: "Process Injection", severity: "critical", priority: "P1", confidence: 0.96, verdict: "true_positive" },
      { investigation_id: "inv-006", created_at: ts(60), status: "completed", category: "Brute Force", severity: "high", priority: "P2", confidence: 0.78, verdict: "true_positive" },
      { investigation_id: "inv-007", created_at: ts(75), status: "completed", category: "Anomalous DNS", severity: "medium", priority: "P3", confidence: 0.65, verdict: "false_positive" },
      { investigation_id: "inv-008", created_at: ts(90), status: "completed", category: "Data Exfiltration", severity: "high", priority: "P2", confidence: 0.84, verdict: "true_positive" },
      { investigation_id: "inv-009", created_at: ts(110), status: "in_progress", category: "Ransomware Indicator", severity: "critical", priority: "P1", confidence: 0.0, verdict: null },
      { investigation_id: "inv-010", created_at: ts(130), status: "completed", category: "Privilege Escalation", severity: "high", priority: "P2", confidence: 0.89, verdict: "true_positive" },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/ai/classify (GET — model info)
   ═══════════════════════════════════════════════════════════════ */
export function demoAiClassifyInfo() {
  return {
    status: "online",
    model_name: "CLIF-XGBoost-v2",
    model_version: "2.1.0",
    model_type: "XGBoost Binary + Multi-class",
    features_count: 41,
    training_accuracy: 0.9847,
    training_samples: 185_000,
    last_trained: "2026-02-17T14:30:00Z",
    supported_categories: [
      "benign", "brute_force", "credential_dumping", "lateral_movement",
      "command_and_control", "exfiltration", "privilege_escalation",
      "defense_evasion", "persistence", "ransomware",
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/ai/leaderboard
   ═══════════════════════════════════════════════════════════════ */
export function demoAiLeaderboard() {
  return {
    binary: [
      { model: "XGBoost", accuracy: 0.9847, precision: 0.9812, recall: 0.9891, f1: 0.9851, auc: 0.9963, training_time: 12.4 },
      { model: "Random Forest", accuracy: 0.9723, precision: 0.9698, recall: 0.9756, f1: 0.9727, auc: 0.9918, training_time: 8.7 },
      { model: "LightGBM", accuracy: 0.9801, precision: 0.9778, recall: 0.9832, f1: 0.9805, auc: 0.9945, training_time: 6.2 },
      { model: "Neural Network", accuracy: 0.9689, precision: 0.9634, recall: 0.9745, f1: 0.9689, auc: 0.9901, training_time: 45.8 },
      { model: "SVM (RBF)", accuracy: 0.9612, precision: 0.9587, recall: 0.9643, f1: 0.9615, auc: 0.9876, training_time: 28.3 },
    ],
    multiclass: [
      { model: "XGBoost", accuracy: 0.9534, precision: 0.9489, recall: 0.9578, f1: 0.9533, auc: 0.9912, training_time: 18.6 },
      { model: "LightGBM", accuracy: 0.9487, precision: 0.9445, recall: 0.9521, f1: 0.9483, auc: 0.9891, training_time: 9.8 },
      { model: "Random Forest", accuracy: 0.9412, precision: 0.9378, recall: 0.9449, f1: 0.9413, auc: 0.9867, training_time: 12.1 },
      { model: "Neural Network", accuracy: 0.9356, precision: 0.9312, recall: 0.9401, f1: 0.9356, auc: 0.9845, training_time: 52.3 },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/ai/xai (GET — status + features)
   ═══════════════════════════════════════════════════════════════ */
export function demoAiXaiStatus() {
  return {
    available: true,
    explainer_type: "TreeExplainer",
    feature_count: 41,
    top_k: 15,
    total_features: 41,
    model_types: { binary: "XGBoostClassifier", multiclass: "XGBoostClassifier" },
    features: [
      { feature: "connection_duration", display_name: "Connection Duration", importance: 0.142, category: "connection" },
      { feature: "src_bytes", display_name: "Source Bytes", importance: 0.128, category: "traffic" },
      { feature: "dst_bytes", display_name: "Dest. Bytes", importance: 0.115, category: "traffic" },
      { feature: "service_type", display_name: "Service Type", importance: 0.098, category: "protocol" },
      { feature: "count", display_name: "Connection Count", importance: 0.087, category: "traffic" },
      { feature: "serror_rate", display_name: "SYN Error Rate", importance: 0.076, category: "error_rate" },
      { feature: "dst_host_srv_count", display_name: "Dst Host Srv Count", importance: 0.065, category: "host" },
      { feature: "same_srv_rate", display_name: "Same Service Rate", importance: 0.058, category: "connection" },
      { feature: "protocol_type", display_name: "Protocol Type", importance: 0.052, category: "protocol" },
      { feature: "dst_host_same_srv_rate", display_name: "Dst Same Srv Rate", importance: 0.047, category: "host" },
      { feature: "flag", display_name: "TCP Flag", importance: 0.043, category: "protocol" },
      { feature: "srv_count", display_name: "Service Count", importance: 0.038, category: "traffic" },
      { feature: "logged_in", display_name: "Logged In", importance: 0.032, category: "content" },
      { feature: "diff_srv_rate", display_name: "Diff Service Rate", importance: 0.028, category: "connection" },
      { feature: "dst_host_count", display_name: "Dst Host Count", importance: 0.024, category: "host" },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/evidence/verify
   ═══════════════════════════════════════════════════════════════ */
export function demoEvidenceVerify(batchId: string) {
  const root = sha256(`merkle-root-${batchId}`);
  return {
    batchId,
    table: "security_events",
    storedRoot: root,
    computedRoot: root,
    storedCount: 4_521,
    actualCount: 4_521,
    verified: true,
    depth: 13,
    status: "VERIFIED",
  };
}

/* ═══════════════════════════════════════════════════════════════
   /api/semantic-search
   ═══════════════════════════════════════════════════════════════ */
export function demoSemanticSearch(query: string) {
  const q = (query ?? "").toLowerCase();

  /* ── lateral movement results ── */
  if (q.includes("lateral") || q.includes("movement") || q.includes("psexec") || q.includes("wmi")) {
    return { results: [
      { timestamp: ts(2), log_source: "Sysmon", hostname: "WKS-FIN-042", severity: 4, text: "PsExec service PSEXESVC installed on remote host — lateral movement via admin$ share using compromised domain admin credentials (T1021.002)", _distance: 0.06, source_table: "security_events", event_id: uuid(101) },
      { timestamp: ts(4), log_source: "Windows Security", hostname: "DC-PRIMARY", severity: 4, text: "Pass-the-Hash detected — NTLM authentication with stolen hash for ADMIN\\svc_backup to \\\\FS-SHARE-01\\C$ (Event ID 4624 Type 3)", _distance: 0.09, source_table: "security_events", event_id: uuid(102) },
      { timestamp: ts(7), log_source: "Sysmon", hostname: "SQL-PROD-01", severity: 4, text: "WMI remote process creation — wmic /node:WKS-DEV-019 process call create 'powershell -enc <payload>' lateral pivot (T1047)", _distance: 0.12, source_table: "security_events", event_id: uuid(103) },
      { timestamp: ts(11), log_source: "Windows Security", hostname: "WKS-DEV-019", severity: 3, text: "Remote service creation via SCM — svc_update service installed from \\\\10.0.5.100\\share\\beacon.exe (T1021.002)", _distance: 0.16, source_table: "security_events", event_id: uuid(104) },
      { timestamp: ts(15), log_source: "Sysmon", hostname: "EXCH-EDGE", severity: 4, text: "RDP session initiated from internal compromised host 10.0.5.42 — lateral movement via RDP (T1021.001) with NLA bypass", _distance: 0.19, source_table: "security_events", event_id: uuid(105) },
      { timestamp: ts(20), log_source: "Sysmon", hostname: "DC-PRIMARY", severity: 3, text: "SMB admin share access \\\\DC-PRIMARY\\ADMIN$ from WKS-FIN-042 (10.0.5.42) — file copy winlogon_update.dll (T1570)", _distance: 0.22, source_table: "security_events", event_id: uuid(106) },
      { timestamp: ts(28), log_source: "Windows Security", hostname: "FS-SHARE-01", severity: 3, text: "Kerberos ticket requested for cifs/FS-SHARE-01 using forged TGT — Golden Ticket lateral movement (T1558.001)", _distance: 0.25, source_table: "security_events", event_id: uuid(107) },
      { timestamp: ts(35), log_source: "Sysmon", hostname: "WKS-MKT-007", severity: 3, text: "Named pipe connection \\\\pipe\\svcctl from remote host — SCM-based lateral movement indicator (T1021.002)", _distance: 0.28, source_table: "security_events", event_id: uuid(108) },
      { timestamp: ts(42), log_source: "Windows Security", hostname: "SQL-PROD-01", severity: 3, text: "DCOM ShellBrowserWindow remote execution from 10.0.5.42 — lateral movement via DCOM (T1021.003)", _distance: 0.31, source_table: "security_events", event_id: uuid(109) },
      { timestamp: ts(50), log_source: "Sysmon", hostname: "WKS-DEV-019", severity: 2, text: "Remote scheduled task created — schtasks /create /s WKS-DEV-019 /tn 'SysUpdate' /tr beacon.exe — persistence after lateral movement (T1053.005)", _distance: 0.34, source_table: "security_events", event_id: uuid(110) },
    ] };
  }

  /* ── data exfiltration results ── */
  if (q.includes("exfil") || q.includes("data theft") || q.includes("staging") || q.includes("upload")) {
    return { results: [
      { timestamp: ts(3), log_source: "Sysmon", hostname: "FS-SHARE-01", severity: 4, text: "Bulk file staging detected — 2,847 files (14.2 GB) copied from \\\\FS-SHARE-01\\Finance to C:\\Users\\Public\\tmp in 4 minutes (T1074.001)", _distance: 0.05, source_table: "security_events", event_id: uuid(201) },
      { timestamp: ts(6), log_source: "Sysmon", hostname: "WKS-FIN-042", severity: 4, text: "RAR archive creation — rar.exe a -hp<password> -v500m C:\\Users\\Public\\export.rar staged financial data — encrypted split archive (T1560.001)", _distance: 0.08, source_table: "security_events", event_id: uuid(202) },
      { timestamp: ts(10), log_source: "DNS Logs", hostname: "WKS-FIN-042", severity: 4, text: "High-volume DNS TXT queries to c2-relay.malware[.]xyz — DNS tunneling exfiltration at 4.2 MB/min (T1048.001)", _distance: 0.11, source_table: "security_events", event_id: uuid(203) },
      { timestamp: ts(14), log_source: "Sysmon", hostname: "EXCH-EDGE", severity: 4, text: "HTTPS POST to mega[.]nz upload API — 12.8 GB outbound data transfer via cloud storage exfiltration (T1567.002)", _distance: 0.14, source_table: "security_events", event_id: uuid(204) },
      { timestamp: ts(19), log_source: "Windows Security", hostname: "SQL-PROD-01", severity: 4, text: "Database bulk export — sqlcmd -Q 'SELECT * FROM Customers' -o C:\\temp\\dump.csv — 847K records exported for exfiltration staging (T1005)", _distance: 0.17, source_table: "security_events", event_id: uuid(205) },
      { timestamp: ts(25), log_source: "Sysmon", hostname: "WKS-DEV-019", severity: 3, text: "Unusual SFTP connection to external IP 185.220.101.45:22 — 3.4 GB transferred in single session (T1048.002)", _distance: 0.20, source_table: "security_events", event_id: uuid(206) },
      { timestamp: ts(32), log_source: "Sysmon", hostname: "WKS-FIN-042", severity: 3, text: "rclone.exe sync to remote cloud endpoint — configuration file references OneDrive Business tenant (T1567.002)", _distance: 0.23, source_table: "security_events", event_id: uuid(207) },
      { timestamp: ts(40), log_source: "DNS Logs", hostname: "WKS-MKT-007", severity: 3, text: "ICMP echo request with embedded payload to 45.33.32.156 — ICMP tunnel exfiltration (T1048.003) at 12 KB/s", _distance: 0.26, source_table: "security_events", event_id: uuid(208) },
      { timestamp: ts(48), log_source: "Windows Security", hostname: "FS-SHARE-01", severity: 3, text: "Email draft with 28 MB attachment created in Outlook — data exfiltration via email draft (T1048.003) to external mailbox", _distance: 0.29, source_table: "security_events", event_id: uuid(209) },
      { timestamp: ts(55), log_source: "Sysmon", hostname: "EXCH-EDGE", severity: 2, text: "USB Mass Storage device connected — Vendor: SanDisk, Serial: 4C530001FF0B — possible physical exfiltration media (T1052.001)", _distance: 0.32, source_table: "security_events", event_id: uuid(210) },
    ] };
  }

  /* ── default / generic results ── */
  return { results: [
    { timestamp: ts(5), log_source: "Sysmon", hostname: "DC-PRIMARY", severity: 4, text: "LSASS memory access detected — credential dumping via Mimikatz-like tool (T1003.001)", _distance: 0.12, source_table: "security_events", event_id: uuid(1) },
    { timestamp: ts(12), log_source: "Sysmon", hostname: "WKS-FIN-042", severity: 4, text: "PsExec service installation — lateral movement using admin credentials (T1021.002)", _distance: 0.18, source_table: "security_events", event_id: uuid(2) },
    { timestamp: ts(20), log_source: "Sysmon", hostname: "WKS-DEV-019", severity: 3, text: "Encoded PowerShell with base64 payload — possible C2 stager download (T1059.001)", _distance: 0.23, source_table: "security_events", event_id: uuid(3) },
    { timestamp: ts(35), log_source: "Windows Security", hostname: "SQL-PROD-01", severity: 3, text: "Token impersonation via SeDebugPrivilege — privilege escalation attempt (T1134.001)", _distance: 0.27, source_table: "security_events", event_id: uuid(4) },
    { timestamp: ts(48), log_source: "Sysmon", hostname: "EXCH-EDGE", severity: 3, text: "PE file with modified creation timestamp — timestomping for defense evasion (T1070.006)", _distance: 0.31, source_table: "security_events", event_id: uuid(5) },
    { timestamp: ts(55), log_source: "DNS Logs", hostname: "WKS-MKT-007", severity: 2, text: "High-entropy DNS queries to .xyz domains — DNS tunneling indicators (T1071.004)", _distance: 0.34, source_table: "security_events", event_id: uuid(6) },
    { timestamp: ts(70), log_source: "Sysmon", hostname: "FS-SHARE-01", severity: 4, text: "Mass file encryption activity — ransomware behavioral pattern detected (T1486)", _distance: 0.38, source_table: "security_events", event_id: uuid(7) },
    { timestamp: ts(85), log_source: "Windows Security", hostname: "DC-PRIMARY", severity: 3, text: "Multiple failed authentication attempts — brute force attack pattern (T1110.001)", _distance: 0.42, source_table: "security_events", event_id: uuid(8) },
  ] };
}

/* ═══════════════════════════════════════════════════════════════
   /api/lancedb (status)
   ═══════════════════════════════════════════════════════════════ */
export function demoLanceDb() {
  return {
    status: "healthy",
    total_vectors: 5_674_661,
    tables: ["security_events_vectors"],
    embedding_dim: 384,
    index_type: "IVF_PQ",
    last_sync: ts(5),
  };
}

/* ── Seeded PRNG ── */
function pseudoRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/ai/classify — classification result
   ═══════════════════════════════════════════════════════════════ */
export function demoAiClassifyResult() {
  return {
    is_attack: true,
    predicted_category: "lateral_movement",
    confidence_score: 0.9234,
    severity: 4,
    features_used: 41,
    model_version: "2.1.0",
    processing_time_ms: 12,
    details: {
      binary_prediction: { is_attack: true, confidence: 0.9234 },
      multiclass_prediction: { category: "lateral_movement", confidence: 0.8912 },
      risk_factors: [
        "High connection rate from single source",
        "Unusual service port combination",
        "Known attack pattern signature match",
      ],
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/ai/investigate — full investigation report
   ═══════════════════════════════════════════════════════════════ */
export function demoAiInvestigate() {
  const now = new Date().toISOString();
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    investigation_id: "inv-demo-live",
    created_at: ago(15),
    status: "completed",
    error: null,
    trigger_source: "manual",
    trigger_event: {
      event_type: "lateral_movement",
      hostname: "WKS-FIN-042",
      description: "PsExec service installation on WKS-FIN-042 from svc-admin account",
    },
    triage: {
      is_attack: true,
      confidence: 0.92,
      category: "lateral_movement",
      severity: "critical",
      priority: "P1",
      explanation: "Event matches known PsExec lateral movement pattern. Service installation on remote host with privileged account is a strong indicator of adversary activity.",
      mitre_tactic: "lateral_movement",
      mitre_technique: "T1021.002",
      classifier_used: "XGBoost Binary + Multi-class",
      log_type: "sysmon",
      xai_available: true,
      xai_top_features: [
        { feature: "connection_duration", shap_value: 0.182, display_name: "Connection Duration", category: "connection" },
        { feature: "src_bytes", shap_value: 0.156, display_name: "Source Bytes", category: "traffic" },
        { feature: "service_type", shap_value: 0.128, display_name: "Service Type", category: "protocol" },
        { feature: "count", shap_value: 0.098, display_name: "Connection Count", category: "traffic" },
        { feature: "serror_rate", shap_value: 0.087, display_name: "SYN Error Rate", category: "error_rate" },
        { feature: "dst_host_srv_count", shap_value: 0.065, display_name: "Dst Host Srv Count", category: "host" },
        { feature: "protocol_type", shap_value: 0.045, display_name: "Protocol Type", category: "protocol" },
        { feature: "dst_bytes", shap_value: -0.042, display_name: "Dest. Bytes", category: "traffic" },
        { feature: "flag", shap_value: 0.038, display_name: "TCP Flag", category: "protocol" },
        { feature: "same_srv_rate", shap_value: -0.034, display_name: "Same Service Rate", category: "connection" },
      ],
      xai_prediction_drivers: "High connection duration strongly indicates lateral movement. Large outgoing data volume typical of PsExec payload transfer. 127 connections to same service suggest credential spraying. 78% SYN error rate indicates port scanning.",
      xai_waterfall: {
        base_value: 0.45,
        output_value: 0.9234,
        features: [
          { feature: "connection_duration", contribution: 0.182 },
          { feature: "src_bytes", contribution: 0.156 },
          { feature: "service_type", contribution: 0.128 },
          { feature: "count", contribution: 0.098 },
          { feature: "serror_rate", contribution: 0.087 },
        ],
      },
      xai_category_attribution: {
        traffic: 0.342,
        connection: 0.224,
        error_rate: 0.087,
        protocol: 0.211,
        host: 0.082,
        content: 0.032,
      },
      xai_model_type: "binary",
    },
    hunt: {
      correlated_events: [
        { event_id: uuid(201), timestamp: ago(14), source_table: "security_events", category: "lateral_movement", severity: 4, description: "PsExec service PSEXESVC installed on WKS-FIN-042", hostname: "WKS-FIN-042", ip_address: "10.10.15.42", similarity_score: 0.96, correlation_type: "exact_match" },
        { event_id: uuid(202), timestamp: ago(13), source_table: "process_events", category: "process_creation", severity: 3, description: "cmd.exe spawned by PSEXESVC on WKS-FIN-042", hostname: "WKS-FIN-042", ip_address: "10.10.15.42", similarity_score: 0.91, correlation_type: "parent_child" },
        { event_id: uuid(203), timestamp: ago(12), source_table: "security_events", category: "credential_access", severity: 4, description: "LSASS memory access from unsigned process", hostname: "DC-PRIMARY", ip_address: "10.10.15.10", similarity_score: 0.88, correlation_type: "temporal" },
        { event_id: uuid(204), timestamp: ago(11), source_table: "network_events", category: "c2_beaconing", severity: 4, description: "Periodic HTTPS callback to 185.220.101.42 every 60s", hostname: "WKS-FIN-042", ip_address: "185.220.101.42", similarity_score: 0.85, correlation_type: "network" },
        { event_id: uuid(205), timestamp: ago(10), source_table: "process_events", category: "process_injection", severity: 4, description: "rundll32.exe injected into svchost.exe memory space", hostname: "WKS-FIN-042", ip_address: "10.10.15.42", similarity_score: 0.82, correlation_type: "behavioral" },
        { event_id: uuid(206), timestamp: ago(9), source_table: "security_events", category: "defense_evasion", severity: 3, description: "Event log cleared on WKS-FIN-042", hostname: "WKS-FIN-042", ip_address: "10.10.15.42", similarity_score: 0.79, correlation_type: "temporal" },
        { event_id: uuid(207), timestamp: ago(8), source_table: "network_events", category: "dns_tunneling", severity: 2, description: "High entropy DNS queries to c2.evil.xyz", hostname: "WKS-FIN-042", ip_address: "10.10.15.42", similarity_score: 0.75, correlation_type: "network" },
      ],
      attack_chain: [
        { timestamp: ago(15), action: "Initial Compromise", source: "DC-PRIMARY", detail: "Compromised svc-admin credentials used to authenticate via SMB" },
        { timestamp: ago(14), action: "Lateral Movement", source: "WKS-FIN-042", detail: "PsExec service PSEXESVC installed and executed on target host" },
        { timestamp: ago(13), action: "Execution", source: "WKS-FIN-042", detail: "cmd.exe spawned by PSEXESVC — attacker gains interactive shell" },
        { timestamp: ago(12), action: "Credential Dumping", source: "DC-PRIMARY", detail: "LSASS memory accessed — Mimikatz-style credential extraction" },
        { timestamp: ago(11), action: "C2 Established", source: "WKS-FIN-042", detail: "Cobalt Strike beacon calling back to 185.220.101.42:443 every 60s" },
        { timestamp: ago(10), action: "Process Injection", source: "WKS-FIN-042", detail: "Beacon injected into svchost.exe for persistence" },
        { timestamp: ago(9), action: "Defense Evasion", source: "WKS-FIN-042", detail: "Security event logs cleared to cover tracks" },
      ],
      affected_hosts: ["DC-PRIMARY", "WKS-FIN-042"],
      affected_ips: ["10.10.15.10", "10.10.15.42", "185.220.101.42"],
      affected_users: ["svc-admin"],
      mitre_tactics: ["lateral_movement", "execution", "credential_access", "command_and_control", "defense_evasion"],
      mitre_techniques: ["T1021.002", "T1059.001", "T1003.001", "T1055.012", "T1071.001"],
    },
    verification: {
      verdict: "true_positive",
      confidence: 0.94,
      adjusted_confidence: 0.96,
      false_positive_score: 0.04,
      evidence_summary: "Cross-referenced 7 correlated events across 3 data sources. PsExec service installation confirmed via Sysmon Event ID 7. Network logs confirm C2 beaconing pattern to known malicious infrastructure (185.220.101.42).",
      checks_performed: 8,
      checks_passed: 7,
      checks_failed: 1,
      check_details: [
        { check: "IOC Reputation", passed: true, detail: "185.220.101.42 flagged in 4 threat intel feeds (Cobalt Strike C2)" },
        { check: "Temporal Correlation", passed: true, detail: "All 7 events occurred within a 6-minute window — consistent attack chain" },
        { check: "Process Lineage", passed: true, detail: "PSEXESVC → cmd.exe → powershell.exe chain confirmed via Sysmon" },
        { check: "Network Anomaly", passed: true, detail: "60-second beacon interval with consistent packet size (typical Cobalt Strike)" },
        { check: "Credential Abuse", passed: true, detail: "svc-admin used from unusual source (DC-PRIMARY → WKS-FIN-042)" },
        { check: "MITRE Coverage", passed: true, detail: "5 MITRE techniques identified across 5 tactics — high-confidence attack" },
        { check: "Baseline Deviation", passed: true, detail: "WKS-FIN-042 has no history of PsExec usage — anomalous behavior" },
        { check: "User Confirmation", passed: false, detail: "Pending SOC analyst confirmation — auto-escalated to P1" },
      ],
      recommendation: "Immediately isolate WKS-FIN-042, reset svc-admin credentials, and block 185.220.101.42 at perimeter firewall. Full forensic investigation recommended.",
    },
    report: {
      investigation_id: "inv-demo-live",
      title: "Lateral Movement via PsExec — Cobalt Strike Deployment",
      executive_summary: "A confirmed lateral movement attack using PsExec has been detected. The threat actor leveraged compromised svc-admin credentials to move from DC-PRIMARY to WKS-FIN-042, where a Cobalt Strike beacon was deployed. The beacon is actively communicating with C2 infrastructure at 185.220.101.42.",
      severity: "critical",
      sections: {
        "Attack Summary": "The attacker compromised the svc-admin service account and used PsExec to remotely install a service on WKS-FIN-042. Post-exploitation involved credential dumping via LSASS access on DC-PRIMARY and deployment of a Cobalt Strike beacon for persistent C2 access.",
        "Impact Assessment": "Two hosts confirmed compromised (DC-PRIMARY, WKS-FIN-042). Domain service account credentials exfiltrated. Active C2 channel established — attacker retains persistent access. Risk of further lateral movement to additional domain-joined hosts.",
        "Evidence Chain": "7 correlated events across security_events, process_events, and network_events tables. Merkle-tree anchored evidence batches provide cryptographic integrity verification for all forensic artifacts.",
      },
      mitre_mapping: [
        { technique_id: "T1021.002", technique_name: "SMB/Windows Admin Shares", tactic: "Lateral Movement", url: "https://attack.mitre.org/techniques/T1021/002" },
        { technique_id: "T1059.001", technique_name: "PowerShell", tactic: "Execution", url: "https://attack.mitre.org/techniques/T1059/001" },
        { technique_id: "T1003.001", technique_name: "LSASS Memory", tactic: "Credential Access", url: "https://attack.mitre.org/techniques/T1003/001" },
        { technique_id: "T1055.012", technique_name: "Process Hollowing", tactic: "Defense Evasion", url: "https://attack.mitre.org/techniques/T1055/012" },
        { technique_id: "T1071.001", technique_name: "Web Protocols", tactic: "Command and Control", url: "https://attack.mitre.org/techniques/T1071/001" },
      ],
      recommendations: [
        "Isolate WKS-FIN-042 from the network immediately",
        "Reset svc-admin credentials and review all associated sessions",
        "Block external IP 185.220.101.42 at the perimeter firewall",
        "Run full forensic sweep on DC-PRIMARY and WKS-FIN-042",
        "Sweep all domain-joined hosts for PsExec and Cobalt Strike indicators",
        "Enable enhanced Sysmon logging across all endpoints",
        "Implement network segmentation to limit lateral movement paths",
      ],
      affected_assets: {
        hosts: ["DC-PRIMARY", "WKS-FIN-042"],
        accounts: ["svc-admin"],
        ips: ["10.10.15.10", "10.10.15.42", "185.220.101.42"],
      },
      timeline: [
        { timestamp: ago(15), event: "svc-admin authenticated via SMB from DC-PRIMARY", source: "security_events" },
        { timestamp: ago(14), event: "PsExec service PSEXESVC installed on WKS-FIN-042", source: "security_events" },
        { timestamp: ago(13), event: "cmd.exe spawned by PSEXESVC", source: "process_events" },
        { timestamp: ago(12), event: "LSASS memory access detected on DC-PRIMARY", source: "security_events" },
        { timestamp: ago(11), event: "Cobalt Strike beacon established to 185.220.101.42", source: "network_events" },
        { timestamp: ago(10), event: "Process injection: rundll32.exe → svchost.exe", source: "process_events" },
        { timestamp: ago(9), event: "Security event logs cleared on WKS-FIN-042", source: "security_events" },
      ],
    },
    agent_results: [
      { agent_name: "Triage Agent", status: "completed", started_at: ago(15), finished_at: ago(14.7), duration_ms: 340, error: null },
      { agent_name: "Hunter Agent", status: "completed", started_at: ago(14.7), finished_at: ago(12.9), duration_ms: 1820, error: null },
      { agent_name: "Verifier Agent", status: "completed", started_at: ago(12.9), finished_at: ago(12.2), duration_ms: 670, error: null },
      { agent_name: "Reporter Agent", status: "completed", started_at: ago(12.2), finished_at: ago(11.3), duration_ms: 910, error: null },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/ai/xai (explain)
   ═══════════════════════════════════════════════════════════════ */
export function demoAiXaiExplain() {
  return {
    is_attack: true,
    confidence: 0.9234,
    category: "lateral_movement",
    severity: "critical",
    explanation: "Event classified as lateral movement with 92.3% confidence. SHAP analysis reveals connection duration and source bytes as primary attack indicators.",
    xai: {
      method: "SHAP",
      model_type: "binary",
      explainer_type: "TreeExplainer",
      top_features: [
        { feature: "connection_duration", display_name: "Connection Duration", shap_value: 0.182, abs_shap_value: 0.182, feature_value: 0.847, raw_value: 0.847, impact: "positive" as const, category: "connection" },
        { feature: "src_bytes", display_name: "Source Bytes", shap_value: 0.156, abs_shap_value: 0.156, feature_value: 12453, raw_value: 12453, impact: "positive" as const, category: "traffic" },
        { feature: "service_type", display_name: "Service Type", shap_value: 0.128, abs_shap_value: 0.128, feature_value: 2, raw_value: "private", impact: "positive" as const, category: "protocol" },
        { feature: "count", display_name: "Connection Count", shap_value: 0.098, abs_shap_value: 0.098, feature_value: 127, raw_value: 127, impact: "positive" as const, category: "traffic" },
        { feature: "serror_rate", display_name: "SYN Error Rate", shap_value: 0.087, abs_shap_value: 0.087, feature_value: 0.78, raw_value: 0.78, impact: "positive" as const, category: "error_rate" },
        { feature: "dst_host_srv_count", display_name: "Dst Host Srv Count", shap_value: 0.065, abs_shap_value: 0.065, feature_value: 3, raw_value: 3, impact: "positive" as const, category: "host" },
        { feature: "protocol_type", display_name: "Protocol Type", shap_value: 0.045, abs_shap_value: 0.045, feature_value: 1, raw_value: "tcp", impact: "positive" as const, category: "protocol" },
        { feature: "dst_bytes", display_name: "Dest. Bytes", shap_value: -0.042, abs_shap_value: 0.042, feature_value: 892, raw_value: 892, impact: "negative" as const, category: "traffic" },
        { feature: "flag", display_name: "TCP Flag", shap_value: 0.038, abs_shap_value: 0.038, feature_value: 3, raw_value: "S0", impact: "positive" as const, category: "protocol" },
        { feature: "same_srv_rate", display_name: "Same Service Rate", shap_value: -0.034, abs_shap_value: 0.034, feature_value: 0.12, raw_value: 0.12, impact: "negative" as const, category: "connection" },
        { feature: "logged_in", display_name: "Logged In", shap_value: 0.032, abs_shap_value: 0.032, feature_value: 1, raw_value: 1, impact: "positive" as const, category: "content" },
        { feature: "dst_host_same_srv_rate", display_name: "Dst Same Srv Rate", shap_value: -0.028, abs_shap_value: 0.028, feature_value: 0.08, raw_value: 0.08, impact: "negative" as const, category: "host" },
        { feature: "srv_count", display_name: "Service Count", shap_value: 0.025, abs_shap_value: 0.025, feature_value: 45, raw_value: 45, impact: "positive" as const, category: "traffic" },
        { feature: "diff_srv_rate", display_name: "Diff Service Rate", shap_value: 0.018, abs_shap_value: 0.018, feature_value: 0.67, raw_value: 0.67, impact: "positive" as const, category: "connection" },
        { feature: "dst_host_count", display_name: "Dst Host Count", shap_value: -0.015, abs_shap_value: 0.015, feature_value: 12, raw_value: 12, impact: "negative" as const, category: "host" },
      ],
      waterfall: {
        base_value: 0.45,
        output_value: 0.9234,
        features: [
          { feature: "connection_duration", value: 0.182 },
          { feature: "src_bytes", value: 0.156 },
          { feature: "service_type", value: 0.128 },
          { feature: "count", value: 0.098 },
          { feature: "serror_rate", value: 0.087 },
          { feature: "dst_host_srv_count", value: 0.065 },
          { feature: "protocol_type", value: 0.045 },
          { feature: "flag", value: 0.038 },
          { feature: "dst_bytes", value: -0.042 },
          { feature: "same_srv_rate", value: -0.034 },
          { feature: "dst_host_same_srv_rate", value: -0.028 },
        ],
      },
      prediction_drivers: "High connection duration (0.847) strongly indicates attack activity. Large outgoing data volume (12,453 bytes) typical of data exfiltration. 127 connections to same service suggest brute-force or scanning pattern. 78% SYN error rate indicates port scanning or service probing.",
      category_attribution: {
        traffic: 0.342,
        connection: 0.224,
        error_rate: 0.087,
        protocol: 0.211,
        host: 0.082,
        content: 0.032,
      },
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   POST /api/ai/chat
   ═══════════════════════════════════════════════════════════════ */
export function demoAiChat(message: string) {
  const q = message.toLowerCase();

  /* ── Query-specific responses for suggested prompts + common questions ── */
  const responses: { match: (q: string) => boolean; text: string }[] = [
    {
      match: (q) => q.includes("investigation pipeline") || q.includes("how does the investigation"),
      text: `## CLIF Investigation Pipeline\n\nCLIF uses a **four-agent AI pipeline** to automate security investigations:\n\n### 1. Triage Agent\nReceives the raw event and runs it through our **XGBoost binary classifier** (98.5% accuracy). Determines if the event is malicious or benign. Assigns an initial severity score and extracts key indicators (IPs, hostnames, process names).\n\n### 2. Hunter Agent\nPerforms deep investigation by:\n- Correlating with **similar events** across all 4 log tables\n- Checking source/destination IPs against threat intelligence\n- Building an **attack chain** using MITRE ATT&CK mapping\n- Identifying affected assets and lateral movement paths\n\n### 3. Verifier Agent\nCross-validates the Hunter's findings through:\n- **8 independent verification checks** (IOC validation, temporal correlation, behavioral analysis, MITRE consistency, etc.)\n- Reduces false positives by ~40%\n- Produces a confidence-weighted verdict\n\n### 4. Reporter Agent\nGenerates a structured investigation report with:\n- Executive summary and technical details\n- MITRE ATT&CK technique mapping\n- Affected assets and timeline\n- Prioritized remediation recommendations\n\nThe entire pipeline executes in **under 3 seconds** per event, enabling real-time automated response.`,
    },
    {
      match: (q) => q.includes("shap") || q.includes("feature attribution") || q.includes("explainab"),
      text: `## SHAP Feature Attribution in CLIF\n\n**SHAP** (SHapley Additive exPlanations) is our core explainability framework, based on cooperative game theory.\n\n### How It Works\n\nFor each prediction, SHAP computes the **marginal contribution** of every feature to the final output. This gives us:\n\n1. **Local explanations** — Why *this specific event* was classified as malicious\n2. **Global explanations** — Which features matter most *across all predictions*\n\n### Waterfall Charts\n\nThe waterfall visualization shows:\n- **Red bars** (positive SHAP values) → push prediction toward *malicious*\n- **Blue bars** (negative SHAP values) → push prediction toward *benign*\n- Bar length = magnitude of impact\n\n### Top Features in Our Model\n\n| Feature | Avg SHAP | Category |\n|---------|----------|----------|\n| \`dst_bytes\` | 0.142 | Network |\n| \`service_type\` | 0.128 | Protocol |\n| \`connection_duration\` | 0.115 | Temporal |\n| \`src_bytes\` | 0.098 | Network |\n| \`protocol_flag\` | 0.087 | Protocol |\n\n### Why It Matters\n\n- **Audit compliance**: SOC analysts can justify every AI decision\n- **Model debugging**: Identifies feature drift or data quality issues\n- **Trust building**: Investigators understand *why* an alert was raised, not just *that* it was raised\n\nAll SHAP outputs are accessible via the \`/explainability\` page or the XAI API endpoint.`,
    },
    {
      match: (q) => q.includes("syn flood") || q.includes("syn attack"),
      text: `## SYN Flood Attacks\n\n### Overview\n\nA **SYN flood** is a Denial-of-Service (DoS) attack that exploits the TCP three-way handshake. The attacker sends a massive volume of **SYN packets** with spoofed source IPs, never completing the handshake. This exhausts the target's connection table and memory.\n\n### Attack Mechanics\n\n1. Attacker sends SYN → Target allocates resources and replies SYN-ACK\n2. Attacker **never sends the final ACK**\n3. Target holds half-open connections until timeout (typically 75 seconds)\n4. Connection table fills → legitimate users can't connect\n\n### Detection in CLIF\n\nCLIF detects SYN floods through multiple signals:\n\n- **High SYN-to-ACK ratio** from a single source (>10:1)\n- **Rapid connection rate** exceeding baseline (>500 SYN/sec)\n- **Multiple spoofed source IPs** targeting same destination port\n- **MITRE mapping**: T1498.001 (Network Denial of Service: Direct Network Flood)\n\n### Current CLIF Telemetry\n\n- \`network_events\` table shows **3 potential SYN flood patterns** in the last 24h\n- Largest burst: **12,400 SYN packets/sec** targeting 10.0.1.50:443\n- Source: Distributed across 847 unique IPs (likely botnet)\n\n### Mitigation\n\n- Enable **SYN cookies** on target hosts\n- Configure rate limiting at network perimeter\n- Use CLIF's real-time alerting to trigger automated firewall rules`,
    },
    {
      match: (q) => q.includes("brute force") || q.includes("brute-force"),
      text: `## Investigating Brute Force Attempts with CLIF\n\n### Step-by-Step Investigation Workflow\n\n**Step 1: Identify the Alert**\nGo to the **Alerts** page and filter for category \`credential-access\` or search for "brute-force". CLIF auto-classifies authentication failures exceeding threshold as brute force (MITRE T1110).\n\n**Step 2: Search for Related Events**\nOn the **Search** page, query the \`security_events\` table for the source IP:\n- Filter by \`event_type = authentication_failure\`\n- Look for >10 failures within 60 seconds from the same source\n- Check if different usernames are being tried (credential stuffing variant)\n\n**Step 3: Semantic Search**\nUse CLIF's **semantic search** — type "suspicious authentication pattern" to find conceptually related events that keyword search might miss.\n\n**Step 4: Run AI Investigation**\nRight-click the alert → **Investigate with AI**. The 4-agent pipeline will:\n- Triage: Classify as malicious/benign\n- Hunt: Correlate with other events from the same IP, check fail2ban logs\n- Verify: Cross-check against known attack patterns\n- Report: Generate full investigation with timeline\n\n**Step 5: Check Explainability**\nGo to **Explainability** to see which features drove the AI's classification — typically \`failed_login_count\`, \`unique_usernames\`, and \`time_between_attempts\` have the highest SHAP values.\n\n### What CLIF Shows Right Now\n\n- **23 brute force alerts** in the last 24 hours\n- Top targeted host: \`DC-PRIMARY\` (domain controller)\n- Top source IP: \`192.168.1.105\` (87 failed attempts in 4 minutes)\n- 3 successful logins after brute force detected → **high priority**`,
    },
    {
      match: (q) => q.includes("lateral movement"),
      text: `## Lateral Movement Detection in CLIF\n\nCLIF monitors multiple lateral movement techniques mapped to MITRE ATT&CK:\n\n### Active Detections\n\n| Technique | MITRE ID | Events (24h) | Severity |\n|-----------|----------|--------------|----------|\n| PsExec Remote Execution | T1569.002 | 47 | Critical |\n| Pass-the-Hash | T1550.002 | 12 | Critical |\n| WMI Remote Execution | T1047 | 34 | High |\n| RDP Lateral Movement | T1021.001 | 89 | Medium |\n| SMB File Sharing | T1021.002 | 156 | Low |\n\n### Current Investigation\n\nWe're tracking an active lateral movement chain:\n\n1. \`WKS-IT-PC7\` → \`DC-PRIMARY\` via PsExec (svc-admin)\n2. \`DC-PRIMARY\` → \`WKS-FIN-042\` via WMI (domainadmin)\n3. \`WKS-FIN-042\` → \`SRV-FILE-01\` via SMB admin share\n\nThis matches the classic **credential hopping** pattern. Recommend immediate isolation of compromised hosts and credential reset for \`svc-admin\` and \`domainadmin\` accounts.`,
    },
    {
      match: (q) => q.includes("mitre") || q.includes("att&ck") || q.includes("attack framework"),
      text: `## MITRE ATT&CK Integration in CLIF\n\nCLIF maps all detections to the **MITRE ATT&CK v14** framework, covering 14 tactics and 200+ techniques.\n\n### Most Active Tactics (Last 24h)\n\n1. **Execution** (TA0002) — 892 events (PowerShell, cmd.exe, WMI)\n2. **Lateral Movement** (TA0008) — 338 events (PsExec, RDP, SMB)\n3. **Credential Access** (TA0006) — 267 events (LSASS access, brute force)\n4. **Persistence** (TA0003) — 145 events (scheduled tasks, registry keys)\n5. **Defense Evasion** (TA0005) — 112 events (log clearing, process injection)\n\n### How CLIF Uses MITRE\n\n- **Real-time mapping**: Every classified event is tagged with technique IDs\n- **Heatmap visualization**: Dashboard shows tactical distribution at a glance\n- **Attack chains**: AI investigation pipeline builds MITRE-based kill chains\n- **Threat intel correlation**: IOCs are linked to known threat actor TTPs\n\nYou can explore the full mapping on the **Dashboard** (heatmap) or in individual **Investigation Reports**.`,
    },
    {
      match: (q) => q.includes("top threat") || q.includes("threat categor") || q.includes("current threat"),
      text: `## Current Threat Categories\n\nBased on CLIF's real-time analysis over the last 24 hours:\n\n### Top 5 Threat Categories by Volume\n\n| # | Category | Count | Severity | Trend |\n|---|----------|-------|----------|-------|\n| 1 | Suspicious Execution | 892 | High | ↑ 23% |\n| 2 | Lateral Movement | 338 | Critical | ↑ 45% |\n| 3 | Credential Access | 267 | High | → Stable |\n| 4 | Network Anomaly | 198 | Medium | ↓ 12% |\n| 5 | Persistence Mechanism | 145 | High | ↑ 8% |\n\n### Key Concerns\n\n- **Lateral movement is trending up 45%** — indicates active adversary in the network\n- **3 critical investigations** open with high-confidence true positive verdicts\n- **Top targeted asset**: DC-PRIMARY (domain controller) — 342 events\n- **Top source IP**: 192.168.1.105 — linked to brute force + PsExec activity\n\nRecommend reviewing the **Dashboard** heatmap and **Alerts** page filtered to Critical severity for immediate prioritization.`,
    },
  ];

  const matched = responses.find((r) => r.match(q));
  const text = matched?.text || `Based on the current CLIF telemetry, I can see:\n\n## Current Threat Landscape\n\n- **21.4M+ events** ingested across 4 tables\n- **~70K EPS** sustained ingestion rate\n- **47 critical alerts** in the last 24 hours\n- **Top MITRE technique**: T1059.001 (PowerShell Execution) with 892 detections\n\n### Key Findings\n\n1. **Active Lateral Movement**: PsExec-based movement from DC-PRIMARY to WKS-FIN-042 using compromised svc-admin credentials\n2. **Credential Dumping**: LSASS memory access detected on domain controller\n3. **C2 Beaconing**: 60-second interval callbacks to 185.220.101.42\n\n### Recommended Actions\n\n- Isolate WKS-FIN-042 immediately\n- Reset svc-admin credentials\n- Block 185.220.101.42 at perimeter firewall\n- Run full forensic sweep on affected hosts`;

  return {
    response: text,
    llm_used: true,
    note: "Response generated using CLIF context and qwen3 via Ollama",
  };
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/ai/investigations/[id]
   ═══════════════════════════════════════════════════════════════ */
export function demoInvestigationDetail(id: string) {
  return {
    ...demoAiInvestigate(),
    investigation_id: id,
  };
}
