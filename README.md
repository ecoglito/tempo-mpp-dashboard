# TempoMPP Dashboard

Real-time dashboard tracking machine-to-machine payments on the **Tempo blockchain** via the **Machine Payments Protocol (MPP)**.

> The machine economy is being built. Watch it happen.

## What is this?

A live pulse dashboard showing the state of agentic payments on Tempo — the EVM-compatible blockchain built by Stripe + Paradigm for stablecoin payments.

**Features:**
- 🔴 Real-time animated counters for human vs machine payments
- 📊 24h transaction volume, active agents, and active services
- ⚡ Server-Sent Events for live data streaming
- 🌑 Dark theme with smooth animations
- 📱 Fully responsive

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **viem** — EVM client for Tempo RPC
- **Framer Motion** — Smooth counter animations
- **SSE** — Real-time data streaming

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPO_RPC_URL` | `https://rpc.tempo.xyz` | Tempo blockchain RPC endpoint |
| `MPP_THRESHOLD_USD` | `1` | Transfers ≤ this amount classified as MPP micropayments |

## Architecture

### Data Flow
1. Next.js API routes query the Tempo RPC for block data
2. Stats are computed from recent blocks (tx count, block rate, etc.)
3. SSE endpoint streams updates to the client every 3 seconds
4. Client-side animated counters interpolate between updates

### MPP Classification
Machine payments are detected by analyzing TIP-20 stablecoin transfer events on-chain. Transfers ≤ $1 (configurable via `MPP_THRESHOLD_USD`) are classified as MPP micropayments — this matches MPP's design where agents pay $0.001-$0.10 per API call. Unique senders/receivers in the micropayment range are counted as active agents/services. The architecture supports swapping in a dedicated MPP indexer when one becomes available.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/tempo-mpp-dashboard)

```bash
npx vercel
```

No special configuration needed — works out of the box on Vercel.

## Tempo Chain Details

- **Chain ID:** 4217
- **RPC:** https://rpc.tempo.xyz
- **WebSocket:** wss://rpc.tempo.xyz
- **Explorer:** https://explore.tempo.xyz
- **Currency:** USD (stablecoins)
- **MPP Docs:** https://mpp.dev

## License

MIT
