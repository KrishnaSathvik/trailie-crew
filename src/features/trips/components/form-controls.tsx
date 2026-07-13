import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClassName =
  "border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring focus-visible:ring-offset-background min-h-12 w-full rounded-md border px-3.5 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2";

export function Field({
  id,
  label,
  hint,
  error,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-muted-foreground mb-2 text-xs leading-5"
        >
          {hint}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={inputClassName}
      />
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-2 text-sm font-medium"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const submitClassName =
  "bg-foreground text-background focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-opacity focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60";
