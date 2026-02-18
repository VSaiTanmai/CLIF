import { NextResponse } from "next/server";
import { DEMO_MODE, demoAiLeaderboard } from "@/lib/demo-data";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8200";

/**
 * GET /api/ai/leaderboard — Get the ML model training leaderboard
 */
export async function GET() {
  /* ── Demo mode — instant response ── */
  if (DEMO_MODE) return NextResponse.json(demoAiLeaderboard());

  try {
    const res = await fetch(`${AI_SERVICE_URL}/model/leaderboard`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({
      error: e.message || "AI service unreachable",
    }, { status: 503 });
  }
}
