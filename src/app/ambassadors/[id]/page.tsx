import { ArrowLeft, Instagram, Music2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import AmbassadorEditor from "@/components/AmbassadorEditor";
import { AMBASSADOR_STAGE_META, totalFollowers } from "@/lib/ambassadors";
import { requireUser } from "@/lib/auth";
import { getAmbassador, listAmbassadorStageEvents } from "@/lib/data";
import { allowedEmails } from "@/lib/env";
import { dateTime, relativeTime, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const compact = (value: number | null) =>
  value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

export default async function AmbassadorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const ambassador = await getAmbassador(id);
  if (!ambassador) notFound();

  const events = await listAmbassadorStageEvents(id);
  const reach = totalFollowers(ambassador);

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      <Link
        href="/ambassadors"
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
        <ArrowLeft size={14} /> Ambassadors
      </Link>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 25, letterSpacing: "-0.01em" }}>
          {ambassador.full_name}
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--ink-secondary)" }}>
          {ambassador.school ?? "school not given"}
          {ambassador.grad_year && ` · ’${ambassador.grad_year.slice(-2)}`}
          {ambassador.major && ` · ${ambassador.major}`}
        </p>
      </div>

      {ambassador.archived && (
        <div
          className="card"
          style={{ padding: "12px 14px", marginBottom: 18, borderColor: "var(--warning)" }}
        >
          <strong style={{ fontSize: 13.5 }}>Archived</strong>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
            Off the recruiting list, kept for the record. Nothing is deleted — put them back any
            time from the panel on the right.
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
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>The application</h2>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <Fact label="Stage" value={AMBASSADOR_STAGE_META[ambassador.stage].label} />
              <Fact
                label="Set by"
                value={
                  ambassador.stage_source === "manual"
                    ? (ambassador.stage_changed_by ?? "a teammate")
                    : "the hourly scan"
                }
              />
              <Fact label="Applied" value={shortDate(ambassador.applied_at)} />
              <Fact label="School email" value={ambassador.school_email ?? "—"} />
              <Fact label="Phone" value={ambassador.phone ?? "—"} />
              <Fact
                label="Home town"
                value={
                  [ambassador.city, ambassador.state].filter(Boolean).join(", ") || "—"
                }
              />
              <Fact label="Date of birth" value={ambassador.dob ?? "—"} />
              <Fact label="Niche" value={ambassador.niche ?? "—"} />
              <Fact label="Total reach" value={compact(reach)} />
            </dl>
          </section>

          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Social</h2>
            <div style={{ display: "grid", gap: 9 }}>
              <Handle
                icon={<Instagram size={14} />}
                platform="Instagram"
                handle={ambassador.instagram}
                followers={ambassador.ig_followers}
                href={
                  ambassador.instagram
                    ? `https://instagram.com/${encodeURIComponent(ambassador.instagram)}`
                    : null
                }
              />
              <Handle
                icon={<Music2 size={14} />}
                platform="TikTok"
                handle={ambassador.tiktok}
                followers={ambassador.tt_followers}
                href={
                  ambassador.tiktok
                    ? `https://tiktok.com/@${encodeURIComponent(ambassador.tiktok)}`
                    : null
                }
              />
            </div>
          </section>

          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>Why they applied</h2>
            {ambassador.why ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {ambassador.why}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-muted)" }}>
                They left this blank.
              </p>
            )}
          </section>

          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>How they found us</h2>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <Fact label="Source" value={ambassador.utm_source ?? "direct"} />
              <Fact label="Landing page" value={ambassador.landing_page ?? "—"} />
            </dl>
          </section>
        </div>

        <aside style={{ display: "grid", gap: 20 }}>
          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>Tracking</h2>
            <AmbassadorEditor ambassador={ambassador} teamEmails={[...allowedEmails()].sort()} />
          </section>

          <section className="card" style={{ padding: "14px 16px" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Stage history</h2>
            {events.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-muted)" }}>
                No moves yet — still where the scan filed them.
              </p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
                {events.map((event) => (
                  <li key={event.id} style={{ fontSize: 12.5 }}>
                    <div>
                      {event.from_stage
                        ? `${AMBASSADOR_STAGE_META[event.from_stage].label} → `
                        : ""}
                      <strong>{AMBASSADOR_STAGE_META[event.to_stage].label}</strong>
                    </div>
                    <div style={{ color: "var(--ink-muted)", fontSize: 11.5 }}>
                      {event.actor ?? "system"} · {dateTime(event.created_at)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ink-muted)" }}>
              Last change {relativeTime(ambassador.stage_changed_at)}.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt className="label">{label}</dt>
      <dd style={{ margin: "2px 0 0", fontSize: 13, overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

function Handle({
  icon,
  platform,
  handle,
  followers,
  href,
}: {
  icon: React.ReactNode;
  platform: string;
  handle: string | null;
  followers: number | null;
  href: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--ink-muted)", flexShrink: 0 }}>{icon}</span>
      <span className="label" style={{ minWidth: 68 }}>
        {platform}
      </span>
      {handle ? (
        <>
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: "var(--ball-them)" }}
          >
            @{handle}
          </a>
          <span className="tabular" style={{ color: "var(--ink-muted)", fontSize: 12 }}>
            {compact(followers)}
          </span>
        </>
      ) : (
        <span style={{ color: "var(--ink-muted)" }}>not given</span>
      )}
    </div>
  );
}
