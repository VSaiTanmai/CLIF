"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Radar,
  Search,
  Globe,
  Hash,
  Link2,
  Server,
  Shield,
  AlertTriangle,
  Tag,
  Activity,
  Download,
  Zap,

  RefreshCw,
  CheckCircle2,
  Clock,

} from "lucide-react";
import threatIntelData from "@/lib/mock/threat-intel.json";
import type { IOC, ThreatPattern } from "@/lib/types";
import { toast } from "sonner";

const iocs = threatIntelData.iocs as IOC[];
const threatPatterns = threatIntelData.threatPatterns as ThreatPattern[];

/* ─── Constants ─── */
const IOC_TYPE_ICONS: Record<string, React.ElementType> = {
  IPv4: Server,
  Domain: Globe,
  SHA256: Hash,
  URL: Link2,
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-red-600",
};

function getConfidenceLevel(score: number): string {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

const SEVERITY_VARIANT: Record<number, "critical" | "high" | "medium" | "low" | "info"> = {
  4: "critical",
  3: "high",
  2: "medium",
  1: "low",
  0: "info",
};

/* ─── Feed Sources (mock) ─── */
const FEED_SOURCES = [
  { name: "AlienVault OTX", iocs: "45.2K", limit: "840/1000", updated: "2 min ago", status: "ok" as const },
  { name: "MISP Community", iocs: "23.1K", limit: "Unlimited", updated: "5 min ago", status: "ok" as const },
  { name: "Abuse.ch", iocs: "12.4K", limit: "Unlimited", updated: "3 min ago", status: "ok" as const },
  { name: "VirusTotal", iocs: "89.3K", limit: "4/4 (Quota)", updated: "15 min ago", status: "delayed" as const },
];



/* ══════════════════════════════════════════════════════════════
   Threat Intelligence Page
   ══════════════════════════════════════════════════════════════ */
export default function ThreatIntelPage() {
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [liveMitre, setLiveMitre] = useState<Array<{ technique: string; tactic: string; count: number; maxSeverity: number }>>([]);
  const [liveIOCs, setLiveIOCs] = useState<Array<{ value: string; type: string; hits: number; maxSeverity: number }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    async function fetchLive() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/threat-intel", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        setLiveMitre(json.mitreStats ?? []);
        setLiveIOCs(json.topIOCs ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    fetchLive();
    const t = setInterval(fetchLive, 30_000);
    return () => { clearInterval(t); abortRef.current?.abort(); };
  }, []);

  const filteredIocs = useMemo(() => iocs.filter((ioc) => {
    const matchesText = !filter || ioc.value.toLowerCase().includes(filter.toLowerCase()) || ioc.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()));
    const matchesType = typeFilter === "All" || ioc.type === typeFilter;
    return matchesText && matchesType;
  }), [filter, typeFilter]);

  const totalIOCs = iocs.length + liveIOCs.length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">
            Threat Intelligence
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Global threat landscape, IOC management, and adversary tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="gap-1.5 text-sm"
            onClick={() => toast.info("Export Report", { description: "Generating threat intelligence report…" })}
          >
            <Download className="h-4 w-4" /> Export Report
          </Button>
          <Button
            className="gap-1.5 text-sm bg-red-600 hover:bg-red-700 text-white"
            onClick={() => toast.success("Active Defense Mode enabled", { description: "Automated blocking of known IoCs on perimeter devices." })}
          >
            <Shield className="h-4 w-4" /> ACTIVE DEFENSE MODE
          </Button>
        </div>
      </div>

      {/* ── Feed Health + Feed Sources Row ── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
        {/* Feed Health Card */}
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 overflow-hidden border-l-4 border-l-blue-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">
              <Activity className="h-4 w-4 text-blue-500" />
              FEED HEALTH
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold text-green-600">98.2%</span>
              <span className="ml-1.5 text-sm text-green-600 font-medium">Uptime</span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-neutral-400">Active Feeds</span>
                <span className="font-semibold text-foreground">{FEED_SOURCES.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-neutral-400">Total IOCs</span>
                <span className="font-semibold text-blue-600">172.4K</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-neutral-400">Last Sync</span>
                <span className="font-semibold text-foreground">2m ago</span>
              </div>
            </div>
            <Button
              className="mt-4 w-full gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm"
              onClick={() => toast.success("Syncing all feeds…")}
            >
              <RefreshCw className="h-3.5 w-3.5" /> SYNC ALL
            </Button>
          </CardContent>
        </Card>

        {/* Individual Feed Cards */}
        {FEED_SOURCES.map((feed) => (
          <Card key={feed.name} className="shadow-sm border-gray-200/80 dark:border-neutral-700/80">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{feed.name}</h3>
                {feed.status === "ok" ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-0 text-[10px] font-bold">
                    OK
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-0 text-[10px] font-bold">
                    DELAYED
                  </Badge>
                )}
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">IOCs</span>
                  <span className="font-semibold tabular-nums text-foreground">{feed.iocs}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">Limit</span>
                  <span className="font-semibold tabular-nums text-foreground">{feed.limit}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">Updated</span>
                  <span className="font-semibold tabular-nums text-foreground">{feed.updated}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Live MITRE ATT&CK Detections ── */}
      {liveMitre.length > 0 && (
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 overflow-hidden border-l-4 border-l-purple-400">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Activity className="h-4 w-4 text-purple-500" />
              Live MITRE ATT&CK Detections (24h)
              <Badge variant="outline" className="ml-1 tabular-nums text-[10px]">
                {liveMitre.reduce((s, m) => s + m.count, 0)} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {liveMitre.slice(0, 8).map((m) => (
                <div key={m.technique} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-2.5 bg-white dark:bg-neutral-800/50">
                  <div>
                    <Badge variant={m.maxSeverity >= 3 ? "critical" : m.maxSeverity >= 2 ? "high" : "medium"} className="text-[9px] font-mono">
                      {m.technique}
                    </Badge>
                    <p className="mt-1 text-[10px] text-gray-500 dark:text-neutral-400">{m.tactic}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-foreground">{m.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Threat Patterns ── */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Detection Patterns
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {threatPatterns.map((pattern) => (
            <Card key={pattern.name} className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <Badge variant={SEVERITY_VARIANT[pattern.severity] ?? "info"} className="text-[10px]">
                    {pattern.mitre}
                  </Badge>
                  {pattern.matchedEvents > 0 && (
                    <span className="text-[10px] font-semibold text-amber-600">{pattern.matchedEvents} hits</span>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{pattern.name}</h3>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-neutral-400 line-clamp-2">{pattern.description}</p>
                <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400">
                  <Shield className="h-3 w-3" /> {pattern.iocCount} IOCs
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Live IOC Matches ── */}
      {liveIOCs.length > 0 && (
        <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80 overflow-hidden border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Active Threat Indicators (Last 24h)
              <Badge variant="high" className="ml-1 tabular-nums text-[10px]">{liveIOCs.length} hosts</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              {liveIOCs.slice(0, 6).map((ioc) => (
                <div key={ioc.value} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-2.5 bg-white dark:bg-neutral-800/50">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-mono text-xs text-foreground">{ioc.value}</span>
                  </div>
                  <span className={cn("text-xs font-semibold tabular-nums", ioc.maxSeverity >= 3 ? "text-red-600" : "text-amber-600")}>
                    {ioc.hits} hits
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── IOC Table ── */}
      <Card className="shadow-sm border-gray-200/80 dark:border-neutral-700/80">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-[15px] font-bold">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Indicators of Compromise
              <Badge variant="outline" className="ml-1 tabular-nums">{filteredIocs.length}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search IOCs…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <div className="flex gap-1">
              {["All", "IPv4", "Domain", "SHA256", "URL"].map((t) => (
                <Button key={t} variant={typeFilter === t ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setTypeFilter(t)}>
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-neutral-700">
                  {["Type", "Value", "Source", "Confidence", "MITRE", "Hits", "Tags", "Last Seen"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredIocs.map((ioc, idx) => {
                  const TypeIcon = IOC_TYPE_ICONS[ioc.type] ?? Globe;
                  const confLevel = getConfidenceLevel(ioc.confidence);
                  return (
                    <tr key={idx} className="border-b border-gray-100 dark:border-neutral-800 transition-colors hover:bg-gray-50/50 dark:hover:bg-neutral-800/50">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-[11px] text-foreground">{ioc.type}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">
                        {ioc.value.length > 50 ? `${ioc.value.slice(0, 50)}…` : ioc.value}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-500 dark:text-neutral-400">{ioc.source}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("text-[11px] font-semibold tabular-nums", CONFIDENCE_COLORS[confLevel])}>
                          {ioc.confidence}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-[9px] font-mono">{ioc.mitre}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("text-[11px] tabular-nums", ioc.matchedEvents > 0 ? "font-semibold text-amber-600" : "text-gray-400")}>
                          {formatNumber(ioc.matchedEvents)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {ioc.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center rounded-sm bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] text-gray-600 dark:text-neutral-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-500 dark:text-neutral-400 whitespace-nowrap">
                        {timeAgo(ioc.lastSeen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
