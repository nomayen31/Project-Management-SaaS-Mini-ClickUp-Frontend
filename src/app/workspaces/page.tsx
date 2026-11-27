import { Suspense } from "react";
import { AppProviders } from "@/components/app-providers";
import { WorkspacesScreen } from "@/components/workspaces-screen";

export default function WorkspacesPage() {
  return <Suspense fallback={<main className="overview">Loading workspaces…</main>}>
    <AppProviders><WorkspacesScreen /></AppProviders>
  </Suspense>;
}
