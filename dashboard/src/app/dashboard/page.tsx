"use client";

import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRate, severityLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Database,
  ShieldAlert,
  Clock,
  TrendingUp,
  TrendingDown,
  Flame,
  Search,
  MessageSquare,
  Gauge,
  Timer,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  User,
  Monitor,
  Globe,
} from "lucide-react";
import type { DashboardMetrics } from "@/lib/types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { useEffect, useState, useRef, useMemo } from "react";

/* ── Constants ── */
const SEVERITY_COLORS: Record<number, string> = {
  0: "#64748b",
  1: "#22c55e",
  2: "#0d9488",
  3: "#f59e0b",
  4: "#dc2626",
};

const SEV_LABEL: Record<number, string> = {
  4: "Critical",
  3: "High",
  2: "Medium",
  1: "Low",
  0: "Info",
};

const SEV_VARIANT: Record<
  number,
  "critical" | "high" | "medium" | "low" | "info"
> = {
  4: "critical",
  3: "high",
  2: "medium",
  1: "low",
  0: "info",
};

const TIME_RANGES = [
  { value: "1h", label: "Last 1 hour" },
  { value: "4h", label: "Last 4 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
] as const;

/* ── MITRE tactic display colours (heat-map intensity via opacity) ── */
/** MITRE tactic short names for compact display */
const TACTIC_SHORT: Record<string, string> = {
  initial_access: "Init Access",
  execution: "Execution",
  persistence: "Persist",
  privilege_escalation: "Priv Esc",
  defense_evasion: "Def Evasion",
  credential_access: "Cred Access",
  discovery: "Discovery",
  lateral_movement: "Lat Move",
  collection: "Collection",
  command_and_control: "C2",
  exfiltration: "Exfil",
  impact: "Impact",
  resource_development: "Resource Dev",
  reconnaissance: "Recon",
};

/* ── Types ── */
interface Alert {
  event_id: string;
  timestamp: string;
  severity: number;
  category: string;
  description: string;
  hostname: string;
}

interface Investigation {
  investigation_id: string;
  created_at: string;
  status: string;
  category: string;
  severity: string;
  priority: string;
  confidence: number;
  verdict: string | null;
}

/* ── Sub-components ── */
function KpiCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  value,
  subtitle,
  loading,
  valueColor,
  trend,
  trendLabel,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  value: string;
  subtitle: string;
  loading: boolean;
  valueColor?: string;
  trend?: number;
  trendLabel?: string;
}) {
  const trendUp = (trend ?? 0) > 0;
  const trendDown = (trend ?? 0) < 0;
  return (
    <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={cn("rounded-xl p-3.5", iconBg)}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {title}
            </p>
            {loading ? (
              <Skeleton className="mt-1 h-9 w-24" />
            ) : (
              <div className="flex items-baseline gap-2">
                <p
                  className={cn(
                    "text-[28px] font-bold tabular-nums tracking-tight leading-tight",
                    valueColor || "text-foreground",
                  )}
                >
                  {value}
                </p>
                {trend !== undefined && trend !== 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-xs font-semibold",
                      trendUp ? "text-red-500" : "text-green-500",
                    )}
                  >
                    {trendUp ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(trend)}%
                  </span>
                )}
              </div>
            )}
            <p className="text-[13px] text-gray-400">
              {trendLabel || subtitle}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Tiny inline sparkline for risk score gauge */
function RiskGauge({ score, loading }: { score: number; loading: boolean }) {
  if (loading) return <Skeleton className="h-9 w-24" />;
  const color =
    score >= 70
      ? "text-red-500"
      : score >= 40
        ? "text-amber-500"
        : "text-green-500";
  const bgColor =
    score >= 70
      ? "bg-red-500"
      : score >= 40
        ? "bg-amber-500"
        : "bg-green-500";
  return (
    <div className="flex items-baseline gap-2">
      <p className={cn("text-[28px] font-bold tabular-nums tracking-tight leading-tight", color)}>
        {score}
      </p>
      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-16 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", bgColor)}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400">/100</span>
      </div>
    </div>
  );
}

function formatMttr(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="font-semibold text-foreground">
        {formatNumber(payload[0].value)} events
      </p>
    </div>
  );
}

/** Entity type icon + color */
function EntityIcon({ type }: { type: string }) {
  if (type === "user") return <User className="h-3.5 w-3.5 text-blue-400" />;
  if (type === "host") return <Monitor className="h-3.5 w-3.5 text-violet-400" />;
  return <Globe className="h-3.5 w-3.5 text-cyan-400" />;
}

function entityTypeBadgeClass(type: string) {
  if (type === "user") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  if (type === "host") return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
  return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
}

/** Heat color based on normalised 0-1 intensity */
function heatColor(intensity: number): string {
  if (intensity >= 0.8) return "bg-red-500 dark:bg-red-500";
  if (intensity >= 0.6) return "bg-orange-500 dark:bg-orange-500";
  if (intensity >= 0.4) return "bg-amber-400 dark:bg-amber-500";
  if (intensity >= 0.2) return "bg-yellow-300 dark:bg-yellow-500";
  return "bg-emerald-400 dark:bg-emerald-500";
}

function heatTextColor(intensity: number): string {
  if (intensity >= 0.8) return "text-red-600 dark:text-red-400";
  if (intensity >= 0.6) return "text-orange-600 dark:text-orange-400";
  if (intensity >= 0.4) return "text-amber-600 dark:text-amber-400";
  if (intensity >= 0.2) return "text-yellow-600 dark:text-yellow-500";
  return "text-emerald-600 dark:text-emerald-400";
}

/* ══════════════════════════════════════════════════════════════
   Main Dashboard Page
   ══════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState("24h");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { data, loading, error } = usePolling<DashboardMetrics>(
    `/api/metrics?range=${timeRange}`,
    2000,
  );
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [invSearch, setInvSearch] = useState("");

  /* ── Close picker on outside click ── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Fetch alerts ── */
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setAlerts(
            (json.alerts ?? []).filter((a: Alert) => a.severity >= 2),
          );
        }
      } catch {
        /* silent */
      }
    };
    fetchAlerts();
    const t = setInterval(fetchAlerts, 15_000);
    return () => clearInterval(t);
  }, []);

  /* ── Fetch investigations ── */
  useEffect(() => {
    const fetchInv = async () => {
      try {
        const res = await fetch("/api/ai/agents", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setInvestigations(json.investigations ?? []);
        }
      } catch {
        /* silent */
      }
    };
    fetchInv();
    const t = setInterval(fetchInv, 30_000);
    return () => clearInterval(t);
  }, []);

  const uptime = data?.uptime ? `${data.uptime}%` : "—";

  const timelineData = useMemo(() => {
    if (!mounted) return [];
    return (data?.eventsTimeline ?? []).map((d) => ({
      time: new Date(d.time + "Z").toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      count: d.count,
    }));
  }, [data?.eventsTimeline, mounted]);

  const severityData = (data?.severityDistribution ?? [])
    .filter((d) => d.severity >= 1)
    .sort((a, b) => a.severity - b.severity)
    .map((d) => ({
      label: severityLabel(d.severity),
      count: d.count,
      severity: d.severity,
    }));

  const filteredInvestigations = investigations.filter(
    (inv) =>
      !invSearch ||
      inv.category?.toLowerCase().includes(invSearch.toLowerCase()) ||
      inv.investigation_id?.toLowerCase().includes(invSearch.toLowerCase()),
  );

  const activeIncidents = investigations.filter(
    (i) => i.status === "completed",
  ).length;

  const selectedLabel =
    TIME_RANGES.find((r) => r.value === timeRange)?.label ?? "Last 24 hours";

  // Risk Score & MTTR
  const riskScore = data?.riskScore ?? 0;
  const riskTrend = data?.riskTrend ?? 0;
  const mttr = data?.mttr ?? 0;
  const alertTrend = data?.riskTrend ?? 0; // alerts trend same computation

  // MITRE heatmap helpers
  const tacticHeatmap = data?.mitreTacticHeatmap ?? [];
  const maxAlerts = Math.max(1, ...tacticHeatmap.map((t) => t.alerts));

  // Risky entities
  const riskyEntities = data?.riskyEntities ?? [];
  const maxEntityRisk = Math.max(1, ...riskyEntities.map((e) => e.riskScore));

  return (
    <div className="space-y-6">
      {/* ── Header with Time Range Picker ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">
            Security Operations Center
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Real-time threat monitoring and incident response
          </p>
        </div>
        {/* Time Range Picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors"
          >
            <Clock className="h-4 w-4 text-gray-400" />
            {selectedLabel}
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 py-1 shadow-lg">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => {
                    setTimeRange(r.value);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors",
                    timeRange === r.value
                      ? "font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10"
                      : "text-gray-700 dark:text-neutral-300",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-red-700">
                Failed to load metrics
              </p>
              <p className="text-xs text-red-500">
                {error} — retrying with exponential backoff
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Row — 6 cards ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={MessageSquare}
          iconColor="text-teal-600"
          iconBg="bg-teal-50 dark:bg-teal-500/10"
          title="TOTAL EVENTS"
          value={data ? formatNumber(data.totalEvents) : "—"}
          subtitle="All time ingested"
          loading={loading}
        />
        <KpiCard
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50 dark:bg-green-500/10"
          title="INGESTION RATE"
          value={data ? formatRate(data.ingestRate) : "—"}
          subtitle="Events per second"
          loading={loading}
          valueColor="text-green-600"
        />
        <KpiCard
          icon={ShieldAlert}
          iconColor="text-red-600"
          iconBg="bg-red-50 dark:bg-red-500/10"
          title="ACTIVE ALERTS"
          value={data ? formatNumber(data.activeAlerts) : "—"}
          subtitle={selectedLabel}
          loading={loading}
          trend={alertTrend}
          trendLabel={`vs previous period`}
        />
        <KpiCard
          icon={Flame}
          iconColor="text-orange-600"
          iconBg="bg-orange-50 dark:bg-orange-500/10"
          title="ACTIVE INCIDENTS"
          value={String(activeIncidents)}
          subtitle="AI investigations"
          loading={loading}
        />
        {/* ── NEW: Risk Score ── */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="rounded-xl p-3.5 bg-amber-50 dark:bg-amber-500/10">
                <Gauge className="h-6 w-6 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  RISK SCORE
                </p>
                <RiskGauge score={riskScore} loading={loading} />
                <p className="text-[13px] text-gray-400">
                  {riskScore >= 70
                    ? "High risk posture"
                    : riskScore >= 40
                      ? "Moderate risk"
                      : "Low risk posture"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* ── NEW: MTTR ── */}
        <KpiCard
          icon={Timer}
          iconColor="text-purple-600"
          iconBg="bg-purple-50 dark:bg-purple-500/10"
          title="MTTR"
          value={formatMttr(mttr)}
          subtitle="Mean time to respond"
          loading={loading}
          valueColor={
            mttr > 3600
              ? "text-red-500"
              : mttr > 600
                ? "text-amber-500"
                : "text-green-500"
          }
        />
      </div>

      {/* ── Middle Row: Events Chart | Severity | Live Alerts ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        {/* Events / Minute — 6 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-bold text-foreground">
              Events / Minute
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {loading || timelineData.length === 0 ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={timelineData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="areaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#3b82f6"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="100%"
                        stopColor="#3b82f6"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatNumber(v)}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#areaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Severity — 3 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-bold text-foreground">
              Severity ({selectedLabel.replace("Last ", "")})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {loading || severityData.length === 0 ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={severityData}
                  margin={{ top: 24, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={SEVERITY_COLORS[entry.severity] ?? "#64748b"}
                      />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      fill="hsl(var(--foreground))"
                      fontSize={12}
                      fontWeight={600}
                      formatter={(v) => formatNumber(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Live Alerts — 3 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-bold text-foreground">
                Live Alerts
              </CardTitle>
              {alerts.length > 0 && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[11px] font-bold text-white">
                  {alerts.length > 99 ? "99+" : alerts.length}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="max-h-[268px] overflow-y-auto">
            <div className="space-y-2.5">
              {alerts.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  No recent alerts
                </p>
              ) : (
                alerts.slice(0, 10).map((a, i) => (
                  <div
                    key={a.event_id || i}
                    className="rounded-lg border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 shadow-xs"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        variant={SEV_VARIANT[a.severity] ?? "info"}
                        className="text-[10px] px-2 py-0.5 rounded-sm"
                      >
                        {SEV_LABEL[a.severity] ?? "Info"}
                      </Badge>
                      <span className="text-sm font-bold text-foreground">
                        {a.category || "Alert"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Details: {a.description || a.category}
                    </p>
                    {a.hostname && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {a.hostname.includes(".") ? `Detaram: ${a.hostname}` : `Hostname: ${a.hostname}`}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: MITRE Heatmap | Risky Entities | Recent Investigations ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        {/* MITRE ATT&CK — 3 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-3">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-bold text-foreground">
                MITRE ATT&CK
              </CardTitle>
              <span className="text-[10px] font-medium text-gray-400 dark:text-neutral-500">
                {tacticHeatmap.length} tactics
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : tacticHeatmap.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-400">
                No MITRE data available
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700/50">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tactic</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-12">Tech</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-16">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {tacticHeatmap.map((t) => {
                    const intensity = t.alerts / maxAlerts;
                    const key = t.tactic.toLowerCase().replace(/[\s-]+/g, "_");
                    const label = TACTIC_SHORT[key] ?? t.tactic.replace(/[_-]/g, " ");
                    return (
                      <tr key={t.tactic} className="border-b border-gray-50 dark:border-neutral-800/50 last:border-0">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2 w-2 rounded-full shrink-0", heatColor(intensity))} />
                            <span className="text-[13px] text-gray-700 dark:text-neutral-300 capitalize">
                              {label}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="text-[13px] tabular-nums text-gray-500 dark:text-neutral-400">
                            {t.techniques}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={cn("text-[13px] font-semibold tabular-nums", heatTextColor(intensity))}>
                            {formatNumber(t.alerts)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Risky Entities — 3 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-3">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-bold text-foreground">
                Risky Entities
              </CardTitle>
              <span className="text-[10px] font-medium text-gray-400 dark:text-neutral-500">
                by risk score
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : riskyEntities.length === 0 ? (
              <p className="py-10 text-center text-xs text-gray-400">
                No entity data
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700/50">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-6">#</th>
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Entity</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-14">Alerts</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-16">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {riskyEntities.slice(0, 8).map((e, i) => {
                    const pct = (e.riskScore / maxEntityRisk) * 100;
                    return (
                      <tr key={`${e.entity}-${i}`} className="border-b border-gray-50 dark:border-neutral-800/50 last:border-0">
                        <td className="py-2.5 text-[11px] text-gray-400 dark:text-neutral-500 tabular-nums">
                          {i + 1}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <EntityIcon type={e.type} />
                            <div className="min-w-0">
                              <span className="text-[13px] font-medium text-gray-700 dark:text-neutral-300 truncate block">
                                {e.entity}
                              </span>
                              <span className={cn(
                                "text-[9px] font-medium",
                                e.type === "user" ? "text-blue-500" : e.type === "host" ? "text-violet-500" : "text-cyan-500",
                              )}>
                                {e.type}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="text-[13px] tabular-nums text-gray-500 dark:text-neutral-400">
                            {formatNumber(e.alertCount)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            pct >= 80 ? "text-red-500" : pct >= 50 ? "text-amber-500" : "text-blue-500",
                          )}>
                            {formatNumber(e.riskScore)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Recent Investigations — 6 cols */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 lg:col-span-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px] font-bold text-foreground">
                Recent Investigations
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  className="h-8 w-44 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 pl-8 pr-3 text-sm text-gray-700 dark:text-neutral-300 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Case ID
                    </th>
                    <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Title / Description
                    </th>
                    <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Status
                    </th>
                    <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Assignee
                    </th>
                    <th className="pb-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                      Last Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvestigations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-xs text-gray-400"
                      >
                        No investigations yet — run one from the AI Agents page
                      </td>
                    </tr>
                  ) : (
                    filteredInvestigations.slice(0, 5).map((inv) => (
                      <tr
                        key={inv.investigation_id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-3 pr-3 font-mono text-xs font-semibold text-gray-700">
                          {inv.investigation_id}
                        </td>
                        <td className="max-w-[200px] truncate py-3 pr-3 text-xs text-gray-700">
                          {inv.category}
                          {inv.verdict
                            ? ` — ${inv.verdict.replace(/_/g, " ")}`
                            : ""}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={
                              inv.status === "completed"
                                ? "low"
                                : inv.status === "closed"
                                  ? "closed"
                                  : inv.status === "in_progress"
                                    ? "in_progress"
                                    : inv.status === "open"
                                      ? "open"
                                      : "medium"
                            }
                            className="rounded-full text-[9px] whitespace-nowrap px-2.5"
                          >
                            {inv.status?.replace(/_/g, " ").toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-xs text-gray-600">
                          AI Agent
                        </td>
                        <td className="whitespace-nowrap py-3 text-xs text-gray-500" suppressHydrationWarning>
                          {mounted
                            ? `${new Date(inv.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}, ${new Date(inv.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
