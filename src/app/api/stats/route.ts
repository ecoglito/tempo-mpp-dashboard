import { NextResponse } from "next/server";
import { fetchChainStats } from "@/lib/tempo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const stats = await fetchChainStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chain stats" },
      { status: 500 }
    );
  }
}
