"use client";

import { AnimatedCounter, LiveCounter } from "./AnimatedCounter";
import { formatRate } from "@/lib/format";

interface PaymentCardProps {
  icon: string;
  label: string;
  rate: number; // txs per second
  gradient: string;
  borderColor: string;
  glowColor: string;
}

export function PaymentCard({
  icon,
  label,
  rate,
  gradient,
  borderColor,
  glowColor,
}: PaymentCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-zinc-900/80 backdrop-blur-sm p-8 flex flex-col items-center text-center transition-all duration-300 hover:scale-[1.02]`}
      style={{
        boxShadow: `0 0 60px -12px ${glowColor}`,
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        className={`absolute inset-0 opacity-5 ${gradient}`}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center gap-4 w-full">
        <span className="text-5xl">{icon}</span>
        <h2 className="text-xl font-semibold text-zinc-200">{label}</h2>

        {/* Rate */}
        <div className="mt-2">
          <div className="text-5xl font-bold text-white tabular-nums tracking-tight">
            {formatRate(rate)}
          </div>
          <p className="text-sm text-zinc-500 mt-1">payments per second</p>
        </div>

        {/* Live counter */}
        <div className="mt-4 pt-4 border-t border-zinc-800 w-full">
          <p className="text-xs text-zinc-500 mb-2">
            Payments since you opened this page
          </p>
          <div className="text-3xl font-bold text-white tabular-nums">
            <LiveCounter rate={rate} />
          </div>
        </div>
      </div>
    </div>
  );
}
