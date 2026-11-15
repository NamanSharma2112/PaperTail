import { PageHeader } from "@/components/AppShell";
import { DeleteAccount, PasswordForm, ProfileForm, SessionControls } from "@/components/AccountSettings";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { one } from "@/lib/server/services/common";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { profile, user } = await pageData(async (db, u) => ({ user: u, profile: await one<{ display_name: string; affiliation: string | null }>(db, "select * from profiles where id = $1", [u.id], "Profile") }));
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} title="Settings" />
      <div className="grid gap-12 lg:grid-cols-2">
        <section className="space-y-4">
          <SectionHead n="01" title="Profile" />
          <div className="sheet p-6"><p className="mb-4 text-sm text-ink-2">Signed in as <strong>{user.email}</strong></p><ProfileForm profile={profile} /></div>
          <SectionHead n="02" title="Password and sessions" className="pt-6" />
          <div className="sheet space-y-6 p-6"><PasswordForm /><div className="border-t border-line pt-5"><SessionControls /></div></div>
        </section>
        <section className="space-y-4">
          <SectionHead n="03" title="Project settings" />
          <p className="sheet p-5 text-sm text-ink-2">Project details, your conclusion and ingestion tokens are in each project&apos;s Settings tab.</p>
          <SectionHead n="04" title="Privacy and data" className="pt-6" />
          <div className="sheet space-y-3 p-6 text-sm text-ink-2">
            <p>Your projects are private to you and to members you add. Every request runs under database row-level security, so other accounts cannot read your data even through the API.</p>
            <p>Experiments run on your own computer. The server stores run metadata, metrics and small files you choose to upload (up to 2 MB each); it never stores datasets or executes code.</p>
            <p>Paper metadata is fetched from arXiv, Crossref and OpenAlex when you import a paper; only the identifier you typed is sent to them.</p>
            <p>Each project&apos;s report can be exported as Markdown from its Report tab.</p>
          </div>
          <div className="rounded-[14px] border border-[color-mix(in_oklab,var(--critical)_40%,var(--border))] p-6">
            <p className="label">Delete account</p>
            <p className="mb-4 text-sm text-ink-2">Removes your account and everything it owns. This cannot be undone.</p>
            <DeleteAccount />
          </div>
        </section>
      </div>
    </>
  );
}
