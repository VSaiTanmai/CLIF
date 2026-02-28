import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8200";

/**
 * GET /api/ai/classify — Get AI model info
 * POST /api/ai/classify — Classify a security event
 */
export async function GET() {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/model/info`, { 
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ 
      status: "online",
      ...data,
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "offline",
      error: e.message || "AI service unreachable",
    }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { events, mode = "features" } = body;

    // Single event or batch
    const isBatch = Array.isArray(events) && events.length > 1;
    const endpoint = mode === "clif" 
      ? (isBatch ? "/classify/clif/batch" : "/classify/clif")
      : (isBatch ? "/classify/batch" : "/classify");

    const payload = isBatch 
      ? { events }
      : (Array.isArray(events) ? events[0] : events);

    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI service error: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({
      error: e.message || "Classification failed",
    }, { status: 500 });
  }
}
