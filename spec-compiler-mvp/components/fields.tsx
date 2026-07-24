"use client";

// Shared form primitives for the per-domain question flows.

export function FieldLabel({
  number,
  children,
  optional,
}: {
  number: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <span className="font-mono text-xs text-inkMuted">{number}</span>
      <h3 className="font-display font-medium text-sm uppercase tracking-wide text-ink">
        {children}
      </h3>
      {optional && (
        <span className="font-mono text-[10px] text-inkMuted">optional</span>
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
      onClick={onClick}
      className={`px-3 py-2 text-sm font-mono border rounded-sm transition-colors text-left ${
        active
          ? "bg-ink text-paperRaised border-ink"
          : "bg-paperRaised text-ink border-line hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2 text-sm font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
    />
  );
}
