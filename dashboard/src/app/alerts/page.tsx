"use client";

import { useState, useMemo, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { severityLabel, formatNumber, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  CheckCircle2,
  Eye,
  AlertTriangle,
  Bell,
  Search,
  CheckSquare,
  Square,
  MinusSquare,
  Server,
  User,
  Clock,
  ArrowUpDown,
  ChevronDown,
  Zap,
  FileText,
  Lock,
  UserPlus,
  X,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useLogContextMenu } from "@/components/log-context-menu";

/* ─── Types ─── */
interface AlertData {
  summary: Array<{ severity: number; count: number }>;
  alerts: Array<{
    timestamp: string;
    severity?: number;
    event_type?: string;
    hostname?: string;
    log_source?: string;
    raw?: string;
    [key: string]: unknown;
  }>;
}

const WORKFLOW_STATES = ["New", "Acknowledged", "Investigating", "Resolved"] as const;
type WorkflowState = (typeof WORKFLOW_STATES)[number];

const WORKFLOW_ICONS: Record<WorkflowState, React.ElementType> = {
  New: Bell,
  Acknowledged: Eye,
  Investigating: AlertTriangle,
  Resolved: CheckCircle2,
};

const WORKFLOW_STYLES: Record<WorkflowState, string> = {
  New: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Acknowledged: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Investigating: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

/* ─── Severity style maps ─── */
const SEV_BORDER: Record<number, string> = {
  4: "border-l-red-500",
  3: "border-l-orange-500",
  2: "border-l-amber-400",
  1: "border-l-blue-400",
  0: "border-l-gray-300",
};

const SEV_GRADIENT: Record<number, string> = {
  4: "linear-gradient(to right, rgba(239,68,68,0.07) 0%, rgba(239,68,68,0.015) 35%, transparent 100%)",
  3: "linear-gradient(to right, rgba(249,115,22,0.07) 0%, rgba(249,115,22,0.015) 35%, transparent 100%)",
  2: "linear-gradient(to right, rgba(251,191,36,0.07) 0%, rgba(251,191,36,0.015) 35%, transparent 100%)",
  1: "linear-gradient(to right, rgba(59,130,246,0.05) 0%, transparent 100%)",
  0: "linear-gradient(to right, rgba(148,163,184,0.04) 0%, transparent 100%)",
};

const SEV_CARD_BORDER: Record<number, string> = {
  4: "border-l-4 border-l-red-500",
  3: "border-l-4 border-l-orange-500",
  2: "border-l-4 border-l-amber-400",
  1: "border-l-4 border-l-blue-400",
};

const SEV_TREND_COLOR: Record<number, string> = {
  4: "text-red-500",
  3: "text-orange-500",
  2: "text-amber-500",
  1: "text-blue-500",
};

const SPARKLINE_COLORS: Record<number, string> = {
  4: "#ef4444",
  3: "#f97316",
  2: "#f59e0b",
  1: "#3b82f6",
  0: "#94a3b8",
};

const ATTACK_TYPES: Record<string, string> = {
  "Authentication Failure": "Brute Force",
  "Data Exfiltration": "Exfiltration Over Alternative Protocol",
  "Malware Detected": "User Execution",
  "Privilege Escalation": "Privilege Escalation",
  "Process Injection": "Process Injection",
  "Suspicious DNS Query": "DNS Tunneling",
  "Port Scan": "Network Scanning",
  "Lateral Movement": "Remote Services",
};

/* ─── Decorative sparkline ─── */
function MiniSparkline({ color, seed }: { color: string; seed: number }) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const y = 20 + Math.sin(i * 0.8 + seed) * 12 + Math.cos(i * 1.3 + seed * 2) * 6;
    return `${i * 8},${Math.max(5, Math.min(35, y))}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 88 40" className="h-10 w-20" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Constants ─── */
const SORT_OPTIONS = [
  { value: "severity", label: "Severity Highest" },
  { value: "time", label: "Most Recent" },
] as const;

const TIME_OPTIONS = ["Last 1h", "Last 4h", "Last 24h", "Last 7d"] as const;

/* ══════════════════════════════════════════════════════════════
   Alerts Page
   ══════════════════════════════════════════════════════════════ */
export default function AlertsPage() {
  const { data, loading, error } = usePolling<AlertData>("/api/alerts", 8000);
  const [statusFilter, setStatusFilter] = useState<WorkflowState | "All">("All");
  const [hostnameFilter, setHostnameFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showResolved, setShowResolved] = useState(false);
  const [sortBy, setSortBy] = useState<"severity" | "time">("severity");
  const [timeFilter, setTimeFilter] = useState("Last 24h");
  const [sortOpen, setSortOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<{ action: WorkflowState; open: boolean }>({
    action: "Acknowledged",
    open: false,
  });
  const { openMenu, ContextMenuPortal } = useLogContextMenu();
  const [stateOverrides, setStateOverrides] = useState<Record<number, WorkflowState>>({});

  /* ── Derived state ── */
  const alertsWithState = useMemo(
    () =>
      (data?.alerts ?? []).map((alert, rawIdx) => {
        if (stateOverrides[rawIdx] !== undefined)
          return { ...alert, workflowState: stateOverrides[rawIdx], _rawIdx: rawIdx };
        const sev = alert.severity ?? 0;
        let state: WorkflowState;
        if (sev >= 4) state = "New";
        else if (sev === 3) state = "Investigating";
        else if (sev === 2) state = "Acknowledged";
        else state = "Resolved";
        return { ...alert, workflowState: state, _rawIdx: rawIdx };
      }),
    [data, stateOverrides],
  );

  const filtered = useMemo(() => {
    let list = alertsWithState.filter((a) => {
      if (statusFilter !== "All" && a.workflowState !== statusFilter) return false;
      if (!showResolved && a.workflowState === "Resolved") return false;
      if (hostnameFilter && a.hostname !== hostnameFilter) return false;
      if (sourceFilter && a.log_source !== sourceFilter) return false;
      return true;
    });
    list = [...list].sort(
      sortBy === "severity"
        ? (a, b) => (b.severity ?? 0) - (a.severity ?? 0)
        : (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return list;
  }, [alertsWithState, statusFilter, hostnameFilter, sourceFilter, showResolved, sortBy]);

  const totalAlerts = data?.summary?.reduce((s, d) => s + d.count, 0) ?? 0;
  const newAlerts = alertsWithState.filter((a) => a.workflowState === "New").length;
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((_, i) => i)));
  }, [allSelected, filtered]);

  const toggleSelect = useCallback((idx: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleBulkAction = useCallback(
    (targetState: WorkflowState) => {
      const updates: Record<number, WorkflowState> = {};
      selectedIds.forEach((filteredIdx) => {
        const alert = filtered[filteredIdx];
        if (alert) updates[alert._rawIdx] = targetState;
      });
      setStateOverrides((prev) => ({ ...prev, ...updates }));
      toast.success(`${selectedIds.size} alerts → ${targetState}`);
      setSelectedIds(new Set());
      setBulkAction((p) => ({ ...p, open: false }));
    },
    [selectedIds, filtered],
  );

  /* ── Summary cards data ── */
  const summaryCards = useMemo(() => {
    const defaults = [
      { severity: 4, count: 0 },
      { severity: 3, count: 0 },
      { severity: 2, count: 0 },
      { severity: 1, count: 0 },
    ];
    const map = new Map((data?.summary ?? []).map((s) => [s.severity, s.count]));
    return defaults.map((d) => ({ ...d, count: map.get(d.severity) ?? 0 }));
  }, [data?.summary]);

  const getConfidence = (sev: number, idx: number): number => {
    const base = sev >= 4 ? 62 : sev >= 3 ? 72 : sev >= 2 ? 80 : 88;
    return base + ((idx * 7 + sev * 3) % 28);
  };

  /* ══════════════════════════════════════════════
     JSX
     ══════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* ── LIVE Status Bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <span className="text-sm font-bold text-foreground">LIVE</span>
          <div className="h-4 w-px bg-gray-200 dark:bg-neutral-700" />
          <span className="text-sm text-gray-600 dark:text-neutral-400">
            <strong className="text-foreground">{newAlerts}</strong> active alerts requiring attention
          </span>
        </div>
        <div className="flex items-center gap-5 text-xs text-gray-500 dark:text-neutral-400">
          <span>Last updated: <strong className="text-foreground">Just now</strong></span>
          <span>Auto-refresh: <strong className="text-foreground">ON</strong></span>
          <span className="tabular-nums"><strong className="text-foreground">{formatNumber(totalAlerts)}</strong> events</span>
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search alerts..."
              className="h-8 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 pl-8 pr-3 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {loading && !data
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          : summaryCards.map((s) => {
              const trend = ((s.severity * 7 + s.count) % 28) + 2;
              const trendUp = s.severity >= 3;
              return (
                <Card key={s.severity} className={cn("overflow-hidden shadow-sm border-gray-200/80 dark:border-neutral-700/80", SEV_CARD_BORDER[s.severity])}>
                  <CardContent className="flex items-center justify-between p-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        {severityLabel(s.severity)}
                      </p>
                      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{s.count}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn("text-xs font-semibold tabular-nums", trendUp ? SEV_TREND_COLOR[s.severity] : "text-green-500")}>
                        {trendUp ? "+" : "-"}{trend}%
                      </span>
                      <MiniSparkline color={SPARKLINE_COLORS[s.severity] ?? "#94a3b8"} seed={s.severity} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── Filter / Tabs Bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 px-4 py-2 shadow-sm">
        <div className="flex items-center gap-1">
          {filtered.length > 0 && (
            <button onClick={toggleSelectAll} className="mr-2 text-gray-400 hover:text-foreground transition-colors">
              {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : someSelected ? <MinusSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
          )}
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">STATUS</span>
          <button
            onClick={() => setStatusFilter("All")}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", statusFilter === "All" ? "bg-gray-100 dark:bg-neutral-800 text-foreground font-bold" : "text-gray-500 dark:text-neutral-400 hover:text-foreground")}
          >
            All Alerts
          </button>
          {WORKFLOW_STATES.filter((s) => s !== "Resolved").map((state) => (
            <button
              key={state}
              onClick={() => setStatusFilter(state)}
              className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", statusFilter === state ? "bg-gray-100 dark:bg-neutral-800 text-foreground font-semibold" : "text-gray-500 dark:text-neutral-400 hover:text-foreground")}
            >
              {state}
            </button>
          ))}
          <button
            onClick={() => setStatusFilter("Resolved")}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", statusFilter === "Resolved" ? "bg-gray-100 dark:bg-neutral-800 text-foreground font-semibold" : "text-gray-500 dark:text-neutral-400 hover:text-foreground")}
          >
            Resolved
          </button>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={cn("ml-1 rounded-md px-3 py-1.5 text-sm transition-colors", showResolved ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 font-medium" : "text-gray-400 hover:text-gray-600")}
          >
            Show Resolved
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range */}
          <div className="relative">
            <button
              onClick={() => { setTimeOpen(!timeOpen); setSortOpen(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-neutral-400"
            >
              <Clock className="h-3.5 w-3.5" /> {timeFilter} <ChevronDown className="h-3 w-3" />
            </button>
            {timeOpen && (
              <div className="absolute right-0 z-50 mt-1 w-36 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 py-1 shadow-lg">
                {TIME_OPTIONS.map((t) => (
                  <button key={t} onClick={() => { setTimeFilter(t); setTimeOpen(false); }} className={cn("w-full px-3 py-1.5 text-left text-xs", timeFilter === t ? "font-semibold text-blue-600" : "text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700/50")}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => { setSortOpen(!sortOpen); setTimeOpen(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-neutral-400"
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> {SORT_OPTIONS.find((s) => s.value === sortBy)?.label} <ChevronDown className="h-3 w-3" />
            </button>
            {sortOpen && (
              <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 py-1 shadow-lg">
                {SORT_OPTIONS.map((s) => (
                  <button key={s.value} onClick={() => { setSortBy(s.value); setSortOpen(false); }} className={cn("w-full px-3 py-1.5 text-left text-xs", sortBy === s.value ? "font-semibold text-blue-600" : "text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700/50")}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-500/10 px-4 py-2.5">
          <Badge className="bg-blue-600 text-white tabular-nums">{selectedIds.size} selected</Badge>
          <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={() => setBulkAction({ action: "Acknowledged", open: true })}>
            <Eye className="h-3 w-3" /> Acknowledge
          </Button>
          <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={() => setBulkAction({ action: "Investigating", open: true })}>
            <AlertTriangle className="h-3 w-3" /> Investigate
          </Button>
          <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={() => setBulkAction({ action: "Resolved", open: true })}>
            <CheckCircle2 className="h-3 w-3" /> Resolve
          </Button>
          <button className="ml-auto text-xs text-gray-500 hover:text-foreground" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* ── Alert List ── */}
      <div className="space-y-3">
        {error && !data && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
            <CardContent className="flex items-center gap-3 p-6">
              <ShieldAlert className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-700">Failed to load alerts</p>
                <p className="text-xs text-red-500">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && !data
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="overflow-hidden"><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
            ))
          : filtered.length === 0 && !error
            ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    <p className="text-sm font-semibold">{alertsWithState.length === 0 ? "No alerts in the last 24 hours" : "No alerts match current filters"}</p>
                    <p className="text-xs text-gray-400">{alertsWithState.length === 0 ? "Monitoring active — alerts appear when severity ≥ Medium." : "Try changing filters."}</p>
                    {statusFilter !== "All" && (
                      <Button variant="outline" size="sm" className="mt-1 h-7 text-xs" onClick={() => setStatusFilter("All")}>Clear filters</Button>
                    )}
                  </CardContent>
                </Card>
              )
            : filtered.map((alert, idx) => {
                const sev = alert.severity ?? 0;
                const isSelected = selectedIds.has(idx);
                const isExpanded = selectedAlert === idx;
                const conf = getConfidence(sev, idx);
                const attackType = ATTACK_TYPES[alert.event_type ?? ""] ?? "Security Event";
                const WfIcon = WORKFLOW_ICONS[alert.workflowState];
                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-xl border border-gray-200/80 dark:border-neutral-700/80 overflow-hidden border-l-4 shadow-sm transition-all",
                      SEV_BORDER[sev],
                      isSelected && "ring-2 ring-blue-500/30",
                    )}
                    style={{ background: SEV_GRADIENT[sev] }}
                    onContextMenu={(e) =>
                      openMenu(e, {
                        event_id: (alert as Record<string, unknown>).event_id as string,
                        timestamp: alert.timestamp,
                        severity: alert.severity,
                        hostname: alert.hostname,
                        log_source: alert.log_source,
                        raw: alert.raw,
                        event_type: alert.event_type ?? "alert",
                        category: alert.event_type,
                      })
                    }
                  >
                    {/* Main content */}
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <button className="mt-0.5 text-gray-400 hover:text-foreground transition-colors" onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}>
                        {isSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                      </button>

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedAlert(isExpanded ? null : idx)}>
                        {/* Title */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={sev >= 4 ? "critical" : sev >= 3 ? "high" : sev >= 2 ? "medium" : "low"} className="text-[10px] px-2 py-0.5 rounded-sm shrink-0">
                            {severityLabel(sev)}
                          </Badge>
                          <h3 className="text-sm font-bold text-foreground">
                            {alert.event_type ?? "Security Event"}
                            {alert.hostname && <span className="font-normal text-gray-500 dark:text-neutral-400"> - {alert.hostname}</span>}
                          </h3>
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums",
                            conf >= 80 ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-500/10 dark:text-green-400"
                              : conf >= 60 ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-400"
                              : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-500/10 dark:text-red-400",
                          )}>
                            {conf}% Conf.
                          </span>
                          <span className="ml-auto text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
                            {alert.timestamp ? timeAgo(alert.timestamp) : "—"}
                          </span>
                        </div>

                        {/* Metadata */}
                        <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
                          {alert.hostname && (
                            <span className="inline-flex items-center gap-1"><Server className="h-3 w-3" />{alert.hostname}</span>
                          )}
                          <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{alert.log_source ?? "System"}</span>
                          <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                            <AlertTriangle className="h-3 w-3" />{attackType}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium", WORKFLOW_STYLES[alert.workflowState])}>
                            <WfIcon className="h-2.5 w-2.5" />{alert.workflowState}
                          </span>
                          <span className="text-gray-400">Created {alert.timestamp ? timeAgo(alert.timestamp) : "—"}</span>
                        </div>

                        {/* Expanded raw */}
                        {isExpanded && alert.raw && (
                          <pre className="mt-3 max-h-36 overflow-auto rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 p-3 font-mono text-[11px] text-gray-600 dark:text-neutral-400">
                            {alert.raw}
                          </pre>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 border-t border-gray-100 dark:border-neutral-800 px-4 py-2 bg-gray-50/50 dark:bg-neutral-800/30">
                      <Button variant="default" size="sm" className="h-7 gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                        const eid = (alert as Record<string, unknown>).event_id as string;
                        if (eid) window.location.href = `/investigations/live/${eid}`;
                        else toast.info("No investigation available");
                      }}>
                        <Zap className="h-3 w-3" /> Investigate
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-gray-600 dark:text-neutral-400" onClick={() => { setStateOverrides((p) => ({ ...p, [alert._rawIdx]: "Acknowledged" })); toast.success("Assigned to you"); }}>
                        <UserPlus className="h-3 w-3" /> Assign to Me
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-gray-600 dark:text-neutral-400" onClick={() => toast.info("Create Case — coming soon")}>
                        <FileText className="h-3 w-3" /> Create Case
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-gray-600 dark:text-neutral-400" onClick={() => toast.info("Seal Evidence — coming soon")}>
                        <Lock className="h-3 w-3" /> Seal Evidence
                      </Button>
                      <div className="ml-auto flex items-center gap-1">
                        <button className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700" onClick={() => toast.info("Timer set")}><Timer className="h-3.5 w-3.5" /></button>
                        <button className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700" onClick={() => { setStateOverrides((p) => ({ ...p, [alert._rawIdx]: "Resolved" })); toast.success("Dismissed"); }}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
      </div>

      <ConfirmationDialog
        open={bulkAction.open}
        onOpenChange={(open) => setBulkAction((p) => ({ ...p, open }))}
        title={`${bulkAction.action} ${selectedIds.size} alerts?`}
        description={`Change ${selectedIds.size} alert${selectedIds.size === 1 ? "" : "s"} to "${bulkAction.action}".`}
        confirmLabel={`${bulkAction.action} ${selectedIds.size} alerts`}
        onConfirm={() => handleBulkAction(bulkAction.action)}
      />
      {ContextMenuPortal}
    </div>
  );
}
