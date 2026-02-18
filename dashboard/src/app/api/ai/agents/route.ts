import { NextResponse } from "next/server";
import { DEMO_MODE, demoAiAgents } from "@/lib/demo-data";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8200";

/**
 * GET /api/ai/agents — Get status of all AI agents + recent investigations
 */
export async function GET() {
  /* ── Demo mode — instant response ── */
  if (DEMO_MODE) return NextResponse.json(demoAiAgents());

  try {
    const [statusRes, invRes] = await Promise.all([
      fetch(`${AI_SERVICE_URL}/agents/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${AI_SERVICE_URL}/agents/investigations?limit=20`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (!statusRes.ok) throw new Error(`Agent status: ${statusRes.status}`);

    const status = await statusRes.json();
    const investigations = invRes.ok ? await invRes.json() : { investigations: [] };

    return NextResponse.json({
      ...status,
      investigations: investigations.investigations ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        agents: [],
        total_agents: 0,
        investigations: [],
        error: e.message || "AI service unreachable",
      },
      { status: 503 },
    );
  }
}
