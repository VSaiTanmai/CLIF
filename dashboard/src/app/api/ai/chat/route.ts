import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8200";

/**
 * POST /api/ai/chat — Chat with CLIF AI assistant (Ollama qwen model)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${AI_SERVICE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65000), // 65s — LLM can be slow
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI service error: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Chat request failed", response: "Sorry, the AI service is currently unavailable. Please try again later." },
      { status: 500 },
    );
  }
}
