import { ImageSpec } from "./types";

export interface RequiredField {
  key: keyof ImageSpec;
  label: string;
  /** What generating without this field risks — shown in the UI so the
   * ask never feels arbitrary. */
  prevents: string;
  filled: (spec: ImageSpec) => boolean;
}

// Only Level 1 fields count toward completeness. formatUse and exclusions
// are optional context, not required — see original PRD Level 1 vs Level 2.
export const REQUIRED_FIELDS: RequiredField[] = [
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

export interface CompletenessResult {
  /** 0–100 */
  score: number;
  /** How many required fields are still unanswered */
  creditsAtRisk: number;
  missing: RequiredField[];
  isReadyToCompile: boolean;
}

export function scoreSpec(spec: ImageSpec): CompletenessResult {
  const missing = REQUIRED_FIELDS.filter((f) => !f.filled(spec));
  const filledCount = REQUIRED_FIELDS.length - missing.length;
  const score = Math.round((filledCount / REQUIRED_FIELDS.length) * 100);

  return {
    score,
    creditsAtRisk: missing.length,
    missing,
    // Allow compiling once the idea + non-negotiable are set, even if
    // format/style are still defaults — but flag the risk clearly.
    isReadyToCompile: spec.idea.trim().length > 0,
  };
}
