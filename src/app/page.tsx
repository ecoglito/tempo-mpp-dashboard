import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="pt-12 pb-6 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
            TempoMPP
          </span>
        </h1>
        <p className="mt-3 text-zinc-500 text-lg max-w-xl mx-auto">
          Autonomous agents deserve autonomous payments.
        </p>
      </header>

      {/* Dashboard */}
      <div className="flex-1 px-4 md:px-8 max-w-5xl mx-auto w-full pb-12">
        <Dashboard />
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t border-zinc-800/50 space-y-2">
        <p className="text-xs text-zinc-600">
          Data from{" "}
          <a
            href="https://explore.tempo.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-400 transition-colors underline underline-offset-2"
          >
            explore.tempo.xyz
          </a>{" "}
          · Powered by the{" "}
          <a
            href="https://mpp.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-400 transition-colors underline underline-offset-2"
          >
            MPP protocol
          </a>{" "}
          · Built by{" "}
          <a
            href="https://gte.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-400 transition-colors underline underline-offset-2"
          >
            GTE
          </a>
        </p>
        <p className="text-[10px] text-zinc-700">
          Machine payments detected via TIP-20 micropayment heuristic (≤$1 transfers)
        </p>
      </footer>
    </main>
  );
}
