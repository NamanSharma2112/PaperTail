"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Reproductions", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/graph", label: "Graph", match: (p: string) => p.startsWith("/graph") },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`press rounded-md px-2.5 py-1.5 !no-underline transition-colors duration-150 ${
              active ? "bg-surface-2 font-semibold !text-ink" : "!text-ink-2 hover:bg-surface-2 hover:!text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
