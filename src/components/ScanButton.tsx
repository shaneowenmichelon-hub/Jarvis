"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Scan now". The hourly cron is the normal path; this is for when someone
 * has just replied to a brand and wants the board to catch up immediately.
 */
export default function ScanButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function scan() {
    setRunning(true);
    setMessage(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as {
        status: string;
        brandsCreated: number;
        stagesChanged: number;
        error?: string;
      };

      if (result.status === "skipped") {
        setMessage("A scan is already running");
      } else if (result.status === "error") {
        setMessage(result.error ?? "Scan failed");
      } else {
        setMessage(
          `${result.brandsCreated} new · ${result.stagesChanged} moved`,
        );
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {message && (
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{message}</span>
      )}
      <button className="btn btn-sm" onClick={scan} disabled={running}>
        <RefreshCw
          size={14}
          style={running ? { animation: "spin 1s linear infinite" } : undefined}
        />
        {running ? "Scanning…" : "Scan now"}
      </button>
      <style>{"@keyframes spin { to { transform: rotate(360deg) } }"}</style>
    </div>
  );
}
