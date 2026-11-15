import Link from "next/link";
import { BookOpen, ClipboardList, FlaskConical, GitCompareArrows, FileText, Terminal, Ban } from "lucide-react";
import { Wordmark } from "@/components/Mark";
import { Schematic } from "@/components/Schematic";
import { buttonVariants } from "@/components/ui/button";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: BookOpen, title: "Import the paper", text: "Paste an arXiv ID, a DOI or a paper link. Title, authors, venue and links come from arXiv, Crossref or OpenAlex. Nothing is downloaded or summarised." },
  { icon: ClipboardList, title: "Write down the protocol", text: "Objective, method, data, preprocessing, hyperparameters and evaluation, each marked with where it came from: the paper, the official code, or your own inference." },
  { icon: Terminal, title: "Run it on your machine", text: "Wrap your usual command with the papertrail Python package. It records the code commit, environment, seed, parameters and metrics, and sends them here." },
  { icon: GitCompareArrows, title: "Compare with the paper", text: "Enter the numbers the paper reports. PaperTrail summarises your runs, computes the difference with an interval, and says when a comparison is not valid." },
  { icon: FlaskConical, title: "Explain the differences", text: "Log every change you had to make and every discrepancy you found, with a category, severity and whether the cause is confirmed or only suspected." },
  { icon: FileText, title: "Publish the record", text: "Export a reproduction report someone else can check: what was attempted, what ran, what matched, what did not, and why." },
];

const NOT = [
  "A paper summariser or chatbot. No AI is needed or used.",
  "A place to run code. Experiments run on your computer; this server only stores records.",
  "A replacement for GitHub, MLflow or DVC. It links to them and records what they don't: the claim being tested.",
  "A certificate. A report says what was observed, not that a paper is right or wrong.",
];

export default async function Landing() {
  const user = await currentUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>Open your workspace</Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
                <Link href="/signup" className={buttonVariants({ size: "sm" })}>Create an account</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-24 px-4 py-14 sm:px-6 sm:py-20">
        <section className="rise">
          <p className="eyebrow">A workspace for reproducing computational research</p>
          <h1 className="display mt-4 max-w-4xl text-[42px] sm:text-[64px]">From published research to reproducible evidence.</h1>
          <p className="lede mt-5 max-w-2xl">
            Papers report numbers. PaperTrail helps you check them: write down exactly what the paper claims, run the authors&apos; code on your own machine, and keep a
            record anyone can inspect, including the parts that did not match.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? "/dashboard" : "/signup"} className={buttonVariants({ size: "lg" })}>{user ? "Go to your dashboard" : "Start a reproduction"}</Link>
            <a href="#how" className={buttonVariants({ variant: "secondary", size: "lg" })}>How it works</a>
          </div>
          <div className="mt-14">
            <Schematic />
          </div>
        </section>

        <section id="how" className="scroll-mt-20 space-y-8">
          <div className="section-head"><span className="marker">§ 01</span><h2>How it works</h2></div>
          <ol className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="mono text-xs text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <s.icon className="size-4 text-ink-2" aria-hidden />
                </div>
                <h3 className="title mt-3 text-lg">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="section-head"><span className="marker">§ 02</span><h2>Why it matters</h2></div>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Public code does not mean a result can be reproduced. In the pilot behind this project, the official code for a well-known 2017 paper could not be
              installed from its own requirements file; once it ran, two of three testable numbers matched, one depended on an undocumented training detail, and one
              could not be attempted because its data was never published. None of that is visible from the paper.
            </p>
            <p className="text-[15px] leading-relaxed text-ink-2">
              PaperTrail keeps that kind of finding attached to the claim it concerns, so the next person does not have to rediscover it.
            </p>
          </div>
          <div className="space-y-4">
            <div className="section-head"><span className="marker">§ 03</span><h2>What it is not</h2></div>
            <ul className="space-y-2.5">
              {NOT.map((n) => (
                <li key={n} className="flex gap-3 text-[15px] text-ink-2">
                  <Ban className="mt-1 size-4 shrink-0 text-ink-3" aria-hidden />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-6">
          <div className="section-head"><span className="marker">§ 04</span><h2>Who it is for</h2></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Students and independent researchers", "Re-doing a paper for a thesis, a course or the ML Reproducibility Challenge, and needing a report others can check."],
              ["Research labs", "Reproducing a baseline before building on it, and keeping the record when people move on."],
              ["Educators", "Setting a reproduction as coursework and seeing what each student attempted and where results diverged."],
            ].map(([t, d]) => (
              <div key={t} className="sheet p-6">
                <h3 className="title text-lg">{t}</h3>
                <p className="mt-1.5 text-sm text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="sheet plate dot-grid px-6 py-12 text-center">
          <h2 className="display text-[32px] sm:text-[40px]">Start with one paper.</h2>
          <p className="lede mx-auto mt-3 max-w-xl">An account is free. Your projects are private to you unless you add members.</p>
          <div className="mt-6">
            <Link href={user ? "/dashboard" : "/signup"} className={buttonVariants({ size: "lg" })}>{user ? "Open your workspace" : "Create an account"}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <p>PaperTrail records how published results were checked. It never executes research code.</p>
          <p className="mono">Metadata: arXiv · Crossref · OpenAlex</p>
        </div>
      </footer>
    </div>
  );
}
