"use client";

import { AlertTriangle, Mail, Pin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { relativeTime } from "@/lib/format";
import { resolveStage, urgency, type UrgencyLevel } from "@/lib/stages";
import { STAGES, STAGE_META, type BrandRow, type Stage } from "@/lib/types";

const URGENCY_COLOR: Record<UrgencyLevel, string> = {
  ok: "var(--ink-muted)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};

export default function BrandCard({ brand }: { brand: BrandRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = urgency(brand.stage, brand.last_message_at, new Date());

  const { suggestion } = resolveStage({
    currentStage: brand.stage,
    stageSource: brand.stage_source,
    autoStage: brand.auto_stage ?? brand.stage,
  });

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/brands/${brand.id}`, {
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

  return (
    <article
      className="card"
      style={{
        padding: "12px 13px",
        display: "grid",
        gap: 8,
        opacity: disabled ? 0.6 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
        <Link
          href={`/brands/${brand.id}`}
          style={{ fontWeight: 600, fontSize: 14.5, textDecoration: "none", lineHeight: 1.3 }}
        >
          {brand.name}
        </Link>
        {brand.stage_source === "manual" && (
          <span
            title="Pinned by hand — the hourly scan will not move this card"
            style={{ color: "var(--ink-muted)", flexShrink: 0, marginTop: 2 }}
          >
            <Pin size={13} />
          </span>
        )}
      </div>

      {brand.summary && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-secondary)", lineHeight: 1.45 }}>
          {brand.summary}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--ink-muted)",
        }}
      >
        <Mail size={12} style={{ flexShrink: 0 }} />
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={brand.primary_contact_email ?? ""}
        >
          {brand.primary_contact_email ?? "no contact address"}
        </span>
      </div>

      {/* Age. Color is never the only cue — the days are spelled out beside it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: URGENCY_COLOR[age.level],
            flexShrink: 0,
          }}
        />
        {/* The dot carries the status colour; the words stay in ink, because
            warning yellow on a light surface is barely 1.8:1. */}
        <span style={{ color: "var(--ink-secondary)" }}>
          {age.days === 0 ? "today" : `${age.days}d`} · last message{" "}
          {relativeTime(brand.last_message_at)}
        </span>
      </div>

      {/* An active campaign with an unanswered email still has to shout. */}
      {brand.awaiting_our_reply && brand.stage === "active_campaign" && (
        <Badge tone="critical" icon>
          They are waiting on your reply
        </Badge>
      )}

      {brand.classification === "unverified" && (
        <div style={{ display: "grid", gap: 6 }}>
          <Badge tone="warning">Not confirmed as a brand yet</Badge>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-sm"
              disabled={disabled}
              onClick={() => patch({ confirm: true })}
            >
              It&apos;s a brand
            </button>
            <button
              className="btn btn-sm"
              disabled={disabled}
              onClick={() => patch({ dismiss: true })}
            >
              Not a brand
            </button>
          </div>
        </div>
      )}

      {suggestion && (
        <div style={{ display: "grid", gap: 6 }}>
          <Badge tone="warning">Inbox says: {STAGE_META[suggestion].label}</Badge>
          <button
            className="btn btn-sm"
            style={{ width: "fit-content" }}
            disabled={disabled}
            onClick={() => patch({ acceptSuggestion: true })}
          >
            Move it there
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <label className="label" htmlFor={`stage-${brand.id}`} style={{ flexShrink: 0 }}>
          Stage
        </label>
        <select
          id={`stage-${brand.id}`}
          value={brand.stage}
          disabled={disabled}
          onChange={(event) => patch({ stage: event.target.value as Stage })}
          style={{ fontSize: 12, padding: "5px 7px" }}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_META[stage].label}
            </option>
          ))}
        </select>
      </div>

      {brand.owner_email && (
        <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          Owner: {brand.owner_email}
        </div>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function Badge({
  children,
  tone,
  icon = false,
}: {
  children: React.ReactNode;
  tone: "warning" | "critical";
  icon?: boolean;
}) {
  const color = tone === "critical" ? "var(--critical)" : "var(--warning)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 500,
        // Border and icon carry the status; the label stays readable ink.
        color: "var(--ink)",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "2px 7px",
        width: "fit-content",
        lineHeight: 1.5,
      }}
    >
      {icon ? (
        <AlertTriangle size={11} style={{ color, flexShrink: 0 }} />
      ) : (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
