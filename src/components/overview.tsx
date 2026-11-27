"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarDays, FolderKanban } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { HealthPanel } from "./health-panel";
import { projectsApi } from "@/lib/projects-api";
import { workspacesApi, WorkspaceRequestError } from "@/lib/workspaces-api";

const featuredQuery = "limit=5&sort=newest";

export function Overview() {
  const router = useRouter();
  const params = useSearchParams();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: ({ signal }) => workspacesApi.list(signal), retry: false });
  const active = workspaces.isSuccess
    ? workspaces.data.find((workspace) => workspace.id === params.get("workspace")) ?? workspaces.data[0]
    : undefined;
  const workspaceId = active?.id ?? "";
  const signedOut = workspaces.error instanceof WorkspaceRequestError && workspaces.error.status === 401;
  const unavailable = workspaces.error instanceof WorkspaceRequestError && workspaces.error.status === 404;
  const projects = useQuery({
    queryKey: ["projects", workspaceId, "list", featuredQuery],
    queryFn: ({ signal }) => projectsApi.list(workspaceId, featuredQuery, signal),
    enabled: Boolean(workspaceId), retry: false,
  });
  const projectsHref = `/projects?workspace=${workspaceId}`;

  return <main className="workspace-content dashboard-content">
    <div className="dashboard-title">
      <div>
        <h1>Workspace overview</h1>
        {active && <p>{active.name}</p>}
      </div>
      {active && <div className="dashboard-switch"><label htmlFor="overview-workspace">Workspace</label>
        <select id="overview-workspace" value={active.id} onChange={(event) => router.replace(`/?workspace=${event.target.value}`)}>
          {workspaces.data?.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}
        </select>
      </div>}
    </div>
    {signedOut || unavailable || (workspaces.isSuccess && !active) ? <section className="dashboard-welcome">
      <FolderKanban size={25} aria-hidden="true" />
      <h2>{signedOut || unavailable ? "Open your workspace" : "Create your first workspace"}</h2>
      <p>{signedOut ? "Sign in to see your projects and their progress." : unavailable ? "Sign-in options depend on how this environment is configured." : "Create a workspace to organize projects and invite your team."}</p>
      <Link className="dashboard-cta" href={signedOut || unavailable ? "/auth" : "/workspaces"}>{signedOut || unavailable ? "Go to sign-in" : "Create workspace"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </section> : <>
      {workspaces.isPending && <p role="status">Loading your workspaces…</p>}
      {workspaces.isError && <div className="workspace-panel"><p role="alert">Workspaces could not be loaded.</p><Button onClick={() => void workspaces.refetch()}>Try again</Button></div>}
      {active && <section className="workspace-panel dashboard-projects" aria-labelledby="recent-project-title">
        <div className="workspace-heading dashboard-panel-heading">
          <h2 id="recent-project-title">Recent projects {projects.data && <span className="workspace-role">{projects.data.total}</span>}</h2>
          <Link href={projectsHref}>View all projects <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        {projects.isPending && <p role="status">Loading projects…</p>}
        {projects.isError && <div><p role="alert">Projects could not be loaded.</p><Button onClick={() => void projects.refetch()}>Try again</Button></div>}
        {projects.data?.items.length === 0 && <p>This workspace has no projects yet.</p>}
        <ul className="dashboard-project-list">{projects.data?.items.map((project) => <li key={project.id}>
          <div className="dashboard-project-title">
            <FolderKanban size={19} aria-hidden="true" />
            <Link href={projectsHref + "&project=" + project.id}>{project.name}</Link>
          </div>
          <div className="dashboard-progress">
            <progress aria-label={`${project.name} progress`} value={project.completedTasks} max={Math.max(project.totalTasks, 1)} />
            <span>{project.completedTasks}/{project.totalTasks} complete</span>
          </div>
          <span className="dashboard-date">{project.dueDate && <><CalendarDays size={15} aria-hidden="true" /><time dateTime={project.dueDate.slice(0, 10)}>{project.dueDate.slice(0, 10)}</time></>}</span>
        </li>)}</ul>
      </section>}
    </>}
    <details className="dashboard-diagnostics">
      <summary>Connection status</summary>
      <HealthPanel />
    </details>
  </main>;
}
