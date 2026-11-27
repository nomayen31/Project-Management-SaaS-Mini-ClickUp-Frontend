"use client";

import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, CircleCheck, Clock3, ListTodo, UserRoundMinus } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { request } from "@/lib/workspaces-api";
import { Button } from "./ui/button";

const count = z.number().int().nonnegative();
const status = z.object({ status: z.string(), count });
const dashboard = z.object({
  date: z.iso.date(), taskStatuses: z.array(status), projectStatuses: z.array(status), overdue: count, unassigned: count,
  upcomingTasks: z.array(z.object({ id: z.uuid(), title: z.string(), dueDate: z.iso.datetime(), project: z.object({ id: z.uuid(), name: z.string() }) })),
  upcomingProjects: z.array(z.object({ id: z.uuid(), name: z.string(), dueDate: z.iso.datetime() })),
  workload: z.array(z.object({ userId: z.string(), name: z.string(), open: count, overdue: count })),
});

const statusLabels: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done" };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function localDate() {
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);
}

export function DashboardInsights({ workspaceId }: { workspaceId: string }) {
  const date = localDate();
  const query = useQuery({
    queryKey: ["workspace-dashboard", workspaceId, date],
    queryFn: ({ signal }) => request(`/${workspaceId}/dashboard?date=${date}`, dashboard, { signal }),
    retry: false,
  });

  if (query.isPending) return <div className="workspace-panel dashboard-skeleton" role="status">Loading workspace metrics…</div>;
  if (query.isError) return <div className="workspace-panel"><p role="alert">Workspace metrics could not be loaded.</p><Button onClick={() => void query.refetch()}>Retry metrics</Button></div>;

  const { taskStatuses, projectStatuses, overdue, unassigned, upcomingTasks, upcomingProjects, workload } = query.data;
  const total = taskStatuses.reduce((sum, row) => sum + row.count, 0);
  const done = taskStatuses.find(({ status }) => status === "DONE")?.count ?? 0;
  const activeProjects = projectStatuses.find(({ status }) => status === "ACTIVE")?.count ?? 0;
  const open = total - done;
  const stats = [
    { label: "Active projects", value: activeProjects, icon: BriefcaseBusiness },
    { label: "Open tasks", value: open, icon: ListTodo },
    { label: "Completed tasks", value: done, icon: CircleCheck },
    { label: "Overdue tasks", value: overdue, icon: Clock3 },
    { label: "Unassigned tasks", value: unassigned, icon: UserRoundMinus },
  ];
  const base = `/projects?workspace=${workspaceId}`;
  const max = Math.max(1, ...workload.map(({ open }) => open));
  const deadlines = [
    ...upcomingProjects.map((item) => ({ id: item.id, title: item.name, subtitle: "Project", dueDate: item.dueDate, href: base + "&project=" + item.id })),
    ...upcomingTasks.map((item) => ({ id: item.id, title: item.title, subtitle: item.project.name, dueDate: item.dueDate, href: base + "&project=" + item.project.id + "&task=" + item.id + "#task-details" })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title)).slice(0, 8);

  return <>
    <dl className="dashboard-stats" aria-label="Workspace metrics">
      {stats.map(({ label, value, icon: Icon }) => <div key={label}>
        <dt><Icon size={17} aria-hidden="true" />{label}</dt><dd>{value}</dd>
      </div>)}
    </dl>
    <div className="dashboard-insight-grid">
      <section className="workspace-panel" aria-labelledby="dashboard-status-title">
        <h2 id="dashboard-status-title">Tasks by status</h2>
        <ul className="dashboard-bars">{Object.entries(statusLabels).map(([status, label]) => {
          const value = taskStatuses.find((row) => row.status === status)?.count ?? 0;
          return <li key={status}><span>{label}</span><div className="dashboard-bar" aria-hidden="true"><span data-status={status} style={{ width: `${total ? value / total * 100 : 0}%` }} /></div><strong>{value}</strong></li>;
        })}</ul>
      </section>
      <section className="workspace-panel" aria-labelledby="dashboard-deadline-title">
        <div className="workspace-heading dashboard-inline-title"><h2 id="dashboard-deadline-title">Upcoming deadlines</h2><span className="workspace-role">Next 14 days</span></div>
        {deadlines.length === 0 ? <p>No upcoming deadlines.</p> : <ul className="workspace-list">
          {deadlines.map((item) => <li key={item.id}><div className="dashboard-deadline"><Link href={item.href}>{item.title}</Link><small>{item.subtitle}</small></div>
            <time dateTime={item.dueDate.slice(0, 10)}>{dateLabel(item.dueDate)}</time></li>)}
        </ul>}
      </section>
      <section className="workspace-panel dashboard-workload" aria-labelledby="dashboard-workload-title">
        <h2 id="dashboard-workload-title">Team workload</h2>
        <p className="dashboard-muted">Open assignments by team member</p>
        {!workload.length ? <p>No team members with task access yet.</p> : <ul className="dashboard-bars">
          {workload.map((item) => <li key={item.userId}>
            <span>{item.name}</span>
            <div className="dashboard-bar" aria-hidden="true"><span style={{ width: `${item.open / max * 100}%` }} /></div>
            <strong>{item.open} open{item.overdue > 0 && <small> · {item.overdue} overdue</small>}</strong>
          </li>)}
        </ul>}
      </section>
    </div>
  </>;
}
