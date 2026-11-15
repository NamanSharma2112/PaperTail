import Link from "next/link";
import { Wordmark } from "@/components/Mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
        <Link href="/" className="!no-underline"><Wordmark /></Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="sheet plate w-full max-w-md p-7 sm:p-9">{children}</div>
      </main>
    </div>
  );
}
