"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface DataPoint {
  date: string;
  val: number | null;
}

interface SeriesData {
  mpp: DataPoint[];
  x402: DataPoint[];
}

type Period = "1W" | "1M" | "ALL";

interface ChartConfig {
  metric: string;
  title: string;
  formatValue: (n: number) => string;
  defaultPeriod: Period;
}

const CHARTS: ChartConfig[] = [
  {
    metric: "CUMULATIVE_SELLERS",
    title: "Cumulative Sellers",
    formatValue: formatCount,
    defaultPeriod: "ALL",
  },
  {
    metric: "REAL_TXNS",
    title: "Real Transactions",
    formatValue: formatCount,
    defaultPeriod: "1M",
  },
  {
    metric: "REAL_VOLUME",
    title: "Real Volume",
    formatValue: formatUSD,
    defaultPeriod: "1M",
  },
  {
    metric: "PERCENT_GAMED_TXNS",
    title: "% Gamed Transactions",
    formatValue: formatPercent,
    defaultPeriod: "1M",
  },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.round(n).toString();
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function formatPercent(n: number): string {
  return n.toFixed(1) + "%";
}

function formatDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function getStartDate(period: Period): string {
  const now = new Date();
  if (period === "1W") {
    now.setDate(now.getDate() - 7);
  } else if (period === "1M") {
    now.setMonth(now.getMonth() - 1);
  } else {
    // ALL — x402 has data from 2025-06-01
    return "2025-06-01";
  }
  return now.toISOString().split("T")[0];
}

function getEndDate(): string {
  return new Date().toISOString().split("T")[0];
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 220;
const PADDING = { top: 20, right: 20, bottom: 40, left: 55 };
const INNER_W = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

interface MergedPoint {
  date: string;
  mpp: number | null;
  x402: number | null;
}

function mergeData(mpp: DataPoint[], x402: DataPoint[]): MergedPoint[] {
  const map = new Map<string, MergedPoint>();

  for (const p of x402) {
    map.set(p.date, { date: p.date, mpp: null, x402: p.val });
  }
  for (const p of mpp) {
    const existing = map.get(p.date);
    if (existing) {
      existing.mpp = p.val;
    } else {
      map.set(p.date, { date: p.date, mpp: p.val, x402: null });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function SingleChart({ config }: { config: ChartConfig }) {
  const [data, setData] = useState<SeriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(config.defaultPeriod);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const startDate = getStartDate(period);
    const endDate = getEndDate();

    fetch(
      `/api/artemis?metric=${config.metric}&startDate=${startDate}&endDate=${endDate}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config.metric, period]);

  const merged = data ? mergeData(data.mpp ?? [], data.x402 ?? []) : [];

  const handleMouseMove = useCallback(
    (
      e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>
    ) => {
      if (merged.length < 2 || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const clientX =
        "touches" in e ? e.touches[0].clientX : e.clientX;
      const svgX = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
      const chartX = svgX - PADDING.left;

      if (chartX < 0 || chartX > INNER_W) {
        setHoverIndex(null);
        return;
      }

      const idx = Math.round((chartX / INNER_W) * (merged.length - 1));
      setHoverIndex(Math.max(0, Math.min(merged.length - 1, idx)));
    },
    [merged]
  );

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  if (loading) {
    return (
      <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-4">
          {config.title}
        </p>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-[#bbb]">Loading...</p>
        </div>
      </div>
    );
  }

  if (merged.length < 2) {
    return (
      <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-4">
          {config.title}
        </p>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-[#bbb]">No data available</p>
        </div>
      </div>
    );
  }

  // Compute scales
  const allVals = merged.flatMap((p) =>
    [p.mpp, p.x402].filter((v): v is number => v !== null)
  );
  const maxVal = Math.max(...allVals, 1);

  const scaleX = (i: number) =>
    PADDING.left + (i / (merged.length - 1)) * INNER_W;
  const scaleY = (v: number) =>
    PADDING.top + INNER_H - (v / maxVal) * INNER_H;

  // Build paths
  function buildPath(
    key: "mpp" | "x402"
  ): { path: string; points: { x: number; y: number; i: number }[] } {
    const pts: { x: number; y: number; i: number }[] = [];
    for (let i = 0; i < merged.length; i++) {
      const v = merged[i][key];
      if (v !== null) {
        pts.push({ x: scaleX(i), y: scaleY(v), i });
      }
    }
    const path = pts
      .map((p, j) => `${j === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    return { path, points: pts };
  }

  const mppLine = buildPath("mpp");
  const x402Line = buildPath("x402");

  // X-axis labels
  const labelCount = Math.min(6, merged.length);
  const xLabels: { i: number; label: string }[] = [];
  for (let j = 0; j < labelCount; j++) {
    const i = Math.round((j / (labelCount - 1)) * (merged.length - 1));
    xLabels.push({ i, label: formatDate(merged[i].date) });
  }

  // Y-axis labels
  const yTicks = 4;
  const yLabels: { val: number; label: string }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxVal / yTicks) * i;
    yLabels.push({ val, label: config.formatValue(val) });
  }

  const hoverPoint = hoverIndex !== null ? merged[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? scaleX(hoverIndex) : 0;

  return (
    <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <p className="text-[10px] text-[#999] uppercase tracking-[0.15em]">
            {config.title}
          </p>
          {/* Legend */}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-3 h-[2px] bg-black inline-block" />
              <span className="text-[9px] text-[#666]">MPP</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-[2px] bg-[#999] inline-block" />
              <span className="text-[9px] text-[#666]">x402</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(["1W", "1M", "ALL"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] rounded-sm transition-colors ${
                period === p
                  ? "bg-black text-white"
                  : "text-[#999] hover:text-black"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Hover values */}
      {hoverPoint && (
        <div className="flex items-center gap-4 mb-2">
          <p className="text-[11px] tabular-nums">
            {hoverPoint.mpp !== null && (
              <span className="text-black font-medium">
                MPP: {config.formatValue(hoverPoint.mpp)}
              </span>
            )}
            {hoverPoint.mpp !== null && hoverPoint.x402 !== null && (
              <span className="text-[#ccc]"> · </span>
            )}
            {hoverPoint.x402 !== null && (
              <span className="text-[#666]">
                x402: {config.formatValue(hoverPoint.x402)}
              </span>
            )}
            <span className="text-[#999] font-normal ml-2">
              {formatDate(hoverPoint.date)}
            </span>
          </p>
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-auto select-none touch-none"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseLeave}
      >
        {/* Grid lines */}
        {yLabels.map(({ val }) => (
          <line
            key={`grid-${val}`}
            x1={PADDING.left}
            y1={scaleY(val)}
            x2={PADDING.left + INNER_W}
            y2={scaleY(val)}
            stroke="#f0f0f0"
            strokeWidth="1"
          />
        ))}

        {/* x402 area fill */}
        {x402Line.points.length > 1 && (
          <path
            d={
              x402Line.path +
              ` L ${scaleX(x402Line.points[x402Line.points.length - 1].i).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)}` +
              ` L ${scaleX(x402Line.points[0].i).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)} Z`
            }
            fill="rgba(153,153,153,0.06)"
          />
        )}

        {/* MPP area fill */}
        {mppLine.points.length > 1 && (
          <path
            d={
              mppLine.path +
              ` L ${scaleX(mppLine.points[mppLine.points.length - 1].i).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)}` +
              ` L ${scaleX(mppLine.points[0].i).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)} Z`
            }
            fill="rgba(0,0,0,0.04)"
          />
        )}

        {/* x402 line */}
        {x402Line.path && (
          <path
            d={x402Line.path}
            fill="none"
            stroke="#999"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* MPP line */}
        {mppLine.path && (
          <path
            d={mppLine.path}
            fill="none"
            stroke="black"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Hover crosshair */}
        {hoverPoint && (
          <line
            x1={hoverX}
            y1={PADDING.top}
            x2={hoverX}
            y2={PADDING.top + INNER_H}
            stroke="#ccc"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}

        {/* Hover dots */}
        {hoverPoint && hoverPoint.mpp !== null && (
          <circle
            cx={hoverX}
            cy={scaleY(hoverPoint.mpp)}
            r={4}
            fill="black"
            stroke="white"
            strokeWidth={2}
          />
        )}
        {hoverPoint && hoverPoint.x402 !== null && (
          <circle
            cx={hoverX}
            cy={scaleY(hoverPoint.x402)}
            r={4}
            fill="#999"
            stroke="white"
            strokeWidth={2}
          />
        )}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => {
          const x = scaleX(i);
          const tooClose = hoverPoint && Math.abs(x - hoverX) < 35;
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={PADDING.top + INNER_H + 20}
              textAnchor="middle"
              fill="#999"
              fontSize="9"
              fontFamily="Inter, sans-serif"
              opacity={tooClose ? 0 : 1}
            >
              {label}
            </text>
          );
        })}

        {/* Y-axis labels */}
        {yLabels.map(({ val, label }) => {
          const y = scaleY(val);
          const tooClose =
            hoverPoint &&
            (hoverPoint.mpp !== null
              ? Math.abs(y - scaleY(hoverPoint.mpp)) < 12
              : false);
          return (
            <text
              key={`y-${val}`}
              x={PADDING.left - 8}
              y={y + 3}
              textAnchor="end"
              fill="#999"
              fontSize="9"
              fontFamily="Inter, sans-serif"
              opacity={tooClose ? 0 : 1}
            >
              {label}
            </text>
          );
        })}

        {/* Axis lines */}
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + INNER_H}
          stroke="#e0e0e0"
          strokeWidth="1"
        />
        <line
          x1={PADDING.left}
          y1={PADDING.top + INNER_H}
          x2={PADDING.left + INNER_W}
          y2={PADDING.top + INNER_H}
          stroke="#e0e0e0"
          strokeWidth="1"
        />

        {/* Hit area */}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          style={{ cursor: "crosshair" }}
        />
      </svg>
    </div>
  );
}

export function ArtemisCharts() {
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="text-center pt-4">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.3em] mb-2">
          Powered by Artemis
        </p>
        <h2 className="font-serif text-2xl md:text-3xl font-light tracking-tight text-black">
          Agentic Payments — Supply Side
        </h2>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {CHARTS.map((config) => (
          <SingleChart key={config.metric} config={config} />
        ))}
      </div>
    </div>
  );
}
