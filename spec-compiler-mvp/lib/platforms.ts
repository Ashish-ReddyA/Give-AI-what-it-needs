// Dated platform knowledge — the ONLY place platform-specific facts live.
//
// Generation platforms churn monthly: parameter flags change, model lineups
// rotate, defaults shift. Hardcoding "--v 6" in a compiler is how prompts
// silently rot (that's exactly what v1 of this file's predecessor did).
// Everything here carries a `verified` date and is shown to the user in the
// results note, so stale knowledge is visible instead of silent.
//
// When updating: bump `verified`, and run `npm test` — the compiler tests
// assert against this config, not against magic strings.

/** When a human last checked these facts against the live platforms. */
export const KNOWLEDGE_VERIFIED = "2026-07";

export const MIDJOURNEY = {
  /** Current default model version to pin with --v */
  version: "7",
} as const;

export interface RoutedModel {
  model: string;
  why: string;
}

/**
 * Higgsfield image-model routing table.
 * Higgsfield aggregates multiple image models; the compiler has to pick one.
 * A simple, explainable heuristic — replace with real usage data (Phase 1.5
 * outcome log) once it exists. Model names churn: verify against Higgsfield's
 * current lineup when bumping KNOWLEDGE_VERIFIED.
 */
export const HIGGSFIELD_IMAGE_MODELS = {
  text: {
    model: "GPT Image 2",
    why: "the non-negotiable detail requires exact text/logo rendering",
  },
  realistic: {
    model: "Seedream",
    why: "realistic style is Seedream's strongest fit for photorealism",
  },
  exclusions: {
    model: "Nano Banana Pro",
    why: "exclusions/edits are involved — built for precise control",
  },
  default: {
    model: "Reve",
    why: "no strong signal either way — defaults to the most prompt-faithful option",
  },
} as const satisfies Record<string, RoutedModel>;

/**
 * Higgsfield video-model routing table.
 * Same idea as the image table: Higgsfield aggregates video models
 * (Veo, Kling, Seedance, Hailuo, ...) and the credits differ per model,
 * so routing wrong here wastes real money — this is the domain where
 * "credits at risk" is literally true.
 */
export const HIGGSFIELD_VIDEO_MODELS = {
  audio: {
    model: "Veo 3.1",
    why: "the clip needs rendered audio/dialogue — Veo generates native audio",
  },
  motion: {
    model: "Kling 2.5",
    why: "dynamic camera work is Kling's strongest fit",
  },
  long: {
    model: "Seedance 1.0 Pro",
    why: "longer multi-shot clips are Seedance's specialty",
  },
  default: {
    model: "Hailuo 02",
    why: "no strong signal either way — solid physics and prompt fidelity",
  },
} as const satisfies Record<string, RoutedModel>;
