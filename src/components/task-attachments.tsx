"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { attachmentsApi } from "@/lib/projects-api";
import { WorkspaceRequestError } from "@/lib/workspaces-api";

export function TaskAttachments({ workspaceId, projectId, taskId, editable }: {
  workspaceId: string; projectId: string; taskId: string; editable: boolean;
}) {
  const key = ["projects", workspaceId, projectId, "attachments", taskId];
  const cache = useQueryClient();
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => attachmentsApi.list(workspaceId, projectId, taskId, signal) });
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const error = change.error || list.error;

  return <>
    <h3>Attachments</h3>
    {list.isPending && <p role="status">Loading attachments…</p>}
    {error && <p role="alert">{error instanceof WorkspaceRequestError ? error.message : "The attachment request failed."}</p>}
    {list.data?.items.length === 0 && <p>No attachments yet.</p>}
    <ul className="workspace-list">{list.data?.items.map((item) => <li key={item.id}>
      <span><a href={attachmentsApi.download(workspaceId, projectId, taskId, item.id)}>{item.name}</a> · {Math.ceil(item.bytes / 1024)} KB</span>
      {editable && <Button disabled={change.isPending} onClick={() => {
        if (window.confirm(`Remove ${item.name}?`)) change.mutate(() => attachmentsApi.remove(workspaceId, projectId, taskId, item.id));
      }}>Remove file</Button>}
    </li>)}</ul>
    {editable && list.data && (list.data.uploadsEnabled ? <form className="workspace-inline" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const file = new FormData(form).get("file");
      if (file instanceof File && file.size > 0) {
        change.mutate(async () => {
          await attachmentsApi.upload(workspaceId, projectId, taskId, file);
          form.reset();
        });
      }
    }}>
      <label>Attach a file (PDF, PNG, or JPEG, up to 3 MB)<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
      <Button type="submit" disabled={change.isPending}>{change.isPending ? "Working…" : "Upload file"}</Button>
    </form> : <p>File uploads are unavailable.</p>)}
  </>;
}
