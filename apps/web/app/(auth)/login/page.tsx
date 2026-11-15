import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/AuthForms";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await currentUser()) redirect("/dashboard");
  const { reset } = await searchParams;
  return (
    <>
      <p className="eyebrow">Account</p>
      <h1 className="title mt-2 text-[26px]">Sign in</h1>
      <p className="mt-1.5 mb-6 text-sm text-ink-2">Welcome back to your research workspace.</p>
      {reset && <p role="status" className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm">Password changed. Sign in with the new one.</p>}
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
