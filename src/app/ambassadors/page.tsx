import AmbassadorBoard from "@/components/AmbassadorBoard";
import Header from "@/components/Header";
import Tabs from "@/components/Tabs";
import { requireUser } from "@/lib/auth";
import { isLocalMode, latestScanRun, listAmbassadors, listBoardBrands } from "@/lib/data";
import { allowedEmails } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AmbassadorsPage() {
  const user = await requireUser();

  const [ambassadors, brands, lastRun] = await Promise.all([
    listAmbassadors(),
    listBoardBrands(),
    latestScanRun(),
  ]);

  return (
    <main className="page">
      <Header user={user} lastRun={lastRun} localMode={isLocalMode()} />
      <Tabs pipelineCount={brands.length} ambassadorCount={ambassadors.length} />
      <AmbassadorBoard ambassadors={ambassadors} teamEmails={[...allowedEmails()].sort()} />
    </main>
  );
}
