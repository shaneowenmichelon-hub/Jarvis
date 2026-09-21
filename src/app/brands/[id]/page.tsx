import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import BrandEditor from "@/components/BrandEditor";
import { requireUser } from "@/lib/auth";
import { allowedEmails } from "@/lib/env";
import { currency, dateTime, relativeTime, shortDate } from "@/lib/format";
import { urgency } from "@/lib/stages";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { STAGE_META, type BrandRow, type MessageRow, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StageEventRow {
  id: number;
  from_stage: Stage | null;
  to_stage: Stage;
  source: "auto" | "manual";
  actor: string | null;
  note: string | null;
  created_at: string;
}

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: brandData } = await db.from("brands").select("*").eq("id", id).maybeSingle();
  if (!brandData) notFound();

  const brand = brandData as BrandRow;

  const [messagesResult, eventsResult] = await Promise.all([
    db
      .from("messages")
      .select("*")
      .eq("brand_id", id)
      .order("sent_at", { ascending: false })
      .limit(100),
    db
      .from("stage_events")
      .select("*")
      .eq("brand_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const messages = (messagesResult.data ?? []) as MessageRow[];
  const events = (eventsResult.data ?? []) as StageEventRow[];
  const age = urgency(brand.stage, brand.last_message_at, new Date());

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
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

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 25, letterSpacing: "-0.01em" }}>{brand.name}</h1>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--ink-secondary)" }}>
          {brand.primary_contact_name && `${brand.primary_contact_name} · `}
          {brand.primary_contact_email ?? "no contact address"}
          {brand.domain && (
            <>
              {" · "}
              <a
                href={`https://${brand.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: "var(--ball-them)" }}
              >
                {brand.domain}
              </a>
            </>
          )}
        </p>
        {brand.summary && (
          <p style={{ margin: "8px 0 0", fontSize: 13.5 }}>{brand.summary}</p>
        )}
      </div>

      {brand.blocked && (
        <div
          className="card"
          style={{ padding: "12px 14px", marginBottom: 18, borderColor: "var(--critical)" }}
        >
          <strong style={{ color: "var(--critical)", fontSize: 13.5 }}>
            Do not contact this entity
          </strong>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
            Blocked under a standing agency rule. It is kept here for the record only.
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Where it stands</h2>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 12,
              }}
            >
              <Fact label="Stage" value={STAGE_META[brand.stage].label} />
              <Fact
                label="Set by"
                value={
                  brand.stage_source === "manual"
                    ? `${brand.stage_changed_by ?? "a teammate"} (pinned)`
                    : "the hourly scan"
                }
              />
              <Fact
                label="Waiting"
                value={`${age.days}d`}
                tone={age.level === "ok" ? undefined : age.level}
              />
              <Fact label="First contact" value={shortDate(brand.first_contact_at)} />
              <Fact
                label="Last message"
                value={`${relativeTime(brand.last_message_at)} (${
                  brand.last_direction === "inbound" ? "them" : "us"
                })`}
              />
              <Fact label="Deal value" value={currency(brand.deal_value)} />
              <Fact label="Event" value={brand.event_tag ?? "—"} />
              <Fact label="Messages" value={`${brand.message_count} in ${brand.thread_count} threads`} />
            </dl>
          </section>

          <section>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Email history</h2>
            {messages.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>No messages recorded yet.</p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className="card"
                    style={{
                      padding: "10px 12px",
                      borderLeft: `3px solid ${
                        message.direction === "inbound" ? "var(--ball-us)" : "var(--ball-them)"
                      }`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        fontSize: 11.5,
                        color: "var(--ink-muted)",
                        marginBottom: 3,
                      }}
                    >
                      {message.direction === "inbound" ? (
                        <ArrowDownLeft size={12} />
                      ) : (
                        <ArrowUpRight size={12} />
                      )}
                      <span>{message.direction === "inbound" ? "They wrote" : "We wrote"}</span>
                      <span>·</span>
                      <span>{dateTime(message.sent_at)}</span>
                      {message.from_email && (
                        <>
                          <span>·</span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {message.from_email}
                          </span>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {message.subject ?? "(no subject)"}
                    </div>
                    {message.snippet && (
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontSize: 12.5,
                          color: "var(--ink-secondary)",
                          lineHeight: 1.45,
                        }}
                      >
                        {message.snippet}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside style={{ display: "grid", gap: 20 }}>
          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>Details</h2>
            <BrandEditor brand={brand} teamEmails={[...allowedEmails()].sort()} />
          </section>

          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Stage history</h2>
            {events.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-muted)" }}>
                No moves recorded.
              </p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
                {events.map((event) => (
                  <li key={event.id} style={{ fontSize: 12.5 }}>
                    <div>
                      {event.from_stage ? `${STAGE_META[event.from_stage].label} → ` : ""}
                      <strong>{STAGE_META[event.to_stage].label}</strong>
                    </div>
                    <div style={{ color: "var(--ink-muted)", fontSize: 11.5 }}>
                      {event.actor ?? "system"} · {relativeTime(event.created_at)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "critical";
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd style={{ margin: "2px 0 0", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
        {tone && (
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: `var(--${tone})`,
              flexShrink: 0,
            }}
          />
        )}
        {value}
      </dd>
    </div>
  );
}
