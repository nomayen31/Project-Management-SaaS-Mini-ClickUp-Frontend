import { z } from "zod";
import { json, request } from "./workspaces-api";

const person = z.object({ name: z.string() });
const comment = z.object({ id: z.uuid(), body: z.string(), createdAt: z.iso.datetime(), author: person });
const task = z.object({ id: z.uuid(), title: z.string(), projectId: z.uuid() });
const activity = z.object({
  id: z.uuid(), type: z.enum(["CREATED", "UPDATED", "MOVED", "COMMENTED"]),
  detail: z.string().nullable(), actor: person, createdAt: z.iso.datetime(),
});
const notification = z.object({
  id: z.uuid(), readAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(), actor: person, task,
});
const page = <T>(item: z.ZodType<T>) => z.object({ items: z.array(item), hasMore: z.boolean() });
const path = (workspace: string, project: string, task: string) => `/${workspace}/projects/${project}/tasks/${task}`;

export const collaborationRefresh = 8_000;
export const collaborationApi = {
  comments: (workspace: string, project: string, task: string, index: number, signal: AbortSignal) =>
    request(path(workspace, project, task) + `/comments?page=${index}`, page(comment), { signal }),
  post: (workspace: string, project: string, task: string, body: string, mentions: string[]) =>
    request(path(workspace, project, task) + "/comments", comment, json("POST", { body, mentions })),
  history: (workspace: string, project: string, task: string, index: number, signal: AbortSignal) =>
    request(path(workspace, project, task) + `/activity?page=${index}`, page(activity), { signal }),
  inbox: (workspace: string, index: number, signal: AbortSignal) =>
    request(`/${workspace}/notifications?page=${index}`, page(notification).extend({ unread: z.number() }), { signal }),
  read: (workspace: string, id: string) =>
    request(`/${workspace}/notifications/${id}/read`, z.undefined(), { method: "PATCH" }),
  feed: (workspace: string, index: number, signal: AbortSignal) =>
    request(`/${workspace}/activity-feed?page=${index}`, page(activity.extend({ task })), { signal }),
};

export function activityLabel(type: z.infer<typeof activity>["type"], detail: string | null) {
  if (type === "MOVED" && detail) return "moved the task to " + detail.toLowerCase().replaceAll("_", " ");
  return { CREATED: "created the task", UPDATED: "updated the task", MOVED: "moved the task", COMMENTED: "posted a comment" }[type];
}
