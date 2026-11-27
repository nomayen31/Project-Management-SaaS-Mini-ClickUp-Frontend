"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "./ui/button";
import { WorkspaceRequestError } from "@/lib/workspaces-api";

const preferences = z.object({ data: z.object({ mentionNotifications: z.boolean() }) });
const key = ["account-settings"] as const;

async function requestPreferences(init?: RequestInit, signal?: AbortSignal) {
  const response = await fetch("/api/me/settings", { ...init, signal, cache: "no-store" });
  if (!response.ok) throw new WorkspaceRequestError(response.status, "Notification preferences could not be saved or loaded.");
  return preferences.parse(await response.json()).data;
}

export function AccountPreferences() {
  const cache = useQueryClient();
  const result = useQuery({ queryKey: key, queryFn: ({ signal }) => requestPreferences(undefined, signal), retry: false });
  const change = useMutation({
    mutationFn: (mentionNotifications: boolean) => requestPreferences({
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mentionNotifications }),
    }),
    onSuccess: (data) => cache.setQueryData(key, data),
  });
  const error = change.error || result.error;
  return <section className="account-preferences" aria-labelledby="account-notifications-title">
    <h2 id="account-notifications-title">Notifications</h2>
    {result.isPending && <p role="status">Loading preferences…</p>}
    {error && <p role="alert">Notification preferences could not be {change.isError ? "saved" : "loaded"}.</p>}
    {result.isError && <Button onClick={() => void result.refetch()}>Retry preferences</Button>}
    {result.data && <label>
      <input type="checkbox" disabled={change.isPending} checked={change.isPending ? change.variables : result.data.mentionNotifications}
        onChange={(event) => change.mutate(event.target.checked)} />
      Notify me when someone mentions me
    </label>}
    {change.isSuccess && <p role="status">Preferences saved.</p>}
  </section>;
}
