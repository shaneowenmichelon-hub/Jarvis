/**
 * Says plainly that this is the seeded local copy, not a live inbox.
 *
 * A pipeline tool that looks live but is not is worse than one that is
 * obviously a demo, so this sits above the board rather than in a corner.
 */
export default function LocalModeBanner({
  formCount,
  manualCount,
  ambassadorCount,
}: {
  formCount: number;
  manualCount: number;
  ambassadorCount: number;
}) {
  return (
    <div
      className="card"
      style={{ padding: "13px 16px", marginBottom: 20, borderColor: "var(--warning)" }}
    >
      <strong style={{ fontSize: 13.5 }}>Running locally on seeded data</strong>
      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
        Everything the collegiateagency.com form sent between 31 August and 21 September 2026:{" "}
        {formCount} brand {formCount === 1 ? "inquiry" : "inquiries"} and {ambassadorCount}{" "}
        ambassador {ambassadorCount === 1 ? "application" : "applications"}, plus the
        conversation that followed each one
        {manualCount > 0 && `, and ${manualCount} entered by hand that came in off-website`}. The
        team&rsquo;s own test submissions are left out. Moving cards, assigning owners and editing
        notes all work and persist to <code>.local-data/db.json</code>. Nothing here reads live
        mail; for that, connect Supabase and Gmail and the hourly scan takes over.
      </p>
    </div>
  );
}
