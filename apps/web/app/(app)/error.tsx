"use client";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="sheet p-8">
      <p className="eyebrow">Error</p>
      <h1 className="title mt-2 text-2xl">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-ink-2">The database may be unreachable, or something went wrong on the server. Nothing you entered has been lost.</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </div>
  );
}
