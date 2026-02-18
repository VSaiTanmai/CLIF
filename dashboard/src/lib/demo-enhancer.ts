/**
 * Demo data enhancer — transforms real ClickHouse data into
 * impressive-looking dashboard numbers for presentations / demos.
 *
 * Toggle: set NEXT_PUBLIC_DEMO_MODE=true in .env.local (or just
 * flip the constant below).
 *
 * Principles:
 *  - EPS fluctuates realistically between 60K-100K
 *  - Severity distribution follows a healthy-SOC bell curve
 *  - Events timeline shows an organic day/night wave
 *  - MITRE heatmap spans 8+ tactics with varied intensity
 *  - Alert counts are reasonable (not millions)
 *  - Everything uses seeded pseudo-randomness so it doesn't jump wildly between polls
 */

import type { DashboardMetrics } from "@/lib/types";

/* ══════════ Toggle ══════════ */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || true; // ← flip to false to disable

/* ══════════ Seeded PRNG (deterministic per second bucket) ══════════ */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Get a slowly-changing seed (changes every N seconds) */
function timeSeed(bucketSeconds = 5): number {
  return Math.floor(Date.now() / (bucketSeconds * 1000));
}

/* ══════════ Demo data generators ══════════ */

function demoEps(): number {
  const rand = seededRandom(timeSeed(3));
  // Base 80K ± 20K
  return Math.round(60_000 + rand() * 40_000);
}

function demoTotalEvents(real: number): number {
  // Use real if > 1M, otherwise make it look like 21.4M+
  if (real > 1_000_000) return real;
  return 21_427_583 + Math.floor(timeSeed(1) * 73);
}

function demoActiveAlerts(): number {
  const rand = seededRandom(timeSeed(10));
  // Between 1,200 and 2,800 — realistic for a 24h SOC view
  return Math.round(1200 + rand() * 1600);
}

function demoCriticalAlerts(): number {
  const rand = seededRandom(timeSeed(10) + 1);
  return Math.round(28 + rand() * 35);
}

function demoSeverityDistribution(): Array<{ severity: number; count: number }> {
  const rand = seededRandom(timeSeed(15));
  // Classic SOC pyramid: lots of low, fewer high, rare critical
  return [
    { severity: 1, count: Math.round(12000 + rand() * 4000) },   // Low
    { severity: 2, count: Math.round(6000 + rand() * 2500) },    // Medium
    { severity: 3, count: Math.round(1800 + rand() * 800) },     // High
    { severity: 4, count: Math.round(120 + rand() * 180) },      // Critical
  ];
}

function demoEventsTimeline(): Array<{ time: string; count: number }> {
  const points: Array<{ time: string; count: number }> = [];
  const now = new Date();
  const rand = seededRandom(timeSeed(30));

  // Generate 36 points (6 hours of 10-min intervals) with organic wave
  for (let i = 35; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 10 * 60_000);
    const hour = t.getHours();

    // Day/night cycle: higher during business hours
    const dayFactor = hour >= 9 && hour <= 18
      ? 1.0
      : hour >= 6 && hour <= 21
        ? 0.7
        : 0.4;

    // Base wave with sine modulation for organic feel
    const wave = Math.sin((i / 36) * Math.PI * 2.5) * 0.15;
    const noise = (rand() - 0.5) * 0.12;
    const base = 3_600_000; // ~60K eps * 60s

    const count = Math.max(
      800_000,
      Math.round(base * dayFactor * (1 + wave + noise)),
    );

    points.push({
      time: t.toISOString().replace("Z", ""),
      count,
    });
  }

  return points;
}

function demoTopSources(): Array<{ source: string; count: number }> {
  const rand = seededRandom(timeSeed(30));
  const sources = [
    "Sysmon", "Windows Security", "Firewall", "IDS/IPS",
    "Endpoint Agent", "Cloud Trail", "DNS Logs", "Proxy",
    "DHCP", "Active Directory",
  ];
  return sources.map((source, i) => ({
    source,
    count: Math.round((10 - i) * 80_000 * (0.7 + rand() * 0.6)),
  }));
}

function demoMitreHeatmap(): Array<{ tactic: string; techniques: number; alerts: number }> {
  const rand = seededRandom(timeSeed(30));
  const tactics = [
    { tactic: "initial_access", base: 420 },
    { tactic: "execution", base: 890 },
    { tactic: "persistence", base: 340 },
    { tactic: "privilege_escalation", base: 215 },
    { tactic: "defense_evasion", base: 760 },
    { tactic: "credential_access", base: 380 },
    { tactic: "discovery", base: 1100 },
    { tactic: "lateral_movement", base: 190 },
    { tactic: "collection", base: 145 },
    { tactic: "command_and_control", base: 95 },
    { tactic: "exfiltration", base: 42 },
    { tactic: "impact", base: 28 },
  ];

  return tactics.map((t) => ({
    tactic: t.tactic,
    techniques: Math.round(2 + rand() * 6),
    alerts: Math.round(t.base * (0.8 + rand() * 0.4)),
  }));
}

function demoMitreTopTechniques(): Array<{ technique: string; tactic: string; count: number }> {
  const rand = seededRandom(timeSeed(30));
  const techs = [
    { technique: "T1059.001", tactic: "execution", base: 890 },
    { technique: "T1055.012", tactic: "defense_evasion", base: 670 },
    { technique: "T1003.001", tactic: "credential_access", base: 420 },
    { technique: "T1071.001", tactic: "command_and_control", base: 380 },
    { technique: "T1566.001", tactic: "initial_access", base: 310 },
    { technique: "T1021.001", tactic: "lateral_movement", base: 260 },
    { technique: "T1547.001", tactic: "persistence", base: 195 },
    { technique: "T1078.003", tactic: "persistence", base: 165 },
    { technique: "T1027", tactic: "defense_evasion", base: 140 },
    { technique: "T1082", tactic: "discovery", base: 120 },
  ];
  return techs.map((t) => ({
    ...t,
    count: Math.round(t.base * (0.8 + rand() * 0.4)),
  }));
}

function demoRiskyEntities(): Array<{ entity: string; type: "user" | "host" | "ip"; riskScore: number; alertCount: number }> {
  const rand = seededRandom(timeSeed(30));
  return [
    { entity: "svc-admin", type: "user" as const, riskScore: Math.round(4200 + rand() * 800), alertCount: Math.round(180 + rand() * 60) },
    { entity: "DC-PRIMARY", type: "host" as const, riskScore: Math.round(3600 + rand() * 700), alertCount: Math.round(145 + rand() * 50) },
    { entity: "jthompson", type: "user" as const, riskScore: Math.round(2800 + rand() * 500), alertCount: Math.round(98 + rand() * 40) },
    { entity: "WKS-FIN-042", type: "host" as const, riskScore: Math.round(2200 + rand() * 400), alertCount: Math.round(72 + rand() * 30) },
    { entity: "SQL-PROD-01", type: "host" as const, riskScore: Math.round(1600 + rand() * 350), alertCount: Math.round(55 + rand() * 25) },
    { entity: "m.chen", type: "user" as const, riskScore: Math.round(1100 + rand() * 250), alertCount: Math.round(38 + rand() * 15) },
    { entity: "EXCH-EDGE", type: "host" as const, riskScore: Math.round(800 + rand() * 200), alertCount: Math.round(25 + rand() * 12) },
    { entity: "backup-svc", type: "user" as const, riskScore: Math.round(500 + rand() * 150), alertCount: Math.round(18 + rand() * 8) },
  ];
}

function demoRiskScore(): number {
  const rand = seededRandom(timeSeed(8));
  // Stay in the amber/moderate zone (42-68) for dramatic but not panic
  return Math.round(42 + rand() * 26);
}

/* ══════════ Main transformer ══════════ */
export function enhanceForDemo(
  real: DashboardMetrics | null,
): DashboardMetrics | null {
  if (!real) return null;
  if (!DEMO_MODE) return real;

  const rand = seededRandom(timeSeed(10));

  return {
    ...real,
    // KPIs
    ingestRate: demoEps(),
    totalEvents: demoTotalEvents(real.totalEvents),
    activeAlerts: demoActiveAlerts(),
    criticalAlertCount: demoCriticalAlerts(),

    // Charts
    severityDistribution: demoSeverityDistribution(),
    eventsTimeline: demoEventsTimeline(),
    topSources: demoTopSources(),

    // MITRE
    mitreTacticHeatmap: demoMitreHeatmap(),
    mitreTopTechniques: demoMitreTopTechniques(),

    // Risky Entities
    riskyEntities: demoRiskyEntities(),

    // Risk & Trends
    riskScore: demoRiskScore(),
    riskTrend: Math.round(-5 + rand() * 18),  // -5% to +13%
    mttr: Math.round(420 + rand() * 300),       // 7-12 min MTTR
    mttrTrend: Math.round(-12 + rand() * 8),    // trending down (good)

    // Table counts
    tableCounts: {
      raw_logs: 4_765_558 + Math.floor(rand() * 10000),
      security_events: 5_674_661 + Math.floor(rand() * 8000),
      process_events: 4_788_297 + Math.floor(rand() * 9000),
      network_events: 6_191_079 + Math.floor(rand() * 11000),
    },

    // Evidence
    evidenceBatches: real.evidenceBatches || 847,
    evidenceAnchored: real.evidenceAnchored || 18_432_109,

    // Uptime
    uptime: "99.97",

    // Previous period for trend arrows
    prevActiveAlerts: Math.round(1400 + rand() * 400),
  };
}
