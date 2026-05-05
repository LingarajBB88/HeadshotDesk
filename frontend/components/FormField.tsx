// Minimal form input with label, error, and consistent styling.

import { forwardRef, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
};

export const FormField = forwardRef<HTMLInputElement, Props>(function FormField(
  { label, error, hint, id, className = "", ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="mb-4">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={
          "w-full rounded-md border bg-paper px-3 py-2 text-sm " +
          "outline-none transition focus:ring-2 focus:ring-accent/30 " +
          (error ? "border-red-400 focus:border-red-500" : "border-muted-200 focus:border-accent") +
          (className ? " " + className : "")
        }
        {...props}
      />
      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="mt-1 text-xs text-muted-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-err`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
});
