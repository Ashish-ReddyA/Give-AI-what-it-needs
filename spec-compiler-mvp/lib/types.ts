// The structured specs the whole app is built around.
// Two domains now: image gen (the original Phase 1 cut) and video gen —
// where a wasted run costs real credits and minutes, so "ask first,
// spend once" is economically true. Level 2/3 fields and further domains
// are deliberately NOT here yet — see ROADMAP.md for the phase plan.

export type Domain = "image" | "video";

// ---------- Shared ----------

export type AspectFormat = "square" | "landscape" | "portrait";

export const FORMAT_LABELS: Record<AspectFormat, string> = {
  square: "Square (1:1)",
  landscape: "Landscape (16:9)",
  portrait: "Portrait (9:16)",
};

export const FORMAT_RATIOS: Record<AspectFormat, string> = {
  square: "1:1",
  landscape: "16:9",
  portrait: "9:16",
};

export interface CompiledPrompt {
  /** Target platform, e.g. "Midjourney" or "Veo 3" */
  platform: string;
  /** Short note on why the compiler made the choices it made */
  note: string;
  /** The main prompt text to copy/paste */
  prompt: string;
  /** Extra structured fields shown alongside the prompt (e.g. model routing) */
  meta?: Record<string, string>;
}

// ---------- Image ----------

/** Alias kept while callers migrate to AspectFormat */
export type ImageFormat = AspectFormat;
export type ImageStyle = "realistic" | "anime" | "3d" | "illustration";

export interface ImageSpec {
  /** The user's raw starting idea, e.g. "a cat sitting on a wooden table" */
  idea: string;
  /** Aspect ratio bucket */
  format: AspectFormat | null;
  /** What the image is for, e.g. "Instagram post" — optional context */
  formatUse: string;
  /** Visual style bucket */
  style: ImageStyle | null;
  /** The one dealbreaker detail — the highest-leverage field. If this is
   * wrong, the generation is wasted regardless of how good everything else is. */
  nonNegotiable: string;
  /** Things that must NOT appear (text, watermark, extra limbs, etc.) — optional */
  exclusions: string;
}

export const EMPTY_SPEC: ImageSpec = {
  idea: "",
  format: null,
  formatUse: "",
  style: null,
  nonNegotiable: "",
  exclusions: "",
};

export const STYLE_LABELS: Record<ImageStyle, string> = {
  realistic: "Realistic / photographic",
  anime: "Anime",
  "3d": "3D render",
  illustration: "Illustration",
};

// ---------- Video ----------

export type VideoDuration = "short" | "medium" | "long";
export type CameraMotion = "static" | "slow" | "dynamic" | "handheld";

export interface VideoSpec {
  /** The user's raw starting idea, e.g. "a barista pouring latte art" */
  idea: string;
  /** Aspect ratio bucket */
  format: AspectFormat | null;
  /** Clip length bucket — drives model choice and cost */
  duration: VideoDuration | null;
  /** Camera / motion character — the axis video models diverge on most */
  motion: CameraMotion | null;
  /** The one dealbreaker detail */
  nonNegotiable: string;
  /** Dialogue / sound that must be in the clip — optional; only some models render audio */
  audio: string;
  /** Things that must NOT appear — optional */
  exclusions: string;
}

export const EMPTY_VIDEO_SPEC: VideoSpec = {
  idea: "",
  format: null,
  duration: null,
  motion: null,
  nonNegotiable: "",
  audio: "",
  exclusions: "",
};

export const DURATION_LABELS: Record<VideoDuration, string> = {
  short: "Short (~5s)",
  medium: "Medium (~8–10s)",
  long: "Long (15s+)",
};

export const DURATION_SECONDS: Record<VideoDuration, string> = {
  short: "5s",
  medium: "8–10s",
  long: "15s+",
};

export const MOTION_LABELS: Record<CameraMotion, string> = {
  static: "Static / locked-off",
  slow: "Slow pan / dolly",
  dynamic: "Dynamic / tracking",
  handheld: "Handheld / documentary",
};
