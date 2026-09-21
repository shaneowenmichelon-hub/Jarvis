/**
 * Says plainly that this is the seeded local copy, not a live inbox.
 *
 * A pipeline tool that looks live but is not is worse than one that is
 * obviously a demo, so this sits above the board rather than in a corner.
 */
export default function LocalModeBanner({ brandCount }: { brandCount: number }) {
  return (
    <div
      className="card"
      style={{ padding: "13px 16px", marginBottom: 20, borderColor: "var(--warning)" }}
    >
      <strong style={{ fontSize: 13.5 }}>Running locally on seeded data</strong>
      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
        {brandCount} brands from a real scan of the ZMM inbox covering 31 August to 21 September
        2026. Moving cards, assigning owners and editing notes all work and persist to{" "}
        <code>.local-data/db.json</code>. Nothing here reads live mail — for that, connect
        Supabase and Gmail and the hourly scan takes over.
      </p>
    </div>
  );
}
