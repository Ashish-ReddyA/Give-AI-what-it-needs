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
    <div className="space-y-5">
      <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Brief</p>
          <h2 className="mt-1 text-lg font-semibold text-textPrimary">What do you want to create?</h2>
          <p className="mt-1 text-sm text-textSecondary">
            Describe the subject, setting, and moment. You can refine every detail after analysis.
          </p>
        </div>
        <label htmlFor="image-idea" className="sr-only">Image idea</label>
        <textarea
          id="image-idea"
          value={spec.idea}
          onChange={(e) => set("idea", e.target.value)}
          placeholder="A quiet cafe at sunrise, steam rising from a latte near the window..."
          rows={5}
          className="min-h-36 w-full resize-y rounded-xl border border-borderUi bg-surfaceSubtle px-4 py-3.5 text-base leading-7 text-textPrimary placeholder:text-textMuted focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10"
        />
      </section>

      <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-textPrimary">Core settings</h2>
          <p className="mt-1 text-sm text-textSecondary">Set the output shape and the details that cannot be wrong.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel>Aspect ratio</FieldLabel>
            <div role="group" aria-label="Aspect ratio" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(FORMAT_LABELS) as AspectFormat[]).map((format) => (
                <ChoiceButton
                  key={format}
                  active={spec.format === format}
                  onClick={() => set("format", format)}
                >
                  {FORMAT_LABELS[format]}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <FieldLabel>Visual style</FieldLabel>
            <div role="group" aria-label="Visual style" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(STYLE_LABELS) as ImageStyle[]).map((style) => (
                <ChoiceButton
                  key={style}
                  active={spec.style === style}
                  onClick={() => set("style", style)}
                >
                  {STYLE_LABELS[style]}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <FieldLabel htmlFor="image-non-negotiable">Must-have detail</FieldLabel>
            <p id="image-non-negotiable-help" className="mb-2 text-sm text-textSecondary">
              The one detail that would make the generation unusable if it were wrong.
            </p>
            <TextField
              id="image-non-negotiable"
              label="Must-have image detail"
              value={spec.nonNegotiable}
              onChange={(value) => set("nonNegotiable", value)}
              placeholder="For example: the cat must be an orange tabby"
            />
          </div>
        </div>

        <details className="mt-6 border-t border-borderUi pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-textPrimary">Advanced details</summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="image-use" optional>Intended use</FieldLabel>
              <TextField
                id="image-use"
                label="Intended image use"
                value={spec.formatUse}
                onChange={(value) => set("formatUse", value)}
                placeholder="Instagram post, product hero, print..."
              />
            </div>
            <div>
              <FieldLabel htmlFor="image-exclusions" optional>Exclude</FieldLabel>
              <TextField
                id="image-exclusions"
                label="Image exclusions"
                value={spec.exclusions}
                onChange={(value) => set("exclusions", value)}
                placeholder="Text, watermark, extra limbs..."
              />
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
