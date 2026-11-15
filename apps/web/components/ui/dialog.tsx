"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Dialog({ open, onOpenChange, title, description, children, trigger, wide }: {
  open?: boolean; onOpenChange?: (o: boolean) => void; title: string; description?: React.ReactNode; children: React.ReactNode; trigger?: React.ReactNode; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="dialog-overlay fixed inset-0 z-40 bg-[rgb(15_27_45/0.35)] backdrop-blur-[2px]" />
        <D.Content className={cn("dialog-content sheet fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-float", wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="title text-xl">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <button className="press -mr-2 -mt-1 rounded-full p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-4" />
              </button>
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation for destructive actions. */
export function ConfirmButton({ label, title, description, confirmLabel = "Delete", onConfirm, variant = "ghost", size = "sm", icon }: {
  label: React.ReactNode; title: string; description: React.ReactNode; confirmLabel?: string; onConfirm: () => Promise<void>; variant?: "ghost" | "secondary" | "danger"; size?: "sm" | "md"; icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); setError(null); }}
      title={title}
      description={description}
      trigger={<Button variant={variant} size={size} type="button">{icon}{label}</Button>}
    >
      {error && <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-[var(--critical)]" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} type="button">Cancel</Button>
        <Button
          variant="danger"
          loading={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "That did not work");
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
