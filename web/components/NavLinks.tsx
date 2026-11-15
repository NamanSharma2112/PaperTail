"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Reproductions", n: "01", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/graph", label: "Graph", n: "02", match: (p: string) => p.startsWith("/graph") },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="flex items-center gap-1 text-[13.5px]">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 !no-underline ${
              active ? "bg-surface font-medium !text-ink shadow-card ring-1 ring-line" : "!text-ink-2 hover:bg-surface-2 hover:!text-ink"
            }`}
          >
            <span className="mono text-[10px] text-ink-3">{l.n}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
