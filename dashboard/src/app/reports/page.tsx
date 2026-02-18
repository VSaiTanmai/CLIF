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
  FileText,
  FileWarning,
  Briefcase,
  Code2,
  Shield,
  Radar,
  Download,
  Plus,
  Clock,
  CheckCircle2,
  Loader2,
  FileJson,
  FileDown,
  FileSpreadsheet,
  FileCode2,
  Printer,
  Search,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  ShieldAlert,
  Activity,
  Database,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowRight,
  Hash,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface ReportData {
  summary: {
    totalEvents: number;
    totalAlerts24h: number;
    criticalAlerts: number;
    highAlerts: number;
    mediumAlerts: number;
    evidenceBatches: number;
    evidenceAnchored: number;
    evidenceVerified: number;
  };
  eventsByTable: Array<{ table: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  severityDistribution: Array<{ severity: number; count: number }>;
  recentCriticalAlerts: Array<{
    eventId: string;
    timestamp: string;
    severity: number;
    category: string;
    source: string;
    description: string;
    hostname: string;
    mitreTactic: string;
    mitreTechnique: string;
  }>;
  mitreTopTechniques: Array<{
    technique: string;
    tactic: string;
    count: number;
  }>;
  generatedAt: string;
}

/* ── Constants ── */
const TEMPLATES = [
  {
    id: "incident",
    name: "Incident Report",
    description: "Full investigation timeline with evidence chain and Merkle anchors",
    icon: FileWarning,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-l-red-500/60",
  },
  {
    id: "executive",
    name: "Executive Summary",
    description: "High-level briefing for leadership with key metrics and risk assessment",
    icon: Briefcase,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-l-blue-500/60",
  },
  {
    id: "technical",
    name: "Technical Analysis",
    description: "Deep-dive forensic analysis with IOCs, MITRE TTPs, and remediation",
    icon: Code2,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-l-purple-500/60",
  },
  {
    id: "compliance",
    name: "Compliance Report",
    description: "Regulatory documentation with complete audit trail verification",
    icon: Shield,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-l-emerald-500/60",
  },
  {
    id: "threat-intel",
    name: "Threat Intelligence",
    description: "Pattern analysis, IOC sharing, and threat landscape summary",
    icon: Radar,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-l-amber-500/60",
  },
];

const FORMATS = [
  { id: "pdf", label: "PDF", icon: Printer, desc: "Print-ready HTML report", ext: ".html" },
  { id: "json", label: "JSON", icon: FileJson, desc: "Structured data export", ext: ".json" },
  { id: "csv", label: "CSV", icon: FileSpreadsheet, desc: "Spreadsheet-compatible", ext: ".csv" },
  { id: "markdown", label: "Markdown", icon: FileCode2, desc: "Documentation format", ext: ".md" },
];

const SEV_COLORS: Record<number, { text: string; bg: string; label: string }> = {
  4: { text: "text-red-400", bg: "bg-red-500/10", label: "Critical" },
  3: { text: "text-orange-400", bg: "bg-orange-500/10", label: "High" },
  2: { text: "text-amber-400", bg: "bg-amber-500/10", label: "Medium" },
  1: { text: "text-blue-400", bg: "bg-blue-500/10", label: "Low" },
  0: { text: "text-zinc-400", bg: "bg-zinc-500/10", label: "Info" },
};

const TABLE_LABELS: Record<string, string> = {
  raw_logs: "Raw Logs",
  security_events: "Security Events",
  process_events: "Process Events",
  network_events: "Network Events",
};

/* ── Page Component ── */
export default function ReportsPage() {
  const { data, loading } = usePolling<ReportData>("/api/reports", 30000);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [generatedReports, setGeneratedReports] = useState<
    Array<{
      id: string;
      title: string;
      template: string;
      format: string;
      generatedAt: string;
      size: string;
      url: string;
    }>
  >([]);

  const summary = data?.summary;
  const totalAlerts = (summary?.criticalAlerts ?? 0) + (summary?.highAlerts ?? 0) + (summary?.mediumAlerts ?? 0);

  /* ── Download handler ── */
  const handleDownload = useCallback(
    async (templateId: string, format: string) => {
      const key = `${templateId}-${format}`;
      setDownloadingFormat(key);

      try {
        const url = `/api/reports/download?type=${templateId}&format=${format}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        const contentDisp = res.headers.get("Content-Disposition") ?? "";
        const filenameMatch = contentDisp.match(/filename="?([^"]+)"?/);
        const filename = filenameMatch?.[1] ?? `CLIF-Report.${format === "pdf" ? "html" : format}`;

        // For PDF (HTML), open in new tab for print
        if (format === "pdf") {
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
          toast.success("Report opened in new tab", {
            description: "Use Ctrl+P / Cmd+P to save as PDF",
          });
        } else {
          // Direct download for other formats
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          toast.success("Report downloaded", { description: filename });
        }

        // Track the generated report
        const tmpl = TEMPLATES.find((t) => t.id === templateId);
        const sizeKB = Math.round(blob.size / 1024);
        const sizeStr = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
        setGeneratedReports((prev) => [
          {
            id: `RPT-${Date.now()}`,
            title: `${tmpl?.name ?? templateId}`,
            template: templateId,
            format,
            generatedAt: new Date().toISOString(),
            size: sizeStr,
            url,
          },
          ...prev,
        ]);
      } catch (err) {
        toast.error("Download failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setDownloadingFormat(null);
      }
    },
    []
  );

  /* ── Filtered alerts for preview ── */
  const filteredAlerts = useMemo(() => {
    if (!data?.recentCriticalAlerts) return [];
    if (!searchQuery.trim()) return data.recentCriticalAlerts.slice(0, 15);
    const q = searchQuery.toLowerCase();
    return data.recentCriticalAlerts
      .filter(
        (a) =>
          a.category.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.hostname.toLowerCase().includes(q) ||
          a.mitreTechnique.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [data?.recentCriticalAlerts, searchQuery]);

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* ═══════════════════════════════ Hero Header ═══════════════════════════════ */}
        <div className="rounded-xl border bg-gradient-to-r from-card via-card to-blue-500/[0.03] p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[28px] font-bold tracking-tight">Reports</h1>
                <Badge variant="low" className="gap-1.5 text-[11px] px-2.5 py-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  LIVE DATA
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
                Generate forensic-grade reports from live ClickHouse data — incident timelines,
                executive briefings, compliance audits, and threat intelligence summaries.
              </p>
            </div>
            <Button
              className="gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              onClick={() => setShowGenerator(!showGenerator)}
            >
              <Plus className="h-4 w-4" /> Generate Report
            </Button>
          </div>
        </div>

        {/* ═══════════════════════════════ KPI Cards ═══════════════════════════════ */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Events</p>
                {loading ? (
                  <Skeleton className="mt-2 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums mt-1">
                    {formatNumber(summary?.totalEvents ?? 0)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">across all tables</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alerts (24h)</p>
                {loading ? (
                  <Skeleton className="mt-2 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums text-red-400 mt-1">
                    {formatNumber(summary?.totalAlerts24h ?? 0)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.criticalAlerts ?? 0} critical · {summary?.highAlerts ?? 0} high
                </p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3">
                <ShieldAlert className="h-6 w-6 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence Anchored</p>
                {loading ? (
                  <Skeleton className="mt-2 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums text-emerald-400 mt-1">
                    {formatNumber(summary?.evidenceAnchored ?? 0)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.evidenceBatches ?? 0} batches
                </p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <Layers className="h-6 w-6 text-emerald-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MITRE Techniques</p>
                {loading ? (
                  <Skeleton className="mt-2 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums text-purple-400 mt-1">
                    {data?.mitreTopTechniques?.length ?? 0}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">observed (7d)</p>
              </div>
              <div className="rounded-xl bg-purple-500/10 p-3">
                <Activity className="h-6 w-6 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══════════════════════════════ Report Generator ═══════════════════════════════ */}
        {showGenerator && (
          <Card className="border-l-4 border-l-blue-500/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-[16px] font-bold">
                  <div className="rounded-lg bg-blue-500/10 p-1.5">
                    <Plus className="h-4 w-4 text-blue-400" />
                  </div>
                  Generate New Report
                </CardTitle>
                <button onClick={() => setShowGenerator(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Step 1: Select Template */}
              <div className="mb-5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center">1</span>
                  Select Report Template
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                  {TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    const isSelected = selectedTemplate === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => setSelectedTemplate(isSelected ? null : tmpl.id)}
                        className={`text-left rounded-lg border-l-4 border p-3.5 transition-all hover:bg-muted/30
                          ${tmpl.border}
                          ${isSelected ? "ring-2 ring-blue-500/40 bg-muted/20" : ""}
                        `}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`rounded-md ${tmpl.bg} p-1.5`}>
                            <Icon className={`h-4 w-4 ${tmpl.color}`} />
                          </div>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 ml-auto" />}
                        </div>
                        <p className="text-xs font-semibold">{tmpl.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Select Format & Download */}
              {selectedTemplate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center">2</span>
                    Choose Export Format
                  </p>
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {FORMATS.map((fmt) => {
                      const Icon = fmt.icon;
                      const dKey = `${selectedTemplate}-${fmt.id}`;
                      const isDownloading = downloadingFormat === dKey;
                      return (
                        <button
                          key={fmt.id}
                          onClick={() => handleDownload(selectedTemplate, fmt.id)}
                          disabled={isDownloading}
                          className="text-left rounded-lg border p-4 transition-all hover:bg-muted/30 hover:border-blue-500/30 disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-md bg-muted/50 p-2">
                              {isDownloading ? (
                                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                              ) : (
                                <Icon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{fmt.label}</p>
                              <p className="text-[10px] text-muted-foreground">{fmt.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-400">
                            <Download className="h-3 w-3" />
                            {isDownloading ? "Generating…" : `Download ${fmt.ext}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════ Quick Download Row ═══════════════════════════════ */}
        {!showGenerator && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              return (
                <Card key={tmpl.id} className={`border-l-4 ${tmpl.border} cursor-pointer transition-all hover:bg-muted/20`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-md ${tmpl.bg} p-2`}>
                        <Icon className={`h-5 w-5 ${tmpl.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold">{tmpl.name}</h3>
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                          {tmpl.description}
                        </p>
                        <div className="flex gap-1 mt-2">
                          {FORMATS.map((fmt) => {
                            const FmtIcon = fmt.icon;
                            const dKey = `${tmpl.id}-${fmt.id}`;
                            const isD = downloadingFormat === dKey;
                            return (
                              <Tooltip key={fmt.id}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(tmpl.id, fmt.id);
                                    }}
                                    disabled={isD}
                                  >
                                    {isD ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <FmtIcon className="h-3 w-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{fmt.label} — {fmt.desc}</TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════ Generated Reports History ═══════════════════════════════ */}
        {generatedReports.length > 0 && (
          <Card className="border-l-4 border-l-emerald-500/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                <div className="rounded-lg bg-emerald-500/10 p-1.5">
                  <FileDown className="h-4 w-4 text-emerald-400" />
                </div>
                Recently Generated
                <Badge variant="outline" className="text-[10px] ml-2">{generatedReports.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {generatedReports.map((report) => {
                  const tmpl = TEMPLATES.find((t) => t.id === report.template);
                  const TmplIcon = tmpl?.icon ?? FileText;
                  const fmt = FORMATS.find((f) => f.id === report.format);
                  const FmtIcon = fmt?.icon ?? FileText;
                  return (
                    <div key={report.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <div className={`rounded-md ${tmpl?.bg ?? "bg-muted"} p-1.5`}>
                        <TmplIcon className={`h-4 w-4 ${tmpl?.color ?? "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{report.title}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {timeAgo(report.generatedAt)}
                          <span>·</span>
                          <FmtIcon className="h-3 w-3" />
                          {fmt?.label}
                          <span>·</span>
                          {report.size}
                        </div>
                      </div>
                      <Badge variant="low" className="text-[10px] gap-1 shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                        Complete
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => handleDownload(report.template, report.format)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════ Live Data Preview ═══════════════════════════════ */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: Severity + Categories */}
          <div className="space-y-4">
            {/* Severity Distribution */}
            <Card className="border-l-4 border-l-red-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[14px] font-bold">
                  <AlertTriangle className="h-4 w-4 text-red-400" /> Severity Breakdown
                  <span className="ml-auto text-[10px] text-muted-foreground font-normal">7 days</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                ) : (
                  data?.severityDistribution?.map((s) => {
                    const sc = SEV_COLORS[s.severity] ?? SEV_COLORS[0];
                    const total = data.severityDistribution.reduce((sum, x) => sum + x.count, 0);
                    const pct = total > 0 ? (s.count / total) * 100 : 0;
                    return (
                      <div key={s.severity} className="flex items-center gap-3">
                        <Badge variant="outline" className={`text-[10px] w-16 justify-center ${sc.bg} ${sc.text} border-transparent`}>
                          {sc.label}
                        </Badge>
                        <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${sc.bg.replace("/10", "/60")}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums font-semibold w-12 text-right">
                          {formatNumber(s.count)}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card className="border-l-4 border-l-amber-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[14px] font-bold">
                  <BarChart3 className="h-4 w-4 text-amber-400" /> Top Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full mb-2" />)
                ) : (
                  <div className="space-y-2">
                    {data?.topCategories?.slice(0, 8).map((cat, i) => (
                      <div key={cat.category} className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground w-4 text-right tabular-nums">
                          {i + 1}
                        </span>
                        <span className="text-xs flex-1 truncate">{cat.category}</span>
                        <span className="text-xs tabular-nums font-semibold text-muted-foreground">
                          {formatNumber(cat.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Center: MITRE Techniques */}
          <Card className="border-l-4 border-l-purple-500/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-[14px] font-bold">
                <Activity className="h-4 w-4 text-purple-400" /> MITRE ATT&CK Techniques
                <span className="ml-auto text-[10px] text-muted-foreground font-normal">7 days</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2" />)
              ) : (
                <div className="space-y-1.5">
                  {data?.mitreTopTechniques?.map((tech) => {
                    const maxCount = data.mitreTopTechniques[0]?.count ?? 1;
                    const pct = (tech.count / maxCount) * 100;
                    return (
                      <div key={`${tech.technique}-${tech.tactic}`} className="group">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-semibold truncate">{tech.technique}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://attack.mitre.org/techniques/${tech.technique.replace(".", "/")}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>View on MITRE ATT&CK</TooltipContent>
                              </Tooltip>
                            </div>
                            <span className="text-[9px] text-muted-foreground">{tech.tactic}</span>
                          </div>
                          <span className="text-xs tabular-nums font-bold w-8 text-right">{tech.count}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted/30 overflow-hidden mt-0.5">
                          <div className="h-full rounded-full bg-purple-500/40" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Event Distribution + Evidence */}
          <div className="space-y-4">
            {/* Event Distribution */}
            <Card className="border-l-4 border-l-blue-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[14px] font-bold">
                  <Database className="h-4 w-4 text-blue-400" /> Event Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
                ) : (
                  <div className="space-y-2">
                    {data?.eventsByTable?.map((t) => {
                      const total = data.eventsByTable.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? (t.count / total) * 100 : 0;
                      return (
                        <div key={t.table} className="flex items-center gap-3">
                          <span className="text-[10px] font-medium w-20 truncate">
                            {TABLE_LABELS[t.table] ?? t.table}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500/40" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums font-semibold w-14 text-right">
                            {formatNumber(t.count)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evidence Stats */}
            <Card className="border-l-4 border-l-emerald-500/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[14px] font-bold">
                  <Shield className="h-4 w-4 text-emerald-400" /> Evidence Integrity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-400">
                      {loading ? "—" : formatNumber(summary?.evidenceBatches ?? 0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Batches</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums">
                      {loading ? "—" : formatNumber(summary?.evidenceAnchored ?? 0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Anchored</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-400">
                      {loading
                        ? "—"
                        : summary && summary.evidenceBatches > 0
                          ? `${Math.round((summary.evidenceVerified / summary.evidenceBatches) * 100)}%`
                          : "—"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Verified</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ═══════════════════════════════ Recent Alerts Preview ═══════════════════════════════ */}
        <Card className="border-l-4 border-l-orange-500/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                <div className="rounded-lg bg-orange-500/10 p-1.5">
                  <ShieldAlert className="h-4 w-4 text-orange-400" />
                </div>
                Recent Critical/High Alerts
                <Badge variant="outline" className="text-[10px] ml-2">
                  {data?.recentCriticalAlerts?.length ?? 0} alerts
                </Badge>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground font-normal">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search alerts…"
                  className="pl-8 h-8 w-[200px] text-xs bg-muted/30 border-border/50"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No matching alerts</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">Time</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Severity</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">Category</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">Source</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">Host</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">MITRE</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map((alert) => {
                      const sc = SEV_COLORS[alert.severity] ?? SEV_COLORS[0];
                      return (
                        <tr key={alert.eventId} className="border-b border-border/30 transition-colors hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {timeAgo(alert.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant="outline" className={`text-[10px] ${sc.bg} ${sc.text} border-transparent`}>
                              {sc.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs">{alert.category}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{alert.source}</td>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{alert.hostname}</td>
                          <td className="px-4 py-2.5">
                            {alert.mitreTechnique ? (
                              <Badge variant="outline" className="text-[9px] gap-1 bg-purple-500/10 text-purple-400 border-purple-500/30">
                                {alert.mitreTechnique}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-muted-foreground max-w-[250px] truncate">
                            {alert.description}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
