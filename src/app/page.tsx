import { Suspense } from "react";
import { Overview } from "@/components/overview";

export default function Page() {
  return <Suspense fallback={<main className="workspace-content"><h1>Workspace overview</h1><p role="status">Loading workspace…</p></main>}>
    <Overview />
  </Suspense>;
}
