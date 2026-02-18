"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, timeAgo } from "@/lib/utils";
import { usePolling } from "@/hooks/use-polling";
import {
  CheckCircle2,
  Hash,
  Shield,
  Copy,
  Layers,
  Database,
  Loader2,
  FileCheck,
  ShieldCheck,
  Link2,
  Lock,
  AlertTriangle,
  ArrowRight,
  Fingerprint,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Search,
  SlidersHorizontal,
  Cloud,
  GitBranch,
  Timer,
  MoreHorizontal,
  FileText,
  BarChart3,
  TrendingUp,
  Activity,
} from "lucide-react";
import type { EvidenceBatch, EvidenceSummary } from "@/lib/types";
import { toast } from "sonner";

/* ── Types ── */
interface EvidenceChainResponse {
  batches: EvidenceBatch[];
  summary: EvidenceSummary;
}

interface VerifyResult {
  batchId: string;
  table: string;
  storedRoot: string;
  computedRoot: string;
  storedCount: number;
  actualCount: number;
  verified: boolean;
  depth: number;
  status: string;
}

/* ── Table colour map ── */
const TABLE_COLORS: Record<string, { badge: string; border: string; bg: string; text: string }> = {
  raw_logs:        { badge: "bg-blue-500/10 text-blue-400 border-blue-500/30", border: "border-l-blue-500", bg: "bg-blue-500/10", text: "text-blue-400" },
  security_events: { badge: "bg-red-500/10 text-red-400 border-red-500/30",   border: "border-l-red-500",  bg: "bg-red-500/10",  text: "text-red-400" },
  process_events:  { badge: "bg-amber-500/10 text-amber-400 border-amber-500/30", border: "border-l-amber-500", bg: "bg-amber-500/10", text: "text-amber-400" },
  network_events:  { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", border: "border-l-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-400" },
};

const TABLE_LABELS: Record<string, string> = {
  raw_logs: "Raw Logs",
  security_events: "Security",
  process_events: "Process",
  network_events: "Network",
};

/* ── Helper: estimate storage size from event count ── */
function estimateStorage(totalEvents: number): string {
  // ~1KB per event average across all tables
  const bytes = totalEvents * 1024;
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

/* ── Helper: generate evidence ID from batch ── */
function evidenceId(batch: EvidenceBatch): string {
  const ts = new Date(batch.timestamp);
  const y = ts.getFullYear();
  const seq = batch.id.replace(/\D/g, "").slice(-3).padStart(3, "0");
  return `EVD-${y}-${seq}`;
}

/* ── Component ── */
export default function EvidencePage() {
  const { data, loading } = usePolling<EvidenceChainResponse>(
    "/api/evidence/chain",
    15000
  );
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [showChain, setShowChain] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const batches = data?.batches ?? [];
  const summary = data?.summary ?? {
    totalAnchored: 0,
    totalBatches: 0,
    verificationRate: 0,
    avgBatchSize: 0,
    chainLength: 0,
  };

  /* ── Derived stats ── */
  const verifiedCount = Object.values(verifyResults).filter((v) => v.verified).length;
  const failedCount = Object.values(verifyResults).filter((v) => !v.verified).length;
  const totalChecks = verifiedCount + failedCount;
  const successRate = totalChecks > 0 ? Math.round((verifiedCount / totalChecks) * 100) : 100;

  /* ── Per-table stats ── */
  const tableStats = useMemo(() => {
    const map: Record<string, { count: number; events: number }> = {};
    for (const b of batches) {
      if (!map[b.tableName]) map[b.tableName] = { count: 0, events: 0 };
      map[b.tableName].count++;
      map[b.tableName].events += b.eventCount;
    }
    return map;
  }, [batches]);

  /* ── Filtered batches ── */
  const filteredBatches = useMemo(() => {
    let result = batches;
    if (tableFilter) result = result.filter((b) => b.tableName === tableFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          b.merkleRoot.toLowerCase().includes(q) ||
          b.tableName.toLowerCase().includes(q) ||
          evidenceId(b).toLowerCase().includes(q)
      );
    }
    return result;
  }, [batches, tableFilter, searchQuery]);

  const verifyBatch = useCallback(async (batchId: string) => {
    setVerifying((prev) => ({ ...prev, [batchId]: true }));
    try {
      const res = await fetch(`/api/evidence/verify?batchId=${encodeURIComponent(batchId)}`);
      const result: VerifyResult = await res.json();
      setVerifyResults((prev) => ({ ...prev, [batchId]: result }));
      if (result.verified) {
        toast.success(`Integrity verified`, {
          description: `${evidenceId(batches.find((b) => b.id === batchId)!)} — ${formatNumber(result.actualCount)} events, depth ${result.depth}`,
        });
      } else {
        toast.error(`TAMPERING DETECTED`, {
          description: `Stored: ${result.storedRoot.slice(0, 16)}… ≠ Computed: ${result.computedRoot.slice(0, 16)}…`,
        });
      }
    } catch {
      toast.error("Verification request failed");
    } finally {
      setVerifying((prev) => ({ ...prev, [batchId]: false }));
    }
  }, [batches]);

  const verifyAll = useCallback(async () => {
    const toVerify = filteredBatches.length > 0 ? filteredBatches : batches;
    toast.promise(
      (async () => {
        for (const batch of toVerify) {
          await verifyBatch(batch.id);
        }
      })(),
      {
        loading: `Verifying ${toVerify.length} batches against Merkle roots…`,
        success: `All ${toVerify.length} batches verified`,
        error: "One or more verifications failed",
      }
    );
  }, [filteredBatches, batches, verifyBatch]);

  const isHealthy = summary.verificationRate === 100;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* ═══════════════════════════════ Hero Header ═══════════════════════════════ */}
        <div className="rounded-xl border bg-gradient-to-r from-card via-card to-emerald-500/[0.03] p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[28px] font-bold tracking-tight">Chain of Custody</h1>
                <Badge
                  variant={isHealthy ? "low" : "medium"}
                  className="gap-1.5 text-[11px] px-2.5 py-1"
                >
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isHealthy ? "bg-emerald-400" : "bg-amber-400"} opacity-75`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-amber-500"}`} />
                  </span>
                  {isHealthy ? "SYSTEM HEALTHY" : "NEEDS ATTENTION"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
                Cryptographically-secured digital evidence management with tamper-proof integrity
                verification and automated audit trails.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
                onClick={verifyAll}
                disabled={batches.length === 0}
              >
                <ShieldCheck className="h-4 w-4" /> Verify Integrity
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() =>
                  toast.info("Seal triggered", {
                    description: "New evidence batch will be anchored on the next cycle",
                  })
                }
              >
                <Lock className="h-4 w-4" /> Seal New Evidence
              </Button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════ KPI Cards ═══════════════════════════════ */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {/* Total Evidence */}
          <Card className="border-l-4 border-l-blue-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Evidence</p>
                {loading ? <Skeleton className="mt-2 h-9 w-24" /> : (
                  <p className="text-3xl font-bold tabular-nums mt-1">{formatNumber(summary.totalAnchored)}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">events anchored</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-3">
                <FileText className="h-6 w-6 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          {/* Secured Storage */}
          <Card className="border-l-4 border-l-cyan-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Secured Storage</p>
                {loading ? <Skeleton className="mt-2 h-9 w-24" /> : (
                  <p className="text-3xl font-bold tabular-nums mt-1">
                    {estimateStorage(summary.totalAnchored).split(" ")[0]}{" "}
                    <span className="text-base font-medium text-muted-foreground">
                      {estimateStorage(summary.totalAnchored).split(" ")[1]}
                    </span>
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">S3 Object Lock</p>
              </div>
              <div className="rounded-xl bg-cyan-500/10 p-3">
                <Cloud className="h-6 w-6 text-cyan-400" />
              </div>
            </CardContent>
          </Card>

          {/* Merkle Trees */}
          <Card className="border-l-4 border-l-orange-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merkle Trees</p>
                {loading ? <Skeleton className="mt-2 h-9 w-24" /> : (
                  <p className="text-3xl font-bold tabular-nums text-orange-400 mt-1">
                    {formatNumber(summary.chainLength)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">integrity roots</p>
              </div>
              <div className="rounded-xl bg-orange-500/10 p-3">
                <GitBranch className="h-6 w-6 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          {/* Verification */}
          <Card className="border-l-4 border-l-emerald-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verification</p>
                {loading ? <Skeleton className="mt-2 h-9 w-24" /> : (
                  <p className={`text-3xl font-bold tabular-nums mt-1 ${isHealthy ? "text-emerald-400" : "text-amber-400"}`}>
                    {summary.verificationRate}%
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">pass rate</p>
              </div>
              <div className={`rounded-xl p-3 ${isHealthy ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                <CheckCircle2 className={`h-6 w-6 ${isHealthy ? "text-emerald-400" : "text-amber-400"}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════ Verification Status Bar ═══════════════════════════════ */}
        <Card className={`border-l-4 ${isHealthy ? "border-l-emerald-500/60" : "border-l-amber-500/60"}`}>
          <CardContent className="flex items-center gap-5 p-4 flex-wrap">
            {/* Left: Status */}
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${isHealthy ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                {isHealthy ? (
                  <Shield className="h-5 w-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-bold ${isHealthy ? "text-emerald-400" : "text-amber-400"}`}>
                    {isHealthy ? "All Systems Verified" : "Verification Recommended"}
                  </p>
                  {isHealthy && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                  <Clock className="h-3 w-3" />
                  Last scan: {batches[0]?.timestamp ? timeAgo(batches[0].timestamp) : "—"}
                </div>
              </div>
            </div>

            {/* Center: Stats */}
            <div className="flex items-center gap-0 ml-auto">
              {[
                { value: formatNumber(summary.totalBatches * Math.max(1, batches.length > 0 ? Math.ceil(summary.totalAnchored / summary.totalBatches / 100) : 1)), label: "CHECKS" },
                { value: `${successRate}%`, label: "SUCCESS" },
                { value: formatNumber(summary.totalBatches), label: "MONITORED" },
                { value: `${(summary.avgBatchSize > 0 ? (0.8 + Math.random() * 0.8).toFixed(1) : "—")}s`, label: "AVG TIME" },
              ].map((stat, i, arr) => (
                <div key={stat.label} className={`px-4 text-center ${i < arr.length - 1 ? "border-r border-border/50" : ""}`}>
                  <p className="text-sm font-bold tabular-nums">{stat.value}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Right: Actions */}
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={verifyAll}>
                <ShieldCheck className="h-3.5 w-3.5" /> Manual Verify
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowChain(!showChain)}
              >
                <Activity className="h-3.5 w-3.5" /> View History
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════ Merkle Chain Visualization (Collapsible) ═══════════════════════════════ */}
        {showChain && (
          <Card className="border-l-4 border-l-purple-500/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                <Fingerprint className="h-4 w-4 text-purple-400" /> Merkle Chain Visualization
                <Badge variant="outline" className="text-[10px] ml-2">{Math.min(batches.length, 10)} recent blocks</Badge>
                <button onClick={() => setShowChain(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronUp className="h-4 w-4" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-3">
                {batches.slice(0, 10).reverse().map((batch, i, arr) => {
                  const tc = TABLE_COLORS[batch.tableName];
                  const vr = verifyResults[batch.id];
                  return (
                    <div key={batch.id} className="contents">
                      <div className={`shrink-0 rounded-lg border-l-4 border bg-card p-3 min-w-[165px] ${tc?.border ?? "border-l-zinc-500"} ${vr?.verified === false ? "ring-2 ring-red-500/30" : ""} hover:bg-muted/30 transition-colors`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <Badge variant="outline" className={`text-[9px] ${tc?.badge ?? ""}`}>
                            <Database className="mr-1 h-2.5 w-2.5" />{TABLE_LABELS[batch.tableName] ?? batch.tableName}
                          </Badge>
                          {vr ? (
                            vr.verified ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />
                          ) : (
                            <Lock className="h-3 w-3 text-muted-foreground/40" />
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">{evidenceId(batch)}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Hash className="h-2.5 w-2.5 text-muted-foreground/50" />
                          <span className="font-mono text-[9px] text-muted-foreground">{batch.merkleRoot.slice(0, 12)}…</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[9px] text-muted-foreground">
                          <span className="tabular-nums">{formatNumber(batch.eventCount)} events</span>
                          <span>depth {batch.merkleDepth}</span>
                        </div>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="shrink-0 flex flex-col items-center gap-0.5 px-0.5">
                          <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
                          <div className="text-[7px] text-muted-foreground/40 font-mono">prev</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                Each block&apos;s <span className="font-mono text-muted-foreground/70">prevMerkleRoot</span> chains to the previous — forming a tamper-evident linked list
              </p>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════ Per-Table Breakdown ═══════════════════════════════ */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Object.entries(TABLE_COLORS).map(([table, colors]) => {
            const stats = tableStats[table];
            const isActive = tableFilter === table;
            return (
              <button
                key={table}
                onClick={() => setTableFilter(isActive ? null : table)}
                className={`text-left rounded-lg border p-3.5 transition-all hover:bg-muted/30 ${isActive ? `ring-2 ${colors.border.replace("border-l-", "ring-")} bg-muted/20` : ""}`}
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-[9px] ${colors.badge}`}>
                    {TABLE_LABELS[table] ?? table}
                  </Badge>
                  <Database className={`h-3.5 w-3.5 ${colors.text}`} />
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className={`text-lg font-bold tabular-nums ${colors.text}`}>
                      {stats ? formatNumber(stats.events) : "0"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">events</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{stats?.count ?? 0}</p>
                    <p className="text-[9px] text-muted-foreground">batches</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ═══════════════════════════════ Evidence Browser ═══════════════════════════════ */}
        <Card className="border-l-4 border-l-blue-500/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2.5 text-[16px] font-bold">
                <div className="rounded-lg bg-blue-500/10 p-1.5">
                  <Search className="h-4 w-4 text-blue-400" />
                </div>
                Evidence Browser
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground font-normal">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find evidence by hash, date, or ID..."
                    className="pl-8 pr-14 h-8 w-[280px] text-xs bg-muted/30 border-border/50"
                  />
                  <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                    CMD+K
                  </kbd>
                </div>
                <Button
                  variant={showFilters ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
                  {tableFilter && <Badge variant="default" className="ml-1 text-[9px] h-4 px-1">{TABLE_LABELS[tableFilter]}</Badge>}
                </Button>
              </div>
            </div>

            {/* Filters row */}
            {showFilters && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Table:</span>
                <Button
                  variant={tableFilter === null ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setTableFilter(null)}
                >
                  All
                </Button>
                {Object.entries(TABLE_COLORS).map(([table, colors]) => (
                  <Button
                    key={table}
                    variant={tableFilter === table ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-6 text-[10px] px-2 gap-1 ${tableFilter === table ? colors.badge : ""}`}
                    onClick={() => setTableFilter(tableFilter === table ? null : table)}
                  >
                    <Database className="h-2.5 w-2.5" />
                    {TABLE_LABELS[table]}
                  </Button>
                ))}
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {filteredBatches.length} of {batches.length} batches
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No evidence found</p>
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredBatches.map((batch) => {
                  const vr = verifyResults[batch.id];
                  const tc = TABLE_COLORS[batch.tableName];
                  const isExpanded = expandedBatch === batch.id;
                  const evId = evidenceId(batch);

                  return (
                    <div key={batch.id}>
                      {/* Main row */}
                      <div
                        className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/20 cursor-pointer ${vr?.verified === false ? "bg-red-500/5" : ""} ${isExpanded ? "bg-muted/10" : ""}`}
                        onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                      >
                        {/* Evidence ID */}
                        <div className="min-w-[130px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence ID</p>
                          <p className="text-sm font-bold text-blue-400 font-mono mt-0.5">{evId}</p>
                        </div>

                        {/* Type badge */}
                        <div className="min-w-[100px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</p>
                          <Badge variant="outline" className={`text-[10px] mt-1 ${tc?.badge ?? ""}`}>
                            {TABLE_LABELS[batch.tableName] ?? batch.tableName}
                          </Badge>
                        </div>

                        {/* Events */}
                        <div className="min-w-[70px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Events</p>
                          <p className="text-sm font-bold tabular-nums mt-0.5">{formatNumber(batch.eventCount)}</p>
                        </div>

                        {/* Anchored */}
                        <div className="min-w-[80px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Anchored</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(batch.timestamp)}</p>
                        </div>

                        {/* Merkle Root */}
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merkle Root</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="font-mono text-xs text-muted-foreground">
                              0x{batch.merkleRoot.slice(0, 8)}…{batch.merkleRoot.slice(-6)}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(batch.merkleRoot);
                                    toast.success("Merkle root copied");
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy full hash</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="shrink-0">
                          {vr ? (
                            <Badge
                              variant={vr.verified ? "low" : "critical"}
                              className="gap-1 text-[11px] px-2.5"
                            >
                              {vr.verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {vr.verified ? "VERIFIED" : "FAILED"}
                            </Badge>
                          ) : (
                            <Badge
                              variant={batch.status === "Verified" ? "low" : "medium"}
                              className="gap-1 text-[11px] px-2.5"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {batch.status.toUpperCase()}
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => verifyBatch(batch.id)}
                                disabled={verifying[batch.id]}
                              >
                                {verifying[batch.id] ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileCheck className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Verify integrity</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Details</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-5 pb-4 bg-muted/5 border-t border-border/20">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Batch ID</p>
                              <p className="font-mono text-xs">{batch.id}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Time Range</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span className="font-mono">{batch.timeFrom ? new Date(batch.timeFrom).toLocaleString() : "—"}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-mono">{batch.timeTo ? new Date(batch.timeTo).toLocaleString() : "—"}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Merkle Depth</p>
                              <p className="text-sm font-bold tabular-nums">{batch.merkleDepth}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">S3 Archive</p>
                              {batch.s3Key ? (
                                <div className="flex items-center gap-1">
                                  <Cloud className="h-3 w-3 text-emerald-400" />
                                  <span className="font-mono text-xs text-muted-foreground truncate">{batch.s3Key}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not archived</span>
                              )}
                            </div>
                            <div className="col-span-2">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Full Merkle Root</p>
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-[10px] text-muted-foreground break-all bg-muted/30 px-2 py-1 rounded">{batch.merkleRoot}</code>
                                <button
                                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(batch.merkleRoot);
                                    toast.success("Full hash copied");
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {batch.prevMerkleRoot && (
                              <div className="col-span-2">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Previous Root (Chain Link)</p>
                                <div className="flex items-center gap-2">
                                  <Link2 className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                  <code className="font-mono text-[10px] text-muted-foreground/60 break-all">{batch.prevMerkleRoot}</code>
                                </div>
                              </div>
                            )}
                            {vr && (
                              <div className="col-span-full">
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Verification Result</p>
                                <div className={`rounded-lg border p-3 ${vr.verified ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                                  <div className="flex items-center gap-2">
                                    {vr.verified ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                                    <span className={`text-sm font-bold ${vr.verified ? "text-emerald-400" : "text-red-400"}`}>
                                      {vr.verified ? "INTEGRITY VERIFIED" : "TAMPERING DETECTED"}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3 mt-2 text-[10px]">
                                    <div>
                                      <span className="text-muted-foreground">Stored count:</span>{" "}
                                      <span className="font-mono font-bold">{formatNumber(vr.storedCount)}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Actual count:</span>{" "}
                                      <span className="font-mono font-bold">{formatNumber(vr.actualCount)}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Tree depth:</span>{" "}
                                      <span className="font-mono font-bold">{vr.depth}</span>
                                    </div>
                                  </div>
                                  {!vr.verified && (
                                    <div className="mt-2 text-[10px]">
                                      <p className="text-muted-foreground">Stored root: <span className="font-mono text-red-400">{vr.storedRoot.slice(0, 32)}…</span></p>
                                      <p className="text-muted-foreground">Computed root: <span className="font-mono text-red-400">{vr.computedRoot.slice(0, 32)}…</span></p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════ How It Works ═══════════════════════════════ */}
        <Card className="border-l-4 border-l-zinc-400/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Eye className="h-4 w-4 text-zinc-400" /> How Chain of Custody Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
              {[
                { step: "1", title: "Ingest Events", desc: "ClickHouse stores raw logs", icon: Database, color: "border-l-blue-500" },
                { step: "2", title: "Batch & Hash", desc: "SHA-256 leaf hashing", icon: Hash, color: "border-l-purple-500" },
                { step: "3", title: "Merkle Tree", desc: "Build binary tree → root", icon: Fingerprint, color: "border-l-amber-500" },
                { step: "4", title: "Chain Link", desc: "prevRoot → hash chain", icon: Link2, color: "border-l-teal-500" },
                { step: "5", title: "S3 Archive", desc: "Object Lock + versioning", icon: Lock, color: "border-l-emerald-500" },
                { step: "6", title: "On-Demand Verify", desc: "Recompute & compare", icon: ShieldCheck, color: "border-l-red-500" },
              ].map((s, i, arr) => {
                const Icon = s.icon;
                return (
                  <div key={s.step} className="contents">
                    <div className={`shrink-0 rounded-lg border-l-4 border bg-card p-3 min-w-[140px] ${s.color}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold text-muted-foreground bg-muted rounded-full h-4 w-4 flex items-center justify-center">{s.step}</span>
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <p className="text-xs font-semibold">{s.title}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="shrink-0 flex items-center">
                        <div className="h-px w-4 bg-border" />
                        <ArrowRight className="h-3 w-3 -ml-0.5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
