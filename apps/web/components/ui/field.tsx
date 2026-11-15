import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, error, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="label !mb-0" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--critical)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("field", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("field min-h-[84px] resize-y leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn("field appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%23737d8f' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
});

export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, "")}`;
}
