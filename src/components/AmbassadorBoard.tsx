"use client";

import { useMemo, useState } from "react";

import { AMBASSADOR_STAGES, AMBASSADOR_STAGE_META, type AmbassadorStage } from "@/lib/ambassadors";
import type { AmbassadorRow } from "@/lib/types";

import AmbassadorRowCard from "./AmbassadorRowCard";

/**
 * The recruiting list.
 *
 * A list rather than a kanban, because the question here is different from the
 * pipeline's. On a deal you ask "whose move is it"; on an applicant you ask
 * "who is worth taking, and where are they" — so this sorts by reach and
 * filters by school, and the stage is one field among several rather than the
 * whole layout.
 */
export default function AmbassadorBoard({
  ambassadors,
  teamEmails,
}: {
  ambassadors: AmbassadorRow[];
  teamEmails: string[];
}) {
  const [stage, setStage] = useState<AmbassadorStage | "all">("all");
  const [school, setSchool] = useState("all");
  const [sort, setSort] = useState<"reach" | "recent">("recent");

  const schools = useMemo(
    () => [...new Set(ambassadors.map((a) => a.school).filter(Boolean))].sort() as string[],
    [ambassadors],
  );

  const counts = useMemo(() => {
    const byStage = Object.fromEntries(AMBASSADOR_STAGES.map((s) => [s, 0])) as Record<
      AmbassadorStage,
      number
    >;
    for (const ambassador of ambassadors) byStage[ambassador.stage] += 1;
    return byStage;
  }, [ambassadors]);

  const reachOf = (a: AmbassadorRow) => (a.ig_followers ?? 0) + (a.tt_followers ?? 0);

  const visible = useMemo(() => {
    const filtered = ambassadors.filter(
      (a) => (stage === "all" || a.stage === stage) && (school === "all" || a.school === school),
    );

    return filtered.sort((a, b) =>
      sort === "reach"
        ? reachOf(b) - reachOf(a)
        : b.applied_at.localeCompare(a.applied_at),
    );
  }, [ambassadors, stage, school, sort]);

  const totalReach = ambassadors.reduce((sum, a) => sum + reachOf(a), 0);
  const unreviewed = counts.applied;

  return (
    <>
      <div className="stat-row" style={{ marginBottom: 20 }}>
        <Tile
          label="Waiting on review"
          value={unreviewed}
          note="Applied, nobody has looked"
          accent={unreviewed > 0 ? "var(--ball-us)" : "var(--ink-muted)"}
        />
        <Tile
          label="Onboarded"
          value={counts.onboarded}
          note="Set up, not yet on a campaign"
          accent="var(--ball-them)"
        />
        <Tile
          label="Active"
          value={counts.active}
          note="Working a campaign now"
          accent="var(--ball-running)"
        />
        <Tile
          label="Combined reach"
          value={totalReach >= 1000 ? `${(totalReach / 1000).toFixed(1)}k` : totalReach}
          note="Instagram and TikTok followers"
          accent="var(--ink-muted)"
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Segmented
          value={stage}
          onChange={setStage}
          options={[
            { value: "all" as const, label: "All", count: ambassadors.length },
            ...AMBASSADOR_STAGES.map((s) => ({
              value: s,
              label: AMBASSADOR_STAGE_META[s].label,
              count: counts[s],
            })),
          ]}
        />

        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <select
            aria-label="Filter by school"
            value={school}
            onChange={(event) => setSchool(event.target.value)}
            style={{ width: "auto", fontSize: 12.5, padding: "6px 8px" }}
          >
            <option value="all">Every school</option>
            {schools.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as "reach" | "recent")}
            style={{ width: "auto", fontSize: 12.5, padding: "6px 8px" }}
          >
            <option value="recent">Newest first</option>
            <option value="reach">Biggest reach first</option>
          </select>
        </div>
      </div>

      {stage !== "all" && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
          {AMBASSADOR_STAGE_META[stage].blurb}
        </p>
      )}

      {visible.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "18px 14px",
            fontSize: 13,
            color: "var(--ink-muted)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--radius)",
          }}
        >
          {ambassadors.length === 0
            ? "No applications yet. They arrive from the website form and land here automatically."
            : "Nothing matches those filters."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visible.map((ambassador) => (
            <AmbassadorRowCard
              key={ambassador.id}
              ambassador={ambassador}
              teamEmails={teamEmails}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: number | string;
  note: string;
  accent: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 999, background: accent, flexShrink: 0 }}
        />
        <span className="label">{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>{note}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count: number }[];
}) {
  return (
    <div
      role="group"
      aria-label="Filter by stage"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        borderRadius: 9,
        background: "var(--sunken)",
        border: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              background: active ? "var(--surface-raised)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-muted)",
            }}
          >
            {option.label}
            <span className="tabular" style={{ fontSize: 11.5, opacity: 0.75 }}>
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
