import { fetchChainStats } from "@/lib/tempo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
          // Controller closed, clean up
          if (intervalId) clearInterval(intervalId);
        }
      };

      // Send initial data immediately
      try {
        const stats = await fetchChainStats();
        send(stats);
      } catch {
        send({ error: "Failed to fetch initial stats" });
      }

      // Poll every 3 seconds
      intervalId = setInterval(async () => {
        try {
          const stats = await fetchChainStats();
          send(stats);
        } catch {
          // Skip this tick on error
        }
      }, 3000);
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
