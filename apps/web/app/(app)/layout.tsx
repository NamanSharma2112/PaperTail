import { AppShell } from "@/components/AppShell";
import { requireUserPage } from "@/lib/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
