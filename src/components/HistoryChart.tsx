"use client";

import { useEffect, useState } from "react";

interface DataPoint {
  timestamp: number;
  mppTxCount: number;
  mppVolume: number;
}

interface HistoryData {
  points: DataPoint[];
  mppTxs24h: number;
  mppVolume24h: number;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const INNER_W = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function HistoryChart() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/history");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-4">
          MPP Activity (24h)
        </p>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-[#bbb]">Loading historical data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.points.length < 2) {
    return (
      <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-4">
          MPP Activity (24h)
        </p>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-[#bbb]">No historical data available yet</p>
        </div>
      </div>
    );
  }

  const points = data.points;
  const values = points.map((p) => p.mppTxCount);
  const minTime = points[0].timestamp;
  const maxTime = points[points.length - 1].timestamp;
  const maxVal = Math.max(...values, 1);

  // Scale functions
  const scaleX = (ts: number) =>
    PADDING.left + ((ts - minTime) / (maxTime - minTime || 1)) * INNER_W;
  const scaleY = (v: number) =>
    PADDING.top + INNER_H - (v / maxVal) * INNER_H;

  // Build SVG path
  const pathD = points
    .map((p, i) => {
      const x = scaleX(p.timestamp);
      const y = scaleY(p.mppTxCount);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Area fill path
  const areaD =
    pathD +
    ` L ${scaleX(maxTime).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)}` +
    ` L ${scaleX(minTime).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)} Z`;

  // X-axis labels: every ~4-6 hours
  const timeRange = maxTime - minTime;
  const labelInterval = timeRange > 0 ? Math.max(timeRange / 5, 3600000) : 3600000;
  const xLabels: { ts: number; label: string }[] = [];
  for (let t = minTime; t <= maxTime; t += labelInterval) {
    xLabels.push({ ts: t, label: formatTime(t) });
  }

  // Y-axis labels
  const yTicks = 4;
  const yLabels: { val: number; label: string }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxVal / yTicks) * i;
    yLabels.push({ val, label: Math.round(val).toString() });
  }

  return (
    <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
      <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-4">
        MPP Activity (24h)
      </p>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
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

        {/* Area fill */}
        <path d={areaD} fill="rgba(0,0,0,0.04)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="black"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={scaleX(p.timestamp)}
            cy={scaleY(p.mppTxCount)}
            r="2"
            fill="black"
          />
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ ts, label }) => (
          <text
            key={`x-${ts}`}
            x={scaleX(ts)}
            y={PADDING.top + INNER_H + 20}
            textAnchor="middle"
            fill="#999"
            fontSize="9"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        ))}

        {/* Y-axis labels */}
        {yLabels.map(({ val, label }) => (
          <text
            key={`y-${val}`}
            x={PADDING.left - 8}
            y={scaleY(val) + 3}
            textAnchor="end"
            fill="#999"
            fontSize="9"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        ))}

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
      </svg>
      <p className="text-[10px] text-[#bbb] mt-2 text-center">
        MPP escrow transactions per 30-minute window across all TIP-20 stablecoins
      </p>
    </div>
  );
}
