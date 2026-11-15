import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">No project at this address</h1>
      <p className="mt-1 text-sm text-ink-2">
        It may have been renamed or never existed. <Link href="/">See all reproductions.</Link>
      </p>
    </div>
  );
}
