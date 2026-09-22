"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A deep re-read of the inbox. Separate from "Scan now" because it is slow and
 * costs classifier calls, so it should be a deliberate choice rather than
 * something anyone taps by accident.
 */
export default function BackfillButton({ days = 365 }: { days?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function backfill() {
    if (!window.confirm(`Re-read the last ${days} days of mail? This can take a few minutes.`)) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backfillDays: days, force: true }),
      });
      const result = (await response.json()) as {
        status: string;
        threadsSeen: number;
        brandsCreated: number;
        error?: string;
      };

      setMessage(
        result.status === "ok"
          ? `Read ${result.threadsSeen} threads · ${result.brandsCreated} new brands`
          : (result.error ?? "Backfill failed"),
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button className="btn btn-sm" onClick={backfill} disabled={busy}>
        {busy ? "Reading…" : `Re-read last ${days} days`}
      </button>
      {message && <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{message}</span>}
    </div>
  );
}
