import { compareByUrgency } from "@/lib/stages";
import { STAGES, STAGE_META, type BrandRow, type Stage } from "@/lib/types";

import BrandCard from "./BrandCard";

const BALL_COLOR: Record<"us" | "them" | "running", string> = {
  us: "var(--ball-us)",
  them: "var(--ball-them)",
  running: "var(--ball-running)",
};

/**
 * The four areas.
 *
 * The accent on each column says whose move it is — ours, theirs, or already
 * running — rather than giving every column an arbitrary colour of its own.
 * Identity comes from the heading, which is always visible, so nothing here
 * depends on being able to tell two hues apart.
 */
export default function Board({ brands }: { brands: BrandRow[] }) {
  const byStage = new Map<Stage, BrandRow[]>(STAGES.map((stage) => [stage, []]));

  for (const brand of brands) {
    if (brand.archived) continue;
    byStage.get(brand.stage)?.push(brand);
  }

  for (const list of byStage.values()) {
    // Longest-waiting first: the top of each column is what is about to be
    // forgotten.
    list.sort(compareByUrgency);
  }

  return (
    <div className="board">
      {STAGES.map((stage) => {
        const meta = STAGE_META[stage];
        const list = byStage.get(stage) ?? [];

        return (
          <section key={stage} aria-labelledby={`col-${stage}`}>
            <div
              style={{
                borderTop: `3px solid ${BALL_COLOR[meta.ball]}`,
                paddingTop: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <h2 id={`col-${stage}`} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  {meta.label}
                </h2>
                <span className="tabular" style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                  {list.length}
                </span>
              </div>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 11.5,
                  color: "var(--ink-muted)",
                  lineHeight: 1.4,
                }}
              >
                {meta.blurb}
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {list.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: "14px 12px",
                    fontSize: 12.5,
                    color: "var(--ink-muted)",
                    border: "1px dashed var(--border-strong)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  Nothing here.
                </p>
              ) : (
                list.map((brand) => <BrandCard key={brand.id} brand={brand} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
