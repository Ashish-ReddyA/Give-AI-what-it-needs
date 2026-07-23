import {
  ImageSpec,
  FORMAT_RATIOS,
  STYLE_LABELS,
  CompiledPrompt,
} from "./types";

const STYLE_DESCRIPTORS: Record<string, string> = {
  realistic: "photorealistic, natural lighting, shallow depth of field",
  anime: "anime style, clean linework, cel shading",
  "3d": "3D render, studio lighting, soft shadows",
  illustration: "digital illustration, painterly detail",
};

function styleDescriptor(spec: ImageSpec): string {
  return spec.style ? STYLE_DESCRIPTORS[spec.style] : "";
}

function exclusionList(spec: ImageSpec): string[] {
  return spec.exclusions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Midjourney ----------
// Comma-separated descriptors + parameter flags (--ar, --no, --style, --v)
export function compileMidjourney(spec: ImageSpec): CompiledPrompt {
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const style = styleDescriptor(spec);
  if (style) parts.push(style);

  const flags: string[] = [];
  if (spec.format) flags.push(`--ar ${FORMAT_RATIOS[spec.format]}`);
  const exclusions = exclusionList(spec);
  if (exclusions.length) flags.push(`--no ${exclusions.join(", ")}`);
  flags.push("--style raw", "--v 6");

  const prompt = [parts.filter(Boolean).join(", "), flags.join(" ")]
    .filter(Boolean)
    .join(" ");

  return {
    platform: "Midjourney",
    note: "Parameter flags carry format and exclusions — Midjourney doesn't read those as prose.",
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

  const exclusions = exclusionList(spec);
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
// format a string. This is a simple, explainable heuristic — swap in
// something smarter once you have real usage data.
function chooseHiggsfieldModel(spec: ImageSpec): { model: string; why: string } {
  const nonNeg = spec.nonNegotiable.toLowerCase();
  const excl = spec.exclusions.toLowerCase();

  if (nonNeg.includes("text") || nonNeg.includes("logo") || nonNeg.includes("word")) {
    return {
      model: "GPT Image 2",
      why: "the non-negotiable detail involves exact text/logo rendering",
    };
  }
  if (spec.style === "realistic") {
    return {
      model: "Seedream",
      why: "realistic style is Seedream's strongest fit for photorealism",
    };
  }
  if (excl.length > 0) {
    return {
      model: "Nano Banana Pro",
      why: "exclusions/edits are involved — Nano Banana Pro is built for precise control",
    };
  }
  return {
    model: "Reve",
    why: "no strong signal either way — Reve defaults to the most prompt-faithful option",
  };
}

export function compileHiggsfield(spec: ImageSpec): CompiledPrompt {
  const { model, why } = chooseHiggsfieldModel(spec);
  const parts = [spec.idea.trim()];
  if (spec.nonNegotiable.trim()) parts.push(spec.nonNegotiable.trim());
  const style = styleDescriptor(spec);
  if (style) parts.push(style);

  const exclusions = exclusionList(spec);

  return {
    platform: "Higgsfield",
    note: `Routed to ${model} — ${why}.`,
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
