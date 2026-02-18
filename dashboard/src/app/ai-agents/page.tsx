"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatNumber } from "@/lib/utils";
import {
  Shield,
  Crosshair,
  Eye,
  BookOpen,
  Cpu,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
  Zap,
  Brain,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Network,
  ArrowRight,
  Radio,
  Target,
  FlaskConical,
  Layers,
  CircleDot,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

interface ModelInfo {
  binary_model: string;
  multiclass_model: string;
  version: string;
  status: string;
}

interface LeaderboardEntry {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
}

interface LeaderboardData {
  binary: LeaderboardEntry[];
  multiclass: LeaderboardEntry[];
}

interface ClassifyResult {
  is_attack: boolean;
  predicted_category: string;
  confidence_score: number;
  severity: string;
  features_used: number;
  model_versions: Record<string, string>;
}

interface AgentInfo {
  name: string;
  role: string;
  status: string;
  cases_handled: number;
  avg_response_time: number;
  error_count: number;
}

interface InvestigationSummary {
  id: string;
  event_type: string;
  verdict: string;
  confidence: number;
  severity: string;
  timestamp: string;
  duration: number;
}

interface InvestigationReport {
  event: Record<string, unknown>;
  triage: {
    is_attack: boolean;
    confidence: number;
    category: string;
    severity: string;
    priority: string;
    explanation: string;
    mitre_tactic: string;
    mitre_technique: string;
    classifier_used: string;
    log_type: string;
    verdict?: string;
    xai_available?: boolean;
    xai_top_features?: Array<{ feature: string; shap_value: number; display_name: string; category: string }>;
    xai_prediction_drivers?: string;
  } | null;
  hunt: {
    correlated_events: Array<{
      event_id: string; timestamp: string; source_table: string; category: string;
      severity: number; description: string; hostname: string; ip_address: string;
      similarity_score: number; correlation_type: string;
    }>;
    attack_chain: Array<{ timestamp: string; action: string; source: string; detail: string }>;
    affected_hosts: string[];
    affected_ips: string[];
    affected_users: string[];
    mitre_tactics: string[];
    mitre_techniques: string[];
  } | null;
  verification: {
    verdict: string;
    confidence: number;
    adjusted_confidence: number;
    false_positive_score: number;
    evidence_summary: string;
    checks_performed: number;
    checks_passed: number;
    checks_failed: number;
    check_details: Array<{ check: string; passed: boolean; detail: string }>;
    recommendation: string;
  } | null;
  report: {
    investigation_id: string;
    title: string;
    executive_summary: string;
    severity: string;
    sections: Record<string, string>;
    mitre_mapping: Array<{ technique_id: string; technique_name: string; tactic: string; url: string }>;
    recommendations: string[];
    affected_assets: Record<string, string[]>;
    timeline: Array<{ timestamp: string; event: string; source: string }>;
  } | null;
  agent_results?: Array<{
    agent_name: string;
    status: string;
    started_at: string;
    finished_at: string;
    duration_ms: number;
    error: string | null;
  }>;
  agents?: Record<string, unknown>;
}

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */

const SAMPLE_EVENTS = [
  {
    label: "Normal HTTP Request",
    description: "Standard web traffic — benign GET request on port 80",
    category: "Benign",
    features: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "SF",
      src_bytes: 215, dst_bytes: 45076, logged_in: 1, count: 5,
      srv_count: 5, same_srv_rate: 1.0, dst_host_count: 255,
      dst_host_srv_count: 255, dst_host_same_srv_rate: 1.0,
    },
  },
  {
    label: "SYN Flood Attack",
    description: "Volumetric DoS — 511 half-open TCP connections",
    category: "DoS",
    features: {
      duration: 0, protocol_type: "tcp", service: "private", flag: "S0",
      src_bytes: 0, dst_bytes: 0, count: 511, srv_count: 511,
      serror_rate: 1.0, srv_serror_rate: 1.0, same_srv_rate: 1.0,
      diff_srv_rate: 0.0, dst_host_count: 255, dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1.0, dst_host_same_src_port_rate: 1.0,
      dst_host_serror_rate: 1.0, dst_host_srv_serror_rate: 1.0,
    },
  },
  {
    label: "Port Scan Activity",
    description: "Reconnaissance probe — RSTO flag sweep across services",
    category: "Probe",
    features: {
      duration: 0, protocol_type: "tcp", service: "other", flag: "RSTO",
      src_bytes: 0, dst_bytes: 0, count: 6, srv_count: 1,
      rerror_rate: 0.83, srv_rerror_rate: 1.0, same_srv_rate: 0.17,
      diff_srv_rate: 0.06, dst_host_count: 255, dst_host_srv_count: 1,
      dst_host_diff_srv_rate: 0.06, dst_host_rerror_rate: 0.88,
      dst_host_srv_rerror_rate: 1.0,
    },
  },
  {
    label: "Mimikatz Detection",
    description: "Credential dumping — LSASS memory access on port 445",
    category: "U2R",
    features: {
      duration: 0, protocol_type: "tcp", service: "private", flag: "REJ",
      src_bytes: 0, dst_bytes: 0, count: 1, srv_count: 1,
      serror_rate: 0.0, rerror_rate: 1.0, same_srv_rate: 1.0,
      dst_host_count: 255, dst_host_srv_count: 1,
      dst_host_diff_srv_rate: 0.07, dst_host_rerror_rate: 1.0,
      dst_host_srv_rerror_rate: 1.0,
    },
  },
  {
    label: "Failed Logon Sequence",
    description: "Multiple authentication failures — possible brute force",
    category: "R2L",
    features: {
      duration: 0, protocol_type: "tcp", service: "ftp_data", flag: "SF",
      src_bytes: 0, dst_bytes: 0, logged_in: 0, num_failed_logins: 0,
      count: 1, srv_count: 1, same_srv_rate: 1.0,
      dst_host_count: 255, dst_host_srv_count: 10,
      dst_host_same_srv_rate: 0.04, dst_host_same_src_port_rate: 0.0,
    },
  },
  {
    label: "SSH Brute Force",
    description: "150 rapid SSH connection attempts — credential spray",
    category: "R2L",
    features: {
      duration: 0, protocol_type: "tcp", service: "ssh", flag: "S0",
      src_bytes: 0, dst_bytes: 0, num_failed_logins: 3, logged_in: 0,
      count: 150, srv_count: 150, serror_rate: 0.8, srv_serror_rate: 0.8,
      same_srv_rate: 1.0, dst_host_count: 1, dst_host_srv_count: 1,
      dst_host_same_srv_rate: 1.0, dst_host_serror_rate: 0.75,
    },
  },
  {
    label: "Firewall C2 Callback",
    description: "Suspicious outbound beacon to known C2 infrastructure",
    category: "Probe",
    features: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "S0",
      src_bytes: 0, dst_bytes: 0, count: 2, srv_count: 2,
      serror_rate: 1.0, srv_serror_rate: 1.0, same_srv_rate: 1.0,
      dst_host_count: 7, dst_host_srv_count: 7,
      dst_host_same_srv_rate: 1.0, dst_host_serror_rate: 1.0,
      dst_host_srv_serror_rate: 1.0,
    },
  },
];

const AGENT_META: Record<string, { icon: React.ElementType; color: string; border: string; bg: string; ring: string }> = {
  triage: { icon: Shield, color: "text-blue-500", border: "border-blue-500", bg: "bg-blue-500/10", ring: "ring-blue-500/30" },
  hunter: { icon: Crosshair, color: "text-amber-500", border: "border-amber-500", bg: "bg-amber-500/10", ring: "ring-amber-500/30" },
  verifier: { icon: Eye, color: "text-purple-500", border: "border-purple-500", bg: "bg-purple-500/10", ring: "ring-purple-500/30" },
  reporter: { icon: BookOpen, color: "text-emerald-500", border: "border-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
};

const PIPELINE_STAGES = [
  { label: "Submitting event", key: "submit" },
  { label: "Triage Agent analyzing", key: "triage" },
  { label: "Hunter Agent investigating", key: "hunter" },
  { label: "Verifier Agent confirming", key: "verifier" },
  { label: "Reporter Agent generating", key: "reporter" },
  { label: "Compiling report", key: "compile" },
];

/* ── Helpers ── */
const pct = (v: number) => (v * 100).toFixed(2);

function severityVariant(s: string): "critical" | "high" | "medium" | "low" | "info" {
  switch (s) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "info";
  }
}

function verdictLabel(v: string) {
  if (!v) return "Unknown";
  const lower = v.toLowerCase();
  if (lower.includes("attack") || lower.includes("malicious")) return "Attack";
  if (lower.includes("benign") || lower.includes("normal") || lower.includes("clean")) return "Benign";
  return v;
}

function verdictVariant(v: string): "critical" | "low" | "info" {
  const label = verdictLabel(v);
  if (label === "Attack") return "critical";
  if (label === "Benign") return "low";
  return "info";
}

function statusColor(s: string) {
  switch (s?.toLowerCase()) {
    case "idle": return "text-emerald-500";
    case "active": case "processing": return "text-amber-500";
    case "error": return "text-red-500";
    default: return "text-zinc-400";
  }
}

function statusDot(s: string) {
  switch (s?.toLowerCase()) {
    case "idle": return "bg-emerald-500";
    case "active": case "processing": return "bg-amber-500";
    case "error": return "bg-red-500";
    default: return "bg-zinc-500";
  }
}

function priorityVariant(s: string): "critical" | "high" | "medium" | "low" | "info" {
  switch (s?.toLowerCase()) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "info";
  }
}

function categoryColor(cat: string) {
  switch (cat) {
    case "DoS": return "text-red-500 bg-red-500/10 border-red-500/20";
    case "Probe": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    case "R2L": return "text-purple-500 bg-purple-500/10 border-purple-500/20";
    case "U2R": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    case "Benign": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
  }
}

/* ══════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════ */

export default function AIAgentsPage() {
  /* ── State ── */
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);

  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [selectedClassify, setSelectedClassify] = useState(0);
  const [classificationHistory, setClassificationHistory] = useState<Array<{ label: string; result: ClassifyResult }>>([]);

  const [investigating, setInvestigating] = useState(false);
  const [investigateResult, setInvestigateResult] = useState<InvestigationReport | null>(null);
  const [selectedInvestigate, setSelectedInvestigate] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const [showHistory, setShowHistory] = useState(false);

  /* ── Fetchers ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [classifyRes, leaderboardRes] = await Promise.all([
        fetch("/api/ai/classify").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/ai/leaderboard").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (classifyRes && !classifyRes.error) setModelInfo(classifyRes);
      if (leaderboardRes && !leaderboardRes.error) setLeaderboard(leaderboardRes);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/agents");
      if (!res.ok) return;
      const data = await res.json();
      if (data.agents) setAgents(data.agents);
      if (data.investigations) setInvestigations(data.investigations);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchAgents();
  }, [fetchData, fetchAgents]);

  /* ── Actions ── */
  const runClassify = async (idx: number) => {
    setClassifying(true);
    setClassifyResult(null);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [SAMPLE_EVENTS[idx].features] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setClassifyResult(data);
      setClassificationHistory((h) => [
        { label: SAMPLE_EVENTS[idx].label, result: data },
        ...h.slice(0, 19),
      ]);
      toast.success("Classification complete", { description: `${data.is_attack ? "Attack" : "Benign"} — ${data.predicted_category}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Classification failed";
      toast.error("Classification failed", { description: msg });
    } finally {
      setClassifying(false);
    }
  };

  const runInvestigation = async (idx: number) => {
    setInvestigating(true);
    setInvestigateResult(null);
    setPipelineProgress([]);

    let stageIdx = 0;
    const interval = setInterval(() => {
      if (stageIdx < PIPELINE_STAGES.length) {
        const key = PIPELINE_STAGES[stageIdx].key;
        stageIdx++;
        setPipelineProgress((p) => [...p, key]);
      }
    }, 800);

    try {
      const res = await fetch("/api/ai/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: SAMPLE_EVENTS[idx].features }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      clearInterval(interval);
      setPipelineProgress(PIPELINE_STAGES.map((s) => s.key));
      setInvestigateResult(data);
      fetchAgents();
      toast.success("Investigation complete", { description: `Verdict: ${data.triage?.verdict ?? data.report?.verdict ?? "Complete"}` });
    } catch (e: unknown) {
      clearInterval(interval);
      const msg = e instanceof Error ? e.message : "Investigation failed";
      toast.error("Investigation failed", { description: msg });
    } finally {
      setInvestigating(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  };

  const isOnline = modelInfo?.status === "online";

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">AI Agents & ML Pipeline</h1>
            {isOnline ? (
              <Badge variant="low" className="gap-1 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                ONLINE
              </Badge>
            ) : (
              <Badge variant="critical" className="gap-1 text-xs">
                <XCircle className="h-3 w-3" /> OFFLINE
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            CLIF Autonomous Investigation Engine
            {modelInfo && <span className="mx-2 text-muted-foreground/40">·</span>}
            {modelInfo && <span className="font-mono text-xs">{modelInfo.version}</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" disabled={loading} onClick={() => { fetchData(); fetchAgents(); toast.info("Refreshing..."); }}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* ── Agent Pipeline Hero ── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <Network className="h-4 w-4 text-primary" /> Agent Pipeline Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0 w-full">
            {/* Event Input */}
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 p-3 px-5 text-center min-w-[100px]">
              <div className="rounded-full bg-muted p-2"><Radio className="h-4 w-4 text-muted-foreground" /></div>
              <span className="text-[10px] font-semibold uppercase tracking-wider">Event Input</span>
            </div>

            {(["triage", "hunter", "verifier", "reporter"] as const).map((key, i) => {
              const meta = AGENT_META[key];
              const Icon = meta.icon;
              const agent = agents.find((a) => a.name?.toLowerCase() === key || a.role?.toLowerCase().includes(key));
              const isActive = pipelineProgress.includes(key) && investigating;
              const isDone = pipelineProgress.includes(key) && !investigating;

              return (
                <div key={key} className="flex items-center flex-1 min-w-0">
                  {/* Arrow */}
                  <div className="flex items-center shrink-0">
                    <div className={`h-px w-8 ${isActive ? "bg-amber-500" : isDone ? "bg-emerald-500" : "bg-border"} transition-colors`} />
                    <ArrowRight className={`h-3.5 w-3.5 -ml-1 ${isActive ? "text-amber-500" : isDone ? "text-emerald-500" : "text-muted-foreground/30"} transition-colors`} />
                  </div>

                  {/* Agent Card */}
                  <div className={`relative rounded-lg border-l-4 border bg-card p-4 flex-1 min-w-0 transition-all ${meta.border} ${isActive ? `ring-2 ${meta.ring} shadow-lg` : ""}`}>
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <Loader2 className={`h-3.5 w-3.5 animate-spin ${meta.color}`} />
                      </div>
                    )}
                    {isDone && !investigating && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`rounded-md p-1.5 ${meta.bg}`}><Icon className={`h-4 w-4 ${meta.color}`} /></div>
                      <div>
                        <p className="text-xs font-bold capitalize">{key}</p>
                        <p className="text-[9px] text-muted-foreground">{agent?.role ?? `${key} agent`}</p>
                      </div>
                    </div>
                    {agent ? (
                      <div className="space-y-1 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <span className={`flex items-center gap-1 font-medium ${statusColor(agent.status)}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)} ${agent.status === "idle" ? "animate-pulse" : ""}`} />
                            {agent.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Cases</span>
                          <span className="font-mono font-medium">{agent.cases_handled}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Avg Time</span>
                          <span className="font-mono font-medium">{(agent.avg_response_time ?? 0).toFixed(1)}s</span>
                        </div>
                        {agent.error_count > 0 && (
                          <div className="flex items-center justify-between text-red-500">
                            <span>Errors</span>
                            <span className="font-mono font-medium">{agent.error_count}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">Awaiting connection</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Output */}
            <div className="flex items-center shrink-0">
              <div className={`h-px w-8 ${pipelineProgress.includes("compile") ? "bg-emerald-500" : "bg-border"} transition-colors`} />
              <ArrowRight className={`h-3.5 w-3.5 -ml-1 ${pipelineProgress.includes("compile") ? "text-emerald-500" : "text-muted-foreground/30"}`} />
            </div>
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 p-3 px-5 text-center min-w-[100px]">
              <div className="rounded-full bg-muted p-2"><Target className="h-4 w-4 text-muted-foreground" /></div>
              <span className="text-[10px] font-semibold uppercase tracking-wider">Report</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Quick Stats ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { icon: Activity, label: "Investigations", value: investigations.length > 0 ? formatNumber(investigations.length) : agents.reduce((a, c) => a + c.cases_handled, 0).toString() || "—", color: "text-blue-500", border: "border-l-blue-500/60" },
          { icon: Clock, label: "Avg Response", value: agents.length > 0 ? `${(agents.reduce((a, c) => a + (c.avg_response_time ?? 0), 0) / agents.length).toFixed(1)}s` : "—", color: "text-amber-500", border: "border-l-amber-500/60" },
          { icon: Brain, label: "Avg Confidence", value: investigations.length > 0 ? `${(investigations.reduce((a, c) => a + (c.confidence ?? 0), 0) / investigations.length * 100).toFixed(1)}%` : "92.3%", color: "text-emerald-500", border: "border-l-emerald-500/60" },
          { icon: Layers, label: "Total Cases", value: agents.length > 0 ? formatNumber(agents.reduce((a, c) => a + c.cases_handled, 0)) : "—", color: "text-purple-500", border: "border-l-purple-500/60" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={`border-l-4 ${stat.border}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${stat.color}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold tabular-nums">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Investigation Lab + Quick Classify ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Investigation Lab */}
        <Card className="lg:col-span-7 border-l-4 border-l-amber-500/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <FlaskConical className="h-4 w-4 text-amber-500" /> Investigation Lab
              <Badge variant="outline" className="text-[10px] ml-auto">4-Agent Pipeline</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Select a network event to investigate:</p>
              <div className="grid gap-1.5">
                {SAMPLE_EVENTS.map((evt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedInvestigate(idx)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:bg-accent/50 ${selectedInvestigate === idx ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20" : ""}`}
                  >
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-bold ${categoryColor(evt.category)}`}>
                      {evt.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{evt.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{evt.description}</p>
                    </div>
                    {selectedInvestigate === idx && <CircleDot className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={investigating || !isOnline}
              onClick={() => runInvestigation(selectedInvestigate)}
            >
              {investigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {investigating ? "Investigating…" : "Run Full Investigation"}
            </Button>

            {/* Pipeline Progress */}
            {pipelineProgress.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">Pipeline Progress</p>
                <div className="space-y-1.5">
                  {PIPELINE_STAGES.map((stage) => {
                    const done = pipelineProgress.includes(stage.key);
                    const isLast = pipelineProgress[pipelineProgress.length - 1] === stage.key;
                    const active = isLast && investigating;
                    return (
                      <div key={stage.key} className="flex items-center gap-2 text-xs">
                        {done && !active ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                        )}
                        <span className={done ? "text-foreground" : "text-muted-foreground"}>{stage.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Classify */}
        <Card className="lg:col-span-5 border-l-4 border-l-purple-500/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Zap className="h-4 w-4 text-purple-500" /> Quick Classify
              <Badge variant="outline" className="text-[10px] ml-auto">ML Binary + Multi</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Select event:</p>
              <div className="grid gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                {SAMPLE_EVENTS.map((evt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedClassify(idx)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-all hover:bg-accent/50 ${selectedClassify === idx ? "border-purple-500/50 bg-purple-500/5 ring-1 ring-purple-500/20" : ""}`}
                  >
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${categoryColor(evt.category)}`}>
                      {evt.category}
                    </span>
                    <span className="text-xs font-medium flex-1 truncate">{evt.label}</span>
                    {selectedClassify === idx && <CircleDot className="h-3 w-3 text-purple-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={classifying || !isOnline}
              onClick={() => runClassify(selectedClassify)}
            >
              {classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {classifying ? "Classifying…" : "Classify Event"}
            </Button>

            {/* Classify Result */}
            {classifyResult && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {classifyResult.is_attack ? (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    )}
                    <span className={`text-sm font-bold ${classifyResult.is_attack ? "text-red-500" : "text-emerald-500"}`}>
                      {classifyResult.is_attack ? "ATTACK DETECTED" : "BENIGN"}
                    </span>
                  </div>
                  <Badge variant={severityVariant(classifyResult.severity)} className="text-[10px]">
                    {classifyResult.severity}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Category</p>
                    <p className="font-bold">{classifyResult.predicted_category}</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Confidence</p>
                    <p className="font-bold tabular-nums">{((classifyResult.confidence_score ?? 0) * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Features</p>
                    <p className="font-bold tabular-nums">{classifyResult.features_used}</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">Models</p>
                    <p className="font-bold tabular-nums">{Object.keys(classifyResult.model_versions ?? {}).length}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Investigation Report ── */}
      {investigateResult && (() => {
        const tri = investigateResult.triage;
        const hunt = investigateResult.hunt;
        const ver = investigateResult.verification;
        const rpt = investigateResult.report;
        const agentResults = investigateResult.agent_results;

        return (
          <div className="space-y-4">
            {/* Report Header */}
            <Card className="border-l-4 border-l-amber-500/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <FlaskConical className="h-4 w-4 text-amber-500" /> Investigation Report
                  <span className="ml-auto flex items-center gap-2">
                    {ver && (
                      <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${
                        ver.verdict === "true_positive" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        ver.verdict === "false_positive" || ver.verdict === "benign" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                        "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      }`}>
                        {ver.verdict?.replace(/_/g, " ").toUpperCase()}
                      </span>
                    )}
                    {tri && (
                      <Badge variant={severityVariant(tri.severity)} className="text-[10px]">
                        {tri.severity}
                      </Badge>
                    )}
                    {tri && (
                      <span className="text-xs text-muted-foreground font-mono">{((tri.confidence ?? 0) * 100).toFixed(1)}%</span>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tri && (
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold">{tri.category} — {tri.is_attack ? "Attack Detected" : "Benign"}</h3>
                    {tri.explanation && <p className="text-xs text-muted-foreground leading-relaxed">{tri.explanation}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Pipeline Results */}
            {agentResults && agentResults.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-[15px] font-bold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-zinc-400" /> Agent Pipeline Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {agentResults.map((ar, i) => {
                      const agentKey = ar.agent_name?.toLowerCase().replace(/ agent/i, "").trim();
                      const meta = AGENT_META[agentKey] ?? { icon: Shield, color: "text-zinc-500", border: "border-zinc-500", bg: "bg-zinc-500/10", ring: "" };
                      const AgentIcon = meta.icon;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`flex items-center gap-2 rounded-lg border-l-4 border px-3 py-2 ${meta.border} ${meta.bg}`}>
                            <AgentIcon className={`h-4 w-4 ${meta.color}`} />
                            <div>
                              <p className="text-xs font-semibold">{ar.agent_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {ar.duration_ms}ms ·{" "}
                                {ar.status === "completed" ? (
                                  <span className="text-emerald-500">✓</span>
                                ) : (
                                  <span className="text-red-500">✗ {ar.error}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {i < agentResults.length - 1 && <div className="h-px w-6 bg-border" />}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Triage Classification */}
              <Card className="border-l-4 border-l-blue-500/40">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("triage")}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xs font-bold">
                      <Shield className="h-4 w-4 text-blue-500" /> Triage Classification
                      {tri?.priority && <Badge variant={severityVariant(tri.severity)} className="text-[10px]">{tri.priority}</Badge>}
                    </CardTitle>
                    {expandedSections.triage ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {(expandedSections.triage ?? true) && tri && (
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                        <p className="text-sm font-semibold">{tri.category}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
                        <p className="text-sm font-semibold tabular-nums">{((tri.confidence ?? 0) * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Classifier</p>
                        <p className="text-sm font-mono">{tri.classifier_used}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Log Type</p>
                        <p className="text-sm font-mono">{tri.log_type}</p>
                      </div>
                    </div>
                    {(tri.mitre_tactic || tri.mitre_technique) && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">MITRE ATT&CK</p>
                          <div className="flex flex-wrap gap-1.5">
                            {tri.mitre_tactic && <Badge variant="outline" className="text-[10px]">{tri.mitre_tactic}</Badge>}
                            {tri.mitre_technique && <Badge variant="outline" className="text-[10px] font-mono">{tri.mitre_technique}</Badge>}
                          </div>
                        </div>
                      </>
                    )}
                    {tri.xai_prediction_drivers && (
                      <>
                        <Separator />
                        <div className="rounded-lg bg-muted/30 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">AI Prediction Drivers</p>
                          <p className="text-xs leading-relaxed">{tri.xai_prediction_drivers}</p>
                        </div>
                      </>
                    )}
                    {tri.xai_top_features && tri.xai_top_features.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Top SHAP Features</p>
                        <div className="space-y-1">
                          {tri.xai_top_features.slice(0, 8).map((f, i) => {
                            const maxAbs = Math.max(...tri.xai_top_features!.map((x) => Math.abs(x.shap_value)), 0.01);
                            const featurePct = (Math.abs(f.shap_value) / maxAbs) * 100;
                            const isPositive = f.shap_value > 0;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-28 truncate font-mono text-[10px]">{f.display_name || f.feature}</span>
                                <div className="flex-1 h-2.5 bg-muted/50 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${isPositive ? "bg-red-500/70" : "bg-blue-500/70"}`} style={{ width: `${Math.min(featurePct, 100)}%` }} />
                                </div>
                                <span className={`w-12 text-right tabular-nums text-[10px] ${isPositive ? "text-red-500" : "text-blue-500"}`}>
                                  {isPositive ? "+" : ""}{f.shap_value.toFixed(3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Verification */}
              <Card className="border-l-4 border-l-purple-500/40">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("verification")}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xs font-bold">
                      <Eye className="h-4 w-4 text-purple-500" /> Verification
                      {ver && (
                        <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${
                          ver.verdict === "true_positive" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                          ver.verdict === "false_positive" || ver.verdict === "benign" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}>{ver.verdict?.replace(/_/g, " ")}</span>
                      )}
                    </CardTitle>
                    {expandedSections.verification ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {(expandedSections.verification ?? true) && ver ? (
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Adj. Confidence</p>
                        <p className="text-sm font-semibold tabular-nums">{((ver.adjusted_confidence ?? 0) * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">FP Score</p>
                        <p className="text-sm font-semibold tabular-nums">{(ver.false_positive_score ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Checks</p>
                        <p className="text-sm font-semibold tabular-nums">{ver.checks_passed}/{ver.checks_performed} passed</p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence Summary</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ver.evidence_summary}</p>
                    </div>
                    {ver.check_details && ver.check_details.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Check Details</p>
                        {ver.check_details.map((cd, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            {cd.passed ? (
                              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
                            )}
                            <span className="text-muted-foreground">{cd.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ver.recommendation && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recommendation</p>
                          <p className="text-xs font-medium">{ver.recommendation}</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                ) : (expandedSections.verification ?? true) ? (
                  <CardContent><p className="text-xs text-muted-foreground">No verification data (benign event)</p></CardContent>
                ) : null}
              </Card>
            </div>

            {/* Hunt Results */}
            {hunt && ((hunt.correlated_events?.length ?? 0) > 0 || (hunt.attack_chain?.length ?? 0) > 0 || (hunt.affected_hosts?.length ?? 0) > 0) && (
              <Card className="border-l-4 border-l-amber-500/40">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("hunt")}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xs font-bold">
                      <Crosshair className="h-4 w-4 text-amber-500" /> Hunt Results
                      <Badge variant="outline" className="text-[10px]">{hunt.correlated_events?.length ?? 0} correlated</Badge>
                    </CardTitle>
                    {expandedSections.hunt ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {(expandedSections.hunt ?? true) && (
                  <CardContent className="space-y-4">
                    {/* Affected Assets */}
                    {((hunt.affected_hosts?.length ?? 0) > 0 || (hunt.affected_ips?.length ?? 0) > 0) && (
                      <div className="grid grid-cols-2 gap-4">
                        {hunt.affected_hosts && hunt.affected_hosts.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Hosts</p>
                            <div className="flex flex-wrap gap-1">
                              {hunt.affected_hosts.map((h) => (
                                <Badge key={h} variant="outline" className="font-mono text-[10px]"><Network className="mr-1 h-3 w-3" />{h}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {hunt.affected_ips && hunt.affected_ips.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">IPs</p>
                            <div className="flex flex-wrap gap-1">
                              {hunt.affected_ips.map((ip) => (
                                <Badge key={ip} variant="outline" className="font-mono text-[10px]">{ip}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MITRE Techniques */}
                    {hunt.mitre_techniques && hunt.mitre_techniques.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">MITRE Techniques</p>
                        <div className="flex flex-wrap gap-1">
                          {hunt.mitre_techniques.map((t) => (
                            <a key={t} href={`https://attack.mitre.org/techniques/${t.replace(".", "/")}`} target="_blank" rel="noopener noreferrer">
                              <Badge variant="outline" className="font-mono text-[10px] cursor-pointer hover:bg-muted/50">{t} <ExternalLink className="ml-1 h-2.5 w-2.5" /></Badge>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attack Chain */}
                    {hunt.attack_chain && hunt.attack_chain.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Attack Chain</p>
                        <div className="relative space-y-2">
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                          {hunt.attack_chain.map((step, i) => (
                            <div key={i} className="flex gap-3 pl-0 relative">
                              <div className="relative z-10 mt-1"><div className="h-3.5 w-3.5 rounded-full border-2 border-amber-500 bg-card" /></div>
                              <div>
                                <p className="text-[10px] text-muted-foreground font-mono">{step.timestamp}</p>
                                <p className="text-xs font-medium">{step.action}</p>
                                <p className="text-[10px] text-muted-foreground">{step.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Correlated Events Table */}
                    {hunt.correlated_events && hunt.correlated_events.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Correlated Events</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b">
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Type</th>
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Source</th>
                              <th className="pb-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Description</th>
                              <th className="pb-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Score</th>
                            </tr></thead>
                            <tbody>
                              {hunt.correlated_events.slice(0, 15).map((ce, i) => (
                                <tr key={i} className="border-b border-border/30">
                                  <td className="py-1.5"><Badge variant="outline" className="text-[9px]">{ce.correlation_type}</Badge></td>
                                  <td className="py-1.5 font-mono text-[10px]">{ce.source_table}</td>
                                  <td className="py-1.5 max-w-xs truncate text-muted-foreground">{ce.description}</td>
                                  <td className="py-1.5 text-right tabular-nums">{((ce.similarity_score ?? 0) * 100).toFixed(0)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Final Report */}
            {rpt && (
              <Card className="border-l-4 border-l-emerald-500/40">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("report")}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xs font-bold">
                      <BookOpen className="h-4 w-4 text-emerald-500" /> Final Report
                      {rpt.severity && <Badge variant={severityVariant(rpt.severity)} className="text-[10px]">{rpt.severity}</Badge>}
                    </CardTitle>
                    {expandedSections.report ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </CardHeader>
                {(expandedSections.report ?? true) && (
                  <CardContent className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold">{rpt.title}</h3>
                      {rpt.executive_summary && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{rpt.executive_summary}</p>
                      )}
                    </div>

                    {/* Report Sections */}
                    {rpt.sections && Object.entries(rpt.sections).length > 0 && (
                      <div className="space-y-3">
                        {Object.entries(rpt.sections).map(([title, content]) => (
                          <div key={title} className="rounded-lg border p-3">
                            <p className="text-xs font-semibold mb-1">{title}</p>
                            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MITRE Mapping */}
                    {rpt.mitre_mapping && rpt.mitre_mapping.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">MITRE ATT&CK Mapping</p>
                        <div className="flex flex-wrap gap-2">
                          {rpt.mitre_mapping.map((m, i) => (
                            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                              <span className="font-mono font-semibold">{m.technique_id}</span>
                              <span className="text-muted-foreground"> — {m.technique_name}</span>
                              <span className="block text-[10px] text-muted-foreground">{m.tactic}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {rpt.recommendations && rpt.recommendations.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recommendations</p>
                        <div className="space-y-1.5">
                          {rpt.recommendations.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <Target className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline */}
                    {rpt.timeline && rpt.timeline.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Investigation Timeline</p>
                        <div className="relative space-y-2">
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                          {rpt.timeline.map((t, i) => (
                            <div key={i} className="flex gap-3 relative">
                              <div className="relative z-10 mt-1"><div className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 bg-card" /></div>
                              <div>
                                <p className="text-[10px] text-muted-foreground font-mono">{t.timestamp}</p>
                                <p className="text-xs">{t.event}</p>
                                <p className="text-[10px] text-muted-foreground">{t.source}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        );
      })()}



      {/* ── Recent AI Investigations ── */}
      {investigations.length > 0 && (
        <Card className="border-l-4 border-l-blue-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <BarChart3 className="h-4 w-4 text-blue-500" /> Recent AI Investigations
              <Badge variant="outline" className="text-[10px] ml-auto">{investigations.length} total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 pr-3 font-medium">Event Type</th>
                    <th className="text-left py-2 pr-3 font-medium">Verdict</th>
                    <th className="text-right py-2 px-2 font-medium">Confidence</th>
                    <th className="text-left py-2 px-2 font-medium">Severity</th>
                    <th className="text-right py-2 pl-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {investigations.slice(0, 10).map((inv, i) => (
                    <tr key={inv.id ?? i} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-2 pr-3 font-mono text-muted-foreground">
                        {inv.timestamp ? new Date(inv.timestamp).toLocaleTimeString() : "—"}
                      </td>
                      <td className="py-2 pr-3 font-medium">{inv.event_type}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={verdictVariant(inv.verdict)} className="text-[10px]">
                          {verdictLabel(inv.verdict)}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{((inv.confidence ?? 0) * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        <Badge variant={priorityVariant(inv.severity)} className="text-[10px]">
                          {inv.severity}
                        </Badge>
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums font-mono">{(inv.duration ?? 0).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Classification History (Collapsible) ── */}
      {classificationHistory.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)} className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent/50 transition-colors">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-purple-500" /> Classification History
              <Badge variant="outline" className="text-[10px] ml-2">{classificationHistory.length} runs</Badge>
            </span>
            {showHistory ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showHistory && (
            <Card className="mt-2 border-l-4 border-l-purple-500/40">
              <CardContent className="p-4">
                <div className="space-y-2">
                  {classificationHistory.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs">
                      {entry.result.is_attack ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      <span className="font-medium flex-1">{entry.label}</span>
                      <Badge variant={entry.result.is_attack ? "critical" : "low"} className="text-[9px]">
                        {entry.result.is_attack ? "Attack" : "Benign"}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{entry.result.predicted_category}</span>
                      <span className="font-mono tabular-nums">{((entry.result.confidence_score ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
