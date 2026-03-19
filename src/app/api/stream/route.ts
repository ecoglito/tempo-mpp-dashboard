import { fetchChainStats } from "@/lib/tempo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send initial data immediately
      try {
        const stats = await fetchChainStats();
        send(stats);
      } catch {
        send({ error: "Failed to fetch initial stats" });
      }

      // Poll every 3 seconds
      const interval = setInterval(async () => {
        try {
          const stats = await fetchChainStats();
          send(stats);
        } catch {
          // Skip this tick on error
        }
      }, 3000);

      // Clean up when client disconnects
      // The stream will be cancelled by the runtime
      const cleanup = () => clearInterval(interval);
      // Store cleanup for when stream is cancelled
      (controller as unknown as Record<string, unknown>).__cleanup = cleanup;
    },
    cancel() {
      // Called when the client disconnects
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
