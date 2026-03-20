import {
  createPublicClient,
  http,
  defineChain,
  parseAbiItem,
  formatUnits,
  type Log,
} from "viem";

// All active TIP-20 stablecoins on Tempo
const TEMPO_STABLECOINS = [
  { address: "0x20c0000000000000000000000000000000000000", symbol: "pathUSD", decimals: 6 },
  { address: "0x20c000000000000000000000b9537d11c60e8b50", symbol: "USDC.e", decimals: 6 },
  { address: "0x20c00000000000000000000031d99efa5dbd3713", symbol: "ENSH", decimals: 6 },
  { address: "0x20c000000000000000000000987bef2978df41f9", symbol: "TIMECOIN", decimals: 6 },
  { address: "0x20c000000000000000000000766bc256ae7da3e9", symbol: "TA", decimals: 6 },
] as const;

const TIP20_DECIMALS = 6;

// MPP escrow contract — ALL session payments flow through here
const MPP_ESCROW = "0x33b901018174ddabe4841042ab76ba85d4e24f25";

// Known MPP recipient (Tempo proxy for OpenAI, Anthropic, etc.)
const MPP_RECIPIENT = "0xca4e835f803cb0b7c428222b3a3b98518d4779fe";

// Minimum amount to count — filters out gas fee dust
const MPP_FLOOR = parseFloat(process.env.MPP_FLOOR_USD || "0.001");

// System addresses to exclude (fee collector, DEX router, etc.)
const SYSTEM_ADDRESSES = new Set([
  "0xfeec000000000000000000000000000000000000",
  "0xdec0000000000000000000000000000000000000",
]);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

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

// Global human payment rate (~28,935/sec based on Visa+Mastercard+others)
// Sources: Visa ~65K tps capacity, processes ~7,400 avg; MC ~5,000; others ~16,500
const GLOBAL_HUMAN_PAYMENTS_PER_SEC = 28_935;

export interface ChainStats {
  currentBlock: number;
  totalTempoTxs24h: number;
  blocksPerSecond: number;
  txsPerSecond: number;
  humanTxsPerSecond: number;
  machineTxsPerSecond: number;
  tempoHumanTxsPerSecond: number;
  volume24h: number;
  machineVolume24h: number;
  mppTxs24h: number;
  mppVolume24h: number;
  activeAgents: number;
  activeServices: number;
  humanToMachineRatio: number;
  timestamp: number;
}

// ---- In-memory cache to avoid hammering RPC ----
let cachedStats: ChainStats | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 2500;

// ---- Transfer classification ----
interface TransferClassification {
  machineTxCount: number;
  machineVolume: number;
  totalStablecoinTxCount: number;
  totalStablecoinVolume: number;
  uniqueAgents: Set<string>;
  uniqueServices: Set<string>;
}

function classifyTransfers(logs: Log[]): TransferClassification {
  const result: TransferClassification = {
    machineTxCount: 0,
    machineVolume: 0,
    totalStablecoinTxCount: 0,
    totalStablecoinVolume: 0,
    uniqueAgents: new Set(),
    uniqueServices: new Set(),
  };

  for (const log of logs) {
    const args = log as unknown as {
      args?: { from?: string; to?: string; value?: bigint };
    };
    if (!args.args?.value) continue;

    const usdValue = parseFloat(
      formatUnits(args.args.value, TIP20_DECIMALS)
    );
    const from = (args.args.from ?? "").toLowerCase();
    const to = (args.args.to ?? "").toLowerCase();

    if (SYSTEM_ADDRESSES.has(from) || SYSTEM_ADDRESSES.has(to)) continue;
    if (usdValue < MPP_FLOOR) continue;

    // Count all stablecoin transfers
    result.totalStablecoinTxCount++;
    result.totalStablecoinVolume += usdValue;

    // MPP payment = involves the escrow contract OR the known MPP recipient
    const isMPP =
      from === MPP_ESCROW ||
      to === MPP_ESCROW ||
      to === MPP_RECIPIENT ||
      from === MPP_RECIPIENT;

    if (isMPP) {
      result.machineTxCount++;
      result.machineVolume += usdValue;
      // Agent = whoever deposits into escrow (not the escrow itself)
      if (to === MPP_ESCROW) result.uniqueAgents.add(from);
      // Service = whoever receives from escrow settlements
      if (from === MPP_ESCROW && to !== MPP_RECIPIENT)
        result.uniqueServices.add(to);
      if (to === MPP_RECIPIENT) result.uniqueServices.add(to);
    }
  }

  return result;
}

// ---- Historical data for 24h chart ----
export interface HistoryDataPoint {
  timestamp: number;
  mppTxCount: number;
  mppVolume: number;
}

export interface HistoryResponse {
  points: HistoryDataPoint[];
  mppTxs24h: number;
  mppVolume24h: number;
}

let cachedHistory: HistoryResponse | null = null;
let historyCacheTimestamp = 0;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchHistoricalData(): Promise<HistoryResponse> {
  if (cachedHistory && Date.now() - historyCacheTimestamp < HISTORY_CACHE_TTL_MS) {
    return cachedHistory;
  }

  const client = getClient();

  try {
    const currentBlock = await client.getBlockNumber();
    // ~0.5s block time → 172,800 blocks in 24h
    const blocksIn24h = 172_800n;
    const startBlock = currentBlock > blocksIn24h ? currentBlock - blocksIn24h : 0n;

    // 48 sample points at ~30 min intervals (3,600 blocks per window)
    const windowSize = 3_600n;
    const numPoints = 48;

    // Fetch all points in parallel (batched)
    const points: HistoryDataPoint[] = [];
    let totalMppTxs = 0;
    let totalMppVolume = 0;

    // Process in batches of 8 to avoid overwhelming RPC
    const batchSize = 8;
    for (let batchStart = 0; batchStart < numPoints; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, numPoints);
      const batchPromises = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const windowStart = startBlock + BigInt(i) * windowSize;
        const windowEnd = windowStart + windowSize - 1n > currentBlock
          ? currentBlock
          : windowStart + windowSize - 1n;

        batchPromises.push(
          (async () => {
            try {
              // Get timestamp for this window
              const block = await client.getBlock({ blockNumber: windowStart });
              const timestamp = Number(block.timestamp) * 1000;

              // Query all stablecoin Transfer events in this window
              const logArrays = await Promise.all(
                TEMPO_STABLECOINS.map((token) =>
                  client
                    .getLogs({
                      address: token.address as `0x${string}`,
                      event: TRANSFER_EVENT,
                      fromBlock: windowStart,
                      toBlock: windowEnd,
                    })
                    .catch(() => [] as Log[])
                )
              );
              const allLogs = logArrays.flat();
              const classification = classifyTransfers(allLogs);

              return {
                timestamp,
                mppTxCount: classification.machineTxCount,
                mppVolume: classification.machineVolume,
              };
            } catch {
              return null;
            }
          })()
        );
      }

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        if (result) {
          points.push(result);
          totalMppTxs += result.mppTxCount;
          totalMppVolume += result.mppVolume;
        }
      }
    }

    // Sort by timestamp
    points.sort((a, b) => a.timestamp - b.timestamp);

    const history: HistoryResponse = {
      points,
      mppTxs24h: totalMppTxs,
      mppVolume24h: totalMppVolume,
    };

    cachedHistory = history;
    historyCacheTimestamp = Date.now();
    return history;
  } catch (error) {
    console.error("Failed to fetch historical data:", error);
    return { points: [], mppTxs24h: 0, mppVolume24h: 0 };
  }
}

// Fetch recent blocks and TIP-20 transfers, classify MPP vs human
export async function fetchChainStats(): Promise<ChainStats> {
  // Return cache if fresh
  if (cachedStats && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStats;
  }

  const client = getClient();

  try {
    const currentBlockNumber = await client.getBlockNumber();

    // Fetch ~2000 blocks (~16 min at 0.5s block time) for better signal
    const blocksToFetch = 2000;
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

    // Sample recent blocks for total tx count
    const sampleSize = 10;
    const step = Math.max(1, Math.floor(blockDelta / sampleSize));
    const sampleBlocks = await Promise.all(
      Array.from({ length: sampleSize }, (_, i) => {
        const bn = startBlock + BigInt(i * step);
        return client
          .getBlock({
            blockNumber:
              bn > currentBlockNumber ? currentBlockNumber : bn,
          })
          .catch(() => null);
      })
    );

    const validBlocks = sampleBlocks.filter(
      (b): b is NonNullable<typeof b> => b !== null
    );
    const avgTxPerBlock =
      validBlocks.length > 0
        ? validBlocks.reduce(
            (sum, b) => sum + b.transactions.length,
            0
          ) / validBlocks.length
        : 0;

    const txsPerSecond = avgTxPerBlock * blocksPerSecond;

    // Fetch Transfer events for ALL stablecoins in the sample window
    let classification: TransferClassification;
    try {
      const logArrays = await Promise.all(
        TEMPO_STABLECOINS.map((token) =>
          client
            .getLogs({
              address: token.address as `0x${string}`,
              event: TRANSFER_EVENT,
              fromBlock: startBlock,
              toBlock: currentBlockNumber,
            })
            .catch(() => [] as Log[])
        )
      );
      const allLogs = logArrays.flat();
      classification = classifyTransfers(allLogs);
    } catch {
      classification = {
        machineTxCount: 0,
        machineVolume: 0,
        totalStablecoinTxCount: 0,
        totalStablecoinVolume: 0,
        uniqueAgents: new Set(),
        uniqueServices: new Set(),
      };
    }

    // Machine payments = MPP escrow activity on Tempo (real on-chain data)
    // Human payments = global payment networks (Visa, MC, etc.)
    const machineTxsPerSecond =
      classification.machineTxCount > 0
        ? classification.machineTxCount / timeDelta
        : 0;
    const humanTxsPerSecond = GLOBAL_HUMAN_PAYMENTS_PER_SEC;

    // Tempo human = total stablecoin transfers minus MPP
    const totalStablecoinTxsPerSecond =
      classification.totalStablecoinTxCount > 0
        ? classification.totalStablecoinTxCount / timeDelta
        : 0;
    const tempoHumanTxsPerSecond = Math.max(
      0,
      totalStablecoinTxsPerSecond - machineTxsPerSecond
    );

    const machineVolumeRate =
      classification.machineTxCount > 0
        ? classification.machineVolume / timeDelta
        : 0;

    const humanToMachineRatio =
      machineTxsPerSecond > 0
        ? Math.round(humanTxsPerSecond / machineTxsPerSecond)
        : 0;

    // Extrapolate 24h totals (rate-based estimates for display)
    const totalTempoTxs24h = Math.round(txsPerSecond * 86400);
    const machineVolume24h = machineVolumeRate * 86400;

    // Try to get actual 24h cumulative from history cache (non-blocking)
    const historyCumulative = cachedHistory
      ? { mppTxs24h: cachedHistory.mppTxs24h, mppVolume24h: cachedHistory.mppVolume24h }
      : { mppTxs24h: Math.round(machineTxsPerSecond * 86400), mppVolume24h: machineVolume24h };

    const stats: ChainStats = {
      currentBlock: Number(currentBlockNumber),
      totalTempoTxs24h,
      blocksPerSecond,
      txsPerSecond,
      humanTxsPerSecond,
      machineTxsPerSecond,
      tempoHumanTxsPerSecond,
      volume24h: machineVolume24h,
      machineVolume24h,
      mppTxs24h: historyCumulative.mppTxs24h,
      mppVolume24h: historyCumulative.mppVolume24h,
      activeAgents: classification.uniqueAgents.size || 0,
      activeServices: classification.uniqueServices.size || 0,
      humanToMachineRatio,
      timestamp: Date.now(),
    };

    cachedStats = stats;
    cacheTimestamp = Date.now();
    return stats;
  } catch (error) {
    console.error("Failed to fetch chain stats:", error);
    return {
      currentBlock: 0,
      totalTempoTxs24h: 0,
      blocksPerSecond: 0,
      txsPerSecond: 0,
      humanTxsPerSecond: GLOBAL_HUMAN_PAYMENTS_PER_SEC,
      machineTxsPerSecond: 0,
      tempoHumanTxsPerSecond: 0,
      volume24h: 0,
      machineVolume24h: 0,
      mppTxs24h: 0,
      mppVolume24h: 0,
      activeAgents: 0,
      activeServices: 0,
      humanToMachineRatio: 0,
      timestamp: Date.now(),
    };
  }
}
