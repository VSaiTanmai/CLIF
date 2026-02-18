import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8200";

/**
 * GET /api/ai/investigations/[id] — Fetch a specific investigation by ID
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const res = await fetch(
      `${AI_SERVICE_URL}/agents/investigations/${params.id}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Investigation not found" },
        { status: 404 },
      );
    }

    if (!res.ok) {
      throw new Error(`AI service error: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to fetch investigation" },
      { status: 500 },
    );
  }
}
