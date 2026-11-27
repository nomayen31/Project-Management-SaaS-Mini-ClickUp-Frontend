"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { activityLabel, collaborationApi, collaborationRefresh } from "@/lib/collaboration-api";
import { workspacesApi, WorkspaceRequestError } from "@/lib/workspaces-api";

function ErrorText({ error }: { error: unknown }) {
  return error ? <p role="alert">{error instanceof WorkspaceRequestError ? error.message : "The request failed. Try again."}</p> : null;
}

function DateStamp({ value }: { value: string }) {
  return <time dateTime={value} className="collaboration-time">{new Date(value).toLocaleString()}</time>;
}

function PageButtons({ page, more, change }: { page: number; more?: boolean; change: (value: number) => void }) {
  return page > 1 || more ? <div className="workspace-actions">
    <Button disabled={page === 1} onClick={() => change(page - 1)}>Newer</Button>
    <Button disabled={!more} onClick={() => change(page + 1)}>Older</Button>
  </div> : null;
}

function Entry({ children, date }: { children: ReactNode; date: string }) {
  return <li className="collaboration-entry"><div>{children}</div><DateStamp value={date} /></li>;
}

export function TaskDiscussion({ workspaceId, projectId, taskId, editable }: {
  workspaceId: string; projectId: string; taskId: string; editable: boolean;
}) {
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const cache = useQueryClient();
  const key = ["discussion", workspaceId, projectId, taskId];
  const comments = useQuery({
    queryKey: [...key, "comments", page], queryFn: ({ signal }) => collaborationApi.comments(workspaceId, projectId, taskId, page, signal),
    refetchInterval: page === 1 ? collaborationRefresh : false,
  });
  const history = useQuery({
    queryKey: [...key, "history", historyPage], queryFn: ({ signal }) => collaborationApi.history(workspaceId, projectId, taskId, historyPage, signal),
    refetchInterval: historyPage === 1 ? collaborationRefresh : false,
  });
  const people = useQuery({
    queryKey: ["workspace-members", workspaceId], queryFn: ({ signal }) => workspacesApi.members(workspaceId, signal), enabled: editable,
  });
  const post = useMutation({
    mutationFn: ({ form, body, mentions }: { form: HTMLFormElement; body: string; mentions: string[] }) =>
      collaborationApi.post(workspaceId, projectId, taskId, body, mentions).then(() => form.reset()),
    onSuccess: async () => {
      setPage(1);
      setHistoryPage(1);
      await Promise.all([cache.invalidateQueries({ queryKey: key }), cache.invalidateQueries({ queryKey: ["collaboration", workspaceId] })]);
    },
  });

  return <div className="collaboration">
    <section aria-label="Task discussion">
      <h3>Discussion</h3>
      {editable && <form className="auth-fields" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        post.mutate({ form, body: String(data.get("comment")), mentions: data.getAll("mentions").map(String) });
      }}>
        <label>Write a comment<textarea name="comment" required maxLength={4000} /></label>
        {people.data && people.data.length > 0 && <details>
          <summary>Mention people</summary>
          <fieldset className="collaboration-mentions">
            <legend>Select up to 10 people to notify</legend>
            {people.data.map(({ user }) => <label key={user.id}><input type="checkbox" name="mentions" value={user.id} />{user.name}</label>)}
          </fieldset>
        </details>}
        <Button type="submit" disabled={post.isPending}>Post comment</Button>
      </form>}
      <ErrorText error={post.error || comments.error || people.error} />
      {comments.isPending && <p role="status">Loading comments…</p>}
      {comments.data?.items.length === 0 && <p>No comments yet.</p>}
      <ul className="workspace-list">{comments.data?.items.map((item) => <Entry key={item.id} date={item.createdAt}>
        <strong>{item.author.name}</strong><p className="project-description">{item.body}</p>
      </Entry>)}</ul>
      <PageButtons page={page} more={comments.data?.hasMore} change={setPage} />
    </section>
    <section aria-label="Task activity">
      <h3>Task activity</h3><ErrorText error={history.error} />
      {history.isPending && <p role="status">Loading activity…</p>}
      {history.data?.items.length === 0 && <p>No recorded activity.</p>}
      <ul className="workspace-list">{history.data?.items.map((item) => <Entry key={item.id} date={item.createdAt}>
        <strong>{item.actor.name}</strong> {activityLabel(item.type, item.detail)}
      </Entry>)}</ul>
      <PageButtons page={historyPage} more={history.data?.hasMore} change={setHistoryPage} />
    </section>
  </div>;
}

export function WorkspaceCollaboration({ workspaceId }: { workspaceId: string }) {
  const [mode, setMode] = useState<"inbox" | "feed">("inbox");
  const [page, setPage] = useState(1);
  const cache = useQueryClient();
  const key = ["collaboration", workspaceId];
  const inbox = useQuery({
    queryKey: [...key, "inbox", page], queryFn: ({ signal }) => collaborationApi.inbox(workspaceId, page, signal),
    enabled: mode === "inbox", refetchInterval: page === 1 ? collaborationRefresh : false,
  });
  const feed = useQuery({
    queryKey: [...key, "feed", page], queryFn: ({ signal }) => collaborationApi.feed(workspaceId, page, signal),
    enabled: mode === "feed", refetchInterval: page === 1 ? collaborationRefresh : false,
  });
  const current = mode === "inbox" ? inbox : feed;
  const read = useMutation({
    mutationFn: (id: string) => collaborationApi.read(workspaceId, id),
    onSuccess: () => cache.invalidateQueries({ queryKey: [...key, "inbox"] }),
  });
  const taskLink = (task: { projectId: string; id: string }) =>
    `/projects?workspace=${workspaceId}&project=${task.projectId}&task=${task.id}#task-details`;

  return <section className="workspace-panel collaboration" aria-label="Workspace collaboration">
    <h2>Collaboration</h2>
    <div className="workspace-actions">
      <Button aria-pressed={mode === "inbox"} onClick={() => { setMode("inbox"); setPage(1); }}>Inbox{inbox.data?.unread ? ` (${inbox.data.unread} unread)` : ""}</Button>
      <Button aria-pressed={mode === "feed"} onClick={() => { setMode("feed"); setPage(1); }}>Activity feed</Button>
    </div>
    <ErrorText error={current.error || read.error} />
    {current.isPending && <p role="status">Loading…</p>}
    {current.data?.items.length === 0 && <p>{mode === "inbox" ? "No notifications yet." : "No recorded activity yet."}</p>}
    <ul className="workspace-list">{mode === "inbox" ? inbox.data?.items.map((item) => <Entry key={item.id} date={item.createdAt}>
      <p><strong>{item.actor.name}</strong> mentioned you on <Link href={taskLink(item.task)}>{item.task.title}</Link>.</p>
      {!item.readAt && <Button disabled={read.isPending} onClick={() => read.mutate(item.id)}>Mark as read</Button>}
    </Entry>) : feed.data?.items.map((item) => <Entry key={item.id} date={item.createdAt}>
      <strong>{item.actor.name}</strong> {activityLabel(item.type, item.detail)}. <Link href={taskLink(item.task)}>{item.task.title}</Link>
    </Entry>)}</ul>
    <PageButtons page={page} more={current.data?.hasMore} change={setPage} />
  </section>;
}
