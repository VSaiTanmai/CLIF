"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Cpu,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Brain,
  BarChart3,
  FlaskConical,
  Loader2,
  Trophy,
  Target,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface ModelInfo {
  status: "online" | "offline";
  version?: string;
  dataset?: string;
  binary_model?: { name: string; accuracy: number };
  multiclass_model?: { name: string; accuracy: number };
  categories?: string[];
  error?: string;
}

interface LeaderboardEntry {
  name: string;
  best_params: Record<string, unknown>;
  cv_accuracy: number;
  test_accuracy: number;
  test_precision: number;
  test_recall: number;
  test_f1: number;
  auc_roc: number | null;
  train_time: number;
  inference_ms: number;
}

interface LeaderboardData {
  binary: LeaderboardEntry[];
  multiclass: LeaderboardEntry[];
}

interface ClassifyResult {
  is_attack: boolean;
  confidence: number;
  category: string;
  severity: string;
  explanation: string;
  binary_probability: number;
  multiclass_probabilities?: Record<string, number>;
}

/* ── Sample events for quick classification ── */
const SAMPLE_EVENTS = [
  {
    label: "Normal HTTP Traffic",
    icon: CheckCircle2,
    color: "text-emerald-400",
    event: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "SF",
      src_bytes: 215, dst_bytes: 45076, land: 0, wrong_fragment: 0, urgent: 0,
      hot: 0, num_failed_logins: 0, logged_in: 1, num_compromised: 0,
      root_shell: 0, su_attempted: 0, num_root: 0, num_file_creations: 0,
      num_shells: 0, num_access_files: 0, num_outbound_cmds: 0,
      is_host_login: 0, is_guest_login: 0, count: 1, srv_count: 1,
      serror_rate: 0.0, srv_serror_rate: 0.0, rerror_rate: 0.0,
      srv_rerror_rate: 0.0, same_srv_rate: 1.0, diff_srv_rate: 0.0,
      srv_diff_host_rate: 0.0, dst_host_count: 255, dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1.0, dst_host_diff_srv_rate: 0.0,
      dst_host_same_src_port_rate: 0.0, dst_host_srv_diff_host_rate: 0.0,
      dst_host_serror_rate: 0.0, dst_host_srv_serror_rate: 0.0,
      dst_host_rerror_rate: 0.0, dst_host_srv_rerror_rate: 0.0,
    },
  },
  {
    label: "SYN Flood (DoS)",
    icon: AlertTriangle,
    color: "text-red-400",
    event: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "S0",
      src_bytes: 0, dst_bytes: 0, land: 0, wrong_fragment: 0, urgent: 0,
      hot: 0, num_failed_logins: 0, logged_in: 0, num_compromised: 0,
      root_shell: 0, su_attempted: 0, num_root: 0, num_file_creations: 0,
      num_shells: 0, num_access_files: 0, num_outbound_cmds: 0,
      is_host_login: 0, is_guest_login: 0, count: 511, srv_count: 511,
      serror_rate: 1.0, srv_serror_rate: 1.0, rerror_rate: 0.0,
      srv_rerror_rate: 0.0, same_srv_rate: 1.0, diff_srv_rate: 0.0,
      srv_diff_host_rate: 0.0, dst_host_count: 255, dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1.0, dst_host_diff_srv_rate: 0.0,
      dst_host_same_src_port_rate: 1.0, dst_host_srv_diff_host_rate: 0.0,
      dst_host_serror_rate: 1.0, dst_host_srv_serror_rate: 1.0,
      dst_host_rerror_rate: 0.0, dst_host_srv_rerror_rate: 0.0,
    },
  },
  {
    label: "Port Scan (Probe)",
    icon: Activity,
    color: "text-amber-400",
    event: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "REJ",
      src_bytes: 0, dst_bytes: 0, land: 0, wrong_fragment: 0, urgent: 0,
      hot: 0, num_failed_logins: 0, logged_in: 0, num_compromised: 0,
      root_shell: 0, su_attempted: 0, num_root: 0, num_file_creations: 0,
      num_shells: 0, num_access_files: 0, num_outbound_cmds: 0,
      is_host_login: 0, is_guest_login: 0, count: 1, srv_count: 1,
      serror_rate: 0.0, srv_serror_rate: 0.0, rerror_rate: 1.0,
      srv_rerror_rate: 1.0, same_srv_rate: 1.0, diff_srv_rate: 0.0,
      srv_diff_host_rate: 0.0, dst_host_count: 147, dst_host_srv_count: 13,
      dst_host_same_srv_rate: 0.09, dst_host_diff_srv_rate: 0.06,
      dst_host_same_src_port_rate: 0.0, dst_host_srv_diff_host_rate: 0.0,
      dst_host_serror_rate: 0.0, dst_host_srv_serror_rate: 0.0,
      dst_host_rerror_rate: 1.0, dst_host_srv_rerror_rate: 1.0,
    },
  },
];

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

/* ── Severity badge variant mapping ── */
function severityVariant(sev: string): "critical" | "high" | "medium" | "low" | "info" {
  switch (sev?.toLowerCase()) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "info";
  }
}

/* ══════════════════════════════════════════════════════════════ */
export default function AIAgentsPage() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [selectedSample, setSelectedSample] = useState<number | null>(null);
  const [classificationHistory, setClassificationHistory] = useState<
    { label: string; result: ClassifyResult; timestamp: Date }[]
  >([]);

  /* ── Fetch model info + leaderboard ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [infoRes, lbRes] = await Promise.all([
        fetch("/api/ai/classify").then((r) => r.json()),
        fetch("/api/ai/leaderboard").then((r) => r.json()),
      ]);
      setModelInfo(infoRes);
      if (!infoRes.error) setLeaderboard(lbRes);
    } catch {
      setModelInfo({ status: "offline", error: "Failed to reach API" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Run classification ── */
  const runClassify = async (idx: number) => {
    setClassifying(true);
    setSelectedSample(idx);
    setClassifyResult(null);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: SAMPLE_EVENTS[idx].event }),
      });
      const data: ClassifyResult = await res.json();
      setClassifyResult(data);
      setClassificationHistory((prev) => [
        { label: SAMPLE_EVENTS[idx].label, result: data, timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
      toast.success("Classification complete", {
        description: `${data.is_attack ? "⚠ Attack" : "✓ Benign"} — ${data.category} (${(data.confidence * 100).toFixed(1)}%)`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Classification failed", { description: msg });
    } finally {
      setClassifying(false);
    }
  };

  const isOnline = modelInfo?.status === "online";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Classifier</h1>
          <p className="text-sm text-muted-foreground">
            ML-powered network intrusion detection — Tier 2 classifier trained on NSL-KDD
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Service Status Banner */}
      <Card className={isOnline ? "border-emerald-500/30" : "border-red-500/30"}>
        <CardContent className="flex items-center gap-4 py-4">
          <div className={`rounded-full p-2 ${isOnline ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            {isOnline
              ? <Zap className="h-5 w-5 text-emerald-400" />
              : <XCircle className="h-5 w-5 text-red-400" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">AI Service</span>
              <Badge variant={isOnline ? "low" : "critical"}>
                {isOnline ? "Online" : "Offline"}
              </Badge>
              {modelInfo?.version && (
                <Badge variant="outline" className="text-[10px]">v{modelInfo.version}</Badge>
              )}
            </div>
            {isOnline && modelInfo?.dataset && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Dataset: {modelInfo.dataset} · Binary: {modelInfo.binary_model?.name} ({pct(modelInfo.binary_model?.accuracy ?? 0)}) · Multiclass: {modelInfo.multiclass_model?.name} ({pct(modelInfo.multiclass_model?.accuracy ?? 0)})
              </p>
            )}
            {!isOnline && (
              <p className="text-xs text-red-400 mt-0.5">
                {modelInfo?.error ?? "AI classifier service is not reachable — start ai_service.py"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="classify" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Live Classify
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !isOnline ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bot className="mx-auto h-10 w-10 mb-3 opacity-40" />
                <p>AI service is offline. Start <code className="text-xs">ai_service.py</code> to enable classification.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" /> Binary Accuracy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-emerald-400">
                      {pct(modelInfo?.binary_model?.accuracy ?? 0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {modelInfo?.binary_model?.name}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Target className="h-3.5 w-3.5" /> Multiclass Accuracy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-blue-400">
                      {pct(modelInfo?.multiclass_model?.accuracy ?? 0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {modelInfo?.multiclass_model?.name}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Cpu className="h-3.5 w-3.5" /> Models Trained
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums">
                      {(leaderboard?.binary?.length ?? 0) + (leaderboard?.multiclass?.length ?? 0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {leaderboard?.binary?.length ?? 0} binary · {leaderboard?.multiclass?.length ?? 0} multiclass
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" /> Attack Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums">
                      {modelInfo?.categories?.length ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {modelInfo?.categories?.join(", ")}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Architecture overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4 text-primary" />
                    Classifier Architecture
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md bg-emerald-500/10 p-1.5">
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="text-sm font-medium">Stage 1 — Binary</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        First pass determines if traffic is <strong>Normal</strong> or <strong>Attack</strong>.
                        Uses {modelInfo?.binary_model?.name} with {pct(modelInfo?.binary_model?.accuracy ?? 0)} accuracy.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md bg-blue-500/10 p-1.5">
                          <Target className="h-4 w-4 text-blue-400" />
                        </div>
                        <span className="text-sm font-medium">Stage 2 — Multiclass</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        If attack detected, classifies into categories: {modelInfo?.categories?.filter(c => c !== "Normal").join(", ")}.
                        Uses {modelInfo?.multiclass_model?.name}.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md bg-amber-500/10 p-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </div>
                        <span className="text-sm font-medium">Stage 3 — Severity</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Computes severity (Info → Critical) from confidence scores and attack category.
                        Generates human-readable explanations for SOC analysts.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Leaderboard Tab ── */}
        <TabsContent value="leaderboard" className="space-y-4">
          {!leaderboard ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {loading
                  ? <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  : <p>No leaderboard data available.</p>}
              </CardContent>
            </Card>
          ) : (
            <>
              {(["binary", "multiclass"] as const).map((task) => (
                <Card key={task}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Trophy className="h-4 w-4 text-amber-400" />
                      {task === "binary" ? "Binary Classification" : "Multiclass Classification"} Leaderboard
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 pr-4 font-medium text-muted-foreground">#</th>
                            <th className="pb-2 pr-4 font-medium text-muted-foreground">Model</th>
                            <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Accuracy</th>
                            <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Precision</th>
                            <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Recall</th>
                            <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">F1</th>
                            {task === "binary" && (
                              <th className="pb-2 font-medium text-muted-foreground text-right">AUC-ROC</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard[task].map((m, i) => (
                            <tr
                              key={m.name}
                              className={`border-b border-border/50 ${i === 0 ? "bg-amber-500/5" : ""}`}
                            >
                              <td className="py-2.5 pr-4 tabular-nums">
                                {i === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                                    <Trophy className="h-3 w-3" /> 1
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">{i + 1}</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 font-medium">{m.name}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-400 font-medium">
                                {pct(m.test_accuracy)}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{pct(m.test_precision)}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{pct(m.test_recall)}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{pct(m.test_f1)}</td>
                              {task === "binary" && (
                                <td className="py-2.5 text-right tabular-nums text-blue-400">
                                  {m.auc_roc != null ? pct(m.auc_roc) : "—"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        {/* ── Live Classify Tab ── */}
        <TabsContent value="classify" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Sample events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  Sample Events
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SAMPLE_EVENTS.map((sample, idx) => {
                  const Icon = sample.icon;
                  return (
                    <button
                      key={idx}
                      disabled={classifying || !isOnline}
                      onClick={() => runClassify(idx)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedSample === idx ? "border-primary bg-accent/30" : ""
                      }`}
                    >
                      <div className="rounded-md bg-muted p-2">
                        <Icon className={`h-4 w-4 ${sample.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{sample.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {sample.event.protocol_type.toUpperCase()} · {sample.event.service} · flag={sample.event.flag} · src_bytes={sample.event.src_bytes}
                        </p>
                      </div>
                      {classifying && selectedSample === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Zap className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
                {!isOnline && (
                  <p className="text-xs text-red-400 text-center pt-2">
                    AI service offline — start it to classify events
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Result panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Classification Result
                </CardTitle>
              </CardHeader>
              <CardContent>
                {classifyResult ? (
                  <div className="space-y-4">
                    {/* Verdict */}
                    <div className={`rounded-lg border p-4 ${
                      classifyResult.is_attack
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5"
                    }`}>
                      <div className="flex items-center gap-2">
                        {classifyResult.is_attack
                          ? <AlertTriangle className="h-5 w-5 text-red-400" />
                          : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                        <span className="text-lg font-semibold">
                          {classifyResult.is_attack ? "Attack Detected" : "Benign Traffic"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {classifyResult.explanation}
                      </p>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                        <p className="text-sm font-bold mt-1">{classifyResult.category}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
                        <p className="text-sm font-bold mt-1 tabular-nums text-emerald-400">
                          {(classifyResult.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Severity</p>
                        <Badge variant={severityVariant(classifyResult.severity)} className="mt-1">
                          {classifyResult.severity}
                        </Badge>
                      </div>
                    </div>

                    {/* Multiclass probabilities */}
                    {classifyResult.multiclass_probabilities && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            Class Probabilities
                          </p>
                          <div className="space-y-2">
                            {Object.entries(classifyResult.multiclass_probabilities)
                              .sort(([, a], [, b]) => b - a)
                              .map(([cls, prob]) => (
                                <div key={cls} className="flex items-center gap-2">
                                  <span className="text-xs w-20 truncate">{cls}</span>
                                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary transition-all duration-500"
                                      style={{ width: `${prob * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs tabular-nums text-muted-foreground w-14 text-right">
                                    {(prob * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Bot className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">Select a sample event to classify</p>
                    <p className="text-[10px] mt-1">Results will appear here in real-time</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Classification History */}
          {classificationHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4 text-primary" />
                  Classification History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative space-y-3">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  {classificationHistory.map((item, idx) => (
                    <div key={idx} className="relative flex gap-3">
                      <div className="relative z-10 mt-1">
                        <div className={`h-3.5 w-3.5 rounded-full border-2 bg-card ${
                          item.result.is_attack ? "border-red-400" : "border-emerald-400"
                        }`} />
                      </div>
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{item.label}</Badge>
                        <Badge variant={item.result.is_attack ? "critical" : "low"} className="text-[10px]">
                          {item.result.category}
                        </Badge>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {(item.result.confidence * 100).toFixed(1)}% confidence
                        </span>
                        <Badge variant={severityVariant(item.result.severity)} className="text-[10px]">
                          {item.result.severity}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {item.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
