"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BrainCircuit,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Info,
  BarChart3,
  Layers,
  Zap,
  AlertTriangle,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface XAIFeature {
  feature: string;
  display_name: string;
  shap_value: number;
  abs_shap_value: number;
  feature_value?: number;
  raw_value?: string | number | null;
  impact: "positive" | "negative";
  category: string;
}

interface WaterfallData {
  base_value: number;
  output_value: number;
  features: { feature: string; value: number }[];
}

interface GlobalFeature {
  feature: string;
  display_name: string;
  importance: number;
  category: string;
}

interface XAIStatus {
  available: boolean;
  explainer_type?: string;
  feature_count?: number;
  top_k?: number;
  features?: GlobalFeature[];
  total_features?: number;
  model_types?: { binary: string; multiclass: string };
  error?: string;
}

interface ExplainResult {
  is_attack: boolean;
  confidence: number;
  category: string;
  severity: string;
  explanation: string;
  xai?: {
    top_features: XAIFeature[];
    waterfall: WaterfallData;
    prediction_drivers: string;
    category_attribution: Record<string, number>;
    model_type: string;
    explainer_type: string;
    error?: string;
  };
}

/* ─── Sample Events ──────────────────────────────────────────────────────── */

const SAMPLE_EVENTS = [
  {
    name: "SYN Flood (DoS)",
    event: {
      duration: 0, protocol_type: "tcp", service: "private", flag: "S0",
      src_bytes: 0, dst_bytes: 0, count: 511, srv_count: 511,
      serror_rate: 1.0, srv_serror_rate: 1.0, same_srv_rate: 1.0,
      diff_srv_rate: 0.0, dst_host_count: 255, dst_host_srv_count: 255,
      dst_host_same_srv_rate: 1.0, dst_host_same_src_port_rate: 1.0,
      dst_host_serror_rate: 1.0, dst_host_srv_serror_rate: 1.0,
    },
  },
  {
    name: "Port Scan (Probe)",
    event: {
      duration: 0, protocol_type: "tcp", service: "other", flag: "RSTO",
      src_bytes: 0, dst_bytes: 0, count: 6, srv_count: 1,
      rerror_rate: 0.83, srv_rerror_rate: 1.0, same_srv_rate: 0.17,
      diff_srv_rate: 0.06, dst_host_count: 255, dst_host_srv_count: 1,
      dst_host_diff_srv_rate: 0.06, dst_host_rerror_rate: 0.88,
      dst_host_srv_rerror_rate: 1.0,
    },
  },
  {
    name: "Normal HTTP",
    event: {
      duration: 0, protocol_type: "tcp", service: "http", flag: "SF",
      src_bytes: 215, dst_bytes: 45076, logged_in: 1, count: 5,
      srv_count: 5, same_srv_rate: 1.0, dst_host_count: 255,
      dst_host_srv_count: 255, dst_host_same_srv_rate: 1.0,
    },
  },
  {
    name: "SSH Brute Force (R2L)",
    event: {
      duration: 0, protocol_type: "tcp", service: "ssh", flag: "S0",
      src_bytes: 0, dst_bytes: 0, num_failed_logins: 3, logged_in: 0,
      count: 150, srv_count: 150, serror_rate: 0.8, srv_serror_rate: 0.8,
      same_srv_rate: 1.0, dst_host_count: 1, dst_host_srv_count: 1,
      dst_host_same_srv_rate: 1.0, dst_host_serror_rate: 0.75,
    },
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  traffic: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  content: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  connection: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  error_rate: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  host: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  protocol: "bg-pink-500/15 text-pink-400 border-pink-500/25",
  other: "bg-neutral-500/15 text-neutral-400 border-neutral-500/25",
};

function shapBar(value: number, maxAbs: number) {
  const pct = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) * 100 : 0;
  const isPositive = value > 0;
  return (
    <div className="relative h-4 w-full">
      {/* Center line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-700" />
      {isPositive ? (
        <div
          className="absolute top-0.5 bottom-0.5 rounded-r bg-red-500/70"
          style={{ left: "50%", width: `${pct / 2}%` }}
        />
      ) : (
        <div
          className="absolute top-0.5 bottom-0.5 rounded-l bg-blue-500/70"
          style={{ right: "50%", width: `${pct / 2}%` }}
        />
      )}
    </div>
  );
}

function severityColor(sev: string) {
  switch (sev) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "medium": return "text-yellow-400";
    case "low": return "text-blue-400";
    default: return "text-neutral-400";
  }
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ExplainabilityPage() {
  const [status, setStatus] = useState<XAIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [selectedSample, setSelectedSample] = useState(0);

  // Fetch XAI status & global feature importance on mount
  useEffect(() => {
    fetch("/api/ai/xai")
      .then((r) => r.json())
      .then((s) => {
        setStatus(s);
        // Auto-trigger first explanation so page isn't empty
        if (s?.available) {
          setExplaining(true);
          fetch("/api/ai/xai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(SAMPLE_EVENTS[0].event),
          })
            .then((r) => r.json())
            .then(setResult)
            .catch(() => setResult(null))
            .finally(() => setExplaining(false));
        }
      })
      .catch(() => setStatus({ available: false, error: "Service unavailable" }))
      .finally(() => setLoading(false));
  }, []);

  const handleExplain = useCallback(async (idx: number) => {
    setSelectedSample(idx);
    setExplaining(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/xai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SAMPLE_EVENTS[idx].event),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setExplaining(false);
    }
  }, []);

  // Compute max absolute SHAP for bar scaling
  const maxAbsShap = useMemo(() => {
    if (!result?.xai?.top_features) return 1;
    return Math.max(
      ...result.xai.top_features.map((f) => Math.abs(f.shap_value)),
      0.001
    );
  }, [result]);

  // Top global features (up to 15)
  const globalFeatures = useMemo(() => {
    if (!status?.features) return [];
    return status.features.slice(0, 15);
  }, [status]);

  const maxGlobalImportance = useMemo(() => {
    if (!globalFeatures.length) return 1;
    return Math.max(...globalFeatures.map((f) => f.importance), 0.001);
  }, [globalFeatures]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            Explainable AI (XAI)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            SHAP-based model interpretability — understand why the AI makes each decision
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            status?.available
              ? "border-emerald-500/30 text-emerald-400"
              : "border-red-500/30 text-red-400"
          }
        >
          {status?.available ? "SHAP Active" : "XAI Unavailable"}
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BrainCircuit className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Explainer
              </p>
              <p className="text-sm font-medium">
                {status?.explainer_type || "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Features
              </p>
              <p className="text-sm font-medium tabular-nums">
                {status?.feature_count ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Top-K Shown
              </p>
              <p className="text-sm font-medium tabular-nums">
                {status?.top_k ?? 10}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Models
              </p>
              <p className="text-sm font-medium truncate">
                {status?.model_types?.binary?.split("Classifier")[0] || "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content: 2-Column Layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left Column: Interactive Explainer */}
        <div className="lg:col-span-3 space-y-4">
          {/* Sample Event Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Live SHAP Explanation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Select a sample security event to see real-time SHAP feature attribution analysis.
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_EVENTS.map((s, idx) => (
                  <Button
                    key={s.name}
                    size="sm"
                    variant={selectedSample === idx && result ? "default" : "outline"}
                    onClick={() => handleExplain(idx)}
                    disabled={explaining || !status?.available}
                    className="text-xs"
                  >
                    {explaining && selectedSample === idx && (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {s.name}
                  </Button>
                ))}
              </div>

              {!status?.available && (
                <div className="flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  XAI is unavailable. Ensure the AI service is running and SHAP is installed.
                </div>
              )}
            </CardContent>
          </Card>

          {/* SHAP Result */}
          {result && result.xai && !result.xai.error && (
            <>
              {/* Classification Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] font-bold">
                    Classification Result
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge
                      variant={result.is_attack ? "destructive" : "outline"}
                      className="text-xs"
                    >
                      {result.is_attack ? "ATTACK" : "BENIGN"}
                    </Badge>
                    <span className="text-sm font-mono font-medium">
                      {result.category}
                    </span>
                    <span className={`text-xs font-medium uppercase ${severityColor(result.severity)}`}>
                      {result.severity}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                      Confidence: {(result.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      {result.xai.prediction_drivers}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Top Feature Contributions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px] font-bold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    SHAP Feature Contributions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/70" />
                      Pushes toward {result.is_attack ? result.category : "attack"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500/70" />
                      Pushes toward benign
                    </span>
                  </div>

                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-neutral-800 text-xs text-muted-foreground">
                        <th className="py-2 pr-2 text-left font-medium w-[30%]">Feature</th>
                        <th className="py-2 px-2 text-left font-medium w-[40%]">
                          SHAP Value
                        </th>
                        <th className="py-2 px-2 text-right font-medium w-[15%]">Value</th>
                        <th className="py-2 pl-2 text-right font-medium w-[15%]">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.xai.top_features.map((feat, i) => (
                        <tr key={feat.feature} className="border-b border-neutral-800/50">
                          <td className="py-2.5 pr-2">
                            <div className="flex items-center gap-2">
                              {feat.impact === "positive" ? (
                                <ArrowUpRight className="h-3 w-3 text-red-400 shrink-0" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3 text-blue-400 shrink-0" />
                              )}
                              <span className="truncate" title={feat.display_name}>
                                {feat.display_name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              {shapBar(feat.shap_value, maxAbsShap)}
                              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap w-16 text-right">
                                {feat.shap_value > 0 ? "+" : ""}
                                {feat.shap_value.toFixed(4)}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                            {feat.raw_value !== null && feat.raw_value !== undefined
                              ? String(feat.raw_value)
                              : feat.feature_value?.toFixed(2) ?? "—"}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <span
                              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] ${
                                CATEGORY_COLORS[feat.category] || CATEGORY_COLORS.other
                              }`}
                            >
                              {feat.category}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Category Attribution + Waterfall side by side */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Category Attribution */}
                {result.xai.category_attribution &&
                  Object.keys(result.xai.category_attribution).length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-[13px] font-bold">
                          Feature Category Attribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(result.xai.category_attribution).map(
                            ([cat, val]) => {
                              const total = Object.values(
                                result.xai!.category_attribution
                              ).reduce((a, b) => a + b, 0);
                              const pct = total > 0 ? (val / total) * 100 : 0;
                              return (
                                <div key={cat}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-muted-foreground">
                                      {cat}
                                    </span>
                                    <span className="tabular-nums">
                                      {pct.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-neutral-800">
                                    <div
                                      className="h-2 rounded-full bg-primary transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                {/* Waterfall */}
                {result.xai.waterfall && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px] font-bold">
                        Decision Waterfall
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-xs font-mono">
                        <div className="flex justify-between text-muted-foreground mb-2">
                          <span>Base value</span>
                          <span className="tabular-nums">
                            {result.xai.waterfall.base_value.toFixed(4)}
                          </span>
                        </div>
                        {result.xai.waterfall.features.map((wf, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-center"
                          >
                            <span className="truncate text-muted-foreground pr-2 max-w-[70%]">
                              {wf.value >= 0 ? "+" : ""}
                              {wf.value.toFixed(4)}
                            </span>
                            <span className={`text-right truncate max-w-[60%] ${
                              wf.value > 0 ? "text-red-400" : "text-blue-400"
                            }`}>
                              {wf.feature}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-neutral-700 pt-1 mt-2 flex justify-between font-medium">
                          <span>Output</span>
                          <span className="tabular-nums">
                            {result.xai.waterfall.output_value.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* Error or no result */}
          {result && result.xai?.error && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-red-400">
                  XAI Error: {result.xai.error}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Global Feature Importance */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px] font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Global Feature Importance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Model-wide feature importance (Gini impurity) — which features matter most across all predictions.
              </p>
              {globalFeatures.length > 0 ? (
                <div className="space-y-2">
                  {globalFeatures.map((feat, i) => {
                    const pct =
                      maxGlobalImportance > 0
                        ? (feat.importance / maxGlobalImportance) * 100
                        : 0;
                    return (
                      <div key={feat.feature}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span
                            className="truncate text-foreground"
                            title={feat.feature}
                          >
                            <span className="text-muted-foreground mr-1 tabular-nums">
                              {i + 1}.
                            </span>
                            {feat.display_name}
                          </span>
                          <span className="tabular-nums text-muted-foreground ml-2 whitespace-nowrap">
                            {(feat.importance * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-neutral-800">
                          <div
                            className="h-1.5 rounded-full bg-primary/70 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {status?.available
                    ? "Loading feature importance..."
                    : "Feature importance unavailable — AI service offline."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* How SHAP Works — Info Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] font-bold flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                How SHAP Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">SHAP</strong> (SHapley Additive
                exPlanations) uses game-theoretic Shapley values to attribute each
                feature&apos;s contribution to a prediction.
              </p>
              <p>
                <strong className="text-foreground">TreeExplainer</strong> computes
                exact SHAP values in polynomial time for tree-based models
                (ExtraTrees, XGBoost, LightGBM), making it efficient for real-time
                SOC analysis.
              </p>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/70" />
                  <span>
                    <strong className="text-red-400">Positive SHAP</strong> — pushes
                    prediction toward the classified category
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500/70" />
                  <span>
                    <strong className="text-blue-400">Negative SHAP</strong> —
                    opposes the predicted classification
                  </span>
                </div>
              </div>
              <p className="border-t border-neutral-800 pt-2">
                CLIF uses both a <strong className="text-foreground">binary</strong>{" "}
                (attack/normal) and <strong className="text-foreground">multiclass</strong>{" "}
                (DoS/Probe/R2L/U2R/Normal) model. For attacks, the multiclass SHAP
                values are shown; for benign traffic, binary values are used.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
