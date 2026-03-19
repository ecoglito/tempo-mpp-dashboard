"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { PaymentCard } from "./PaymentCard";
import { StatsRow } from "./StatsRow";
import type { ChainStats } from "@/lib/tempo";

function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="relative">
        <div className="w-16 h-16 border-2 border-zinc-700 rounded-full" />
        <div className="w-16 h-16 border-2 border-t-violet-500 rounded-full animate-spin absolute inset-0" />
      </div>
      <div className="text-center">
        <p className="text-zinc-400 text-lg">Connecting to Tempo...</p>
        <p className="text-zinc-600 text-sm mt-1">
          Fetching real-time chain data
        </p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-5xl">⚠️</div>
      <div className="text-center">
        <p className="text-zinc-400 text-lg">
          Unable to connect to Tempo RPC
        </p>
        <p className="text-zinc-600 text-sm mt-1">
          The chain might be experiencing high load
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
      >
        Retry Connection
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
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus("loading");

    // Try SSE first, fall back to polling
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
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      // Fall back to polling
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
  if (status === "error" || !stats)
    return <ErrorState onRetry={connect} />;

  const ratio = stats.humanToMachineRatio;

  return (
    <div className="space-y-8">
      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2">
        <PulsingDot />
        <span className="text-xs text-zinc-500 uppercase tracking-widest">
          Live · Block #{stats.currentBlock.toLocaleString()}
        </span>
      </div>

      {/* Main cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PaymentCard
          icon="🚶"
          label="Human Payments"
          rate={stats.humanTxsPerSecond}
          gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
          borderColor="border-blue-500/20"
          glowColor="rgba(59, 130, 246, 0.15)"
        />
        <PaymentCard
          icon="🤖"
          label="Machine Payments"
          rate={stats.machineTxsPerSecond}
          gradient="bg-gradient-to-br from-violet-500 to-fuchsia-500"
          borderColor="border-violet-500/20"
          glowColor="rgba(139, 92, 246, 0.15)"
        />
      </div>

      {/* Stats row */}
      <StatsRow
        stats={[
          {
            label: "Total Tempo Txs (24h)",
            value: stats.totalTxs24h,
            format: "number",
          },
          {
            label: "Volume (24h)",
            value: stats.volume24h,
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
        <div className="text-center">
          <p className="text-zinc-500 text-sm">
            For every{" "}
            <span className="text-violet-400 font-semibold">
              1 machine payment
            </span>
            , there are approximately{" "}
            <span className="text-blue-400 font-semibold">
              {ratio} human payments
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
