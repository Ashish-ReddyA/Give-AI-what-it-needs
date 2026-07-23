// Pure logic for the MCP tools — no transport, no SDK imports, fully
// unit-testable. The server (server.ts) is a thin stdio wrapper over this.
//
// The elicit → compile loop IS the product: an agent calls elicit_spec,
// asks the user only what's missing, then calls compile_spec. compile_spec
// refuses to compile an incomplete spec unless allowIncomplete is set —
// the same explicit "compile anyway" gate the web UI has.

import {
  Domain,
  ImageSpec,
  VideoSpec,
  EMPTY_SPEC,
  EMPTY_VIDEO_SPEC,
  AspectFormat,
  ImageStyle,
  VideoDuration,
  CameraMotion,
  FORMAT_LABELS,
  STYLE_LABELS,
  DURATION_LABELS,
  MOTION_LABELS,
  CompiledPrompt,
} from "../lib/types";
import {
  scoreSpec,
  CompletenessResult,
  IMAGE_REQUIRED_FIELDS,
  VIDEO_REQUIRED_FIELDS,
} from "../lib/completeness";
import { compileAll } from "../lib/compilers";
import { compileAllVideo } from "../lib/compilers-video";

export interface SpecArgs {
  domain: Domain;
  idea?: string;
  format?: AspectFormat;
  style?: ImageStyle;
  duration?: VideoDuration;
  motion?: CameraMotion;
  nonNegotiable?: string;
  audio?: string;
  exclusions?: string;
  formatUse?: string;
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  key: string;
  question: string;
  /** What answering this prevents — so the agent can explain the ask */
  why: string;
  options?: QuestionOption[];
}

export interface ElicitResult {
  domain: Domain;
  completeness: CompletenessResult;
  /** Required fields still unanswered, phrased as questions for the user */
  questionsRemaining: Question[];
  /** Optional context worth offering (not required for completeness) */
  optionalContext: Question[];
  instructions: string;
}

export interface CompileResult {
  compiled: boolean;
  domain: Domain;
  completeness: CompletenessResult;
  prompts?: CompiledPrompt[];
  questionsRemaining?: Question[];
  instructions: string;
}

const QUESTION_TEXT: Record<string, string> = {
  idea: "What should be generated? Describe the core idea in a sentence.",
  format: "What aspect ratio / format is this for?",
  style: "What visual style?",
  duration: "How long should the clip be?",
  motion: "What camera motion / feel?",
  nonNegotiable:
    "What is the ONE non-negotiable detail — the thing that ruins the result if it's missing or wrong?",
};

const toOptions = (labels: Record<string, string>): QuestionOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const FIELD_OPTIONS: Record<string, QuestionOption[]> = {
  format: toOptions(FORMAT_LABELS),
  style: toOptions(STYLE_LABELS),
  duration: toOptions(DURATION_LABELS),
  motion: toOptions(MOTION_LABELS),
};

const OPTIONAL_CONTEXT: Record<Domain, Question[]> = {
  image: [
    {
      key: "exclusions",
      question:
        "Anything that must NOT appear? (comma-separated, e.g. text, watermark)",
      why: "exclusions change which model gets used and become --no flags / explicit instructions",
    },
    {
      key: "formatUse",
      question: "What is the image for? (e.g. Instagram post)",
      why: "context that helps sanity-check the format choice",
    },
  ],
  video: [
    {
      key: "audio",
      question: "Any dialogue or sound that must be in the clip?",
      why: "only some models render audio — this changes which model is routed to",
    },
    {
      key: "exclusions",
      question:
        "Anything that must NOT appear? (comma-separated, e.g. text overlays, watermark)",
      why: "exclusions become explicit do-not-include instructions per platform",
    },
  ],
};

export function buildImageSpec(args: SpecArgs): ImageSpec {
  return {
    ...EMPTY_SPEC,
    idea: args.idea ?? "",
    format: args.format ?? null,
    formatUse: args.formatUse ?? "",
    style: args.style ?? null,
    nonNegotiable: args.nonNegotiable ?? "",
    exclusions: args.exclusions ?? "",
  };
}

export function buildVideoSpec(args: SpecArgs): VideoSpec {
  return {
    ...EMPTY_VIDEO_SPEC,
    idea: args.idea ?? "",
    format: args.format ?? null,
    duration: args.duration ?? null,
    motion: args.motion ?? null,
    nonNegotiable: args.nonNegotiable ?? "",
    audio: args.audio ?? "",
    exclusions: args.exclusions ?? "",
  };
}

function score(args: SpecArgs): CompletenessResult {
  return args.domain === "image"
    ? scoreSpec(buildImageSpec(args), IMAGE_REQUIRED_FIELDS)
    : scoreSpec(buildVideoSpec(args), VIDEO_REQUIRED_FIELDS);
}

function questionsFor(completeness: CompletenessResult): Question[] {
  return completeness.missing.map((m) => ({
    key: m.key,
    question: QUESTION_TEXT[m.key] ?? `Provide ${m.label}.`,
    why: `prevents ${m.prevents}`,
    ...(FIELD_OPTIONS[m.key] ? { options: FIELD_OPTIONS[m.key] } : {}),
  }));
}

export function elicit(args: SpecArgs): ElicitResult {
  const completeness = score(args);
  const questionsRemaining = questionsFor(completeness);
  const answered = args.domain === "image" ? 4 : 5;

  return {
    domain: args.domain,
    completeness,
    questionsRemaining,
    optionalContext: OPTIONAL_CONTEXT[args.domain].filter(
      (q) => !(args[q.key as keyof SpecArgs] ?? "").toString().trim()
    ),
    instructions: completeness.isComplete
      ? "All required fields are answered. Call compile_spec with the same arguments to get one prompt per platform."
      : `Ask the user the ${questionsRemaining.length} remaining question(s) — do NOT invent answers; each unanswered field is a common cause of a wasted generation. Then call compile_spec with all ${answered} required fields (optional context helps too).`,
  };
}

export function compile(
  args: SpecArgs & { allowIncomplete?: boolean }
): CompileResult {
  const completeness = score(args);

  if (!completeness.hasIdea) {
    return {
      compiled: false,
      domain: args.domain,
      completeness,
      questionsRemaining: questionsFor(completeness),
      instructions:
        "Cannot compile without an idea. Ask the user what should be generated, then call compile_spec again.",
    };
  }

  if (!completeness.isComplete && !args.allowIncomplete) {
    const questionsRemaining = questionsFor(completeness);
    return {
      compiled: false,
      domain: args.domain,
      completeness,
      questionsRemaining,
      instructions: `Not compiled: ${completeness.regenRisks} required field(s) are unanswered, each a common cause of a throwaway run. Ask the user the remaining question(s) and call compile_spec again — or pass allowIncomplete: true to explicitly accept the risk.`,
    };
  }

  const prompts =
    args.domain === "image"
      ? compileAll(buildImageSpec(args))
      : compileAllVideo(buildVideoSpec(args));

  const riskNote = completeness.isComplete
    ? "Spec was complete."
    : `Compiled with ${completeness.regenRisks} accepted regen risk(s).`;

  return {
    compiled: true,
    domain: args.domain,
    completeness,
    prompts,
    instructions: `${riskNote} Give the user the prompt for their platform (each card's note explains the compiler's choices). The meta fields (model routing, aspect, duration) matter — surface them.`,
  };
}
