import { urgency } from "@/lib/stages";
import type { BrandRow } from "@/lib/types";

interface Tile {
  label: string;
  value: number;
  /** One line saying what the number counts, so nobody has to guess. */
  note: string;
  accent: string;
}

/**
 * Four numbers, chosen so the first one is the only one Shane has to read on a
 * busy day: how many brands are sitting there waiting on us.
 */
export default function StatRow({ brands }: { brands: BrandRow[] }) {
  const now = new Date();
  const live = brands.filter((brand) => !brand.archived);

  const waitingOnUs = live.filter(
    (brand) => brand.stage === "new_submission" || brand.stage === "needs_reply",
  ).length;

  const outForFeedback = live.filter((brand) => brand.stage === "awaiting_feedback").length;
  const active = live.filter((brand) => brand.stage === "active_campaign").length;

  const overdue = live.filter(
    (brand) => urgency(brand.stage, brand.last_message_at, now).level === "critical",
  ).length;

  const tiles: Tile[] = [
    {
      label: "Waiting on you",
      value: waitingOnUs,
      note: "New submissions and unanswered replies",
      accent: "var(--ball-us)",
    },
    {
      label: "Out for feedback",
      value: outForFeedback,
      note: "Proposals sitting with the brand",
      accent: "var(--ball-them)",
    },
    {
      label: "Active campaigns",
      value: active,
      note: "Signed and running",
      accent: "var(--ball-running)",
    },
    {
      label: "Overdue",
      value: overdue,
      note: "Past the limit for their stage",
      accent: overdue > 0 ? "var(--critical)" : "var(--ink-muted)",
    },
  ];

  return (
    <div className="stat-row" style={{ marginBottom: 20 }}>
      {tiles.map((tile) => (
        <div key={tile.label} className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: tile.accent,
                flexShrink: 0,
              }}
            />
            <span className="label">{tile.label}</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.15, marginTop: 6 }}>
            {tile.value}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>{tile.note}</div>
        </div>
      ))}
    </div>
  );
}
