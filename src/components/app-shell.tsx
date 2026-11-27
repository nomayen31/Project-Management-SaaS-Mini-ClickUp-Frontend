"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderKanban, LayoutGrid, Menu, Moon, Sun, UserRound, Workflow, X, Layers3 } from "lucide-react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Button } from "./ui/button";

const useTheme = create<{ dark: boolean; toggle: () => void }>()(
  persist((set) => ({ dark: false, toggle: () => set((state) => ({ dark: !state.dark })) }), {
    name: "taskflow-theme",
    skipHydration: true,
  }),
);

const sections = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/workspaces", label: "Workspaces", icon: Layers3 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/auth?mode=sessions", label: "Account", icon: UserRound },
] as const;

function Links({ pathname, workspace, close }: { pathname: string; workspace?: string | null; close: () => void }) {
  return sections.map(({ href, label, icon: Icon }) => {
    const active = href.split("?")[0] === pathname;
    const target = workspace && (href === "/workspaces" || href === "/projects")
      ? href + "?workspace=" + encodeURIComponent(workspace)
      : href;
    return <Link key={href} href={target} className="nav-item" aria-current={active ? "page" : undefined} onClick={close}>
      <Icon size={18} aria-hidden="true" />{label}
    </Link>;
  });
}

function ScopedLinks({ pathname, close }: { pathname: string; close: () => void }) {
  const workspace = useSearchParams().get("workspace");
  return <Links pathname={pathname} workspace={workspace} close={close} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const navigation = useRef<HTMLElement>(null);
  const menuOpen = openOn === pathname;
  const dark = useTheme((state) => state.dark);
  const toggle = useTheme((state) => state.toggle);
  const close = () => setOpenOn(null);
  const section = sections.find(({ href }) => href.split("?")[0] === pathname)?.label ?? "TaskFlow";

  useEffect(() => { void useTheme.persist.rehydrate(); }, []);
  useEffect(() => {
    if (menuOpen) navigation.current?.querySelector("a")?.focus();
  }, [menuOpen]);

  if (pathname === "/auth") return <div className="app-theme" data-theme={dark ? "dark" : "light"}>
    <div className="auth-theme-toggle"><ThemeToggle dark={dark} toggle={toggle} /></div>{children}
  </div>;

  return <div className="app-theme shell" data-theme={dark ? "dark" : "light"} onKeyDown={(event) => {
    if (menuOpen && event.key === "Escape") {
      close();
      document.getElementById("workspace-menu-toggle")?.focus();
    }
  }}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="brand" onClick={close}><span><Workflow size={21} aria-hidden="true" /></span>TaskFlow</Link>
      <nav ref={navigation} id="workspace-navigation" aria-label="Workspace navigation" data-open={menuOpen}>
        <Suspense fallback={<Links pathname={pathname} close={close} />}><ScopedLinks pathname={pathname} close={close} /></Suspense>
      </nav>
    </aside>
    <div className="stage">
      <header className="topbar">
        <div className="topbar-title">
          <Button variant="icon" id="workspace-menu-toggle" className="menu-toggle" aria-label="Workspace navigation"
            aria-controls="workspace-navigation" aria-expanded={menuOpen} onClick={() => setOpenOn(menuOpen ? null : pathname)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
          <span>{section}</span>
        </div>
        <ThemeToggle dark={dark} toggle={toggle} />
      </header>
      <div id="main-content" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}

function ThemeToggle({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return <Button variant="icon" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={toggle}>
    {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
  </Button>;
}
