"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { dashClient, sentinelClient } from "@better-auth/infra/client";
import { z } from "zod";
import { AccountPreferences } from "./account-preferences";
import { Button } from "@/components/ui/button";

const providerSchema = z.object({
  data: z.object({ email: z.boolean(), google: z.boolean(), dash: z.boolean(), sentinel: z.boolean() }),
});
type Providers = z.infer<typeof providerSchema>["data"];
const modes = ["sign-in", "sign-up", "forgot", "reset", "verify", "sessions"] as const;
type Mode = (typeof modes)[number];
const titles: Record<Mode, string> = {
  "sign-in": "Sign in", "sign-up": "Create your account", forgot: "Reset your password",
  reset: "Choose a new password", verify: "Verify your email", sessions: "Your account",
};
const returnTo = "/auth?mode=sessions";

export function AuthScreen() {
  const params = useSearchParams();
  const selection = params.get("mode");
  const mode = modes.find((value) => value === selection) ?? "sign-in";
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/auth-providers", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Auth configuration unavailable.");
      return providerSchema.parse(await response.json()).data;
    },
    retry: false,
  });

  return (
    <main className="auth-layout">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <Link href="/" className="auth-brand">TaskFlow</Link>
        <h1 id="auth-heading">{titles[mode]}</h1>
        {providers.isPending && <p role="status">Loading sign-in options…</p>}
        {providers.isError && <><p role="alert">Sign-in options could not be loaded.</p><Button onClick={() => void providers.refetch()}>Try again</Button></>}
        {providers.data && (providers.data.email || providers.data.google
          ? <AuthForm key={mode} mode={mode} providers={providers.data} token={params.get("token")} callbackError={params.has("error")} verified={params.get("verified") === "1"} />
          : <p>Authentication is unavailable. Contact your administrator.</p>)}
      </section>
    </main>
  );
}

function AuthForm({ mode, providers, token, callbackError, verified }: { mode: Mode; providers: Providers; token: string | null; callbackError: boolean; verified: boolean }) {
  const [client] = useState(() => createAuthClient({
    plugins: [...(providers.dash ? [dashClient()] : []), ...(providers.sentinel ? [sentinelClient()] : [])],
  }));
  const session = client.useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(verified ? "Email verified. You can sign in now." : "");
  const [error, setError] = useState(callbackError ? "This sign-in or verification link could not be completed. Try again." : "");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch { setError("The request could not be completed. Check your details and try again."); }
    finally { setBusy(false); }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const name = String(values.get("name") ?? "").trim();
    void run(async () => {
      if (mode === "sign-up") {
        const result = await client.signUp.email({ name, email, password, callbackURL: "/auth?verified=1" });
        if (result.error) throw result.error;
        setNotice("Check your inbox for a verification link.");
      } else if (mode === "sign-in") {
        const result = await client.signIn.email({ email, password });
        if (result.error) throw result.error;
        window.location.assign(returnTo);
      } else if (mode === "forgot") {
        const result = await client.requestPasswordReset({ email, redirectTo: "/auth?mode=reset" });
        if (result.error) throw result.error;
        setNotice("If the address has an account, you’ll receive a password reset link.");
      } else if (mode === "verify") {
        const result = await client.sendVerificationEmail({ email, callbackURL: "/auth?verified=1" });
        if (result.error) throw result.error;
        setNotice("If the address needs verification, you’ll receive a link.");
      } else if (mode === "reset" && token) {
        const result = await client.resetPassword({ newPassword: password, token });
        if (result.error) throw result.error;
        setNotice("Password updated. You can sign in with your new password.");
      }
    });
  }

  const needsPassword = mode === "sign-up" || mode === "sign-in" || mode === "reset";

  return <>
    {mode === "sessions" ? (
      <div className="auth-fields">
        {session.isPending ? <p role="status">Checking session…</p> : session.error ? <p role="alert">Your session could not be checked.</p> : session.data ? (
          <>
            <p>Signed in as <strong>{session.data.user.email}</strong></p>
            <form className="account-profile" onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("displayName") ?? "").trim();
              if (!name) {
                setError("Enter a display name.");
                return;
              }
              void run(async () => {
                const result = await client.updateUser({ name });
                if (result.error) throw result.error;
                setNotice("Display name saved.");
              });
            }}>
              <h2>Profile</h2>
              <label>Display name<input name="displayName" defaultValue={session.data.user.name} maxLength={100} autoComplete="name" required /></label>
              <Button type="submit" disabled={busy}>Save profile</Button>
            </form>
            <AccountPreferences />
            <Link href="/workspaces">Open workspaces</Link>
            <Button disabled={busy} onClick={() => void run(async () => {
              const result = await client.revokeOtherSessions();
              if (result.error) throw result.error;
              setNotice("Other sessions were signed out.");
            })}>Sign out other sessions</Button>
            <Button disabled={busy} onClick={() => void run(async () => {
              const result = await client.signOut();
              if (result.error) throw result.error;
              window.location.assign("/auth");
            })}>Sign out</Button>
          </>
        ) : <Link href="/auth">Sign in to view your session</Link>}
      </div>
    ) : <>
      {providers.email && (mode !== "reset" || token) && (
        <form className="auth-fields" onSubmit={onSubmit}>
          {mode === "sign-up" && <label>Name<input name="name" autoComplete="name" maxLength={100} required /></label>}
          {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
          {needsPassword && <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-in" ? undefined : 12} maxLength={128} required /></label>}
          <Button type="submit" disabled={busy} className="auth-submit">{mode === "forgot" || mode === "verify" ? "Send email" : titles[mode]}</Button>
        </form>
      )}
      {mode === "reset" && !token && <p>Request a new password reset link to continue.</p>}
      {providers.google && (mode === "sign-in" || mode === "sign-up") && <Button disabled={busy} className="auth-google" onClick={() => void run(async () => {
        const result = await client.signIn.social({ provider: "google", callbackURL: returnTo, errorCallbackURL: "/auth?error=oauth" });
        if (result.error) throw result.error;
      })}>Continue with Google</Button>}
      <nav className="auth-links" aria-label="Account options">
        {mode !== "sign-in" && <Link href="/auth">Sign in</Link>}
        {providers.email && mode === "sign-in" && <Link href="/auth?mode=sign-up">Create account</Link>}
        {providers.email && (mode === "sign-in" || mode === "reset") && <Link href="/auth?mode=forgot">Forgot password?</Link>}
        {providers.email && mode === "sign-in" && <Link href="/auth?mode=verify">Resend verification</Link>}
      </nav>
    </>}
    {notice && <p className="auth-feedback" role="status">{notice}</p>}
    {error && <p className="auth-feedback" role="alert">{error}</p>}
  </>;
}
