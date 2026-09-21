import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

import BackfillButton from "@/components/BackfillButton";
import { requireUser } from "@/lib/auth";
import { allowedDomain, allowedEmails } from "@/lib/env";
import { dateTime, relativeTime } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BrandRow, ScanRunRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireUser();
  const { connected, error } = await searchParams;
  const db = supabaseAdmin();

  const [accountResult, runsResult, ignoredResult, blockedResult, archivedResult] =
    await Promise.all([
      db.from("gmail_accounts").select("*").order("connected_at", { ascending: false }),
      db.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(12),
      db.from("ignored_senders").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("blocked_entities").select("*").order("pattern"),
      db
        .from("brands")
        .select("id, name, primary_contact_email, blocked")
        .eq("archived", true)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

  const accounts = (accountResult.data ?? []) as {
    id: string;
    email: string;
    connected_by: string | null;
    connected_at: string;
    last_scan_at: string | null;
    active: boolean;
  }[];
  const runs = (runsResult.data ?? []) as ScanRunRow[];
  const ignored = (ignoredResult.data ?? []) as {
    pattern: string;
    reason: string | null;
    added_by: string | null;
  }[];
  const blocked = (blockedResult.data ?? []) as { pattern: string; reason: string | null }[];
  const archived = (archivedResult.data ?? []) as Pick<
    BrandRow,
    "id" | "name" | "primary_contact_email" | "blocked"
  >[];

  const live = accounts.find((account) => account.active);

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--ink-muted)",
          textDecoration: "none",
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Board
      </Link>

      <h1 style={{ margin: "0 0 20px", fontSize: 24, letterSpacing: "-0.01em" }}>Settings</h1>

      {connected && (
        <Banner tone="good">Connected {connected}. The next scan will use it.</Banner>
      )}
      {error && <Banner tone="critical">{error}</Banner>}

      <Section title="Inbox">
        {live ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <CheckCircle2 size={15} style={{ color: "var(--good)", flexShrink: 0 }} />
              <strong>{live.email}</strong>
              <span style={{ color: "var(--ink-muted)" }}>
                connected by {live.connected_by ?? "unknown"} · last scan{" "}
                {relativeTime(live.last_scan_at)}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-muted)" }}>
              Read-only access. The dashboard can list and read mail; it cannot send, label,
              or delete anything.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="/api/gmail/connect" className="btn btn-sm">
                Reconnect
              </a>
              <BackfillButton />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <XCircle size={15} style={{ color: "var(--critical)", flexShrink: 0 }} />
              <strong>No inbox connected</strong>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-secondary)" }}>
              Connect the agency Gmail account the brands write to. Requests read-only access.
            </p>
            <a
              href="/api/gmail/connect"
              className="btn btn-sm btn-primary"
              style={{ width: "fit-content" }}
            >
              Connect Gmail
            </a>
          </div>
        )}
      </Section>

      <Section title="Who can sign in">
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>
          Set by the <code>ALLOWED_EMAILS</code> and <code>ALLOWED_DOMAIN</code> environment
          variables in Vercel. Changing them takes a redeploy.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {[...allowedEmails()].sort().map((email) => (
            <li key={email}>{email}</li>
          ))}
          {allowedDomain() && <li>anyone @{allowedDomain()}</li>}
        </ul>
      </Section>

      <Section title="Recent scans">
        {runs.length === 0 ? (
          <Empty>No scans yet.</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-muted)" }}>
                  <Th>When</Th>
                  <Th>Trigger</Th>
                  <Th>Status</Th>
                  <Th>Threads</Th>
                  <Th>New</Th>
                  <Th>Moved</Th>
                  <Th>Skipped</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td>{dateTime(run.started_at)}</Td>
                    <Td>{run.trigger}</Td>
                    <Td>
                      <span
                        style={{
                          color:
                            run.status === "error"
                              ? "var(--critical)"
                              : run.status === "running"
                                ? "var(--ink-secondary)"
                                : "var(--good)",
                        }}
                        title={run.error ?? undefined}
                      >
                        {run.status}
                      </span>
                    </Td>
                    <Td numeric>{run.threads_seen}</Td>
                    <Td numeric>{run.brands_created}</Td>
                    <Td numeric>{run.stages_changed}</Td>
                    <Td numeric>{run.skipped}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Do not contact">
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>
          Mail from these is recorded but kept off the board entirely.
        </p>
        {blocked.length === 0 ? (
          <Empty>Nothing blocked.</Empty>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {blocked.map((entry) => (
              <li key={entry.pattern}>
                <strong>{entry.pattern}</strong>
                {entry.reason && (
                  <span style={{ color: "var(--ink-muted)" }}> — {entry.reason}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Dismissed senders">
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>
          Senders the scan skips. Every &ldquo;Not a brand&rdquo; on the board adds one here.
        </p>
        {ignored.length === 0 ? (
          <Empty>Nothing dismissed.</Empty>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ignored.map((entry) => (
              <span
                key={entry.pattern}
                title={`${entry.reason ?? ""}${entry.added_by ? ` · ${entry.added_by}` : ""}`}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border-strong)",
                  color: "var(--ink-secondary)",
                }}
              >
                {entry.pattern}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Archived">
        {archived.length === 0 ? (
          <Empty>Nothing archived.</Empty>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {archived.map((brand) => (
              <li
                key={brand.id}
                style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}
              >
                <Link href={`/brands/${brand.id}`} style={{ color: "var(--ball-them)" }}>
                  {brand.name}
                </Link>
                <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>
                  {brand.primary_contact_email}
                  {brand.blocked && " · do not contact"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>{title}</h2>
      {children}
    </section>
  );
}

function Banner({ tone, children }: { tone: "good" | "critical"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "critical" ? "alert" : undefined}
      style={{
        margin: "0 0 16px",
        padding: "10px 12px",
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid var(--${tone})`,
        // The border carries the tone; the message itself stays readable ink.
        color: "var(--ink)",
      }}
    >
      {children}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-muted)" }}>{children}</p>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "5px 10px 5px 0", fontWeight: 600 }}>{children}</th>;
}

function Td({ children, numeric = false }: { children: React.ReactNode; numeric?: boolean }) {
  return (
    <td
      className={numeric ? "tabular" : undefined}
      style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}
    >
      {children}
    </td>
  );
}
