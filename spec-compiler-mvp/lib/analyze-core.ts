// What's already settled on a spec — sent to the model as context so it
// never asks about a field the user has answered. SDK-free on purpose so it
// stays cheap to import anywhere.

import { ImageSpec, VideoSpec } from "./types";

const blank = (s: string) => s.trim().length === 0;

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
