import { NextResponse } from "next/server";
import { fetchHistoricalData } from "@/lib/tempo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const history = await fetchHistoricalData();
    return NextResponse.json(history);
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch historical data", points: [], mppTxs24h: 0, mppVolume24h: 0 },
      { status: 500 }
    );
  }
}
