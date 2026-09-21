import Link from "next/link";

import Board from "@/components/Board";
import Header from "@/components/Header";
import StatRow from "@/components/StatRow";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BrandRow, ScanRunRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await requireUser();
  const db = supabaseAdmin();

  const [brandsResult, runResult, accountResult] = await Promise.all([
    db.from("brands").select("*").eq("archived", false).order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    }),
    db.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1),
    db.from("gmail_accounts").select("email, active").eq("active", true).limit(1),
  ]);

  const brands = (brandsResult.data ?? []) as BrandRow[];
  const lastRun = ((runResult.data ?? [])[0] ?? null) as ScanRunRow | null;
  const connected = (accountResult.data ?? []).length > 0;

  return (
    <main className="page">
      <Header user={user} lastRun={lastRun} />

      {!connected && <ConnectPrompt />}

      <StatRow brands={brands} />
      <Board brands={brands} />

      {connected && brands.length === 0 && (
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--ink-muted)" }}>
          Nothing on the board yet. The first scan reaches back six months — run it from
          &ldquo;Scan now&rdquo; above, or wait for the top of the hour.
        </p>
      )}
    </main>
  );
}

function ConnectPrompt() {
  return (
    <div
      className="card"
      style={{
        padding: "14px 16px",
        marginBottom: 20,
        borderColor: "var(--warning)",
      }}
    >
      <strong style={{ fontSize: 14 }}>No inbox connected</strong>
      <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--ink-secondary)" }}>
        The board stays empty until a Gmail account is linked. This is read-only access —
        the dashboard never sends, labels, or deletes mail.
      </p>
      <Link href="/settings" className="btn btn-sm btn-primary">
        Connect Gmail
      </Link>
    </div>
  );
}
