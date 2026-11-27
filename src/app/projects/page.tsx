import { Suspense } from "react";
import { ProjectsScreen } from "@/components/projects-screen";

export default function ProjectsPage() {
  return <Suspense fallback={<main className="overview">Loading projects…</main>}>
    <ProjectsScreen />
  </Suspense>;
}
