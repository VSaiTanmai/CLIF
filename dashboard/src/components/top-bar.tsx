"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, X, ShieldAlert, CheckCheck, Filter, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";

/* ── Types ── */
interface RecentAlert {
  event_id: string;
  timestamp: string;
  severity: number;
  category: string;
  description: string;
  hostname: string;
}

const SEV_LABEL: Record<number, string> = {
  4: "Critical",
  3: "High",
  2: "Medium",
  1: "Low",
  0: "Info",
};
const SEV_VARIANT: Record<number, "critical" | "high" | "medium" | "low" | "info"> = {
  4: "critical",
  3: "high",
  2: "medium",
  1: "low",
  0: "info",
};

const FETCH_TIMEOUT_MS = 15_000;

/* ── Navigation sections ── */
const NAV_SECTIONS = [
  {
    label: "MONITOR",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/live-feed", label: "Live Feed" },
      { href: "/alerts", label: "Alerts" },
    ],
  },
  {
    label: "INVESTIGATE",
    items: [
      { href: "/search", label: "Search" },
      { href: "/investigations", label: "Investigations" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/threat-intel", label: "Threat Intel" },
      { href: "/ai-agents", label: "AI Agents" },
    ],
  },
  {
    label: "EVIDENCE",
    items: [
      { href: "/evidence", label: "Chain of Custody" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/system", label: "System Health" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  /* ── Alert state ── */
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelSevFilter, setPanelSevFilter] = useState<number | null>(null);
  const [panelLimit, setPanelLimit] = useState(10);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Active section detection ── */
  const activeSection = useMemo(() => {
    for (const section of NAV_SECTIONS) {
      if (
        section.items.some(
          (item) =>
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href)),
        )
      ) {
        return section.label;
      }
    }
    return "MONITOR";
  }, [pathname]);

  /* ── Fetch alerts ── */
  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/alerts", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        const recent = (json.alerts ?? []).filter(
          (a: RecentAlert) => a.severity >= 3,
        );
        setAlerts(recent);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [fetchData]);

  const filteredAlerts = useMemo(() => {
    let list = alerts;
    if (panelSevFilter !== null)
      list = list.filter((a) => a.severity === panelSevFilter);
    return list;
  }, [alerts, panelSevFilter]);

  const unreadCount = useMemo(
    () => alerts.filter((a) => !readIds.has(a.event_id)).length,
    [alerts, readIds],
  );

  const markAllRead = useCallback(() => {
    setReadIds(new Set(alerts.map((a) => a.event_id)));
  }, [alerts]);

  /* ── Close panel on click outside ── */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    }
    if (showPanel) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPanel]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && showPanel) setShowPanel(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showPanel]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setSearchQuery("");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-white dark:bg-neutral-900 shadow-sm">
      <div className="flex h-16 items-center justify-between px-6">
        {/* ── Left: Logo + Nav Tabs ── */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="h-3.5 w-3.5 rounded-sm bg-blue-600" />
              <div className="h-3.5 w-3.5 rounded-sm bg-blue-600" />
              <div className="h-3.5 w-3.5 rounded-sm bg-blue-600" />
              <div className="h-3.5 w-3.5 rounded-sm bg-blue-600" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              CLIF
            </span>
          </Link>

          {/* Navigation Tabs */}
          <nav className="flex items-center">
            {NAV_SECTIONS.map((section) => {
              const isActive = activeSection === section.label;
              return (
                <div key={section.label} className="group relative">
                  <Link
                    href={section.items[0].href}
                    className={cn(
                      "inline-flex items-center px-4 py-5 text-sm font-medium transition-colors border-b-2",
                      isActive
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-200 hover:border-gray-300",
                    )}
                  >
                    {section.label}
                  </Link>
                  {/* Dropdown on hover */}
                  <div className="invisible absolute left-0 top-full z-50 pt-0 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                    <div className="min-w-[180px] rounded-lg border bg-white dark:bg-neutral-800 py-1 shadow-lg">
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "block px-4 py-2 text-sm transition-colors",
                            pathname === item.href
                              ? "bg-blue-50 dark:bg-blue-950 font-medium text-blue-600"
                              : "text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700",
                          )}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* ── Right: Search + Bell + User ── */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search events, hosts, users..."
              className="h-9 w-64 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 pl-9 pr-10 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search events"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-neutral-500">
              ⌘K
            </kbd>
          </form>

          {/* Notification Bell */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => {
                setShowPanel((p) => !p);
                setPanelLimit(10);
              }}
              className="relative rounded-lg p-2 text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown panel */}
            {showPanel && (
              <div
                className="absolute right-0 top-12 z-50 w-[420px] rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl"
                role="dialog"
                aria-label="Recent notifications"
              >
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-700 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-semibold text-foreground">
                      Alerts
                    </span>
                    <Badge
                      variant="outline"
                      className="tabular-nums text-[10px]"
                    >
                      {alerts.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-700"
                        onClick={markAllRead}
                      >
                        <CheckCheck className="h-3 w-3" /> Mark all read
                      </button>
                    )}
                    <button
                      className="rounded p-1 text-gray-400 hover:bg-gray-50 dark:hover:bg-neutral-700"
                      onClick={() => setShowPanel(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {/* Severity filter tabs */}
                <div className="flex items-center gap-1 border-b border-gray-100 dark:border-neutral-700 px-4 py-1.5">
                  <Filter className="h-3 w-3 text-gray-400" />
                  {[
                    { label: "All", value: null },
                    { label: "Critical", value: 4 },
                    { label: "High", value: 3 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      className={`rounded-sm px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        panelSevFilter === opt.value
                          ? "bg-gray-100 dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
                          : "text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"
                      }`}
                      onClick={() => {
                        setPanelSevFilter(opt.value);
                        setPanelLimit(10);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                    {filteredAlerts.length} alerts
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-700">
                  {filteredAlerts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">
                      No high-severity alerts
                    </div>
                  ) : (
                    filteredAlerts.slice(0, panelLimit).map((a, i) => {
                      const isRead = readIds.has(a.event_id);
                      return (
                        <div
                          key={a.event_id || i}
                          className={`px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700 ${
                            !isRead ? "border-l-2 border-l-blue-500" : ""
                          }`}
                          onClick={() =>
                            setReadIds((prev) => {
                              const s = new Set(Array.from(prev));
                              s.add(a.event_id);
                              return s;
                            })
                          }
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={SEV_VARIANT[a.severity] ?? "info"}
                              className="text-[9px] shrink-0"
                            >
                              {SEV_LABEL[a.severity] ?? "Info"}
                            </Badge>
                            <span
                              className={`text-xs truncate ${
                                !isRead
                                  ? "font-semibold text-gray-900 dark:text-neutral-100"
                                  : "font-medium text-gray-500 dark:text-neutral-400"
                              }`}
                            >
                              {a.category || "Alert"}
                            </span>
                            <span className="ml-auto whitespace-nowrap text-[10px] text-gray-400">
                              {new Date(a.timestamp).toLocaleTimeString(
                                "en-US",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400 line-clamp-2">
                            {a.description || "Security event detected"}
                          </p>
                          {a.hostname && (
                            <p className="mt-0.5 font-mono text-[10px] text-gray-400">
                              {a.hostname}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-neutral-700 px-4 py-2">
                  <a
                    href="/alerts"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View all alerts →
                  </a>
                  {filteredAlerts.length > panelLimit && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setPanelLimit((p) => p + 20)}
                    >
                      Show more ({filteredAlerts.length - panelLimit} remaining)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* User */}
          <div className="flex items-center gap-2 rounded-lg px-2 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-sm font-semibold text-blue-600 dark:text-blue-400">
              SC
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-foreground">
                Sarah Chen
              </div>
              <div className="text-[11px] text-gray-500 dark:text-neutral-400">SOC Lead</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
