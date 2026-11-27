import { z } from "zod";

const role = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const workspace = z.object({ id: z.uuid(), name: z.string(), role });
const member = z.object({
  role,
  user: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }),
});
const invitation = z.object({ id: z.uuid(), email: z.email(), role, expiresAt: z.iso.datetime() });
const errorResponse = z.object({ error: z.object({ message: z.string() }) });
export type Workspace = z.infer<typeof workspace>;
export type Role = z.infer<typeof role>;
export type AssignableRole = Exclude<Role, "OWNER">;

export class WorkspaceRequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const root = "/api/workspaces";
export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const response = await fetch(root + path, { ...init, cache: "no-store" });
  if (response.status === 204) return schema.parse(undefined);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const data = errorResponse.safeParse(body);
    throw new WorkspaceRequestError(response.status, data.success ? data.data.error.message : "Workspace request failed.");
  }
  return z.object({ data: schema }).parse(body).data;
}

export function json(method: string, body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const workspacesApi = {
  list: (signal: AbortSignal) => request("", z.array(workspace), { signal }),
  create: (name: string) => request("", workspace, json("POST", { name })),
  rename: (id: string, name: string) => request(`/${id}`, workspace, json("PATCH", { name })),
  members: (id: string, signal: AbortSignal) => request(`/${id}/members`, z.array(member), { signal }),
  setRole: (id: string, userId: string, role: AssignableRole) => request(`/${id}/members/${encodeURIComponent(userId)}`, member, json("PATCH", { role })),
  remove: (id: string, userId: string) => request(`/${id}/members/${encodeURIComponent(userId)}`, z.undefined(), { method: "DELETE" }),
  invitations: (id: string, signal: AbortSignal) => request(`/${id}/invitations`, z.array(invitation), { signal }),
  invite: (id: string, email: string, role: AssignableRole) => request(`/${id}/invitations`, invitation.extend({ token: z.string() }), json("POST", { email, role })),
  revoke: (id: string, inviteId: string) => request(`/${id}/invitations/${inviteId}`, z.undefined(), { method: "DELETE" }),
  accept: (token: string) => request("/invitations/accept", z.object({ workspaceId: z.uuid() }), json("POST", { token })),
};
