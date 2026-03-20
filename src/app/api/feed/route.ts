import { getClient } from "@/lib/tempo";
import { parseAbiItem, formatUnits, type Log } from "viem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const MPP_ESCROW = "0x33b901018174ddabe4841042ab76ba85d4e24f25";
const MPP_RECIPIENT = "0xca4e835f803cb0b7c428222b3a3b98518d4779fe";

const STABLECOINS = [
  "0x20c0000000000000000000000000000000000000",
  "0x20c000000000000000000000b9537d11c60e8b50",
  "0x20c00000000000000000000031d99efa5dbd3713",
  "0x20c000000000000000000000987bef2978df41f9",
  "0x20c000000000000000000000766bc256ae7da3e9",
] as const;

const DECIMALS = 6;
const MIN_AMOUNT = 0.001;

interface FeedEvent {
  type: "deposit" | "settlement" | "refund";
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  txHash: string;
}

function classifyTransfer(log: Log): FeedEvent | null {
  const args = log as unknown as {
    args?: { from?: string; to?: string; value?: bigint };
  };
  if (!args.args?.value) return null;

  const from = (args.args.from ?? "").toLowerCase();
  const to = (args.args.to ?? "").toLowerCase();
  const value = parseFloat(formatUnits(args.args.value, DECIMALS));

  if (value < MIN_AMOUNT) return null;

  // Only care about transfers involving the escrow
  if (from !== MPP_ESCROW && to !== MPP_ESCROW) return null;

  let type: FeedEvent["type"];
  if (to === MPP_ESCROW) {
    type = "deposit";
  } else if (from === MPP_ESCROW && to === MPP_RECIPIENT) {
    type = "settlement";
  } else if (from === MPP_ESCROW) {
    type = "refund";
  } else {
    return null;
  }

  return {
    type,
    from: args.args.from ?? "",
    to: args.args.to ?? "",
    amount: value.toFixed(value < 0.01 ? 4 : 2),
    timestamp: Date.now(),
    txHash: log.transactionHash ?? "",
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          if (intervalId) clearInterval(intervalId);
        }
      };

      const client = getClient();
      let lastBlock: bigint;

      try {
        lastBlock = await client.getBlockNumber();
      } catch {
        lastBlock = 0n;
      }

      // Poll every 4 seconds for new Transfer events
      intervalId = setInterval(async () => {
        try {
          const currentBlock = await client.getBlockNumber();
          if (currentBlock <= lastBlock) return;

          const fromBlock = lastBlock + 1n;
          lastBlock = currentBlock;

          const logArrays = await Promise.all(
            STABLECOINS.map((addr) =>
              client
                .getLogs({
                  address: addr as `0x${string}`,
                  event: TRANSFER_EVENT,
                  fromBlock,
                  toBlock: currentBlock,
                })
                .catch(() => [] as Log[])
            )
          );

          const allLogs = logArrays.flat();
          for (const log of allLogs) {
            const event = classifyTransfer(log);
            if (event) {
              send(event);
            }
          }
        } catch {
          // Skip this tick
        }
      }, 4000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
