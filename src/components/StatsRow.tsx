"use client";

import { AnimatedCounter } from "./AnimatedCounter";
import { formatNumber, formatUSD } from "@/lib/format";

interface Stat {
  label: string;
  value: number;
  format: "number" | "usd";
}

interface StatsRowProps {
  stats: Stat[];
}

export function StatsRow({ stats }: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-5 text-center"
        >
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            {stat.label}
          </p>
          <div className="text-2xl font-bold text-white tabular-nums">
            {stat.format === "usd" ? (
              <AnimatedCounter
                value={stat.value}
                prefix="$"
                className="tabular-nums"
              />
            ) : (
              <AnimatedCounter value={stat.value} className="tabular-nums" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
