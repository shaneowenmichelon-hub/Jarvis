import Link from "next/link";

import Board from "@/components/Board";
import Header from "@/components/Header";
import LocalModeBanner from "@/components/LocalModeBanner";
import StatRow from "@/components/StatRow";
import Tabs from "@/components/Tabs";
import { requireUser } from "@/lib/auth";
import {
  activeInbox,
  isLocalMode,
  latestScanRun,
  listAmbassadors,
  listBoardBrands,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await requireUser();
  const local = isLocalMode();

  const [brands, lastRun, inbox, ambassadors] = await Promise.all([
    listBoardBrands(),
    latestScanRun(),
    activeInbox(),
    listAmbassadors(),
  ]);

  return (
    <main className="page">
      <Header user={user} lastRun={lastRun} localMode={local} />
      <Tabs pipelineCount={brands.length} ambassadorCount={ambassadors.length} />

      {local && <LocalModeBanner brandCount={brands.length} />}
      {!local && !inbox && <ConnectPrompt />}

      <StatRow brands={brands} />
      <Board brands={brands} />

      {!local && inbox && brands.length === 0 && (
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--ink-muted)" }}>
          Nothing on the board yet. The first scan reaches back six months — run it from
          &ldquo;Scan now&rdquo; above, or wait for the top of the hour.
        </p>
      )}
    </main>
  );
}

function ConnectPrompt() {
  return (
    <div
      className="card"
      style={{ padding: "14px 16px", marginBottom: 20, borderColor: "var(--warning)" }}
    >
      <strong style={{ fontSize: 14 }}>No inbox connected</strong>
      <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--ink-secondary)" }}>
        The board stays empty until a Gmail account is linked. This is read-only access —
        the dashboard never sends, labels, or deletes mail.
      </p>
      <Link href="/settings" className="btn btn-sm btn-primary">
        Connect Gmail
      </Link>
    </div>
  );
}
