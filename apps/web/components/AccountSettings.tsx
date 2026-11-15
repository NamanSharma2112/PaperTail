"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/utils";

export function ProfileForm({ profile }: { profile: { display_name: string; affiliation: string | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true);
      try { await api("/api/v1/me", { method: "PATCH", json: { display_name: f.get("display_name"), affiliation: f.get("affiliation") } }); toast("success", "Profile saved"); router.refresh(); }
      catch (err) { toast("error", err instanceof Error ? err.message : "Could not save"); }
      finally { setBusy(false); }
    }}>
      <Field label="Display name" htmlFor="pf-name"><Input id="pf-name" name="display_name" defaultValue={profile.display_name} maxLength={120} /></Field>
      <Field label="Affiliation" htmlFor="pf-aff"><Input id="pf-aff" name="affiliation" defaultValue={profile.affiliation ?? ""} maxLength={200} placeholder="University, lab or company" /></Field>
      <Button type="submit" loading={busy}>Save profile</Button>
    </form>
  );
}

export function PasswordForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const newPassword = String(f.get("new"));
      if (newPassword !== String(f.get("confirm"))) return setError("The two new passwords are different.");
      setBusy(true);
      setError(null);
      const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword, revokeOtherSessions: true });
      setBusy(false);
      if (error) return setError(error.message ?? "Could not change the password.");
      form.reset();
      toast("success", "Password changed; other devices were signed out");
    }}>
      {error && <p role="alert" className="text-sm text-[var(--critical)]">{error}</p>}
      <Field label="Current password" htmlFor="pw-cur"><Input id="pw-cur" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 10 characters."><Input id="pw-new" name="new" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Field label="Repeat new password" htmlFor="pw-rep"><Input id="pw-rep" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Button type="submit" loading={busy}>Change password</Button>
    </form>
  );
}

export function SessionControls() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="secondary" loading={busy} onClick={async () => {
      setBusy(true);
      const { error } = await authClient.revokeOtherSessions();
      setBusy(false);
      toast(error ? "error" : "success", error ? error.message ?? "Could not sign out other sessions" : "Signed out of all other devices");
    }}>Sign out of other devices</Button>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Delete your account?" description="Your profile, library, projects you own, their runs, artifacts and tokens are deleted permanently. Projects you are only a member of are not affected." trigger={<Button variant="danger">Delete account</Button>}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const { error } = await authClient.deleteUser({ password: String(f.get("password")) });
        setBusy(false);
        if (error) return setError(error.message ?? "Could not delete the account.");
        router.push("/");
        router.refresh();
      }}>
        {error && <p role="alert" className="text-sm text-[var(--critical)]">{error}</p>}
        <Field label="Confirm with your password" htmlFor="del-pw"><Input id="del-pw" name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="danger" loading={busy}>Delete permanently</Button></div>
      </form>
    </Dialog>
  );
}
