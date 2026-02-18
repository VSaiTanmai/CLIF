"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Shield,
  BrainCircuit,
  ExternalLink,
  Copy,
  MessageSquare,
  Eye,
  Loader2,
  Send,
  FileText,
  Crosshair,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
export interface LogEventData {
  event_id?: string;
  timestamp?: string;
  severity?: number;
  category?: string;
  description?: string;
  hostname?: string;
  ip_address?: string;
  source_ip?: string;
  log_source?: string;
  raw?: string;
  event_type?: string;
  investigation_id?: string;
  [key: string]: unknown;
}

interface LogContextMenuProps {
  event: LogEventData;
  /** Position to render the menu (page coordinates) */
  position: { x: number; y: number };
  onClose: () => void;
  /** If the event already has an investigation, pass its ID */
  investigationId?: string;
}

/* ── Menu Item ── */
function MenuItem({
  icon: Icon,
  label,
  description,
  onClick,
  loading,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "default" | "primary" | "danger";
}) {
  const colors = {
    default: "hover:bg-muted/50",
    primary: "hover:bg-primary/5 text-primary",
    danger: "hover:bg-red-500/5 text-red-600",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${colors[variant]} disabled:opacity-50`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-xs">{label}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   LogContextMenu Component
   ══════════════════════════════════════════════════════════════ */
export function LogContextMenu({
  event,
  position,
  onClose,
  investigationId,
}: LogContextMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [investigating, setInvestigating] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const [adjustedPos, setAdjustedPos] = useState(position);
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > vw - 16) x = vw - rect.width - 16;
    if (y + rect.height > vh - 16) y = vh - rect.height - 16;
    if (x < 16) x = 16;
    if (y < 16) y = 16;
    setAdjustedPos({ x, y });
  }, [position]);

  /* ── Actions ── */
  const handleInvestigate = useCallback(async () => {
    setInvestigating(true);
    try {
      // Determine mode based on event content
      let mode = "features";
      if (event.log_source || event.event_type || event.raw) {
        mode = "generic";
      }

      const res = await fetch("/api/ai/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, mode }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const invId = data.investigation_id;

      toast.success("Investigation started", {
        description: `${data.triage?.category ?? "Event"} — ${data.triage?.priority ?? "P5"}`,
        action: {
          label: "View",
          onClick: () => router.push(`/investigations/live/${invId}`),
        },
      });

      onClose();
      router.push(`/investigations/live/${invId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Investigation failed", { description: msg });
    } finally {
      setInvestigating(false);
    }
  }, [event, router, onClose]);

  const handleCopy = useCallback(() => {
    const text = event.raw ?? JSON.stringify(event, null, 2);
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
    onClose();
  }, [event, onClose]);

  const handleChatAbout = useCallback(() => {
    // Navigate to chat page with context in URL state
    const context = encodeURIComponent(
      JSON.stringify({
        event_type: event.event_type ?? event.category ?? "Security Event",
        severity: event.severity,
        hostname: event.hostname,
        ip: event.ip_address ?? event.source_ip,
        description: event.description ?? event.raw?.slice(0, 200),
      }),
    );
    router.push(`/chat?context=${context}`);
    onClose();
  }, [event, router, onClose]);

  const handleViewXAI = useCallback(() => {
    router.push("/explainability");
    onClose();
  }, [router, onClose]);

  const handleViewInvestigation = useCallback(() => {
    if (investigationId) {
      router.push(`/investigations/live/${investigationId}`);
      onClose();
    }
  }, [investigationId, router, onClose]);

  const handleSearch = useCallback(() => {
    const query = event.hostname ?? event.ip_address ?? event.source_ip ?? "";
    router.push(`/search?q=${encodeURIComponent(query)}`);
    onClose();
  }, [event, router, onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-64 rounded-lg border bg-card shadow-lg"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Header */}
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold truncate">
          {event.event_type ?? event.category ?? "Security Event"}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {event.hostname ?? event.ip_address ?? event.source_ip ?? "Unknown source"}
          {event.timestamp
            ? ` · ${new Date(event.timestamp).toLocaleTimeString()}`
            : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="p-1.5 space-y-0.5">
        {/* If investigation exists → View Investigation */}
        {investigationId ? (
          <MenuItem
            icon={FileText}
            label="View Investigation"
            description={`Open investigation ${investigationId.slice(0, 8)}…`}
            onClick={handleViewInvestigation}
            variant="primary"
          />
        ) : (
          <MenuItem
            icon={Send}
            label="Send to Investigation"
            description="Run full 4-agent pipeline"
            onClick={handleInvestigate}
            loading={investigating}
            variant="primary"
          />
        )}

        <div className="my-1 h-px bg-border" />

        <MenuItem
          icon={MessageSquare}
          label="Ask CLIF AI"
          description="Chat about this event"
          onClick={handleChatAbout}
        />
        <MenuItem
          icon={BrainCircuit}
          label="View XAI / SHAP"
          description="Explain ML classification"
          onClick={handleViewXAI}
        />
        <MenuItem
          icon={Search}
          label="Search Related"
          description={`Find events from ${event.hostname ?? event.ip_address ?? "source"}`}
          onClick={handleSearch}
        />

        <div className="my-1 h-px bg-border" />

        <MenuItem
          icon={Copy}
          label="Copy Event"
          description="Copy raw event to clipboard"
          onClick={handleCopy}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Hook: useLogContextMenu
   Use this in any page to add context menu support to log rows.
   ══════════════════════════════════════════════════════════════ */
export function useLogContextMenu() {
  const [menuState, setMenuState] = useState<{
    event: LogEventData;
    position: { x: number; y: number };
    investigationId?: string;
  } | null>(null);

  const openMenu = useCallback(
    (
      e: React.MouseEvent,
      event: LogEventData,
      investigationId?: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuState({
        event,
        position: { x: e.clientX, y: e.clientY },
        investigationId,
      });
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const ContextMenuPortal = menuState ? (
    <LogContextMenu
      event={menuState.event}
      position={menuState.position}
      onClose={closeMenu}
      investigationId={menuState.investigationId}
    />
  ) : null;

  return { openMenu, closeMenu, ContextMenuPortal };
}
