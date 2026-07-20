import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "text";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-foreground text-background hover:opacity-88 disabled:cursor-not-allowed disabled:opacity-45",
  secondary:
    "border border-border bg-surface hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45",
  ghost:
    "text-muted-foreground hover:bg-subtle hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
  destructive:
    "bg-destructive text-destructive-foreground hover:opacity-88 disabled:cursor-not-allowed disabled:opacity-45",
  text: "text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground disabled:cursor-not-allowed disabled:opacity-45",
};

export function buttonClassName({
  variant = "primary",
  compact = false,
  className = "",
}: {
  variant?: ButtonVariant;
  compact?: boolean;
  className?: string;
} = {}) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-[background-color,color,opacity,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    compact ? "min-h-10 px-3 text-xs" : "min-h-11 px-4 text-sm",
    buttonVariants[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export const inputClassName =
  "border-border bg-surface text-foreground placeholder:text-muted-foreground/70 min-h-11 w-full rounded-control border px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted-foreground";

export const textareaClassName = `${inputClassName} min-h-24 resize-y py-3 leading-6`;

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mx-auto flex w-full max-w-lg flex-col items-center px-6 py-14 text-center ${className}`}
    >
      {icon ? (
        <span className="border-border bg-surface-raised text-muted-foreground rounded-card shadow-soft flex size-11 items-center justify-center border">
          {icon}
        </span>
      ) : null}
      <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">
        {title}
      </h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
        {description}
      </p>
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const tones = {
    neutral: "border-border bg-surface-raised text-muted-foreground",
    positive: "border-positive/30 bg-positive-soft text-positive",
    warning: "border-warning/35 bg-warning-soft text-warning",
    negative: "border-destructive/30 bg-destructive-soft text-destructive",
  };
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
