import {
  createPublicClient,
  http,
  defineChain,
  parseAbiItem,
  formatUnits,
  type Log,
} from "viem";

// Stablecoins used on Tempo
const PATHUSD = "0x20c0000000000000000000000000000000000000" as const;
const USDC_E = "0x20c000000000000000000000b9537d11c60e8b50" as const;
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
  volume24h: number;
  machineVolume24h: number;
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
  uniqueAgents: Set<string>;
  uniqueServices: Set<string>;
}

function classifyTransfers(logs: Log[]): TransferClassification {
  const result: TransferClassification = {
    machineTxCount: 0,
    machineVolume: 0,
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

    // Fetch Transfer events for BOTH stablecoins in the sample window
    let classification: TransferClassification;
    try {
      const [pathLogs, usdcLogs] = await Promise.all([
        client
          .getLogs({
            address: PATHUSD,
            event: TRANSFER_EVENT,
            fromBlock: startBlock,
            toBlock: currentBlockNumber,
          })
          .catch(() => [] as Log[]),
        client
          .getLogs({
            address: USDC_E,
            event: TRANSFER_EVENT,
            fromBlock: startBlock,
            toBlock: currentBlockNumber,
          })
          .catch(() => [] as Log[]),
      ]);
      const allLogs = [...pathLogs, ...usdcLogs];
      classification = classifyTransfers(allLogs);
    } catch {
      classification = {
        machineTxCount: 0,
        machineVolume: 0,
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

    const machineVolumeRate =
      classification.machineTxCount > 0
        ? classification.machineVolume / timeDelta
        : 0;

    const humanToMachineRatio =
      machineTxsPerSecond > 0
        ? Math.round(humanTxsPerSecond / machineTxsPerSecond)
        : 0;

    // Extrapolate 24h totals
    const totalTempoTxs24h = Math.round(txsPerSecond * 86400);
    const machineTxs24h = Math.round(machineTxsPerSecond * 86400);
    const machineVolume24h = machineVolumeRate * 86400;

    const stats: ChainStats = {
      currentBlock: Number(currentBlockNumber),
      totalTempoTxs24h,
      blocksPerSecond,
      txsPerSecond,
      humanTxsPerSecond,
      machineTxsPerSecond,
      volume24h: machineVolume24h,
      machineVolume24h,
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
      volume24h: 0,
      machineVolume24h: 0,
      activeAgents: 0,
      activeServices: 0,
      humanToMachineRatio: 0,
      timestamp: Date.now(),
    };
  }
}
