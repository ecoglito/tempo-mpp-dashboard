"use client";

import { AnimatedCounter } from "./AnimatedCounter";

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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#e0e0e0] border border-[#e0e0e0] rounded-sm overflow-hidden">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white p-5 text-center">
          <p className="text-[10px] text-[#999] uppercase tracking-[0.15em] mb-2">
            {stat.label}
          </p>
          <div className="font-serif text-2xl font-light text-black tabular-nums">
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
