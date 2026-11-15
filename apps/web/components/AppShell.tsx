"use client";
import * as D from "@radix-ui/react-dialog";
import * as M from "@radix-ui/react-dropdown-menu";
import { BookOpen, FileText, FlaskConical, FolderKanban, LayoutDashboard, LogOut, Menu, Network, Plus, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/Mark";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Paper library", icon: BookOpen },
  { href: "/projects", label: "Research projects", icon: FolderKanban },
  { href: "/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname() ?? "";
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] !no-underline",
              active ? "bg-surface font-medium !text-ink shadow-card ring-1 ring-line" : "!text-ink-2 hover:bg-surface-2 hover:!text-ink",
            )}
          >
            <n.icon className="size-4 shrink-0" aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <M.Root>
      <M.Trigger className="press flex size-8 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" aria-label="Account menu">
        {initials}
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={8} className="panel-in sheet z-50 min-w-56 p-1.5 shadow-float">
          <div className="px-2.5 py-2">
            <div className="text-sm font-medium">{name}</div>
            <div className="truncate text-xs text-ink-3">{email}</div>
          </div>
          <M.Separator className="my-1 h-px bg-[var(--border)]" />
          <M.Item asChild>
            <Link href="/settings" className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm !text-ink !no-underline outline-none data-[highlighted]:bg-surface-2">
              <Settings className="size-4" /> Settings
            </Link>
          </M.Item>
          <M.Item
            onSelect={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2"
          >
            <LogOut className="size-4" /> Sign out
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line px-3 py-4 lg:flex">
        <Link href="/dashboard" className="mb-6 px-2 !no-underline"><Wordmark /></Link>
        <NavList />
        <div className="mt-auto px-2 text-[11px] leading-relaxed text-ink-3">
          Experiments run on your machine. This workspace stores the record.
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <D.Root open={open} onOpenChange={setOpen}>
              <D.Trigger className="press -ml-1 rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </D.Trigger>
              <D.Portal>
                <D.Overlay className="dialog-overlay fixed inset-0 z-40 bg-[rgb(15_27_45/0.35)]" />
                <D.Content className="panel-in fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-page p-4 shadow-float">
                  <D.Title className="sr-only">Navigation</D.Title>
                  <div className="mb-5 flex items-center justify-between">
                    <Wordmark />
                    <D.Close className="rounded-full p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Close navigation"><X className="size-4" /></D.Close>
                  </div>
                  <NavList onNavigate={() => setOpen(false)} />
                </D.Content>
              </D.Portal>
            </D.Root>
            <form
              role="search"
              className="relative min-w-0 flex-1 sm:max-w-sm"
              onSubmit={(e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
                if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <label htmlFor="global-search" className="sr-only">Search papers and projects</label>
              <input id="global-search" name="q" placeholder="Search papers and projects" className="field !h-9 !rounded-full !py-0 !pl-9" />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/projects/new" className={cn(buttonVariants({ size: "sm" }), "!no-underline !text-surface")}>
                <Plus /> <span className="hidden sm:inline">New project</span>
              </Link>
              <UserMenu name={user.name} email={user.email} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ crumbs, title, eyebrow, actions, children }: { crumbs?: { href?: string; label: string }[]; title: React.ReactNode; eyebrow?: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {c.href ? <Link href={c.href} className="!text-ink-3 hover:!text-ink">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="display text-[30px] sm:text-[40px]">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="lede mt-3 max-w-3xl !text-[15px]">{children}</div>}
    </div>
  );
}
