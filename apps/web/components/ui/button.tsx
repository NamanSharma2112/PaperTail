import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "press inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-surface shadow-card hover:bg-[color-mix(in_oklab,var(--text-primary)_86%,var(--accent))]",
        secondary: "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "bg-[var(--critical)] text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline !px-0",
      },
      size: { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4", lg: "h-11 px-5 text-[15px]", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ className, variant, size, loading, children, disabled, ...props }, ref) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
});
