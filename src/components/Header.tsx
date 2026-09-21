import { Settings } from "lucide-react";
import Link from "next/link";

import type { SessionUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import type { ScanRunRow } from "@/lib/types";

import ScanButton from "./ScanButton";
import ThemeToggle from "./ThemeToggle";

export default function Header({
  user,
  lastRun,
}: {
  user: SessionUser;
  lastRun: ScanRunRow | null;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 20,
      }}
    >
      <div>
        <Link
          href="/"
          style={{ textDecoration: "none", display: "block", lineHeight: 1.15 }}
        >
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>Sponsor Command</h1>
        </Link>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>
          <ScanStatus lastRun={lastRun} />
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ScanButton />
        <Link href="/settings" className="btn btn-sm" aria-label="Settings">
          <Settings size={14} />
        </Link>
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <button
            className="btn btn-sm"
            type="submit"
            title={`Signed in as ${user.email}`}
          >
            {user.name ?? user.email}
          </button>
        </form>
      </div>
    </header>
  );
}

/**
 * The scan's own health, stated plainly. A stale board is worse than an empty
 * one, so if the last run failed or has not happened, the header says so
 * rather than quietly showing yesterday's pipeline as if it were current.
 */
function ScanStatus({ lastRun }: { lastRun: ScanRunRow | null }) {
  if (!lastRun) {
    return <span style={{ color: "var(--critical)" }}>Never scanned — connect Gmail in Settings</span>;
  }

  if (lastRun.status === "error") {
    return (
      <span style={{ color: "var(--critical)" }}>
        Last scan failed {relativeTime(lastRun.started_at)} — {lastRun.error}
      </span>
    );
  }

  const hoursAgo = (Date.now() - new Date(lastRun.started_at).getTime()) / 3_600_000;
  const stale = hoursAgo > 3;

  // Staleness is stated in words rather than in warning yellow, which is
  // close to invisible on the light surface.
  return (
    <span>
      {stale && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--warning)",
            marginRight: 6,
            verticalAlign: "middle",
          }}
        />
      )}
      {stale ? "Last scan " : "Synced "}
      {relativeTime(lastRun.started_at)}
      {stale && " — the hourly job may not be running"}
    </span>
  );
}
