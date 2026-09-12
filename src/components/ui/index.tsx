"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ button */

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink/90",
        brand: "bg-brand text-white hover:brightness-95",
        secondary: "bg-white border border-line text-ink hover:bg-canvas",
        ghost: "text-muted hover:bg-canvas hover:text-ink",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        // 44px+ targets everywhere: this is a phone app first.
        md: "h-11 px-4 text-[15px]",
        lg: "h-12 px-5 text-base",
        sm: "h-9 px-3 text-sm",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/* ------------------------------------------------------------------- field */

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-[13px] font-medium text-muted mb-1.5 tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

const fieldStyles =
  "w-full h-12 rounded-xl border border-line bg-white px-3.5 text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldStyles, className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldStyles, "appearance-none pr-9 bg-no-repeat", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' fill='none' stroke='%2364748b' stroke-width='2'><path d='M6 8l4 4 4-4'/></svg>\")",
      backgroundPosition: "right 0.75rem center",
    }}
    {...props}
  />
));
Select.displayName = "Select";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldStyles, "h-auto min-h-24 py-3 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  // A <label> wrapping the control associates the two implicitly, so tapping
  // the caption focuses the field and screen readers announce it correctly.
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium tracking-tight text-muted">
          {label}
        </span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- sheet */

/**
 * Bottom sheet on phones, centred dialog on desktop. Native <dialog>-free so
 * it behaves identically in iOS standalone PWA mode.
 *
 * Pass `action` and the whole sheet becomes one <form>, so a footer button is
 * a real submit button inside it. The alternative — a button outside the form
 * calling requestSubmit() — silently does nothing on iOS Safari before 16,
 * which is exactly how a "nothing happens when I tap Create" bug is born.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  action?: (formData: FormData) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl animate-[sheet_.18s_ease-out]"
      >
        <div className="shrink-0 px-5 pt-3 pb-3 border-b border-line">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="h-9 w-9 -mr-2 rounded-lg text-muted hover:bg-canvas text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <Body action={action}>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-line px-5 py-3 safe-bottom">
              {footer}
            </div>
          ) : null}
        </Body>
      </div>
      <style>{`@keyframes sheet{from{transform:translateY(12px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}

/** One <form> around scroll area and footer, or a plain wrapper when there is
 *  no action to submit. */
function Body({
  action,
  children,
}: {
  action?: (formData: FormData) => void;
  children: React.ReactNode;
}) {
  if (!action) return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {children}
    </form>
  );
}

/* ------------------------------------------------------------ icon choice */

export type ChoiceOption = {
  value: string;
  label: string;
  icon: React.ReactNode;
  hint?: string;
};

/**
 * Big tappable tiles instead of a dropdown. A salesperson picking a driver
 * arrangement should see the choices at a glance, not open a select and read.
 */
export function ChoiceGroup({
  name,
  options,
  value,
  onChange,
  columns = 3,
}: {
  name: string;
  options: ChoiceOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  columns?: 2 | 3;
}) {
  return (
    <>
      <input type="hidden" name={name} value={value ?? ""} />
      <div
        role="radiogroup"
        className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-3")}
      >
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : o.value)}
              className={cn(
                "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition active:scale-[0.98]",
                selected
                  ? "border-brand bg-brand-soft text-brand-ink ring-2 ring-brand/20"
                  : "border-line bg-white text-muted hover:bg-canvas",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  selected ? "text-brand-ink" : "text-muted",
                )}
              >
                {o.icon}
              </span>
              <span className="text-[12px] font-medium leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
} from "@/components/ui-server";
