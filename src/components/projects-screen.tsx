"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectBoard } from "./project-board";
import { ProjectCalendar } from "./project-calendar";
import { TaskAttachments } from "./task-attachments";
import { Button } from "@/components/ui/button";
import { workspacesApi, WorkspaceRequestError, type Workspace } from "@/lib/workspaces-api";
import { currentUser, participantRoles, priorities, projectsApi, projectStatuses, sorts, tasksApi, taskStatuses, type Project, type ProjectMember, type Task } from "@/lib/projects-api";

function title(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function date(value: string | null) { return value?.slice(0, 10) ?? ""; }
function options(values: readonly string[]) { return values.map((value) => <option key={value} value={value}>{title(value)}</option>); }
function errorMessage(error: unknown) {
  return error instanceof WorkspaceRequestError ? error.message : "The request failed. Try again.";
}
function queryString(filters: Record<string, string>, page: number) {
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  return query.toString();
}

function useChange(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["projects", workspaceId] }),
  });
}

function Feedback({ loading, error }: { loading?: boolean; error?: unknown }) {
  return <>{loading && <p role="status">Loading…</p>}{Boolean(error) && <p role="alert">{errorMessage(error)}</p>}</>;
}

export function ProjectsScreen() {
  const params = useSearchParams();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: ({ signal }) => workspacesApi.list(signal), retry: false });
  const active = workspaces.data?.find((item) => item.id === params.get("workspace")) ?? workspaces.data?.[0];
  const signedOut = workspaces.error instanceof WorkspaceRequestError && workspaces.error.status === 401;
  const projectId = params.get("project");
  const selectedView = params.get("view");
  const view = selectedView === "board" || selectedView === "calendar" ? selectedView : "list";
  const taskId = params.get("task");

  return <div className="workspace-page">
    <header className="workspace-header"><Link href="/" className="auth-brand">TaskFlow</Link><Link href="/workspaces">Workspaces</Link></header>
    <main className="workspace-content projects-content">
      <h1>Projects</h1>
      {signedOut ? <p><Link href="/auth">Sign in</Link> to view projects.</p> : <Feedback loading={workspaces.isPending} error={workspaces.error} />}
      {workspaces.isSuccess && (active ? <>
        <nav aria-label="Project workspaces" className="project-workspaces">
          {workspaces.data.map((workspace) => <Link key={workspace.id} href={projectHref(workspace.id)} aria-current={workspace.id === active.id ? "page" : undefined}>{workspace.name}</Link>)}
        </nav>
        {projectId ? <ProjectDetails key={active.id + projectId} workspace={active} projectId={projectId} taskId={taskId} view={view} /> : <ProjectsList key={active.id} workspace={active} />}
      </> : <p><Link href="/workspaces">Create a workspace</Link> to start a project.</p>)}
    </main>
  </div>;
}

type ProjectView = "list" | "board" | "calendar";

function projectHref(workspaceId: string, projectId?: string, taskId?: string, view?: ProjectView) {
  const query = new URLSearchParams({ workspace: workspaceId });
  if (projectId) query.set("project", projectId);
  if (taskId) query.set("task", taskId);
  if (view && view !== "list") query.set("view", view);
  return "/projects?" + query + (taskId ? "#task-details" : "");
}

function Filters({ statuses, labelFilter, onApply }: { statuses: readonly string[]; labelFilter?: boolean; onApply: (filters: Record<string, string>) => void }) {
  return <form className="workspace-inline" onSubmit={(event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onApply(Object.fromEntries([...values].map(([key, value]) => [key, String(value)])));
  }}>
    <label>Search<input name="search" maxLength={100} /></label>
    <label>Status<select name="status"><option value="">All statuses</option>{options(statuses)}</select></label>
    <label>Priority<select name="priority"><option value="">All priorities</option>{options(priorities)}</select></label>
    {labelFilter && <label>Label<input name="label" maxLength={30} /></label>}
    <label>Sort<select name="sort"><option value="newest">Newest</option><option value="due">Due date</option><option value="name">Name</option></select></label>
    <Button type="submit">Apply filters</Button>
  </form>;
}

function PageControls({ page, pages, update }: { page: number; pages: number; update: (value: number) => void }) {
  if (pages <= 1 && page === 1) return null;
  return <nav className="workspace-actions" aria-label="Pagination">
    <Button disabled={page <= 1} onClick={() => update(page - 1)}>Previous</Button>
    <span>Page {page} of {Math.max(pages, 1)}</span>
    <Button disabled={page >= pages} onClick={() => update(page + 1)}>Next</Button>
  </nav>;
}

function ProjectFields({ project }: { project?: Project }) {
  return <>
    <label>Project name<input name="name" defaultValue={project?.name} minLength={2} maxLength={100} required /></label>
    <label>Description<textarea name="description" defaultValue={project?.description} maxLength={5000} /></label>
    <div className="workspace-inline">
      <label>Status<select name="status" defaultValue={project?.status ?? "PLANNED"}>{options(projectStatuses)}</select></label>
      <label>Priority<select name="priority" defaultValue={project?.priority ?? "MEDIUM"}>{options(priorities)}</select></label>
      <label>Due date<input name="dueDate" type="date" defaultValue={date(project?.dueDate ?? null)} /></label>
    </div>
  </>;
}

function projectInput(form: HTMLFormElement) {
  const values = new FormData(form);
  return {
    name: String(values.get("name")), description: String(values.get("description")),
    status: values.get("status") as Project["status"], priority: values.get("priority") as Project["priority"],
    dueDate: String(values.get("dueDate")) || null,
  };
}

function ProjectsList({ workspace }: { workspace: Workspace }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const query = queryString(filters, page);
  const list = useQuery({ queryKey: ["projects", workspace.id, "list", query], queryFn: ({ signal }) => projectsApi.list(workspace.id, query, signal) });
  const change = useChange(workspace.id);
  const mayManage = workspace.role === "OWNER" || workspace.role === "ADMIN";
  return <>
    {mayManage && <details className="workspace-panel project-create"><summary>Create project</summary>
      <form className="auth-fields" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = projectInput(form);
        change.mutate(async () => {
          await projectsApi.create(workspace.id, input);
          form.reset();
          setPage(1);
        });
      }}><ProjectFields /><Button type="submit" disabled={change.isPending}>Create project</Button></form>
      <Feedback error={change.error} />
    </details>}
    <section className="workspace-panel" aria-label="Project list">
      <Filters statuses={projectStatuses} onApply={(value) => { setFilters(value); setPage(1); }} />
      <Feedback loading={list.isPending} error={list.error} />
      {list.data?.items.length === 0 && <p>No projects match your filters.</p>}
      <div className="project-grid">
        {list.data?.items.map((project) => <article className="project-card" key={project.id}>
          <Link href={projectHref(workspace.id, project.id)}><h2>{project.name}</h2></Link>
          <p>{title(project.status)} · {title(project.priority)} priority</p>
          {project.dueDate && <p>Due <time dateTime={date(project.dueDate)}>{date(project.dueDate)}</time></p>}
          <progress aria-label={`${project.name} progress`} value={project.completedTasks} max={Math.max(project.totalTasks, 1)} />
          <p>{project.completedTasks} of {project.totalTasks} tasks complete</p>
        </article>)}
      </div>
      {list.data && <PageControls page={page} pages={list.data.pages} update={setPage} />}
    </section>
  </>;
}

function ProjectDetails({ workspace, projectId, taskId, view }: { workspace: Workspace; projectId: string; taskId: string | null; view: ProjectView }) {
  const [deleted, setDeleted] = useState(false);
  const id = workspace.id;
  const manager = workspace.role === "OWNER" || workspace.role === "ADMIN";
  const project = useQuery({ queryKey: ["projects", id, projectId, "detail"], queryFn: ({ signal }) => projectsApi.get(id, projectId, signal), enabled: !deleted, retry: false });
  const members = useQuery({ queryKey: ["projects", id, projectId, "members"], queryFn: ({ signal }) => projectsApi.members(id, projectId, signal), enabled: project.isSuccess && !deleted });
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => currentUser(signal), enabled: workspace.role === "MEMBER" });
  const editTasks = manager || (workspace.role === "MEMBER" && members.data?.some(({ user: person }) => person.id === user.data?.id) === true);
  const change = useChange(id);

  return <>
    <Link href={projectHref(id)}>All projects</Link>
    {deleted ? <p role="status">Project deleted.</p> : <Feedback loading={project.isPending} error={project.error} />}
    {project.data && !deleted && <>
      <section className="workspace-panel">
        <div className="workspace-heading"><h2>{project.data.name}</h2><span className="workspace-role">{title(project.data.status)}</span></div>
        {project.data.description && <p className="project-description">{project.data.description}</p>}
        <p>{title(project.data.priority)} priority · {project.data.completedTasks} of {project.data.totalTasks} tasks complete</p>
        {project.data.dueDate && <p>Due {date(project.data.dueDate)}</p>}
        {manager && <details className="project-create"><summary>Edit project</summary>
          <form className="auth-fields" key={JSON.stringify(project.data)} onSubmit={(event) => {
            event.preventDefault();
            const input = projectInput(event.currentTarget);
            change.mutate(() => projectsApi.update(id, projectId, input));
          }}><ProjectFields project={project.data} /><Button type="submit" disabled={change.isPending}>Save project</Button></form>
          <Button className="mt-2" disabled={change.isPending} onClick={() => {
            if (window.confirm("Delete this project and all of its tasks?")) change.mutate(async () => { await projectsApi.remove(id, projectId); setDeleted(true); });
          }}>Delete project</Button>
        </details>}
        <Feedback error={change.error} />
      </section>
      <ProjectTeam workspaceId={id} projectId={projectId} manager={manager} members={members.data} error={members.error} />
      <nav className="project-workspaces" aria-label="Project views">
        {(["list", "board", "calendar"] as const).map((item) => <Link key={item} href={projectHref(id, projectId, undefined, item)} aria-current={item === view ? "page" : undefined}>{title(item)}</Link>)}
      </nav>
      {view === "list" && <TaskList workspaceId={id} projectId={projectId} editable={editTasks} />}
      {view === "board" && <ProjectBoard workspaceId={id} projectId={projectId} editable={editTasks} taskHref={(task) => projectHref(id, projectId, task, view)} />}
      {view === "calendar" && <ProjectCalendar workspaceId={id} projectId={projectId} taskHref={(task) => projectHref(id, projectId, task, view)} />}
      {taskId && <TaskDetails key={taskId} workspaceId={id} projectId={projectId} taskId={taskId} editable={editTasks} members={members.data ?? []} view={view} />}
    </>}
  </>;
}

function ProjectTeam({ workspaceId, projectId, manager, members, error }: { workspaceId: string; projectId: string; manager: boolean; members?: ProjectMember[]; error: unknown }) {
  const roster = useQuery({ queryKey: ["workspace-members", workspaceId], queryFn: ({ signal }) => workspacesApi.members(workspaceId, signal), enabled: manager });
  const available = roster.data?.filter(({ role, user }) => role !== "VIEWER" && !members?.some((member) => member.user.id === user.id)) ?? [];
  const change = useChange(workspaceId);
  return <section className="workspace-panel">
    <h2>Project team</h2>
    <Feedback loading={!members && !error} error={error || change.error || (manager ? roster.error : undefined)} />
    {members?.length === 0 && <p>No project members.</p>}
    <ul className="workspace-list">{members?.map(({ user, role }) => <li key={user.id}>
      <span>{user.name} <span className="workspace-role">{title(role)}</span></span>
      {manager && <Button disabled={change.isPending} onClick={() => {
        if (window.confirm(`Remove ${user.name} from the project and its tasks?`)) change.mutate(() => projectsApi.removeMember(workspaceId, projectId, user.id));
      }}>Remove</Button>}
    </li>)}</ul>
    {manager && available.length > 0 && <form className="workspace-inline" onSubmit={(event) => {
      event.preventDefault();
      const userId = String(new FormData(event.currentTarget).get("member"));
      change.mutate(() => projectsApi.addMember(workspaceId, projectId, userId));
    }}><label>Add team member<select name="member" required><option value="">Choose a person</option>{available.map(({ user }) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><Button type="submit" disabled={change.isPending}>Add member</Button></form>}
  </section>;
}

function taskInput(form: HTMLFormElement) {
  const fields = new FormData(form);
  return {
    title: String(fields.get("title")), description: String(fields.get("description")),
    status: fields.get("status") as Task["status"], priority: fields.get("priority") as Task["priority"],
    startDate: String(fields.get("startDate")) || null, dueDate: String(fields.get("dueDate")) || null,
    labels: String(fields.get("labels")).split(",").map((value) => value.trim()).filter(Boolean),
  };
}

function TaskForm({ task, submit, children }: { task?: Task; submit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  return <form className="auth-fields" onSubmit={submit}>
    <label>Task title<input name="title" defaultValue={task?.title} minLength={2} maxLength={150} required /></label>
    <label>Description<textarea name="description" defaultValue={task?.description} maxLength={5000} /></label>
    <div className="workspace-inline">
      <label>Status<select name="status" defaultValue={task?.status ?? "TODO"}>{options(taskStatuses)}</select></label>
      <label>Priority<select name="priority" defaultValue={task?.priority ?? "MEDIUM"}>{options(priorities)}</select></label>
      <label>Start date<input type="date" name="startDate" defaultValue={date(task?.startDate ?? null)} /></label>
      <label>Due date<input type="date" name="dueDate" defaultValue={date(task?.dueDate ?? null)} /></label>
    </div>
    <label>Labels (comma-separated)<input name="labels" defaultValue={task?.labels.join(", ")} maxLength={370} /></label>
    {children}
  </form>;
}

function TaskList({ workspaceId, projectId, editable }: { workspaceId: string; projectId: string; editable: boolean }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const query = queryString(filters, page);
  const list = useQuery({ queryKey: ["projects", workspaceId, projectId, "tasks", query], queryFn: ({ signal }) => tasksApi.list(workspaceId, projectId, query, signal) });
  const change = useChange(workspaceId);
  return <section className="workspace-panel">
    <h2>Task list</h2>
    {editable && <details className="project-create"><summary>Add task</summary>
      <TaskForm submit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = taskInput(form);
        change.mutate(async () => { await tasksApi.create(workspaceId, projectId, input); form.reset(); setPage(1); });
      }}><Button type="submit" disabled={change.isPending}>Create task</Button></TaskForm>
    </details>}
    <Filters statuses={taskStatuses} labelFilter onApply={(value) => { setFilters(value); setPage(1); }} />
    <Feedback loading={list.isPending} error={change.error || list.error} />
    {list.data?.items.length === 0 && <p>No tasks match your filters.</p>}
    <ul className="workspace-list">{list.data?.items.map((task) => <li key={task.id}>
      <Link href={projectHref(workspaceId, projectId, task.id)}>{task.title}</Link>
      <span className="workspace-role">{title(task.status)}</span>
      <span>{title(task.priority)} priority{task.dueDate ? ` · Due ${date(task.dueDate)}` : ""}</span>
    </li>)}</ul>
    {list.data && <PageControls page={page} pages={list.data.pages} update={setPage} />}
  </section>;
}

function TaskDetails({ workspaceId, projectId, taskId, editable, members, view }: {
  workspaceId: string; projectId: string; taskId: string; editable: boolean; members: ProjectMember[]; view: ProjectView;
}) {
  const [deleted, setDeleted] = useState(false);
  const result = useQuery({
    queryKey: ["projects", workspaceId, projectId, "task", taskId],
    queryFn: ({ signal }) => tasksApi.get(workspaceId, projectId, taskId, signal), enabled: !deleted, retry: false,
  });
  const change = useChange(workspaceId);
  const cache = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      tasksApi.completeSubtask(workspaceId, projectId, taskId, id, completed),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["projects", workspaceId, projectId, "task", taskId] }),
  });
  const task = result.data;
  const remove = () => {
    if (window.confirm("Delete this task and its subtasks?")) change.mutate(async () => {
      await tasksApi.remove(workspaceId, projectId, taskId);
      setDeleted(true);
    });
  };
  return <section id="task-details" tabIndex={-1} className="workspace-panel" aria-label="Task details">
    <Link href={projectHref(workspaceId, projectId, undefined, view)}>Close task</Link>
    {deleted ? <p role="status">Task deleted.</p> : <Feedback loading={result.isPending} error={result.error || change.error || toggle.error} />}
    {task && !deleted && <>
      <div className="workspace-heading"><h2>{task.title}</h2><span className="workspace-role">{title(task.status)}</span></div>
      {task.description && <p className="project-description">{task.description}</p>}
      <p>{title(task.priority)} priority {task.startDate && ` · Starts ${date(task.startDate)}`} {task.dueDate && `· Due ${date(task.dueDate)}`}</p>
      {task.labels.length > 0 && <ul className="workspace-inline" aria-label="Labels">{task.labels.map((label) => <li className="workspace-role" key={label}>{label}</li>)}</ul>}
      {editable && <details className="project-create"><summary>Edit task</summary>
        <TaskForm key={JSON.stringify(task)} task={task} submit={(event) => {
          event.preventDefault();
          const input = taskInput(event.currentTarget);
          change.mutate(() => tasksApi.update(workspaceId, projectId, taskId, input));
        }}><Button type="submit" disabled={change.isPending}>Save task</Button></TaskForm>
        <Button className="mt-2" disabled={change.isPending} onClick={remove}>Delete task</Button>
      </details>}
      <h3>People</h3>
      {task.participants.length === 0 && <p>No assignees or collaborators.</p>}
      <ul className="workspace-list">{task.participants.map(({ user, role }) => <li key={user.id}>
        <span>{user.name} · {title(role)}</span>
        {editable && <Button disabled={change.isPending} onClick={() => change.mutate(() => tasksApi.removeParticipant(workspaceId, projectId, taskId, user.id))}>Remove person</Button>}
      </li>)}</ul>
      {editable && members.length > 0 && <form className="workspace-inline" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const userId = String(fields.get("person"));
        const role = fields.get("role") as (typeof participantRoles)[number];
        change.mutate(() => tasksApi.setParticipant(workspaceId, projectId, taskId, userId, role));
      }}><label>Person<select name="person" required><option value="">Choose a person</option>{members.map(({ user }) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label>Task role<select name="role">{options(participantRoles)}</select></label><Button type="submit" disabled={change.isPending}>Assign person</Button>
      </form>}
      <h3>Subtasks</h3>
      {task.subtasks.length === 0 && <p>No subtasks.</p>}
      <ul className="workspace-list">{task.subtasks.map((subtask) => <li key={subtask.id}>
        <label className="subtask-checkbox"><input type="checkbox" checked={toggle.isPending && toggle.variables.id === subtask.id ? toggle.variables.completed : subtask.completed} disabled={!editable || change.isPending || toggle.isPending} onChange={(event) => {
          toggle.mutate({ id: subtask.id, completed: event.target.checked });
        }} />{subtask.title}</label>
        {editable && <Button disabled={change.isPending} onClick={() => change.mutate(() => tasksApi.removeSubtask(workspaceId, projectId, taskId, subtask.id))}>Remove subtask</Button>}
      </li>)}</ul>
      {editable && <form className="workspace-inline" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = String(new FormData(form).get("title"));
        change.mutate(async () => { await tasksApi.createSubtask(workspaceId, projectId, taskId, value); form.reset(); });
      }}><label>Subtask title<input name="title" minLength={2} maxLength={150} required /></label><Button type="submit" disabled={change.isPending}>Add subtask</Button></form>}
      <TaskAttachments workspaceId={workspaceId} projectId={projectId} taskId={taskId} editable={editable} />
    </>}
  </section>;
}
