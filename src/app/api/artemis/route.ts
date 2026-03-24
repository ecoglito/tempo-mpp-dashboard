import { NextRequest, NextResponse } from "next/server";

const ARTEMIS_BASE = "https://data-svc.artemisxyz.com/data";
const VALID_METRICS = [
  "CUMULATIVE_SELLERS",
  "REAL_TXNS",
  "REAL_VOLUME",
  "SELLERS",
  "PERCENT_GAMED_TXNS",
];

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(req: NextRequest) {
  const metric = req.nextUrl.searchParams.get("metric");
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");

  if (!metric || !VALID_METRICS.includes(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate required" },
      { status: 400 }
    );
  }

  const cacheKey = `${metric}:${startDate}:${endDate}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const [mppRes, x402Res] = await Promise.all([
      fetch(
        `${ARTEMIS_BASE}/${metric}?symbols=mpp&startDate=${startDate}&endDate=${endDate}`
      ),
      fetch(
        `${ARTEMIS_BASE}/${metric}?symbols=x402&startDate=${startDate}&endDate=${endDate}`
      ),
    ]);

    if (!mppRes.ok || !x402Res.ok) {
      return NextResponse.json(
        { error: "Artemis API error" },
        { status: 502 }
      );
    }

    const mppJson = await mppRes.json();
    const x402Json = await x402Res.json();

    const result = {
      mpp: mppJson?.data?.symbols?.mpp?.[metric] ?? [],
      x402: x402Json?.data?.symbols?.x402?.[metric] ?? [],
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch from Artemis" },
      { status: 502 }
    );
  }
}
