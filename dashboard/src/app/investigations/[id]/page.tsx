"use client";

import { useState, useMemo } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { severityLabel, timeAgo, formatNumber } from "@/lib/utils";
import {
  ArrowLeft,
  Clock,
  User,
  Monitor,
  Tag,
  FileText,
  Shield,
  Network,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Ban,
  KeyRound,
  ArrowUpRight,
  PackageOpen,
  Lock,
  Globe,
  Server,
  Terminal,
  StickyNote,
  Fingerprint,
  LinkIcon,
  Timer,
  Crosshair,
} from "lucide-react";
import investigationsData from "@/lib/mock/investigations.json";
import type { Investigation } from "@/lib/types";
import { InvestigationGraph } from "@/components/investigation-graph";
import { toast } from "sonner";

const cases = investigationsData.cases as Investigation[];

/* ── Constants ── */

const SEVERITY_VARIANT: Record<number, "critical" | "high" | "medium" | "low" | "info"> = {
  4: "critical", 3: "high", 2: "medium", 1: "low", 0: "info",
};

const STATUS_COLORS: Record<string, string> = {
  "Open": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "In Progress": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Closed": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const RISK_SCORES: Record<string, number> = {
  "INV-2026-001": 92, "INV-2026-002": 68, "INV-2026-003": 88, "INV-2026-004": 95,
  "INV-2026-005": 35, "INV-2026-006": 72, "INV-2026-007": 42, "INV-2026-008": 71,
};

/* ── MITRE ATT&CK Kill Chain ── */
const KILL_CHAIN = [
  { phase: "Recon", id: "TA0043" },
  { phase: "Initial Access", id: "TA0001" },
  { phase: "Execution", id: "TA0002" },
  { phase: "Persistence", id: "TA0003" },
  { phase: "Priv. Escalation", id: "TA0004" },
  { phase: "Defense Evasion", id: "TA0005" },
  { phase: "Credential Access", id: "TA0006" },
  { phase: "Discovery", id: "TA0007" },
  { phase: "Lateral Movement", id: "TA0008" },
  { phase: "Collection", id: "TA0009" },
  { phase: "C2", id: "TA0011" },
  { phase: "Exfiltration", id: "TA0010" },
  { phase: "Impact", id: "TA0040" },
];

const TAG_TACTICS: Record<string, string[]> = {
  "lateral-movement": ["TA0008"], "kerberos": ["TA0006"], "execution": ["TA0002"],
  "powershell": ["TA0002", "TA0005"], "encoded-command": ["TA0005"],
  "exfiltration": ["TA0010"], "dns-tunneling": ["TA0011"],
  "command-and-control": ["TA0011"], "credential-access": ["TA0006"],
  "mimikatz": ["TA0006"], "lsass": ["TA0006"], "brute-force": ["TA0006"],
  "password-spray": ["TA0006"], "persistence": ["TA0003"],
  "scheduled-task": ["TA0003", "TA0002"], "discovery": ["TA0007"],
  "network-scan": ["TA0007"], "smb": ["TA0007", "TA0008"],
  "privilege-escalation": ["TA0004"], "service-account": ["TA0004", "TA0001"],
  "domain-controller": ["TA0008"], "T1021": ["TA0008"], "T1059": ["TA0002"],
  "T1041": ["TA0010"], "T1003": ["TA0006"], "T1110": ["TA0006"],
  "T1053": ["TA0003", "TA0002"], "T1018": ["TA0007"],
  "T1078": ["TA0004", "TA0001", "TA0005"],
};

/* ── Mock IOCs per case ── */
const CASE_IOCS: Record<string, Array<{ type: string; value: string; confidence: number; icon: string }>> = {
  "INV-2026-001": [
    { type: "User", value: "U4521@DOM2", confidence: 0.96, icon: "user" },
    { type: "Host", value: "DC01 (Domain Controller)", confidence: 0.98, icon: "server" },
    { type: "Technique", value: "T1021 — Remote Services", confidence: 0.94, icon: "crosshair" },
    { type: "IP", value: "10.0.12.45", confidence: 0.72, icon: "globe" },
    { type: "Protocol", value: "Kerberos TGT/TGS", confidence: 0.89, icon: "network" },
  ],
  "INV-2026-002": [
    { type: "User", value: "U8921@DOM1", confidence: 0.88, icon: "user" },
    { type: "Host", value: "C3847", confidence: 0.95, icon: "server" },
    { type: "Process", value: "powershell.exe -EncodedCommand", confidence: 0.97, icon: "terminal" },
    { type: "Technique", value: "T1059 — Command & Scripting", confidence: 0.93, icon: "crosshair" },
  ],
  "INV-2026-003": [
    { type: "Host", value: "C1923", confidence: 0.95, icon: "server" },
    { type: "IP", value: "198.51.100.23 (External C2)", confidence: 0.91, icon: "globe" },
    { type: "Technique", value: "T1041 — Exfiltration over C2", confidence: 0.88, icon: "crosshair" },
    { type: "DNS", value: "*.evil-domain.xyz (2,400+ queries)", confidence: 0.96, icon: "globe" },
    { type: "User", value: "U3102@DOM3", confidence: 0.82, icon: "user" },
  ],
  "INV-2026-004": [
    { type: "Process", value: "mimikatz.exe (hash: a1b2c3…)", confidence: 0.99, icon: "terminal" },
    { type: "Host", value: "C587", confidence: 0.98, icon: "server" },
    { type: "Technique", value: "T1003 — OS Credential Dumping", confidence: 0.97, icon: "crosshair" },
    { type: "User", value: "U1205@DOM1", confidence: 0.93, icon: "user" },
    { type: "Process", value: "LSASS.exe (PID 672) accessed", confidence: 0.95, icon: "terminal" },
  ],
  "INV-2026-005": [
    { type: "IP", value: "10.0.9.234 (C9234)", confidence: 0.90, icon: "globe" },
    { type: "Technique", value: "T1110 — Brute Force", confidence: 0.85, icon: "crosshair" },
    { type: "Pattern", value: "15 accounts targeted (spray)", confidence: 0.78, icon: "fingerprint" },
  ],
  "INV-2026-006": [
    { type: "Host", value: "C4102", confidence: 0.95, icon: "server" },
    { type: "User", value: "U7823@DOM2", confidence: 0.91, icon: "user" },
    { type: "Process", value: "C:\\Windows\\Temp\\svc.exe", confidence: 0.96, icon: "terminal" },
    { type: "Technique", value: "T1053 — Scheduled Task", confidence: 0.93, icon: "crosshair" },
    { type: "Persistence", value: "Task: WindowsUpdateCheck (q15m)", confidence: 0.88, icon: "fingerprint" },
  ],
  "INV-2026-007": [
    { type: "Host", value: "C2891", confidence: 0.92, icon: "server" },
    { type: "User", value: "U5431@DOM1", confidence: 0.87, icon: "user" },
    { type: "Process", value: "nmap", confidence: 0.99, icon: "terminal" },
    { type: "Technique", value: "T1018 — Remote System Discovery", confidence: 0.90, icon: "crosshair" },
    { type: "Pattern", value: "3,200 IPs on port 445 in 5min", confidence: 0.95, icon: "fingerprint" },
  ],
  "INV-2026-008": [
    { type: "Host", value: "C6721", confidence: 0.93, icon: "server" },
    { type: "User", value: "SYSTEM (interactive logon)", confidence: 0.97, icon: "user" },
    { type: "Technique", value: "T1078 — Valid Accounts", confidence: 0.88, icon: "crosshair" },
    { type: "Process", value: "cmd.exe → whoami.exe", confidence: 0.91, icon: "terminal" },
  ],
};

const IOC_ICONS: Record<string, React.ElementType> = {
  user: User, server: Server, globe: Globe, terminal: Terminal,
  crosshair: Crosshair, network: Network, fingerprint: Fingerprint,
};

/* ── Response Actions ── */
const RESPONSE_ACTIONS = [
  { label: "Isolate Host", icon: Ban, color: "text-red-500", bg: "bg-red-500/10", desc: "Network isolation" },
  { label: "Block IP", icon: Shield, color: "text-orange-500", bg: "bg-orange-500/10", desc: "Firewall rule" },
  { label: "Reset Creds", icon: KeyRound, color: "text-amber-500", bg: "bg-amber-500/10", desc: "Force password reset" },
  { label: "Escalate", icon: ArrowUpRight, color: "text-blue-500", bg: "bg-blue-500/10", desc: "Tier 3 / IR Team" },
  { label: "Collect Evidence", icon: PackageOpen, color: "text-purple-500", bg: "bg-purple-500/10", desc: "Forensic snapshot" },
  { label: "Lock Account", icon: Lock, color: "text-red-500", bg: "bg-red-500/10", desc: "Disable user" },
];

/* ── AI Investigation Timeline ── */
const MOCK_TIMELINE = [
  { time: "10:58:00", event: "Triage Agent classified as lateral movement (confidence: 0.96)", agent: "triage" },
  { time: "10:57:00", event: "Hunter Agent traced authentication chain — 3 hops confirmed", agent: "hunter" },
  { time: "10:52:00", event: "Escalation Agent elevated severity to Critical", agent: "escalation" },
  { time: "10:45:00", event: "Verifier Agent confirmed as true positive — no FP patterns", agent: "verifier" },
  { time: "10:30:00", event: "Reporter Agent generated technical analysis report", agent: "reporter" },
  { time: "10:15:00", event: "Alert initially triaged by Triage Agent", agent: "triage" },
  { time: "10:00:00", event: "Security event detected by CLIF pipeline", agent: "system" },
];

const AGENT_COLORS: Record<string, string> = {
  triage: "border-blue-500", hunter: "border-amber-500", escalation: "border-red-500",
  verifier: "border-purple-500", reporter: "border-emerald-500", system: "border-zinc-400",
};

/* ── Risk Score Ring Component ── */
function RiskRing({ score }: { score: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "text-red-500" : score >= 60 ? "text-amber-500" : score >= 40 ? "text-yellow-500" : "text-emerald-500";
  const strokeColor = score >= 80 ? "#ef4444" : score >= 60 ? "#f59e0b" : score >= 40 ? "#eab308" : "#10b981";
  const label = score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 40 ? "Medium" : "Low";

  return (
    <div className="relative h-20 w-20 mx-auto">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="5" className="stroke-muted/20" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="5"
          stroke={strokeColor}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold ${color}`}>{score}</span>
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════ */
export default function InvestigationDetailPage({ params }: { params: { id: string } }) {
  const investigation = cases.find((c) => c.id === params.id);
  if (!investigation) return notFound();

  const [graphOpen, setGraphOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const riskScore = RISK_SCORES[investigation.id] ?? investigation.severity * 20 + 15;

  const iocs = CASE_IOCS[investigation.id] ?? [
    { type: "User", value: investigation.users[0] ?? "Unknown", confidence: 0.8, icon: "user" },
    { type: "Host", value: investigation.hosts[0] ?? "Unknown", confidence: 0.85, icon: "server" },
  ];

  const activeTactics = useMemo(() => {
    const set = new Set<string>();
    investigation.tags.forEach((tag) => (TAG_TACTICS[tag] ?? []).forEach((t) => set.add(t)));
    return set;
  }, [investigation.tags]);

  const evidence = useMemo(() => {
    const items: Array<{ label: string; size: string; icon: React.ElementType }> = [
      { label: `Security Events (${investigation.eventCount} events)`, size: `${(investigation.eventCount * 0.05).toFixed(1)} MB`, icon: FileText },
      { label: "AI Investigation Report", size: "48 KB", icon: FileText },
    ];
    if (investigation.hosts.length > 1)
      items.push({ label: `Network capture — ${investigation.hosts[0]} → ${investigation.hosts[investigation.hosts.length - 1]}`, size: "14.7 MB", icon: Globe });
    items.push({ label: "Process tree snapshot", size: "340 KB", icon: Terminal });
    return items;
  }, [investigation]);

  const related = useMemo(
    () => cases.filter((c) => c.id !== investigation.id)
      .map((c) => ({ ...c, similarity: Math.min(0.95, c.tags.filter((t) => investigation.tags.includes(t)).length * 0.22 + 0.15) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3),
    [investigation],
  );

  const hoursOpen = Math.max(1, Math.round((Date.now() - new Date(investigation.created).getTime()) / 3_600_000));

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <Link href="/investigations" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Investigations
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={SEVERITY_VARIANT[investigation.severity] ?? "info"}>{severityLabel(investigation.severity)}</Badge>
              <span className="font-mono text-sm text-muted-foreground">{investigation.id}</span>
              <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[investigation.status] ?? ""}`}>
                {investigation.status}
              </span>
            </div>
            <h1 className="mt-2 text-[26px] font-bold tracking-tight">{investigation.title}</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => toast.success("Report exported", { description: `${investigation.id} exported as PDF` })}>
              <FileText className="h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" className="gap-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => toast.warning("Containment initiated", { description: `Isolating hosts: ${investigation.hosts.join(", ")}` })}>
              <Shield className="h-3.5 w-3.5" /> Contain
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          { icon: User, label: "Assignee", value: investigation.assignee },
          { icon: Clock, label: "Last Updated", value: timeAgo(investigation.updated) },
          { icon: Activity, label: "Events", value: formatNumber(investigation.eventCount), mono: true },
          { icon: Monitor, label: "Hosts", value: investigation.hosts.join(", ") },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  <p className={`text-sm font-medium ${card.mono ? "tabular-nums" : ""}`}>{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-l-4 border-l-red-500/60">
          <CardContent className="flex items-center gap-3 p-3">
            <RiskRing score={riskScore} />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk Score</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Timer className="inline h-3 w-3 mr-1" />
                Open {hoursOpen < 24 ? `${hoursOpen}h` : `${Math.round(hoursOpen / 24)}d`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Description + Kill Chain ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8 border-l-4 border-l-blue-500/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-bold">Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{investigation.description}</p>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">MITRE ATT&CK TTPs</p>
              <div className="flex flex-wrap gap-1.5">
                {investigation.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
                    <Tag className="h-3 w-3 text-primary" />{tag}
                  </span>
                ))}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Affected Users</p>
                <div className="flex flex-wrap gap-1.5">
                  {investigation.users.map((u) => (
                    <Badge key={u} variant="outline" className="font-mono text-xs"><User className="mr-1 h-3 w-3" />{u}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Affected Hosts</p>
                <div className="flex flex-wrap gap-1.5">
                  {investigation.hosts.map((h) => (
                    <Badge key={h} variant="outline" className="font-mono text-xs"><Network className="mr-1 h-3 w-3" />{h}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-l-4 border-l-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Crosshair className="h-4 w-4 text-amber-500" /> ATT&CK Kill Chain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {KILL_CHAIN.map((phase) => {
                const active = activeTactics.has(phase.id);
                return (
                  <div key={phase.id} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${active ? "bg-red-500/15 text-red-400 font-semibold border border-red-500/20" : "text-muted-foreground"}`}>
                    <div className={`h-2 w-2 rounded-full shrink-0 ${active ? "bg-red-500" : "bg-muted-foreground/30"}`} style={active ? { boxShadow: "0 0 6px rgba(239,68,68,0.5)" } : undefined} />
                    <span className="flex-1">{phase.phase}</span>
                    <span className="font-mono text-[9px] opacity-60">{phase.id}</span>
                    {active && <AlertTriangle className="h-3 w-3 text-red-500" />}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground text-center">{activeTactics.size} of {KILL_CHAIN.length} phases detected</p>
          </CardContent>
        </Card>
      </div>

      {/* ── IOCs + Response Actions + SLA ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5 border-l-4 border-l-purple-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Fingerprint className="h-4 w-4 text-purple-500" /> Extracted IOCs
              <Badge variant="outline" className="text-[10px] ml-auto">{iocs.length} indicators</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {iocs.map((ioc, i) => {
                const Icon = IOC_ICONS[ioc.icon] ?? Fingerprint;
                const confColor = ioc.confidence >= 0.9 ? "text-emerald-500" : ioc.confidence >= 0.7 ? "text-amber-500" : "text-zinc-400";
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">{ioc.type}</span>
                    <span className="font-mono text-[11px] flex-1 truncate">{ioc.value}</span>
                    <span className={`tabular-nums text-[10px] font-semibold ${confColor}`}>{(ioc.confidence * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-l-4 border-l-red-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Shield className="h-4 w-4 text-red-500" /> Response Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {RESPONSE_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.label} className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:scale-[1.02] hover:shadow-md ${action.bg}`}
                    onClick={() => toast.info(`${action.label} initiated`, { description: `${action.desc} for ${investigation.id}` })}>
                    <Icon className={`h-4 w-4 ${action.color}`} />
                    <span className="text-[10px] font-medium leading-tight">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-l-4 border-l-teal-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <Timer className="h-4 w-4 text-teal-500" /> Case Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Time Open</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${hoursOpen > 72 ? "text-red-500" : hoursOpen > 24 ? "text-amber-500" : "text-emerald-500"}`}>
                {hoursOpen < 24 ? `${hoursOpen}h` : `${Math.round(hoursOpen / 24)}d ${hoursOpen % 24}h`}
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${hoursOpen > 72 ? "bg-red-500" : hoursOpen > 24 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (hoursOpen / 96) * 100)}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">SLA: 96h target</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: investigation.hosts.length, lbl: "Hosts" },
                { val: investigation.users.length, lbl: "Users" },
                { val: investigation.tags.length, lbl: "TTPs" },
                { val: activeTactics.size, lbl: "Tactics" },
              ].map((m) => (
                <div key={m.lbl} className="rounded-md border p-2 text-center">
                  <p className="text-lg font-bold tabular-nums">{m.val}</p>
                  <p className="text-[9px] text-muted-foreground">{m.lbl}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── AI Investigation Timeline ── */}
      <Card className="border-l-4 border-l-blue-500/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
            <Clock className="h-4 w-4 text-blue-500" /> AI Investigation Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-3">
              {MOCK_TIMELINE.map((item, idx) => (
                <div key={idx} className="relative flex gap-3 pl-0">
                  <div className="relative z-10 mt-1.5">
                    <div className={`h-3.5 w-3.5 rounded-full border-2 bg-card ${AGENT_COLORS[item.agent] ?? "border-zinc-400"}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-[10px] text-muted-foreground">{item.time}</p>
                    <p className="text-xs leading-relaxed">{item.event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Attack Graph (Collapsible) ── */}
      <div>
        <button onClick={() => setGraphOpen(!graphOpen)} className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Network className="h-4 w-4 text-primary" /> Attack Graph — {investigation.id}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {graphOpen ? "Collapse" : "Expand"}
            {graphOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {graphOpen && <div className="mt-2"><InvestigationGraph investigation={investigation} /></div>}
      </div>

      {/* ── Evidence + Related Cases + Notes ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-l-4 border-l-emerald-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <PackageOpen className="h-4 w-4 text-emerald-500" /> Evidence Locker
              <Badge variant="outline" className="text-[10px] ml-auto">{evidence.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {evidence.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2 rounded-md border p-2.5 text-xs hover:bg-muted/30 transition-colors cursor-pointer">
                  <div className="rounded-md bg-emerald-500/10 p-1.5"><Icon className="h-3.5 w-3.5 text-emerald-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.size}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full mt-2 gap-1 text-xs" onClick={() => toast.info("Evidence collection queued")}>
              <PackageOpen className="h-3.5 w-3.5" /> Upload Evidence
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <LinkIcon className="h-4 w-4 text-violet-500" /> Related Cases
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {related.map((rel) => (
              <Link key={rel.id} href={`/investigations/${rel.id}`} className="flex items-start gap-2 rounded-md border p-2.5 text-xs hover:bg-muted/30 transition-colors">
                <Badge variant={SEVERITY_VARIANT[rel.severity] ?? "info"} className="text-[9px] shrink-0 mt-0.5">{severityLabel(rel.severity)}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{rel.title}</p>
                  <p className="text-[10px] text-muted-foreground">{rel.id} · {rel.status}</p>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{(rel.similarity * 100).toFixed(0)}%</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-zinc-400/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <StickyNote className="h-4 w-4 text-zinc-400" /> Analyst Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Add investigation notes, observations, or contextual information..."
              className="w-full h-32 rounded-md border bg-transparent px-3 py-2 text-xs leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-muted-foreground">{notes.length} chars</p>
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => { if (notes.trim()) toast.success("Notes saved", { description: `${notes.length} chars saved` }); }}>
                <FileText className="h-3 w-3" /> Save Notes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
