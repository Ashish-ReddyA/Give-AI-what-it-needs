"use client";

import {
  ImageSpec,
  ImageFormat,
  ImageStyle,
  FORMAT_LABELS,
  STYLE_LABELS,
} from "@/lib/types";

interface Props {
  spec: ImageSpec;
  onChange: (next: ImageSpec) => void;
}

function FieldLabel({
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

function ChoiceButton({
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

export default function QuestionFlow({ spec, onChange }: Props) {
  const set = <K extends keyof ImageSpec>(key: K, value: ImageSpec[K]) =>
    onChange({ ...spec, [key]: value });

  return (
    <div className="space-y-6">
      <div>
        <FieldLabel number="00">Base idea</FieldLabel>
        <textarea
          value={spec.idea}
          onChange={(e) => set("idea", e.target.value)}
          placeholder="e.g. a cat sitting on a wooden table"
          rows={2}
          className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2 text-sm font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink resize-none"
        />
      </div>

      <div>
        <FieldLabel number="01">Format</FieldLabel>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {(Object.keys(FORMAT_LABELS) as ImageFormat[]).map((f) => (
            <ChoiceButton
              key={f}
              active={spec.format === f}
              onClick={() => set("format", f)}
            >
              {FORMAT_LABELS[f]}
            </ChoiceButton>
          ))}
        </div>
        <input
          value={spec.formatUse}
          onChange={(e) => set("formatUse", e.target.value)}
          placeholder="what's it for? e.g. Instagram post (optional)"
          className="w-full bg-transparent border-b border-line px-1 py-1 text-xs font-mono text-inkMuted placeholder:text-inkMuted focus:outline-none focus:border-ink"
        />
      </div>

      <div>
        <FieldLabel number="02">Style</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(STYLE_LABELS) as ImageStyle[]).map((s) => (
            <ChoiceButton
              key={s}
              active={spec.style === s}
              onClick={() => set("style", s)}
            >
              {STYLE_LABELS[s]}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel number="03">Non-negotiable detail</FieldLabel>
        <p className="text-xs text-inkMuted mb-2 font-body">
          The one thing that ruins this if it's missing or wrong.
        </p>
        <input
          value={spec.nonNegotiable}
          onChange={(e) => set("nonNegotiable", e.target.value)}
          placeholder="e.g. must be an orange tabby cat"
          className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2 text-sm font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
        />
      </div>

      <div>
        <FieldLabel number="04" optional>
          Exclusions
        </FieldLabel>
        <input
          value={spec.exclusions}
          onChange={(e) => set("exclusions", e.target.value)}
          placeholder="comma-separated, e.g. text, watermark"
          className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2 text-sm font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
        />
      </div>
    </div>
  );
}
