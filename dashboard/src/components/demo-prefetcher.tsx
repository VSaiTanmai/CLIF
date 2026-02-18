"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Prefetch all demo-critical pages & API endpoints on mount.
 * This ensures that navigating between pages during the demo
 * is effectively instant (data already in memory/cache).
 */
const API_ENDPOINTS = [
  "/api/metrics?range=24h",
  "/api/alerts",
  "/api/events/stream",
  "/api/events/search?q=&table=security_events&limit=50&offset=0",
  "/api/system",
  "/api/threat-intel",
  "/api/evidence/chain",
  "/api/reports",
  "/api/ai/agents",
  "/api/ai/classify",
  "/api/ai/leaderboard",
  "/api/ai/xai",
  "/api/lancedb",
];

const PAGE_ROUTES = [
  "/dashboard",
  "/live-feed",
  "/alerts",
  "/search",
  "/ai-agents",
  "/explainability",
  "/chat",
  "/evidence",
  "/reports",
  "/threat-intel",
  "/attack-graph",
  "/system",
  "/settings",
  "/investigations",
];

export function DemoPrefetcher() {
  const router = useRouter();

  useEffect(() => {
    // Prefetch all page routes (Next.js router prefetch)
    PAGE_ROUTES.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {
        // ignore
      }
    });

    // Warm all API caches
    API_ENDPOINTS.forEach((url) => {
      fetch(url, { priority: "low" as RequestPriority }).catch(() => {});
    });
  }, [router]);

  return null;
}
