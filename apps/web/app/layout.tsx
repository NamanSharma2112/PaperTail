import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperTrail",
  description: "From a published number to evidence you can check.",
};

function Mark() {
  // A claim (dot) traced to its evidence (square) along a dotted line.
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 22 22">
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--text-primary)" />
      <circle cx="7" cy="14.5" r="2.6" fill="var(--surface)" />
      <rect x="12.4" y="4.8" width="5" height="5" rx="1.2" fill="var(--series-2)" />
      <path d="M8.9 12.6 L12.6 9" stroke="var(--surface)" strokeWidth="1.3" strokeDasharray="1.4 1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 !text-ink !no-underline">
              <Mark />
              <span className="text-[15px] font-semibold tracking-[-0.01em]">PaperTrail</span>
              <span className="mono hidden rounded-full border border-line px-1.5 py-px text-[10px] text-ink-3 sm:inline">v0.1</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              <span className="mono text-ink-2">PaperTrail</span> keeps a record of how published results were checked. Runs happen on your own machine; this server
              never executes research code.
            </p>
            <p className="mono">Colophon · Inter &amp; JetBrains Mono</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
