// Types + pure merge logic for the AI-assist layer. Deliberately free of
// SDK and zod imports so the main page bundle stays lean — the Anthropic
// SDK (lib/analyze.ts) is dynamically imported only when the user actually
// runs an analysis.
//
// Invariant: analysis NEVER overwrites something the user already set.
// The LLM pre-fills empty fields only; the user's explicit choices win.

import {
  ImageSpec,
  VideoSpec,
  AspectFormat,
  ImageStyle,
  VideoDuration,
  CameraMotion,
} from "./types";

export interface ImageAnalysis {
  format: AspectFormat | null;
  style: ImageStyle | null;
  nonNegotiable: string | null;
  exclusions: string | null;
  formatUse: string | null;
  /** The single highest-leverage question to ask next, tailored to the idea */
  nextQuestion: string | null;
}

export interface VideoAnalysis {
  format: AspectFormat | null;
  duration: VideoDuration | null;
  motion: CameraMotion | null;
  nonNegotiable: string | null;
  audio: string | null;
  exclusions: string | null;
  nextQuestion: string | null;
}

export type Analysis =
  | ({ domain: "image" } & ImageAnalysis)
  | ({ domain: "video" } & VideoAnalysis);

export interface MergeOutcome<S> {
  spec: S;
  /** Keys the analysis filled (was empty, now set) — for the UI hint */
  filled: string[];
}

const blank = (s: string) => s.trim().length === 0;

export function mergeImageAnalysis(
  spec: ImageSpec,
  a: ImageAnalysis
): MergeOutcome<ImageSpec> {
  const next = { ...spec };
  const filled: string[] = [];

  if (next.format === null && a.format) {
    next.format = a.format;
    filled.push("format");
  }
  if (next.style === null && a.style) {
    next.style = a.style;
    filled.push("style");
  }
  if (blank(next.nonNegotiable) && a.nonNegotiable?.trim()) {
    next.nonNegotiable = a.nonNegotiable.trim();
    filled.push("non-negotiable");
  }
  if (blank(next.exclusions) && a.exclusions?.trim()) {
    next.exclusions = a.exclusions.trim();
    filled.push("exclusions");
  }
  if (blank(next.formatUse) && a.formatUse?.trim()) {
    next.formatUse = a.formatUse.trim();
    filled.push("format use");
  }

  return { spec: next, filled };
}

export function mergeVideoAnalysis(
  spec: VideoSpec,
  a: VideoAnalysis
): MergeOutcome<VideoSpec> {
  const next = { ...spec };
  const filled: string[] = [];

  if (next.format === null && a.format) {
    next.format = a.format;
    filled.push("format");
  }
  if (next.duration === null && a.duration) {
    next.duration = a.duration;
    filled.push("duration");
  }
  if (next.motion === null && a.motion) {
    next.motion = a.motion;
    filled.push("camera motion");
  }
  if (blank(next.nonNegotiable) && a.nonNegotiable?.trim()) {
    next.nonNegotiable = a.nonNegotiable.trim();
    filled.push("non-negotiable");
  }
  if (blank(next.audio) && a.audio?.trim()) {
    next.audio = a.audio.trim();
    filled.push("audio");
  }
  if (blank(next.exclusions) && a.exclusions?.trim()) {
    next.exclusions = a.exclusions.trim();
    filled.push("exclusions");
  }

  return { spec: next, filled };
}

// What's already settled — sent to the model so it never re-extracts or
// re-asks a field the user has answered.

export function answeredImageFields(spec: ImageSpec): Record<string, string> {
  const out: Record<string, string> = {};
  if (spec.format) out.format = spec.format;
  if (spec.style) out.style = spec.style;
  if (!blank(spec.nonNegotiable)) out.nonNegotiable = spec.nonNegotiable.trim();
  if (!blank(spec.exclusions)) out.exclusions = spec.exclusions.trim();
  if (!blank(spec.formatUse)) out.formatUse = spec.formatUse.trim();
  return out;
}

export function answeredVideoFields(spec: VideoSpec): Record<string, string> {
  const out: Record<string, string> = {};
  if (spec.format) out.format = spec.format;
  if (spec.duration) out.duration = spec.duration;
  if (spec.motion) out.motion = spec.motion;
  if (!blank(spec.nonNegotiable)) out.nonNegotiable = spec.nonNegotiable.trim();
  if (!blank(spec.audio)) out.audio = spec.audio.trim();
  if (!blank(spec.exclusions)) out.exclusions = spec.exclusions.trim();
  return out;
}
