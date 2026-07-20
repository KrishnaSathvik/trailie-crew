import type { InputHTMLAttributes, ReactNode } from "react";

import {
  buttonClassName,
  inputClassName,
} from "@/components/ui/product-controls";

export { inputClassName };

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
    <div className="space-y-2">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-muted-foreground text-xs leading-5"
        >
          {hint}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={`${inputClassName} min-h-12`}
      />
      {error ? (
        <p
          id={`${id}-error`}
          className="text-destructive text-sm font-medium"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const submitClassName = buttonClassName({
  variant: "primary",
  className: "min-h-12 w-full px-5",
});
