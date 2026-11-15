"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-[var(--critical)]">{text}</p>;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
        setBusy(false);
        if (error) return setError(error.status === 401 ? "That email and password do not match an account." : error.message ?? "Could not sign in.");
        router.push(safeNext(params.get("next")));
        router.refresh();
      }}
    >
      <ErrorBox text={error} />
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/signup">Create an account</Link>
      </div>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const password = String(f.get("password"));
        if (password !== String(f.get("confirm"))) return setError("The two passwords are different.");
        setBusy(true);
        setError(null);
        const { error } = await authClient.signUp.email({ name: String(f.get("name")).trim(), email: String(f.get("email")).trim(), password });
        setBusy(false);
        if (error) return setError(error.code === "USER_ALREADY_EXISTS" || error.status === 422 ? "An account with that email already exists. Sign in instead." : error.message ?? "Could not create the account.");
        router.push("/dashboard");
        router.refresh();
      }}
    >
      <ErrorBox text={error} />
      <Field label="Your name" htmlFor="name"><Input id="name" name="name" autoComplete="name" required maxLength={120} /></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Field label="Repeat password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      <p className="text-center text-sm text-ink-2">Already have one? <Link href="/login">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) {
    return (
      <div className="space-y-3 text-sm text-ink-2">
        <p>If an account exists for that email, a reset link is on its way. It expires in 30 minutes.</p>
        <p className="text-xs text-ink-3">Running PaperTrail locally without an email provider? The link is printed in the server log.</p>
        <Link href="/login">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const { error } = await authClient.requestPasswordReset({ email: String(f.get("email")), redirectTo: "/reset-password" });
        setBusy(false);
        // Do not reveal whether the email has an account.
        if (error && error.status !== 404) return setError(error.message ?? "Could not send the link.");
        setSent(true);
      }}
    >
      <ErrorBox text={error} />
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
      <p className="text-center text-sm"><Link href="/login">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired. Request a new one." : null);
  const [busy, setBusy] = useState(false);
  if (!token) return <div className="space-y-3 text-sm"><ErrorBox text={error ?? "This page needs the link from the reset email."} /><Link href="/forgot-password">Request a new link</Link></div>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const newPassword = String(f.get("password"));
        if (newPassword !== String(f.get("confirm"))) return setError("The two passwords are different.");
        setBusy(true);
        setError(null);
        const { error } = await authClient.resetPassword({ newPassword, token });
        setBusy(false);
        if (error) return setError(error.message ?? "This reset link is invalid or has expired.");
        router.push("/login?reset=1");
      }}
    >
      <ErrorBox text={error} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Field label="Repeat new password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Button type="submit" className="w-full" loading={busy}>Set new password</Button>
    </form>
  );
}
