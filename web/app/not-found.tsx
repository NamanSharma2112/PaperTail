import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sheet p-8">
      <p className="eyebrow">404</p>
      <h1 className="title mt-2 text-2xl">No project at this address</h1>
      <p className="mt-1 text-sm text-ink-2">
        It may have been renamed or never existed. <Link href="/">See all reproductions.</Link>
      </p>
    </div>
  );
}
