import { ImageSpec, VideoSpec } from "./types";

export interface RequiredField<S> {
  key: keyof S & string;
  label: string;
  /** What generating without this field risks — shown in the UI so the
   * ask never feels arbitrary. */
  prevents: string;
  filled: (spec: S) => boolean;
}

export interface MissingField {
  key: string;
  label: string;
  prevents: string;
}

export interface CompletenessResult {
  /** 0–100 */
  score: number;
  /** How many required fields are still unanswered.
   * HONESTY NOTE: this is a field count, not a literal credit count.
   * Each unanswered field is one of the top causes of a throwaway run —
   * the UI explains this instead of pretending it's exact math. */
  regenRisks: number;
  missing: MissingField[];
  /** All required fields answered — results show automatically. */
  isComplete: boolean;
  /** Minimum bar to compile at all (an idea exists). Compiling below
   * isComplete requires an explicit "compile anyway" from the user, so
   * the meter and the gate can never contradict each other again. */
  hasIdea: boolean;
}

export function scoreSpec<S extends { idea: string }>(
  spec: S,
  fields: RequiredField<S>[]
): CompletenessResult {
  const missing = fields.filter((f) => !f.filled(spec));
  const filledCount = fields.length - missing.length;
  const score = Math.round((filledCount / fields.length) * 100);

  return {
    score,
    regenRisks: missing.length,
    missing: missing.map(({ key, label, prevents }) => ({
      key,
      label,
      prevents,
    })),
    isComplete: missing.length === 0,
    hasIdea: spec.idea.trim().length > 0,
  };
}

// Only Level 1 fields count toward completeness. Optional context fields
// (formatUse, exclusions, audio) don't — see original PRD Level 1 vs Level 2.

export const IMAGE_REQUIRED_FIELDS: RequiredField<ImageSpec>[] = [
  {
    key: "idea",
    label: "Base idea",
    prevents: "generating something with no clear subject at all",
    filled: (spec) => spec.idea.trim().length > 0,
  },
  {
    key: "format",
    label: "Format",
    prevents: "an unusable aspect ratio for where this is going",
    filled: (spec) => spec.format !== null,
  },
  {
    key: "style",
    label: "Style",
    prevents: "a totally different aesthetic than you wanted",
    filled: (spec) => spec.style !== null,
  },
  {
    key: "nonNegotiable",
    label: "Non-negotiable detail",
    prevents: "the one dealbreaker detail getting missed",
    filled: (spec) => spec.nonNegotiable.trim().length > 0,
  },
];

export const VIDEO_REQUIRED_FIELDS: RequiredField<VideoSpec>[] = [
  {
    key: "idea",
    label: "Base idea",
    prevents: "burning a video credit on no clear subject at all",
    filled: (spec) => spec.idea.trim().length > 0,
  },
  {
    key: "format",
    label: "Format",
    prevents: "an unusable aspect ratio for where this is going",
    filled: (spec) => spec.format !== null,
  },
  {
    key: "duration",
    label: "Duration",
    prevents: "paying for a clip length you can't use",
    filled: (spec) => spec.duration !== null,
  },
  {
    key: "motion",
    label: "Camera motion",
    prevents: "the wrong camera feel — the #1 cause of video regens",
    filled: (spec) => spec.motion !== null,
  },
  {
    key: "nonNegotiable",
    label: "Non-negotiable detail",
    prevents: "the one dealbreaker detail getting missed",
    filled: (spec) => spec.nonNegotiable.trim().length > 0,
  },
];
