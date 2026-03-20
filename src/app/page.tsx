import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="pt-16 pb-8 px-4 text-center">
        <p className="text-xs tracking-[0.3em] uppercase text-[#999] mb-6">
          Tempo × MPP
        </p>
        <h1 className="font-serif text-5xl md:text-7xl font-light tracking-tight text-black leading-[1.1]">
          Machine
          <br />
          Payments
        </h1>
        <p className="mt-6 text-[#666] text-base max-w-md mx-auto leading-relaxed">
          Autonomous agents deserve autonomous payments.
        </p>
      </header>

      {/* Dashboard */}
      <div className="flex-1 px-4 md:px-8 max-w-4xl mx-auto w-full pb-16">
        <Dashboard />
      </div>

      {/* Footer */}
      <footer className="py-10 px-4 text-center border-t border-[#e0e0e0]">
        <p className="text-xs text-[#999] leading-relaxed">
          Data from{" "}
          <a
            href="https://explore.tempo.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#666] hover:text-black transition-colors underline underline-offset-2"
          >
            explore.tempo.xyz
          </a>
          {" · "}
          Powered by the{" "}
          <a
            href="https://mpp.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#666] hover:text-black transition-colors underline underline-offset-2"
          >
            MPP protocol
          </a>
          {" · "}
          Built by{" "}
          <a
            href="https://gte.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#666] hover:text-black transition-colors underline underline-offset-2"
          >
            GTE
          </a>
        </p>
        <p className="text-[10px] text-[#bbb] mt-3">
          Machine payments detected via MPP escrow contract activity on Tempo mainnet
        </p>
      </footer>
    </main>
  );
}
