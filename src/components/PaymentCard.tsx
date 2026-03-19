"use client";

import { LiveCounter } from "./AnimatedCounter";
import { formatRate } from "@/lib/format";

interface PaymentCardProps {
  icon: string;
  label: string;
  rate: number;
}

export function PaymentCard({ icon, label, rate }: PaymentCardProps) {
  return (
    <div className="bg-white rounded-sm border border-[#e0e0e0] p-8 flex flex-col items-center text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <h2 className="text-xs tracking-[0.2em] uppercase text-[#999] mb-6">
        {label}
      </h2>

      {/* Rate */}
      <div>
        <div className="font-serif text-5xl font-light text-black tabular-nums tracking-tight">
          {formatRate(rate)}
        </div>
        <p className="text-xs text-[#999] mt-2 tracking-wide">
          payments / sec
        </p>
      </div>

      {/* Live counter */}
      <div className="mt-6 pt-6 border-t border-[#e0e0e0] w-full">
        <p className="text-[10px] text-[#bbb] uppercase tracking-[0.15em] mb-2">
          Since you opened this page
        </p>
        <div className="font-serif text-3xl font-light text-black tabular-nums">
          <LiveCounter rate={rate} />
        </div>
      </div>
    </div>
  );
}
