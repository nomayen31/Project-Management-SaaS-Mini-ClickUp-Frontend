"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { workspacesApi, WorkspaceRequestError, type AssignableRole, type Role, type Workspace } from "@/lib/workspaces-api";

const labels: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", VIEWER: "Viewer" };
const workspaceKey = ["workspaces"] as const;

function canManage(actor: Role, target: Role) {
  return target !== "OWNER" && (actor === "OWNER" || (actor === "ADMIN" && target !== "ADMIN"));
}

function roleOptions(actor: Role) {
  const roles: AssignableRole[] = ["ADMIN", "MEMBER", "VIEWER"];
  return roles.filter((role) => canManage(actor, role)).map((role) => <option key={role} value={role}>{labels[role]}</option>);
}

function showError(error: unknown) {
  return error instanceof WorkspaceRequestError ? error.message : "The request could not be completed. Try again.";
}

export function WorkspacesScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const cache = useQueryClient();
  const [inviteToken, setInviteToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ error: "", notice: "" });
  const workspaces = useQuery({ queryKey: workspaceKey, queryFn: ({ signal }) => workspacesApi.list(signal), retry: false });
  const active = workspaces.isSuccess
    ? workspaces.data.find((workspace) => workspace.id === params.get("workspace")) ?? workspaces.data[0]
    : undefined;
  const needsSession = workspaces.error instanceof WorkspaceRequestError && workspaces.error.status === 401;

  useEffect(() => {
    setInviteToken(new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "");
  }, []);

  function switchWorkspace(id: string) {
    router.replace(`/workspaces?workspace=${id}${window.location.hash}`);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback({ error: "", notice: "" });
    try { await action(); }
    catch (error) { setFeedback({ error: showError(error), notice: "" }); }
    finally { setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    void run(async () => {
      const workspace = await workspacesApi.create(name);
      await cache.invalidateQueries({ queryKey: workspaceKey });
      switchWorkspace(workspace.id);
      form.reset();
      setFeedback({ error: "", notice: "Workspace created." });
    });
  }

  function accept() {
    void run(async () => {
      const { workspaceId } = await workspacesApi.accept(inviteToken);
      setInviteToken("");
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      await cache.invalidateQueries({ queryKey: workspaceKey });
      switchWorkspace(workspaceId);
      setFeedback({ error: "", notice: "Invitation accepted." });
    });
  }

  return (
    <div className="workspace-page">
      <header className="workspace-header"><Link href="/" className="auth-brand">TaskFlow</Link><Link href="/auth?mode=sessions">Account</Link></header>
      <main className="workspace-content">
        <h1>Workspaces</h1>
        {inviteToken && <section className="workspace-panel workspace-invitation">
          <h2>Workspace invitation</h2>
          {needsSession ? <><p>Sign in with the invited email address, then return to this page. <Link href="/auth" target="_blank" rel="noopener">Open sign-in</Link></p><Button onClick={() => void workspaces.refetch()}>Check sign-in</Button></>
            : <Button disabled={busy || !workspaces.isSuccess} onClick={accept}>Accept invitation</Button>}
        </section>}
        {workspaces.isPending && <p role="status">Loading workspaces…</p>}
        {needsSession && !inviteToken && <p><Link href="/auth">Sign in</Link> to create or open a workspace.</p>}
        {workspaces.isError && !needsSession && <div><p role="alert">{showError(workspaces.error)}</p><Button onClick={() => void workspaces.refetch()}>Try again</Button></div>}
        {workspaces.isSuccess && <>
          <div className="workspace-toolbar">
            {active && <label>Current workspace
              <select value={active.id} onChange={(event) => switchWorkspace(event.target.value)}>
                {workspaces.data.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>}
            <form onSubmit={create}>
              <label>New workspace name<input name="name" minLength={2} maxLength={80} required /></label>
              <Button type="submit" disabled={busy}>Create workspace</Button>
            </form>
          </div>
          {!active && <p className="workspace-panel">Create a workspace to start organizing your team.</p>}
        </>}
        {feedback.error && <p role="alert">{feedback.error}</p>}
        {feedback.notice && <p role="status">{feedback.notice}</p>}
        {active && <WorkspaceDetails workspace={active} key={active.id} />}
      </main>
    </div>
  );
}

function WorkspaceDetails({ workspace }: { workspace: Workspace }) {
  const { id, role } = workspace;
  const cache = useQueryClient();
  const isManager = canManage(role, "MEMBER");
  const members = useQuery({ queryKey: ["workspace-members", id], queryFn: ({ signal }) => workspacesApi.members(id, signal), retry: false });
  const invitations = useQuery({ queryKey: ["workspace-invitations", id], queryFn: ({ signal }) => workspacesApi.invitations(id, signal), enabled: isManager, retry: false });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ error: "", notice: "" });
  const [inviteLink, setInviteLink] = useState("");

  function mutate(action: () => Promise<unknown>, key: readonly string[], notice: string) {
    setBusy(true);
    setFeedback({ error: "", notice: "" });
    void action().then(async () => {
      await cache.invalidateQueries({ queryKey: key });
      setFeedback({ error: "", notice });
    }).catch((error: unknown) => setFeedback({ error: showError(error), notice: "" }))
      .finally(() => setBusy(false));
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setInviteLink("");
    mutate(async () => {
      const result = await workspacesApi.invite(id, String(values.get("email")), values.get("role") as AssignableRole);
      setInviteLink(`${window.location.origin}/workspaces#invite=${result.token}`);
      form.reset();
    }, ["workspace-invitations", id], "Invitation created. Share the link with the invited person.");
  }

  return <>
    <section className="workspace-panel">
      <div className="workspace-heading"><h2>{workspace.name}</h2><span className="workspace-role">{labels[role]}</span><Link href={`/projects?workspace=${id}`}>Open projects</Link></div>
      {isManager && <form className="workspace-inline" onSubmit={(event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name"));
        mutate(() => workspacesApi.rename(id, name), workspaceKey, "Workspace name updated.");
      }}>
        <label>Workspace name<input name="name" defaultValue={workspace.name} minLength={2} maxLength={80} required /></label>
        <Button type="submit" disabled={busy}>Save name</Button>
      </form>}
      <h3>Members</h3>
      {members.isPending && <p role="status">Loading members…</p>}
      {members.isError && <p role="alert">{showError(members.error)}</p>}
      <ul className="workspace-list">
        {members.data?.map(({ role: memberRole, user }) => <li key={user.id}>
          <span>{user.name}</span>
          {canManage(role, memberRole) ? <div className="workspace-actions">
            <select aria-label={`Role for ${user.name}`} value={memberRole} disabled={busy} onChange={(event) => {
              const next = event.target.value as AssignableRole;
              mutate(() => workspacesApi.setRole(id, user.id, next), ["workspace-members", id], "Member role updated.");
            }}>{roleOptions(role)}</select>
            <Button disabled={busy} onClick={() => {
              if (window.confirm(`Remove ${user.name} from this workspace?`)) {
                mutate(() => workspacesApi.remove(id, user.id), ["workspace-members", id], "Member removed.");
              }
            }}>Remove</Button>
          </div> : <span className="workspace-role">{labels[memberRole]}</span>}
        </li>)}
      </ul>
    </section>
    {isManager && <section className="workspace-panel">
      <h2>Invitations</h2>
      <form className="workspace-inline" onSubmit={invite}>
        <label>Email address<input name="email" type="email" maxLength={254} required /></label>
        <label>Role<select name="role" defaultValue="MEMBER">{roleOptions(role)}</select></label>
        <Button type="submit" disabled={busy}>Create invite link</Button>
      </form>
      {inviteLink && <div className="workspace-inline">
        <label>Invitation link<input type="text" readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label>
        <Button onClick={() => void navigator.clipboard.writeText(inviteLink).then(
          () => setFeedback({ error: "", notice: "Invitation link copied." }),
          () => setFeedback({ error: "Select the invitation link to copy it manually.", notice: "" }),
        )}>Copy link</Button>
      </div>}
      {invitations.isPending && <p role="status">Loading invitations…</p>}
      {invitations.isError && <p role="alert">{showError(invitations.error)}</p>}
      {invitations.data?.length === 0 && <p>No pending invitations.</p>}
      <ul className="workspace-list">
        {invitations.data?.map((invite) => <li key={invite.id}>
          <span>{invite.email} <span className="workspace-role">{labels[invite.role]}</span></span>
          {canManage(role, invite.role) && <Button disabled={busy} onClick={() => {
            setInviteLink("");
            mutate(() => workspacesApi.revoke(id, invite.id), ["workspace-invitations", id], "Invitation revoked.");
          }}>Revoke</Button>}
        </li>)}
      </ul>
    </section>}
    {feedback.error && <p role="alert">{feedback.error}</p>}
    {feedback.notice && <p role="status">{feedback.notice}</p>}
  </>;
}
