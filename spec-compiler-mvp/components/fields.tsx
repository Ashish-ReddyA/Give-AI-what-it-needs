"use client";

export function FieldLabel({
  children,
  optional,
  htmlFor,
}: {
  number?: string;
  children: React.ReactNode;
  optional?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold text-textPrimary"
      >
        {children}
      </label>
      {optional && (
        <span className="rounded-full bg-surfaceSubtle px-2 py-0.5 text-xs font-medium text-textMuted">
          Optional
        </span>
      )}
    </div>
  );
}

export function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primarySoft text-primary shadow-inset"
          : "border-borderUi bg-surface text-textSecondary hover:border-borderStrong hover:bg-surfaceSubtle"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-primary" : "bg-borderStrong"}`}
        />
        {children}
      </span>
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  id,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id?: string;
  label?: string;
}) {
  return (
    <input
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-11 w-full rounded-lg border border-borderUi bg-surface px-3.5 py-2.5 text-sm text-textPrimary placeholder:text-textMuted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
    />
  );
}
