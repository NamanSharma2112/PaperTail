import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <div className="sheet p-8">
        <p className="eyebrow">404</p>
        <h1 className="title mt-2 text-2xl">Nothing here, or not yours to see</h1>
        <p className="mt-2 text-sm text-ink-2">It may have been deleted, or it belongs to a project you are not a member of.</p>
        <p className="mt-5 text-sm"><Link href="/dashboard">Go to your dashboard</Link></p>
      </div>
    </div>
  );
}
