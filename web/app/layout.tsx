import type { Metadata } from "next";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperTrail",
  description: "From a published result to a reproduction you can check.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-bold tracking-tight !text-ink !no-underline">
              <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
                <circle cx="4" cy="13" r="2.5" fill="var(--series-1)" />
                <rect x="11" y="2" width="5" height="5" rx="1.2" fill="var(--series-2)" />
                <path d="M5.5 11.5 L12 6" stroke="var(--text-muted)" strokeWidth="1.5" />
              </svg>
              PaperTrail
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
