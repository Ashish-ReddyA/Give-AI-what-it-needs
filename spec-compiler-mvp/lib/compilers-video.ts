import {
  VideoSpec,
  CompiledPrompt,
  FORMAT_RATIOS,
  DURATION_SECONDS,
  MOTION_LABELS,
} from "./types";
import { KNOWLEDGE_VERIFIED, HIGGSFIELD_VIDEO_MODELS } from "./platforms";
import { exclusionList } from "./compilers";

// Video is where "ask first, spend once" is economically true: one run
// costs 10–100x an image and minutes of wait. These compilers are pure
// template functions, same as the image ones — spec in, prompt out.

// Camera-motion phrasing per bucket. Video models respond to explicit
// camera language far more reliably than to vibes.
const MOTION_PHRASES: Record<string, string> = {
  static: "static locked-off shot, no camera movement",
  slow: "slow smooth camera pan",
  dynamic: "dynamic tracking shot, fluid camera movement",
  handheld: "handheld documentary-style camera",
};

function motionPhrase(spec: VideoSpec): string {
  return spec.motion ? MOTION_PHRASES[spec.motion] : "";
}

// ---------- Veo 3 ----------
// Prose prompt: subject + action, then camera, then audio cues.
// Veo renders native audio — the differentiator worth routing for.
export function compileVeo(spec: VideoSpec): CompiledPrompt {
  const sentences: string[] = [];
  sentences.push(`${spec.idea.trim()}.`);
  if (spec.nonNegotiable.trim()) {
    sentences.push(`Important: ${spec.nonNegotiable.trim()}.`);
  }
  const motion = motionPhrase(spec);
  if (motion) sentences.push(`Camera: ${motion}.`);
  if (spec.audio.trim()) {
    sentences.push(`Audio: ${spec.audio.trim()}.`);
  }
  const exclusions = exclusionList(spec.exclusions);
  if (exclusions.length) {
    sentences.push(`Do not include ${exclusions.join(" or ")}.`);
  }

  return {
    platform: "Veo 3",
    note: `Veo clips are ~8s natively${
      spec.duration === "long" ? " — a 15s+ clip needs stitching or extensions" : ""
    }. Prose + explicit camera/audio cues work best. Verified ${KNOWLEDGE_VERIFIED}.`,
    prompt: sentences.join(" "),
    meta: {
      aspectRatio: spec.format ? FORMAT_RATIOS[spec.format] : "16:9",
      duration: spec.duration ? DURATION_SECONDS[spec.duration] : "—",
      audio: spec.audio.trim() ? "native" : "none requested",
    },
  };
}

// ---------- Runway ----------
// Concise single-shot description + camera keywords. No native audio,
// so an audio requirement is flagged rather than silently dropped.
export function compileRunway(spec: VideoSpec): CompiledPrompt {
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const motion = motionPhrase(spec);
  if (motion) parts.push(motion);
  const exclusions = exclusionList(spec.exclusions);

  const audioWarning = spec.audio.trim()
    ? " ⚠ Runway does not render audio — your audio requirement needs post-production."
    : "";

  return {
    platform: "Runway",
    note: `Keep Runway prompts concise and single-shot; camera keywords carry the motion.${audioWarning} Verified ${KNOWLEDGE_VERIFIED}.`,
    prompt: parts.filter(Boolean).join(", "),
    meta: {
      aspectRatio: spec.format ? FORMAT_RATIOS[spec.format] : "16:9",
      duration: spec.duration ? DURATION_SECONDS[spec.duration] : "—",
      exclude: exclusions.length ? exclusions.join(", ") : "—",
    },
  };
}

// ---------- Higgsfield (video) ----------
// Aggregator routing again — and here the routing decision is the whole
// ballgame, because per-run credits differ by model.
export function chooseHiggsfieldVideoModel(spec: VideoSpec) {
  if (spec.audio.trim()) {
    return HIGGSFIELD_VIDEO_MODELS.audio;
  }
  if (spec.motion === "dynamic" || spec.motion === "handheld") {
    return HIGGSFIELD_VIDEO_MODELS.motion;
  }
  if (spec.duration === "long") {
    return HIGGSFIELD_VIDEO_MODELS.long;
  }
  return HIGGSFIELD_VIDEO_MODELS.default;
}

export function compileHiggsfieldVideo(spec: VideoSpec): CompiledPrompt {
  const { model, why } = chooseHiggsfieldVideoModel(spec);
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const motion = motionPhrase(spec);
  if (motion) parts.push(motion);
  if (spec.audio.trim()) parts.push(`audio: ${spec.audio.trim()}`);

  const exclusions = exclusionList(spec.exclusions);

  return {
    platform: "Higgsfield",
    note: `Routed to ${model} — ${why}. Lineup verified ${KNOWLEDGE_VERIFIED}.`,
    prompt: parts.filter(Boolean).join(", "),
    meta: {
      model,
      aspectRatio: spec.format ? FORMAT_RATIOS[spec.format] : "16:9",
      duration: spec.duration ? DURATION_SECONDS[spec.duration] : "—",
      motion: spec.motion ? MOTION_LABELS[spec.motion] : "—",
      exclude: exclusions.length ? exclusions.join(", ") : "—",
    },
  };
}

export function compileAllVideo(spec: VideoSpec): CompiledPrompt[] {
  return [compileHiggsfieldVideo(spec), compileVeo(spec), compileRunway(spec)];
}
