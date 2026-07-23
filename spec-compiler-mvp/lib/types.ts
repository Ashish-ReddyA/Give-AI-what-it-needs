// The structured spec the whole app is built around.
// This is intentionally small for the MVP: one domain (image gen),
// one level of questions (Level 1). Level 2/3 fields and multi-domain
// support are deliberately NOT here yet — see README for the phase plan.

export type ImageFormat = "square" | "landscape" | "portrait";
export type ImageStyle = "realistic" | "anime" | "3d" | "illustration";

export interface ImageSpec {
  /** The user's raw starting idea, e.g. "a cat sitting on a wooden table" */
  idea: string;
  /** Aspect ratio bucket */
  format: ImageFormat | null;
  /** What the image is for, e.g. "Instagram post" — optional context, not required for completeness */
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

export const FORMAT_LABELS: Record<ImageFormat, string> = {
  square: "Square (1:1)",
  landscape: "Landscape (16:9)",
  portrait: "Portrait (9:16)",
};

export const FORMAT_RATIOS: Record<ImageFormat, string> = {
  square: "1:1",
  landscape: "16:9",
  portrait: "9:16",
};

export const STYLE_LABELS: Record<ImageStyle, string> = {
  realistic: "Realistic / photographic",
  anime: "Anime",
  "3d": "3D render",
  illustration: "Illustration",
};

export interface CompiledPrompt {
  platform: "Midjourney" | "DALL-E / GPT Image" | "Higgsfield";
  /** Short note on why the compiler made the choices it made */
  note: string;
  /** The main prompt text to copy/paste */
  prompt: string;
  /** Extra structured fields shown alongside the prompt (e.g. Higgsfield's model pick) */
  meta?: Record<string, string>;
}
