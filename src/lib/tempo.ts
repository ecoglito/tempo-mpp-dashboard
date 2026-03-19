import { createPublicClient, http, defineChain } from "viem";

export const tempo = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.TEMPO_RPC_URL || "https://rpc.tempo.xyz"],
      webSocket: ["wss://rpc.tempo.xyz"],
    },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
});

export function getClient() {
  return createPublicClient({
    chain: tempo,
    transport: http(process.env.TEMPO_RPC_URL || "https://rpc.tempo.xyz"),
  });
}

export interface BlockData {
  number: bigint;
  timestamp: bigint;
  transactions: `0x${string}`[] | object[];
}

export interface ChainStats {
  currentBlock: number;
  totalTxs24h: number;
  blocksPerSecond: number;
  txsPerSecond: number;
  humanTxsPerSecond: number;
  machineTxsPerSecond: number;
  volume24h: number;
  activeAgents: number;
  activeServices: number;
  humanToMachineRatio: number;
  timestamp: number;
}

// Fetch recent blocks and compute stats
export async function fetchChainStats(): Promise<ChainStats> {
  const client = getClient();

  try {
    const currentBlockNumber = await client.getBlockNumber();

    // Fetch last ~60 blocks for rate calculations (~2 minutes of data)
    const blocksToFetch = 60;
    const startBlock =
      currentBlockNumber - BigInt(blocksToFetch) > 0n
        ? currentBlockNumber - BigInt(blocksToFetch)
        : 0n;

    const [latestBlock, earlierBlock] = await Promise.all([
      client.getBlock({ blockNumber: currentBlockNumber }),
      client.getBlock({ blockNumber: startBlock }),
    ]);

    const timeDelta =
      Number(latestBlock.timestamp - earlierBlock.timestamp) || 1;
    const blockDelta = Number(currentBlockNumber - startBlock) || 1;
    const blocksPerSecond = blockDelta / timeDelta;

    // Sample recent blocks for tx count (fetch 10 evenly spaced)
    const sampleSize = 10;
    const step = Math.max(1, Math.floor(blockDelta / sampleSize));
    const sampleBlocks = await Promise.all(
      Array.from({ length: sampleSize }, (_, i) => {
        const bn = startBlock + BigInt(i * step);
        return client
          .getBlock({ blockNumber: bn > currentBlockNumber ? currentBlockNumber : bn })
          .catch(() => null);
      })
    );

    const validBlocks = sampleBlocks.filter(
      (b): b is NonNullable<typeof b> => b !== null
    );
    const avgTxPerBlock =
      validBlocks.length > 0
        ? validBlocks.reduce((sum, b) => sum + b.transactions.length, 0) /
          validBlocks.length
        : 0;

    const txsPerSecond = avgTxPerBlock * blocksPerSecond;

    // Day 1 of mainnet — simulate MPP vs human split
    // Architecture: replace this ratio with real indexer data later
    const MPP_RATIO = 0.15; // ~15% machine payments on day 1, will grow
    const machineTxsPerSecond = txsPerSecond * MPP_RATIO;
    const humanTxsPerSecond = txsPerSecond * (1 - MPP_RATIO);
    const humanToMachineRatio =
      machineTxsPerSecond > 0
        ? humanTxsPerSecond / machineTxsPerSecond
        : 0;

    // Estimate 24h totals
    const totalTxs24h = Math.round(txsPerSecond * 86400);
    // Rough avg tx value in USD for stablecoin chain
    const avgTxValue = 12.5;
    const volume24h = totalTxs24h * avgTxValue;

    // Simulated unique agents/services (will come from indexer later)
    const activeAgents = Math.max(
      10,
      Math.round(machineTxsPerSecond * 200 + Math.random() * 20)
    );
    const activeServices = Math.max(
      5,
      Math.round(machineTxsPerSecond * 80 + Math.random() * 10)
    );

    return {
      currentBlock: Number(currentBlockNumber),
      totalTxs24h,
      blocksPerSecond,
      txsPerSecond,
      humanTxsPerSecond,
      machineTxsPerSecond,
      volume24h,
      activeAgents,
      activeServices,
      humanToMachineRatio: Math.round(humanToMachineRatio * 10) / 10,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Failed to fetch chain stats:", error);
    // Return fallback data so the UI doesn't break
    return {
      currentBlock: 0,
      totalTxs24h: 0,
      blocksPerSecond: 0,
      txsPerSecond: 0,
      humanTxsPerSecond: 0,
      machineTxsPerSecond: 0,
      volume24h: 0,
      activeAgents: 0,
      activeServices: 0,
      humanToMachineRatio: 0,
      timestamp: Date.now(),
    };
  }
}
