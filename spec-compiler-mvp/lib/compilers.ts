import {
  ImageSpec,
  FORMAT_RATIOS,
  STYLE_LABELS,
  CompiledPrompt,
} from "./types";
import {
  KNOWLEDGE_VERIFIED,
  MIDJOURNEY,
  HIGGSFIELD_IMAGE_MODELS,
} from "./platforms";

// Style descriptors are deliberately subject-neutral. v1 appended
// "shallow depth of field" to every realistic request — an opinionated
// camera choice that actively ruins landscapes/architecture. Descriptors
// must never smuggle in a compositional decision the user didn't make.
const STYLE_DESCRIPTORS: Record<string, string> = {
  realistic: "photorealistic, natural lighting",
  anime: "anime style, clean linework, cel shading",
  "3d": "3D render, studio lighting, soft shadows",
  illustration: "digital illustration, painterly detail",
};

function styleDescriptor(spec: ImageSpec): string {
  return spec.style ? STYLE_DESCRIPTORS[spec.style] : "";
}

export function exclusionList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Does the spec require the model to RENDER text/logo/lettering?
 * "must say OPEN 24/7" → yes. "no text anywhere" → no — that's an
 * exclusion sentiment, and v1's naive substring check routed it to the
 * text-rendering model, the exact opposite of what the user asked for.
 */
export function wantsRenderedText(nonNegotiable: string): boolean {
  const lower = nonNegotiable.toLowerCase();
  const TEXTY = /(text|logo|word|letter|typograph|caption|sign(?:age)?)/;
  if (!TEXTY.test(lower)) return false;
  // Strip negated mentions ("no text", "without any logo", "avoid words"),
  // then re-test what's left.
  const stripped = lower.replace(
    /\b(?:no|without|avoid|zero)\s+(?:any\s+)?(?:visible\s+)?\w*\s*(?:text|logos?|words?|lettering|typography|captions?|sign(?:age|s)?)/g,
    ""
  );
  return TEXTY.test(stripped);
}

// ---------- Midjourney ----------
// Comma-separated descriptors + parameter flags (--ar, --no, --v).
// --style raw only when the user picked realistic: raw disables MJ's
// beautification, which suits photographic control but is the wrong
// default for anime/illustration (v1 forced it on everything).
export function compileMidjourney(spec: ImageSpec): CompiledPrompt {
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const style = styleDescriptor(spec);
  if (style) parts.push(style);

  const flags: string[] = [];
  if (spec.format) flags.push(`--ar ${FORMAT_RATIOS[spec.format]}`);
  const exclusions = exclusionList(spec.exclusions);
  if (exclusions.length) flags.push(`--no ${exclusions.join(", ")}`);
  if (spec.style === "realistic") flags.push("--style raw");
  flags.push(`--v ${MIDJOURNEY.version}`);

  const prompt = [parts.filter(Boolean).join(", "), flags.join(" ")]
    .filter(Boolean)
    .join(" ");

  return {
    platform: "Midjourney",
    note: `Flags carry format and exclusions — Midjourney doesn't read those as prose. Params verified ${KNOWLEDGE_VERIFIED}.`,
    prompt,
  };
}

// ---------- DALL-E / GPT Image ----------
// Plain natural-language sentences. No real negative-prompt syntax, so
// exclusions get phrased as an explicit instruction instead of a flag.
export function compileDalle(spec: ImageSpec): CompiledPrompt {
  const sentences: string[] = [];

  const styleLabel = spec.style
    ? STYLE_LABELS[spec.style].split(" / ")[0].toLowerCase()
    : "";
  const subjectSentence = styleLabel
    ? `A ${styleLabel} image of ${spec.idea.trim()}.`
    : `An image of ${spec.idea.trim()}.`;
  sentences.push(subjectSentence);

  if (spec.nonNegotiable.trim()) {
    sentences.push(`Important: ${spec.nonNegotiable.trim()}.`);
  }

  const style = styleDescriptor(spec);
  if (style) sentences.push(`Rendered with ${style}.`);

  if (spec.format) {
    sentences.push(`Use a ${spec.format} composition.`);
  }

  const exclusions = exclusionList(spec.exclusions);
  if (exclusions.length) {
    sentences.push(`Do not include ${exclusions.join(" or ")}.`);
  }

  return {
    platform: "DALL-E / GPT Image",
    note: "No negative-prompt syntax on this platform, so exclusions are phrased as an explicit instruction.",
    prompt: sentences.join(" "),
  };
}

// ---------- Higgsfield ----------
// Multi-model aggregator: the compiler has to pick a model, not just
// format a string. Routing table lives in platforms.ts with a verified
// date; swap the heuristic for real usage data once the outcome log exists.
export function chooseHiggsfieldModel(spec: ImageSpec) {
  if (wantsRenderedText(spec.nonNegotiable)) {
    return HIGGSFIELD_IMAGE_MODELS.text;
  }
  if (spec.style === "realistic") {
    return HIGGSFIELD_IMAGE_MODELS.realistic;
  }
  if (exclusionList(spec.exclusions).length > 0) {
    return HIGGSFIELD_IMAGE_MODELS.exclusions;
  }
  return HIGGSFIELD_IMAGE_MODELS.default;
}

export function compileHiggsfield(spec: ImageSpec): CompiledPrompt {
  const { model, why } = chooseHiggsfieldModel(spec);
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const style = styleDescriptor(spec);
  if (style) parts.push(style);

  const exclusions = exclusionList(spec.exclusions);

  return {
    platform: "Higgsfield",
    note: `Routed to ${model} — ${why}. Lineup verified ${KNOWLEDGE_VERIFIED}.`,
    prompt: parts.filter(Boolean).join(", "),
    meta: {
      model,
      aspectRatio: spec.format ? FORMAT_RATIOS[spec.format] : "1:1",
      exclude: exclusions.length ? exclusions.join(", ") : "—",
    },
  };
}

export function compileAll(spec: ImageSpec): CompiledPrompt[] {
  return [compileMidjourney(spec), compileDalle(spec), compileHiggsfield(spec)];
}
