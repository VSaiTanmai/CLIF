import { NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { cached } from "@/lib/cache";
import { checkRateLimit, getClientId } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const PROM_TIMEOUT_MS = 8_000;

/** Cache TTL for dashboard metrics — balances freshness vs. query cost */
const METRICS_CACHE_TTL_MS = 2_000;

async function fetchUptime(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROM_TIMEOUT_MS);
  try {
    const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent("avg_over_time(up{job=~\"clickhouse.*|redpanda\"}[24h]) * 100")}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      log.warn("Prometheus uptime query returned non-OK", { component: "metrics", status: res.status });
      return "—";
    }
    const json = await res.json();
    const results = json.data?.result ?? [];
    if (results.length === 0) return "—";
    const avg = results.reduce((sum: number, r: { value: [number, string] }) => sum + parseFloat(r.value[1]), 0) / results.length;
    return avg.toFixed(2);
  } catch {
    log.warn("Prometheus uptime query failed", { component: "metrics" });
    return "—";
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  // Rate limiting
  const rateLimited = checkRateLimit(getClientId(request), { maxTokens: 30, refillRate: 2 }, "/api/metrics");
  if (rateLimited) return rateLimited;

  // Parse optional time range query param
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";
  const rangeMap: Record<string, string> = {
    "1h": "1 HOUR", "4h": "4 HOUR", "24h": "24 HOUR", "7d": "7 DAY", "30d": "30 DAY",
  };
  const sqlInterval = rangeMap[range] || "24 HOUR";
  // For computing previous-period comparison
  const rangeHours: Record<string, number> = { "1h": 1, "4h": 4, "24h": 24, "7d": 168, "30d": 720 };
  const hours = rangeHours[range] || 24;
  const prevInterval = `${hours * 2} HOUR`;

  try {
    const data = await cached(`metrics:dashboard:${range}`, METRICS_CACHE_TTL_MS, async () => {
      const [totalEvents, recentRate, alertCount, topSources, severityDist, eventsTimeline, uptimePct, criticalAlerts, tableCounts, evidenceStats, mitreStats, eventsTimelineFallback, recentRateFallback, riskyEntitiesQ, mitreTacticHeatmapQ, prevAlertsQ, mttrQ] =
        await Promise.allSettled([
          queryClickHouse<{ cnt: string }>(
            `SELECT
               (SELECT count() FROM clif_logs.raw_logs) +
               (SELECT count() FROM clif_logs.security_events) +
               (SELECT count() FROM clif_logs.process_events) +
               (SELECT count() FROM clif_logs.network_events) AS cnt`
          ),
          queryClickHouse<{ eps: string }>(
            `SELECT greatest(
               ifNull((SELECT sum(event_count) / 10
                FROM clif_logs.events_per_10s
                WHERE ts >= now() - INTERVAL 10 SECOND), 0),
               ifNull((SELECT sum(event_count) / greatest(10, dateDiff('second', min(ts), max(ts) + INTERVAL 10 SECOND))
                FROM clif_logs.events_per_10s
                WHERE ts >= now() - INTERVAL 60 SECOND), 0),
               ifNull((SELECT max(bin_total) / 10 FROM (
                  SELECT sum(event_count) AS bin_total
                  FROM clif_logs.events_per_10s
                  WHERE ts >= now() - INTERVAL 1 HOUR
                  GROUP BY ts)), 0),
               ifNull((SELECT coalesce(value, 0)
                FROM clif_logs.pipeline_metrics
                WHERE metric = 'producer_eps'
                  AND ts >= now() - INTERVAL 5 MINUTE
                ORDER BY ts DESC LIMIT 1), 0)
             ) AS eps`
          ),
          queryClickHouse<{ cnt: string }>(
            `SELECT sum(event_count) AS cnt
             FROM clif_logs.security_severity_hourly
             WHERE severity >= 2
               AND hour >= now() - INTERVAL ${sqlInterval}`
          ),
          queryClickHouse<{ source: string; cnt: string }>(
            `SELECT source, sum(event_count) AS cnt
             FROM clif_logs.events_per_minute
             WHERE minute >= now() - INTERVAL ${sqlInterval}
             GROUP BY source
             ORDER BY cnt DESC
             LIMIT 10`
          ),
          queryClickHouse<{ severity: number; cnt: string }>(
            `SELECT severity, sum(event_count) AS cnt
             FROM clif_logs.security_severity_hourly
             WHERE hour >= now() - INTERVAL ${sqlInterval}
             GROUP BY severity
             ORDER BY severity`
          ),
          queryClickHouse<{ minute: string; cnt: string }>(
            `SELECT ts AS minute, sum(event_count) AS cnt
             FROM clif_logs.events_per_10s
             WHERE ts >= now() - INTERVAL 6 HOUR
             GROUP BY ts
             ORDER BY ts`
          ),
          fetchUptime(),
          queryClickHouse<{ cnt: string }>(
            `SELECT count() AS cnt
             FROM clif_logs.security_events
             WHERE severity >= 3
               AND timestamp >= now() - INTERVAL 1 HOUR`
          ),
          queryClickHouse<{ tbl: string; cnt: string }>(
            `SELECT 'raw_logs' AS tbl, count() AS cnt FROM clif_logs.raw_logs
             UNION ALL SELECT 'security_events', count() FROM clif_logs.security_events
             UNION ALL SELECT 'process_events', count() FROM clif_logs.process_events
             UNION ALL SELECT 'network_events', count() FROM clif_logs.network_events`
          ),
          queryClickHouse<{ batches: string; anchored: string }>(
            `SELECT count() AS batches, sum(event_count) AS anchored
             FROM clif_logs.evidence_anchors`
          ),
          queryClickHouse<{ technique: string; tactic: string; cnt: string }>(
            `SELECT mitre_technique AS technique,
                   mitre_tactic AS tactic,
                   count() AS cnt
             FROM clif_logs.security_events
             WHERE mitre_technique != ''
               AND timestamp >= now() - INTERVAL 7 DAY
             GROUP BY mitre_technique, mitre_tactic
             ORDER BY cnt DESC
             LIMIT 10`
          ),
          // ── Fallback: events_per_minute for timeline when events_per_10s TTL expired ──
          queryClickHouse<{ minute: string; cnt: string }>(
            `SELECT minute, sum(event_count) AS cnt
             FROM clif_logs.events_per_minute
             WHERE minute >= now() - INTERVAL ${sqlInterval}
             GROUP BY minute
             ORDER BY minute`
          ),
          // ── Fallback: recent rate from events_per_minute ──
          queryClickHouse<{ eps: string }>(
            `SELECT sum(event_count) / greatest(60, dateDiff('second', min(minute), max(minute) + INTERVAL 60 SECOND)) AS eps
             FROM clif_logs.events_per_minute
             WHERE minute >= now() - INTERVAL 60 MINUTE`
          ),
          // ── NEW: Top risky entities (user/host by alert count + weighted severity) ──
          queryClickHouse<{ entity: string; entity_type: string; risk: string; cnt: string }>(
            `SELECT entity, entity_type, toUInt32(sum(weight)) AS risk, toUInt32(count()) AS cnt FROM (
               SELECT user_id AS entity, 'user' AS entity_type,
                      multiIf(severity=4, 25, severity=3, 10, severity=2, 4, severity=1, 1, 0) AS weight
               FROM clif_logs.security_events
               WHERE user_id != '' AND timestamp >= now() - INTERVAL ${sqlInterval}
               UNION ALL
               SELECT hostname AS entity, 'host' AS entity_type,
                      multiIf(severity=4, 25, severity=3, 10, severity=2, 4, severity=1, 1, 0) AS weight
               FROM clif_logs.security_events
               WHERE hostname != '' AND timestamp >= now() - INTERVAL ${sqlInterval}
             ) GROUP BY entity, entity_type ORDER BY risk DESC LIMIT 8`
          ),
          // ── NEW: MITRE tactic heatmap (distinct techniques count + total alerts per tactic) ──
          queryClickHouse<{ tactic: string; techniques: string; alerts: string }>(
            `SELECT mitre_tactic AS tactic,
                    uniqExact(mitre_technique) AS techniques,
                    count() AS alerts
             FROM clif_logs.security_events
             WHERE mitre_tactic != ''
               AND timestamp >= now() - INTERVAL ${sqlInterval}
             GROUP BY mitre_tactic
             ORDER BY alerts DESC`
          ),
          // ── NEW: Previous period alerts (for trend comparison) ──
          queryClickHouse<{ cnt: string }>(
            `SELECT sum(event_count) AS cnt
             FROM clif_logs.security_severity_hourly
             WHERE severity >= 2
               AND hour >= now() - INTERVAL ${prevInterval}
               AND hour < now() - INTERVAL ${sqlInterval}`
          ),
          // ── NEW: Mean Time to Respond (avg seconds from alert creation to investigation completion) ──
          queryClickHouse<{ mttr_sec: string }>(
            `SELECT avg(diff) AS mttr_sec FROM (
               SELECT dateDiff('second', min(timestamp), max(timestamp)) AS diff
               FROM clif_logs.security_events
               WHERE severity >= 3
                 AND timestamp >= now() - INTERVAL ${sqlInterval}
               GROUP BY category
               HAVING count() >= 2
             )`
          ),
        ]);

      return {
        totalEvents:
          totalEvents.status === "fulfilled" ? Number(totalEvents.value.data[0]?.cnt ?? 0) : 0,
        ingestRate: (() => {
          const primary = recentRate.status === "fulfilled" ? Number(recentRate.value.data[0]?.eps ?? 0) : 0;
          if (primary > 0) return primary;
          const fallback = recentRateFallback.status === "fulfilled" ? Number(recentRateFallback.value.data[0]?.eps ?? 0) : 0;
          if (fallback > 0) return fallback;
          // Final fallback: compute from total events / uptime-seconds of data
          if (totalEvents.status === "fulfilled" && eventsTimelineFallback.status === "fulfilled") {
            const tl = eventsTimelineFallback.value.data;
            if (tl.length >= 2) {
              const totalInWindow = tl.reduce((s, r) => s + Number(r.cnt), 0);
              const firstMs = new Date(tl[0].minute + "Z").getTime();
              const lastMs = new Date(tl[tl.length - 1].minute + "Z").getTime();
              const spanSec = Math.max(60, (lastMs - firstMs) / 1000 + 60);
              return Math.round(totalInWindow / spanSec);
            }
          }
          return 0;
        })(),
        activeAlerts:
          alertCount.status === "fulfilled" ? Number(alertCount.value.data[0]?.cnt ?? 0) : 0,
        topSources:
          topSources.status === "fulfilled"
            ? topSources.value.data.map((r) => ({ source: r.source, count: Number(r.cnt) }))
            : [],
        severityDistribution:
          severityDist.status === "fulfilled"
            ? severityDist.value.data.map((r) => ({
                severity: r.severity,
                count: Number(r.cnt),
              }))
            : [],
        eventsTimeline: (() => {
          const primary = eventsTimeline.status === "fulfilled" ? eventsTimeline.value.data : [];
          if (primary.length > 0) return primary.map((r) => ({ time: r.minute, count: Number(r.cnt) }));
          // Fallback to events_per_minute when events_per_10s TTL expired
          const fallback = eventsTimelineFallback.status === "fulfilled" ? eventsTimelineFallback.value.data : [];
          return fallback.map((r) => ({ time: r.minute, count: Number(r.cnt) }));
        })(),
        uptime:
          uptimePct.status === "fulfilled" ? uptimePct.value : "—",
        criticalAlertCount:
          criticalAlerts.status === "fulfilled" ? Number(criticalAlerts.value.data[0]?.cnt ?? 0) : 0,
        tableCounts:
          tableCounts.status === "fulfilled"
            ? Object.fromEntries(tableCounts.value.data.map((r) => [r.tbl, Number(r.cnt)]))
            : {},
        evidenceBatches:
          evidenceStats.status === "fulfilled" ? Number(evidenceStats.value.data[0]?.batches ?? 0) : 0,
        evidenceAnchored:
          evidenceStats.status === "fulfilled" ? Number(evidenceStats.value.data[0]?.anchored ?? 0) : 0,
        mitreTopTechniques:
          mitreStats.status === "fulfilled"
            ? mitreStats.value.data.map((r) => ({ technique: r.technique, tactic: r.tactic, count: Number(r.cnt) }))
            : [],
        // ── NEW competitive-gap fields ──
        riskyEntities:
          riskyEntitiesQ.status === "fulfilled"
            ? riskyEntitiesQ.value.data.map((r) => ({
                entity: r.entity,
                type: r.entity_type as "user" | "host" | "ip",
                riskScore: Number(r.risk),
                alertCount: Number(r.cnt),
              }))
            : [],
        mitreTacticHeatmap:
          mitreTacticHeatmapQ.status === "fulfilled"
            ? mitreTacticHeatmapQ.value.data.map((r) => ({
                tactic: r.tactic,
                techniques: Number(r.techniques),
                alerts: Number(r.alerts),
              }))
            : [],
        riskScore: (() => {
          // Derive from severity distribution: weighted sum normalised to 0-100
          if (severityDist.status !== "fulfilled") return 0;
          const rows = severityDist.value.data;
          const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
          if (total === 0) return 0;
          const weighted = rows.reduce((s, r) => {
            const w = r.severity === 4 ? 40 : r.severity === 3 ? 20 : r.severity === 2 ? 8 : 2;
            return s + Number(r.cnt) * w;
          }, 0);
          return Math.min(100, Math.round((weighted / total) * 2.5));
        })(),
        riskTrend: (() => {
          const current = alertCount.status === "fulfilled" ? Number(alertCount.value.data[0]?.cnt ?? 0) : 0;
          const prev = prevAlertsQ.status === "fulfilled" ? Number(prevAlertsQ.value.data[0]?.cnt ?? 0) : 0;
          if (prev === 0) return 0;
          return Math.round(((current - prev) / prev) * 100);
        })(),
        mttr: (() => {
          if (mttrQ.status !== "fulfilled") return 0;
          return Number(mttrQ.value.data[0]?.mttr_sec ?? 0);
        })(),
        mttrTrend: 0, // placeholder – needs previous-period MTTR for comparison
        prevActiveAlerts:
          prevAlertsQ.status === "fulfilled" ? Number(prevAlertsQ.value.data[0]?.cnt ?? 0) : 0,
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    log.error("Metrics API failed", {
      component: "api/metrics",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
