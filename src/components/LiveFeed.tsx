"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface FeedEvent {
  type: "deposit" | "settlement" | "refund";
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  txHash: string;
}

interface Notification extends FeedEvent {
  id: string;
}

const MAX_VISIBLE = 4;
const DISPLAY_DURATION = 4000;

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const ICONS: Record<FeedEvent["type"], string> = {
  deposit: "🤖",
  settlement: "⚡",
  refund: "🔓",
};

function formatNotification(event: FeedEvent): string {
  const addr = truncateAddress(event.from);
  switch (event.type) {
    case "deposit":
      return `${truncateAddress(event.from)} deposited $${event.amount} into escrow`;
    case "settlement":
      return `${truncateAddress(event.from)} → MPP Proxy · $${event.amount}`;
    case "refund":
      return `Channel closed · $${event.amount} settled`;
  }
}

export function LiveFeed() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addNotification = useCallback(
    (event: FeedEvent) => {
      const id = `feed-${counterRef.current++}`;
      const notification: Notification = { ...event, id };

      setNotifications((prev) => {
        const next = [...prev, notification];
        // If exceeding max, remove oldest
        if (next.length > MAX_VISIBLE) {
          const removed = next.shift()!;
          const timer = timersRef.current.get(removed.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(removed.id);
          }
        }
        return next;
      });

      // Auto-remove after display duration
      const timer = setTimeout(() => removeNotification(id), DISPLAY_DURATION);
      timersRef.current.set(id, timer);
    },
    [removeNotification]
  );

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource("/api/feed");

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as FeedEvent;
          if (data.type && data.amount) {
            addNotification(data);
          }
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        // Reconnect after 5 seconds
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      // Clean up all notification timers
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [addNotification]);

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none max-sm:left-4 max-sm:right-4">
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-auto max-w-[400px] w-full sm:w-auto"
          >
            <div
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(8px)",
                border: "1px solid #e0e0e0",
                borderRadius: "10px",
                padding: "8px 14px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "12px",
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: "14px", flexShrink: 0 }}>
                {ICONS[n.type]}
              </span>
              <span style={{ color: "#999" }}>
                {formatNotification(n).split("$")[0]}
              </span>
              <span style={{ color: "#000", fontWeight: 600, flexShrink: 0 }}>
                ${n.amount}
              </span>
              <span
                style={{
                  color: "#bbb",
                  fontSize: "10px",
                  marginLeft: "auto",
                  flexShrink: 0,
                }}
              >
                just now
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
