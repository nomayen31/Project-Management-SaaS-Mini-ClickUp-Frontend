import { Suspense } from "react";
import { WorkspacesScreen } from "@/components/workspaces-screen";

export default function WorkspacesPage() {
  return <Suspense fallback={<main className="overview">Loading workspaces…</main>}>
    <WorkspacesScreen />
  </Suspense>;
}
