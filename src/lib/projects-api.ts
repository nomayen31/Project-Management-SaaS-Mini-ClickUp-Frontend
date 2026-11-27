import { z } from "zod";
import { request, json, WorkspaceRequestError } from "./workspaces-api";

export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const projectStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETE"] as const;
export const taskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export const participantRoles = ["ASSIGNEE", "COLLABORATOR"] as const;
export const sorts = ["newest", "due", "name"] as const;

const person = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() });
const subtask = z.object({ id: z.uuid(), title: z.string(), completed: z.boolean() });
const project = z.object({
  id: z.uuid(), name: z.string(), description: z.string(), status: z.enum(projectStatuses),
  priority: z.enum(priorities), dueDate: z.iso.datetime().nullable(),
  totalTasks: z.number(), completedTasks: z.number(),
});
const task = z.object({
  id: z.uuid(), title: z.string(), description: z.string(), status: z.enum(taskStatuses),
  priority: z.enum(priorities), startDate: z.iso.datetime().nullable(), dueDate: z.iso.datetime().nullable(),
  labels: z.array(z.string()), subtasks: z.array(subtask),
  participants: z.array(z.object({ role: z.enum(participantRoles), user: person })),
});
const projectMember = z.object({ user: person, role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]) });

export type Project = z.infer<typeof project>;
export type Task = z.infer<typeof task>;
export type ProjectMember = z.infer<typeof projectMember>;
type ProjectInput = Pick<Project, "name" | "description" | "status" | "priority" | "dueDate">;
type TaskInput = Pick<Task, "title" | "description" | "status" | "priority" | "startDate" | "dueDate" | "labels">;
type ParticipantRole = (typeof participantRoles)[number];

const page = <T>(item: z.ZodType<T>) => z.object({
  items: z.array(item), page: z.number(), limit: z.number(), total: z.number(), pages: z.number(),
});

const empty = z.undefined();
const projects = (workspaceId: string) => `/${workspaceId}/projects`;
const projectPath = (workspaceId: string, id: string) => `${projects(workspaceId)}/${id}`;
const tasks = (workspaceId: string, projectId: string) => `${projectPath(workspaceId, projectId)}/tasks`;
const taskPath = (workspaceId: string, projectId: string, id: string) => `${tasks(workspaceId, projectId)}/${id}`;

export const projectsApi = {
  list: (workspaceId: string, query: string, signal: AbortSignal) => request(`${projects(workspaceId)}?${query}`, page(project), { signal }),
  get: (workspaceId: string, id: string, signal: AbortSignal) => request(projectPath(workspaceId, id), project, { signal }),
  create: (workspaceId: string, input: ProjectInput) => request(projects(workspaceId), project, json("POST", input)),
  update: (workspaceId: string, id: string, input: ProjectInput) => request(projectPath(workspaceId, id), project, json("PATCH", input)),
  remove: (workspaceId: string, id: string) => request(projectPath(workspaceId, id), empty, { method: "DELETE" }),
  members: (workspaceId: string, id: string, signal: AbortSignal) => request(`${projectPath(workspaceId, id)}/members`, z.array(projectMember), { signal }),
  addMember: (workspaceId: string, id: string, userId: string) => request(`${projectPath(workspaceId, id)}/members`, empty, json("POST", { userId })),
  removeMember: (workspaceId: string, id: string, userId: string) => request(`${projectPath(workspaceId, id)}/members/${encodeURIComponent(userId)}`, empty, { method: "DELETE" }),
};

export const tasksApi = {
  list: (workspaceId: string, projectId: string, query: string, signal: AbortSignal) => request(`${tasks(workspaceId, projectId)}?${query}`, page(task), { signal }),
  get: (workspaceId: string, projectId: string, id: string, signal: AbortSignal) => request(taskPath(workspaceId, projectId, id), task, { signal }),
  create: (workspaceId: string, projectId: string, input: TaskInput) => request(tasks(workspaceId, projectId), task, json("POST", input)),
  update: (workspaceId: string, projectId: string, id: string, input: TaskInput) => request(taskPath(workspaceId, projectId, id), task, json("PATCH", input)),
  remove: (workspaceId: string, projectId: string, id: string) => request(taskPath(workspaceId, projectId, id), empty, { method: "DELETE" }),
  move: (workspaceId: string, projectId: string, id: string, status: Task["status"], beforeId: string | null) =>
    request(`${taskPath(workspaceId, projectId, id)}/move`, empty, json("POST", { status, beforeId })),
  setParticipant: (workspaceId: string, projectId: string, id: string, userId: string, role: ParticipantRole) =>
    request(`${taskPath(workspaceId, projectId, id)}/participants/${encodeURIComponent(userId)}`, empty, json("PUT", { role })),
  removeParticipant: (workspaceId: string, projectId: string, id: string, userId: string) =>
    request(`${taskPath(workspaceId, projectId, id)}/participants/${encodeURIComponent(userId)}`, empty, { method: "DELETE" }),
  createSubtask: (workspaceId: string, projectId: string, id: string, title: string) =>
    request(`${taskPath(workspaceId, projectId, id)}/subtasks`, subtask, json("POST", { title })),
  completeSubtask: (workspaceId: string, projectId: string, id: string, subtaskId: string, completed: boolean) =>
    request(`${taskPath(workspaceId, projectId, id)}/subtasks/${subtaskId}`, empty, json("PATCH", { completed })),
  removeSubtask: (workspaceId: string, projectId: string, id: string, subtaskId: string) =>
    request(`${taskPath(workspaceId, projectId, id)}/subtasks/${subtaskId}`, empty, { method: "DELETE" }),
};

export async function currentUser(signal: AbortSignal) {
  const response = await fetch("/api/me", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to determine your project permissions.");
  return z.object({ data: person }).parse(await response.json()).data;
}

const attachment = z.object({ id: z.uuid(), name: z.string(), bytes: z.number() });
const attachments = (workspaceId: string, projectId: string, id: string) => `${taskPath(workspaceId, projectId, id)}/attachments`;
export const attachmentsApi = {
  list: (workspaceId: string, projectId: string, id: string, signal: AbortSignal) =>
    request(attachments(workspaceId, projectId, id), z.object({ items: z.array(attachment), uploadsEnabled: z.boolean() }), { signal }),
  upload: (workspaceId: string, projectId: string, id: string, file: File) => {
    if (file.size > 3 * 1024 * 1024) throw new WorkspaceRequestError(413, "Choose a file no larger than 3 MB.");
    return request(attachments(workspaceId, projectId, id), attachment, {
      method: "POST", body: file,
      headers: { "Content-Type": file.type || "application/octet-stream", "x-taskflow-file-name": encodeURIComponent(file.name) },
    });
  },
  download: (workspaceId: string, projectId: string, id: string, attachmentId: string) =>
    `/api/workspaces${attachments(workspaceId, projectId, id)}/${attachmentId}/download`,
  remove: (workspaceId: string, projectId: string, id: string, attachmentId: string) =>
    request(`${attachments(workspaceId, projectId, id)}/${attachmentId}`, empty, { method: "DELETE" }),
};
