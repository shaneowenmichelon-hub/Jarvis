import Link from "next/link";

import AmbassadorBoard from "@/components/AmbassadorBoard";
import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import { requireUser } from "@/lib/auth";
import { isLocalMode, latestScanRun, listAmbassadors, listBoardBrands } from "@/lib/data";
import { allowedEmails } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AmbassadorsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const user = await requireUser();
  const showArchived = (await searchParams).archived === "1";

  // Both lists every time: the active count belongs on the tab whichever view
  // you are looking at, and the archived count is only worth showing when
  // there is something in it.
  const [ambassadors, archived, brands, lastRun] = await Promise.all([
    listAmbassadors(),
    listAmbassadors({ archived: true }),
    listBoardBrands(),
    latestScanRun(),
  ]);

  const shown = showArchived ? archived : ambassadors;

  return (
    <main className="page">
      <Header user={user} lastRun={lastRun} localMode={isLocalMode()} />
      <Tabs pipelineCount={brands.length} ambassadorCount={ambassadors.length} />

      {showArchived && (
        <div
          className="card"
          style={{ padding: "12px 14px", marginBottom: 18, borderColor: "var(--warning)" }}
        >
          <strong style={{ fontSize: 13.5 }}>Archived applicants</strong>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-secondary)" }}>
            Taken off the recruiting list, kept for the record. Nothing here was deleted, and the
            undo button on a row puts someone back.
          </p>
        </div>
      )}

      <AmbassadorBoard ambassadors={shown} teamEmails={[...allowedEmails()].sort()} />

      {(archived.length > 0 || showArchived) && (
        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--ink-muted)" }}>
          {showArchived ? (
            <Link href="/ambassadors" style={{ color: "var(--ball-them)" }}>
              ← Back to the recruiting list ({ambassadors.length})
            </Link>
          ) : (
            <Link href="/ambassadors?archived=1" style={{ color: "var(--ball-them)" }}>
              View archived ({archived.length}) →
            </Link>
          )}
        </p>
      )}
    </main>
  );
}
