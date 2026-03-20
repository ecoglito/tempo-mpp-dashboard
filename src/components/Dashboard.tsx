"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { PaymentCard } from "./PaymentCard";
import { StatsRow } from "./StatsRow";
import type { ChainStats } from "@/lib/tempo";

function PulsingDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-30" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-black" />
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
      <div className="relative">
        <div className="w-12 h-12 border border-[#e0e0e0] rounded-full" />
        <div className="w-12 h-12 border border-t-black rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-center">
        <p className="text-[#666] text-sm">Connecting to Tempo...</p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
      <div className="text-center">
        <p className="text-[#666] text-sm">Unable to connect to Tempo RPC</p>
      </div>
      <button
        onClick={onRetry}
        className="px-6 py-2 rounded-sm bg-black text-white text-xs uppercase tracking-[0.15em] hover:bg-[#333] transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">(
    "loading"
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus("loading");

    const es = new EventSource("/api/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ChainStats & { error?: string };
        if (!data.error) {
          setStats(data);
          setStatus("connected");
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      es.close();
      fetchWithPolling();
    };
  }, []);

  const fetchWithPolling = useCallback(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
          setStatus("connected");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  if (status === "loading") return <LoadingState />;
  if (status === "error" || !stats) return <ErrorState onRetry={connect} />;

  const ratio = stats.humanToMachineRatio;

  return (
    <div className="space-y-8">
      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2">
        <PulsingDot />
        <span className="text-[10px] text-[#999] uppercase tracking-[0.2em]">
          Live · Block #{stats.currentBlock.toLocaleString()}
        </span>
      </div>

      {/* Main cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PaymentCard
          icon="🤖"
          label="Machine Payments"
          rate={stats.machineTxsPerSecond}
        />
        <PaymentCard
          icon="🚶"
          label="Human Payments"
          rate={stats.humanTxsPerSecond}
        />
      </div>

      {/* Stats row */}
      <StatsRow
        stats={[
          {
            label: "MPP Txs (24h)",
            value: Math.round(stats.machineTxsPerSecond * 86400),
            format: "number",
          },
          {
            label: "MPP Volume (24h)",
            value: stats.machineVolume24h,
            format: "usd",
          },
          {
            label: "Active Agents",
            value: stats.activeAgents,
            format: "number",
          },
          {
            label: "Active Services",
            value: stats.activeServices,
            format: "number",
          },
        ]}
      />

      {/* Ratio */}
      {ratio > 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-[#666] leading-relaxed">
            For every{" "}
            <span className="text-black font-medium">1 machine payment</span>,
            there are approximately{" "}
            <span className="text-black font-medium">
              {ratio.toLocaleString()} human payments
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
