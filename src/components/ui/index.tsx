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

/*
 * There is deliberately no `Select` here any more.
 *
 * A native select hands the choosing to the operating system — on Android a
 * grey system dialog in the middle of a screen that looks nothing like it —
 * and sizes itself to its longest option, which is what once pushed a control
 * row past the edge of the screen. `Picker` is the house control; if one of
 * these is ever needed again, it should be for a reason worth writing down.
 */

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

/* ---------------------------------------------------------- picked date */

/**
 * The chosen date, spelled out under a native date field.
 *
 * A date input shows whatever format the BROWSER's own language uses, not the
 * page's — so the same field reads dd/mm/yyyy on one phone and mm/dd/yyyy on
 * the next, and 05/09 means two different days. Nothing in the app can change
 * that, so the app says the date in words instead and the ambiguity is gone.
 */
export function PickedDate({ value }: { value: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <p className="mt-1.5 text-[12.5px] font-semibold text-brand-ink">
      {d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })}
    </p>
  );
}

/* ------------------------------------------------------------------ picker */

export type PickerOption = { value: string; label: string };

/**
 * A choice, in the app's own clothes.
 *
 * A native `<select>` hands the choosing to the operating system: on Android
 * that is a grey system dialog with radio buttons, in the middle of a screen
 * that looks nothing like it, and on iOS a wheel at the bottom. It also sizes
 * itself to its longest option, which is what once pushed the Pipeline's
 * controls past the edge of the screen and stretched the layout viewport.
 *
 * This is the same list in the app's own sheet: full-width rows you can
 * actually hit, the current choice marked, and the page's own type and
 * colour. `name` posts the value in a form exactly as the select did.
 */
export function Picker({
  value,
  onChange,
  options,
  label,
  name,
  placeholder = "Select",
  className,
  required,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  /** Names the control for screen readers and titles the sheet. */
  label: string;
  /** When set, the value is posted in the surrounding form. */
  name?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}: ${selected?.label ?? placeholder}`}
        className={cn(
          fieldStyles,
          "flex items-center gap-1 text-left disabled:opacity-50",
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-ink" : "text-muted/70",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="-mr-0.5 shrink-0 text-muted"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* The value still reaches the server the way a select's did. */}
      {name ? (
        <input type="hidden" name={name} value={value} required={required} />
      ) : null}

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul className="-my-1 divide-y divide-line">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value || "__empty"}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  aria-current={on}
                  className={cn(
                    "flex h-[52px] w-full items-center gap-3 text-left text-[15px] transition",
                    on ? "font-semibold text-brand-ink" : "text-ink",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {on ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/**
 * A `Picker` that keeps its own value, the way an uncontrolled `<select>`
 * with a `defaultValue` did.
 *
 * Re-seeds when `defaultValue` changes, so a sheet reopened on a different
 * deal shows that deal's value rather than the last one's.
 */
export function PickerField({
  defaultValue = "",
  onValueChange,
  ...rest
}: Omit<React.ComponentProps<typeof Picker>, "value" | "onChange"> & {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = React.useState(defaultValue);
  React.useEffect(() => setValue(defaultValue), [defaultValue]);
  return (
    <Picker
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValueChange?.(v);
      }}
    />
  );
}

/* ------------------------------------------------------- segmented control */

/**
 * One switch, used everywhere something has two or three views.
 *
 * There were five of these built by hand — Board/List, My deals/All deals,
 * Forecast/Wins, Vehicles/Value, Users/Master data — in three different
 * visual treatments, and the Admin one had no active state at all, so you
 * could not tell which page you were on. They are all this now.
 *
 * The selected option is a white card lifted off a grey track, not a slab of
 * ink: on a phone the darkest thing on screen should be a primary action, not
 * a view switch. Options share the width evenly so the control never grows
 * with its labels and pushes the row past the screen.
 *
 * On a desktop row the phone treatment disappeared: a grey track next to white
 * inputs and bordered buttons read as two words of text, not something you
 * could press. From `md` up it becomes the same bordered white shell the
 * Board/Table switch uses, with the chosen option in ink — one switch shape
 * across the whole app.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  /** Named for screen readers, since the control itself is just buttons. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex rounded-xl bg-canvas p-1",
        "md:h-11 md:border md:border-line md:bg-white md:p-[3px]",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-semibold transition md:h-full md:rounded-lg md:text-sm",
              active
                ? "bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] md:bg-ink md:text-white md:shadow-none"
                : "text-muted active:bg-white/60 md:hover:bg-canvas md:hover:text-ink",
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
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
/**
 * How many sheets are open.
 *
 * A picker inside a sheet is a sheet inside a sheet, and the inner one
 * closing would otherwise hand the page back its scrollbar while the outer
 * one is still covering it.
 */
let openSheets = 0;

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
    openSheets += 1;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = "";
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
 * Big tappable tiles instead of a dropdown. A deal owner picking a driver
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
