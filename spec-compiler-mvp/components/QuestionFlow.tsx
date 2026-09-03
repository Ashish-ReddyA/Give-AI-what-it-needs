"use client";

import {
  ImageSpec,
  AspectFormat,
  ImageStyle,
  FORMAT_LABELS,
  STYLE_LABELS,
} from "@/lib/types";
import { FieldLabel, ChoiceButton, TextField } from "./fields";

interface Props {
  spec: ImageSpec;
  onChange: (next: ImageSpec) => void;
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
          placeholder="e.g. a quiet cafe at sunrise, steam rising from a latte"
          rows={3}
          className="w-full bg-paperRaised border border-line rounded-sm px-3 py-2.5 text-sm font-body text-ink placeholder:text-inkFaint focus:outline-none focus:border-ink resize-none transition-colors leading-relaxed"
        />
      </div>

      <div>
        <FieldLabel number="01">Format</FieldLabel>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {(Object.keys(FORMAT_LABELS) as AspectFormat[]).map((f) => (
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
          The one thing that ruins this if it&apos;s missing or wrong.
        </p>
        <TextField
          value={spec.nonNegotiable}
          onChange={(v) => set("nonNegotiable", v)}
          placeholder="e.g. must be an orange tabby cat"
        />
      </div>

      <div>
        <FieldLabel number="04" optional>
          Exclusions
        </FieldLabel>
        <TextField
          value={spec.exclusions}
          onChange={(v) => set("exclusions", v)}
          placeholder="comma-separated, e.g. text, watermark"
        />
      </div>
    </div>
  );
}
