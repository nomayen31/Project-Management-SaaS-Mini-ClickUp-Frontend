"use client";

import { useEffect, useState } from "react";
import { Activity, FolderOpen, LayoutGrid, Menu, Moon, RefreshCw, Sun, Workflow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AppProviders } from "./app-providers";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Button } from "@/components/ui/button";
import { getApiHealth, getDatabaseReadiness } from "@/lib/api";

const useTheme = create<{ dark: boolean; toggle: () => void }>()(
  persist((set) => ({ dark: false, toggle: () => set((state) => ({ dark: !state.dark })) }), {
    name: "taskflow-theme",
    skipHydration: true,
  }),
);

function HealthPanel() {
  const health = useQuery({
    queryKey: ["api-health"],
    queryFn: ({ signal }) => getApiHealth(signal),
    retry: false,
  });
  const readiness = useQuery({
    queryKey: ["database-readiness"],
    queryFn: ({ signal }) => getDatabaseReadiness(signal),
    retry: false,
  });

  return (
    <section className="status-panel" aria-labelledby="status-title">
      <div className="status-top">
        <span className="activity-icon"><Activity size={21} /></span>
        <Button variant="icon" aria-label="Check API again" onClick={() => { void health.refetch(); void readiness.refetch(); }} disabled={health.isFetching || readiness.isFetching}>
          <RefreshCw size={16} />
        </Button>
      </div>
      <div>
        <h2 id="status-title">API connection</h2>
        <p role="status" className="status-label" data-state={health.isFetching ? "pending" : health.isError ? "error" : "ok"}>
          {health.isFetching ? "Checking connection…" : health.isError ? "API unavailable" : "Connected"}
        </p>
      </div>
      <p className="status-detail">
        {health.isError ? "Start the backend and check again." : health.data?.service ?? "Waiting for the backend response."}
      </p>
      <div className="border-t border-line pt-3">
        <h3>Database</h3>
        <p className="status-detail" role="status">
          {readiness.isFetching && "Checking database…"}
          {!readiness.isFetching && readiness.isError && "Could not check database."}
          {!readiness.isFetching && !readiness.isError && readiness.data === "unavailable" && "Database unavailable"}
          {!readiness.isFetching && !readiness.isError && readiness.data === "connected" && "Database connected"}
        </p>
      </div>
    </section>
  );
}

export function WorkspaceShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const dark = useTheme((state) => state.dark);
  const toggle = useTheme((state) => state.toggle);

  useEffect(() => {
    void useTheme.persist.rehydrate();
  }, []);

  return (
    <AppProviders>
      <div className="shell" data-theme={dark ? "dark" : "light"}>
        <aside id="workspace-navigation" className="sidebar" data-open={menuOpen}>
          <a href="/" className="brand"><span><Workflow size={20} /></span>TaskFlow</a>
          <nav aria-label="Workspace navigation">
            <a href="#overview" className="nav-item" aria-current="page" onClick={() => setMenuOpen(false)}><LayoutGrid size={17} /> Overview</a>
            <Link href="/workspaces" className="nav-item mt-2"><FolderOpen size={17} /> Workspaces</Link>
            <Link href="/auth?mode=sessions" className="nav-item mt-2">Account</Link>
          </nav>
        </aside>
        <div className="stage">
          <header className="topbar">
            <div className="topbar-title">
              <Button variant="icon" className="menu-toggle" aria-label="Workspace navigation" aria-controls="workspace-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                <Menu size={17} />
              </Button>
              <span>Workspace <span className="breadcrumb-divider">/</span> Overview</span>
            </div>
            <Button variant="icon" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={toggle}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
          </header>
          <main id="overview" className="overview">
            <h1>Workspace overview</h1>
            <div className="overview-grid">
              <section className="empty-panel" aria-labelledby="projects-title">
                <div className="panel-heading"><h2 id="projects-title">Projects</h2></div>
                <div className="empty-state">
                  <span className="folder-icon"><FolderOpen size={27} /></span>
                  <h3>Projects aren’t available yet</h3>
                  <p>Projects will appear here once workspace and project management are set up.</p>
                </div>
              </section>
              <HealthPanel />
            </div>
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
