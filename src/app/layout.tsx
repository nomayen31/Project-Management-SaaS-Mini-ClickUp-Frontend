import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

export const metadata: Metadata = { title: "TaskFlow", description: "TaskFlow project management" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AppProviders><AppShell>{children}</AppShell></AppProviders></body></html>;
}
