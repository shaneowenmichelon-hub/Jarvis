"use client";

import { Archive, Instagram, Music2, StickyNote, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AMBASSADOR_STAGES, AMBASSADOR_STAGE_META, type AmbassadorStage } from "@/lib/ambassadors";
import { relativeTime } from "@/lib/format";
import type { AmbassadorRow } from "@/lib/types";

const compact = (value: number | null) =>
  value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

/** One applicant, as a row in the recruiting list. */
export default function AmbassadorRowCard({
  ambassador,
  teamEmails,
}: {
  ambassador: AmbassadorRow;
  teamEmails: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not save");
        return;
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;
  const reach = (ambassador.ig_followers ?? 0) + (ambassador.tt_followers ?? 0);

  return (
    <article
      className="card"
      style={{ padding: "12px 14px", opacity: disabled ? 0.6 : 1, display: "grid", gap: 9 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}>
            <Link
              href={`/ambassadors/${ambassador.id}`}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {ambassador.full_name}
            </Link>
            {ambassador.notes && (
              <StickyNote
                size={13}
                aria-label="Has notes"
                style={{ color: "var(--ink-muted)", flexShrink: 0 }}
              />
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-secondary)", marginTop: 1 }}>
            {ambassador.school ?? "school not given"}
            {ambassador.grad_year && ` · ’${ambassador.grad_year.slice(-2)}`}
            {ambassador.major && ` · ${ambassador.major}`}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>
            {[ambassador.city, ambassador.state].filter(Boolean).join(", ") || "—"}
            {ambassador.school_email && ` · ${ambassador.school_email}`}
          </div>
        </div>

        <div style={{ display: "grid", gap: 3, textAlign: "right", flexShrink: 0 }}>
          <div
            className="tabular"
            style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            {compact(reach || null)}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>total reach</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 12,
          color: "var(--ink-muted)",
          flexWrap: "wrap",
        }}
      >
        {ambassador.instagram && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Instagram size={12} />@{ambassador.instagram}
            <span className="tabular">({compact(ambassador.ig_followers)})</span>
          </span>
        )}
        {ambassador.tiktok && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Music2 size={12} />@{ambassador.tiktok}
            <span className="tabular">({compact(ambassador.tt_followers)})</span>
          </span>
        )}
        {ambassador.niche && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              fontSize: 11,
            }}
          >
            {ambassador.niche}
          </span>
        )}
        <span>applied {relativeTime(ambassador.applied_at)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label={`Stage for ${ambassador.full_name}`}
          value={ambassador.stage}
          disabled={disabled}
          onChange={(event) => patch({ stage: event.target.value as AmbassadorStage })}
          style={{ fontSize: 12, padding: "5px 7px", width: "auto", minWidth: 130 }}
        >
          {AMBASSADOR_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {AMBASSADOR_STAGE_META[stage].label}
            </option>
          ))}
        </select>

        <select
          aria-label={`Owner for ${ambassador.full_name}`}
          value={ambassador.owner_email ?? ""}
          disabled={disabled}
          onChange={(event) => patch({ owner_email: event.target.value })}
          style={{ fontSize: 12, padding: "5px 7px", width: "auto", minWidth: 140 }}
        >
          <option value="">Unassigned</option>
          {teamEmails.map((email) => (
            <option key={email} value={email}>
              {email.split("@")[0]}
            </option>
          ))}
          {/* An owner set before the allowlist changed still has to be visible,
              or the select renders blank and the assignment looks lost. */}
          {ambassador.owner_email && !teamEmails.includes(ambassador.owner_email) && (
            <option value={ambassador.owner_email}>{ambassador.owner_email.split("@")[0]}</option>
          )}
        </select>

        {ambassador.why && (
          <button className="btn btn-sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide" : "Why they applied"}
          </button>
        )}

        <button
          className="btn btn-sm"
          disabled={disabled}
          onClick={() => patch(ambassador.archived ? { restore: true } : { archive: true })}
          title={
            ambassador.archived
              ? "Put them back on the list"
              : "Not a fit — keeps the record, takes them off the list"
          }
          style={{ marginLeft: "auto" }}
        >
          {ambassador.archived ? <Undo2 size={13} /> : <Archive size={13} />}
        </button>
      </div>

      {open && ambassador.why && (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "var(--ink-secondary)",
            borderLeft: "2px solid var(--border-strong)",
            paddingLeft: 10,
          }}
        >
          {ambassador.why}
        </p>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
