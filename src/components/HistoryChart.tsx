"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
const CHART_HEIGHT = 220;
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

function formatUSD(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

export function HistoryChart() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!data || data.points.length < 2 || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();

      let clientX: number;
      if ("touches" in e) {
        clientX = e.touches[0].clientX;
      } else {
        clientX = e.clientX;
      }

      // Convert screen position to SVG coordinates
      const svgX =
        ((clientX - rect.left) / rect.width) * CHART_WIDTH;
      const chartX = svgX - PADDING.left;

      if (chartX < 0 || chartX > INNER_W) {
        setHoverIndex(null);
        return;
      }

      const points = data.points;
      const minTime = points[0].timestamp;
      const maxTime = points[points.length - 1].timestamp;
      const hoverTime =
        minTime + (chartX / INNER_W) * (maxTime - minTime);

      // Find nearest point
      let nearest = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].timestamp - hoverTime);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      }
      setHoverIndex(nearest);
    },
    [data]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
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

  const scaleX = (ts: number) =>
    PADDING.left + ((ts - minTime) / (maxTime - minTime || 1)) * INNER_W;
  const scaleY = (v: number) =>
    PADDING.top + INNER_H - (v / maxVal) * INNER_H;

  const pathD = points
    .map((p, i) => {
      const x = scaleX(p.timestamp);
      const y = scaleY(p.mppTxCount);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const areaD =
    pathD +
    ` L ${scaleX(maxTime).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)}` +
    ` L ${scaleX(minTime).toFixed(1)} ${(PADDING.top + INNER_H).toFixed(1)} Z`;

  const timeRange = maxTime - minTime;
  const labelInterval =
    timeRange > 0 ? Math.max(timeRange / 5, 3600000) : 3600000;
  const xLabels: { ts: number; label: string }[] = [];
  for (let t = minTime; t <= maxTime; t += labelInterval) {
    xLabels.push({ ts: t, label: formatTime(t) });
  }

  const yTicks = 4;
  const yLabels: { val: number; label: string }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = (maxVal / yTicks) * i;
    yLabels.push({ val, label: Math.round(val).toString() });
  }

  const hoverPoint =
    hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverPoint ? scaleX(hoverPoint.timestamp) : 0;
  const hoverY = hoverPoint ? scaleY(hoverPoint.mppTxCount) : 0;

  return (
    <div className="bg-white rounded-sm border border-[#e0e0e0] p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-[#999] uppercase tracking-[0.15em]">
          MPP Activity (24h)
        </p>
        {hoverPoint && (
          <p className="text-[11px] text-black font-medium tabular-nums">
            {hoverPoint.mppTxCount} txs · {formatUSD(hoverPoint.mppVolume)}{" "}
            <span className="text-[#999] font-normal">
              at {formatTime(hoverPoint.timestamp)}
            </span>
          </p>
        )}
      </div>
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
            r={hoverIndex === i ? 4 : 2}
            fill={hoverIndex === i ? "black" : "black"}
            stroke={hoverIndex === i ? "white" : "none"}
            strokeWidth={hoverIndex === i ? 2 : 0}
          />
        ))}

        {/* Hover crosshair */}
        {hoverPoint && (
          <>
            {/* Vertical line */}
            <line
              x1={hoverX}
              y1={PADDING.top}
              x2={hoverX}
              y2={PADDING.top + INNER_H}
              stroke="#ccc"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            {/* Horizontal line */}
            <line
              x1={PADDING.left}
              y1={hoverY}
              x2={PADDING.left + INNER_W}
              y2={hoverY}
              stroke="#ccc"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            {/* Y-value label */}
            <rect
              x={PADDING.left - 45}
              y={hoverY - 9}
              width={40}
              height={18}
              rx={2}
              fill="black"
            />
            <text
              x={PADDING.left - 25}
              y={hoverY + 4}
              textAnchor="middle"
              fill="white"
              fontSize="9"
              fontFamily="Inter, sans-serif"
              fontWeight="500"
            >
              {hoverPoint.mppTxCount}
            </text>
            {/* Time label */}
            <rect
              x={hoverX - 30}
              y={PADDING.top + INNER_H + 8}
              width={60}
              height={18}
              rx={2}
              fill="black"
            />
            <text
              x={hoverX}
              y={PADDING.top + INNER_H + 20}
              textAnchor="middle"
              fill="white"
              fontSize="8"
              fontFamily="Inter, sans-serif"
              fontWeight="500"
            >
              {formatTime(hoverPoint.timestamp)}
            </text>
          </>
        )}

        {/* X-axis labels (hide when hovering near them) */}
        {xLabels.map(({ ts, label }) => {
          const x = scaleX(ts);
          const tooClose =
            hoverPoint && Math.abs(x - hoverX) < 35;
          return (
            <text
              key={`x-${ts}`}
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

        {/* Y-axis labels (hide when hovering near them) */}
        {yLabels.map(({ val, label }) => {
          const y = scaleY(val);
          const tooClose =
            hoverPoint && Math.abs(y - hoverY) < 12;
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

        {/* Invisible overlay for better touch/mouse hit area */}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={INNER_W}
          height={INNER_H}
          fill="transparent"
          style={{ cursor: "crosshair" }}
        />
      </svg>
      <p className="text-[10px] text-[#bbb] mt-2 text-center">
        MPP escrow transactions per 30-minute window across all TIP-20 stablecoins
      </p>
    </div>
  );
}
