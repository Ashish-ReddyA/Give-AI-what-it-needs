// The one LLM call in the app (Phase 2a), now provider-agnostic (Phase 2a+).
//
// Claude — or whichever provider the user brings a key for — does only what
// the template compilers can't: extract what the idea ALREADY specifies (so
// the form never re-asks answered questions) and propose the next-best
// question. Compilation stays 100% deterministic; this module never writes
// a prompt.
//
// Two routes, chosen by provider kind:
//  - anthropic:      browser → api.anthropic.com directly (the SDK sets the
//                    CORS opt-in header). The key never leaves the browser.
//  - openai-compat:  browser → /api/analyze (same-origin) → the provider.
//                    Needed because those providers block direct browser
//                    calls; the proxy never stores the key.
//
// This module is dynamically imported, so the Anthropic SDK stays in a lazy
// chunk loaded only when the assist is used.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zodOutputFormat requires zod v4 schemas.
import { z } from "zod/v4";
import {
  ImageSpec,
  VideoSpec,
  AspectFormat,
  ImageStyle,
  VideoDuration,
  CameraMotion,
} from "./types";
import {
  Analysis,
  ImageAnalysis,
  VideoAnalysis,
  answeredImageFields,
  answeredVideoFields,
} from "./analyze-core";
import { PROVIDERS } from "./providers";

// ---- Anthropic structured-output schemas ----

const ImageAnalysisSchema = z.object({
  format: z.enum(["square", "landscape", "portrait"]).nullable(),
  style: z.enum(["realistic", "anime", "3d", "illustration"]).nullable(),
  nonNegotiable: z.string().nullable(),
  exclusions: z.string().nullable(),
  formatUse: z.string().nullable(),
  nextQuestion: z.string().nullable(),
});

const VideoAnalysisSchema = z.object({
  format: z.enum(["square", "landscape", "portrait"]).nullable(),
  duration: z.enum(["short", "medium", "long"]).nullable(),
  motion: z.enum(["static", "slow", "dynamic", "handheld"]).nullable(),
  nonNegotiable: z.string().nullable(),
  audio: z.string().nullable(),
  exclusions: z.string().nullable(),
  nextQuestion: z.string().nullable(),
});

// ---- Prompts (provider-neutral) ----

const SHARED_RULES = `Return ONLY what the idea explicitly states or unambiguously implies — never invent, embellish, or guess. When a field is not clearly specified, return null.

The user message is JSON: { idea, alreadyAnswered }. Fields present in alreadyAnswered are settled — do not extract them again, and do not ask about them in nextQuestion.

nextQuestion: the ONE question whose answer would most reduce the risk of a wasted generation for THIS specific idea, phrased for the user, concrete rather than generic. Null only if nothing worth asking remains.`;

const IMAGE_SYSTEM = `You extract a structured image-generation spec from a user's raw idea.

${SHARED_RULES}

Field rules:
- format: only when the idea names an orientation or ratio ("vertical", "16:9", "square") or a surface with a fixed shape ("YouTube thumbnail" → landscape, "Instagram story" / "TikTok" → portrait). A bare platform name ("for Instagram") is NOT enough — return null.
- style: realistic | anime | 3d | illustration — only when stated or strongly implied ("photo of" → realistic, "anime girl" → anime).
- nonNegotiable: the single detail the user emphasizes (must / needs / has to / make sure / exact names, colors, counts). Short phrase in the user's own words.
- exclusions: things the user says to avoid ("no text", "without watermark"), comma-separated.
- formatUse: what the image is for, if mentioned ("Instagram post", "album cover").`;

const VIDEO_SYSTEM = `You extract a structured video-generation spec from a user's raw idea. Video runs burn real credits, so precision matters more than coverage.

${SHARED_RULES}

Field rules:
- format: only when the idea names an orientation or ratio, or a surface with a fixed shape ("TikTok" / "reel" → portrait, "YouTube" → landscape). A bare platform name is NOT enough if the shape is ambiguous.
- duration: short (~5s) | medium (~8–10s) | long (15s+) — only when the idea gives a length.
- motion: static | slow | dynamic | handheld — only when the idea describes camera work ("locked-off", "slow pan", "tracking shot", "handheld").
- nonNegotiable: the single detail the user emphasizes. Short phrase in their own words.
- audio: dialogue or sound the clip must contain, if stated ("she says 'enjoy'", "rain sounds"). This matters — it changes which model can be used.
- exclusions: things the user says to avoid, comma-separated.`;

// OpenAI-compatible providers use JSON mode, which guarantees valid JSON but
// not a schema — so we spell the exact key set out and validate client-side.
const IMAGE_JSON_CONTRACT = `\n\nRespond with ONLY a JSON object with exactly these keys: "format", "style", "nonNegotiable", "exclusions", "formatUse", "nextQuestion". Use null for any field not clearly specified. No prose, no markdown code fences.`;
const VIDEO_JSON_CONTRACT = `\n\nRespond with ONLY a JSON object with exactly these keys: "format", "duration", "motion", "nonNegotiable", "audio", "exclusions", "nextQuestion". Use null for any field not clearly specified. No prose, no markdown code fences.`;

// ---- Options ----

export interface AnalyzeOptions {
  providerId: string;
  apiKey: string;
  /** openai-compat: model id (editable in the UI). Ignored for Anthropic. */
  model?: string;
  /** custom provider only: user-supplied base URL. */
  baseUrl?: string;
  /** Test hook: injected fetch. */
  fetch?: typeof globalThis.fetch;
}

function userMessage(idea: string, alreadyAnswered: Record<string, string>) {
  return JSON.stringify({ idea: idea.trim(), alreadyAnswered });
}

// ---- Anthropic path (browser-direct) ----

function anthropicClient(opts: AnalyzeOptions): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    timeout: 30_000,
    maxRetries: 1,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

function guard<T>(stopReason: string | null, parsed: T | null | undefined): T {
  if (stopReason === "refusal") {
    throw new Error("The model declined to analyze this idea.");
  }
  if (!parsed) throw new Error("No structured output returned — try again.");
  return parsed;
}

async function anthropicAnalyze<T>(
  system: string,
  spec: { idea: string },
  answered: Record<string, string>,
  schema: z.ZodType<T>,
  opts: AnalyzeOptions
): Promise<T> {
  const client = anthropicClient(opts);
  const message = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userMessage(spec.idea, answered) }],
    output_config: { format: zodOutputFormat(schema) },
  });
  return guard(message.stop_reason, message.parsed_output as T | null);
}

// ---- OpenAI-compatible path (via /api/analyze proxy) ----

const IMAGE_FORMATS: readonly AspectFormat[] = ["square", "landscape", "portrait"];
const IMAGE_STYLES: readonly ImageStyle[] = ["realistic", "anime", "3d", "illustration"];
const VIDEO_DURATIONS: readonly VideoDuration[] = ["short", "medium", "long"];
const VIDEO_MOTIONS: readonly CameraMotion[] = ["static", "slow", "dynamic", "handheld"];

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : null;
}
function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractJson(raw: string): Record<string, unknown> {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw);
  if (direct) return direct;
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    const salvaged = tryParse(match[0]);
    if (salvaged) return salvaged;
  }
  throw new Error(
    "The model didn't return usable JSON — try again, or pick a stronger model."
  );
}

async function proxyComplete(
  system: string,
  spec: { idea: string },
  answered: Record<string, string>,
  opts: AnalyzeOptions
): Promise<Record<string, unknown>> {
  const provider = PROVIDERS[opts.providerId];
  const model = (opts.model ?? "").trim() || provider?.defaultModel || "";
  if (!model) {
    throw new Error("Pick a model for this provider first.");
  }
  const doFetch = opts.fetch ?? fetch;
  const resp = await doFetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-key": opts.apiKey },
    body: JSON.stringify({
      provider: opts.providerId,
      model,
      baseUrl: opts.baseUrl,
      system,
      user: userMessage(spec.idea, answered),
    }),
  });
  const data = (await resp.json()) as { text?: string; error?: string };
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status}).`);
  }
  return extractJson(data.text ?? "");
}

// ---- Public API: dispatch on provider kind ----

export async function analyzeImageIdea(
  spec: ImageSpec,
  opts: AnalyzeOptions
): Promise<Analysis> {
  const provider = PROVIDERS[opts.providerId];
  const answered = answeredImageFields(spec);

  if (provider?.kind === "anthropic") {
    const a = await anthropicAnalyze(IMAGE_SYSTEM, spec, answered, ImageAnalysisSchema, opts);
    return { domain: "image", ...a };
  }

  const j = await proxyComplete(IMAGE_SYSTEM + IMAGE_JSON_CONTRACT, spec, answered, opts);
  const a: ImageAnalysis = {
    format: pick(j.format, IMAGE_FORMATS),
    style: pick(j.style, IMAGE_STYLES),
    nonNegotiable: text(j.nonNegotiable),
    exclusions: text(j.exclusions),
    formatUse: text(j.formatUse),
    nextQuestion: text(j.nextQuestion),
  };
  return { domain: "image", ...a };
}

export async function analyzeVideoIdea(
  spec: VideoSpec,
  opts: AnalyzeOptions
): Promise<Analysis> {
  const provider = PROVIDERS[opts.providerId];
  const answered = answeredVideoFields(spec);

  if (provider?.kind === "anthropic") {
    const a = await anthropicAnalyze(VIDEO_SYSTEM, spec, answered, VideoAnalysisSchema, opts);
    return { domain: "video", ...a };
  }

  const j = await proxyComplete(VIDEO_SYSTEM + VIDEO_JSON_CONTRACT, spec, answered, opts);
  const a: VideoAnalysis = {
    format: pick(j.format, IMAGE_FORMATS),
    duration: pick(j.duration, VIDEO_DURATIONS),
    motion: pick(j.motion, VIDEO_MOTIONS),
    nonNegotiable: text(j.nonNegotiable),
    audio: text(j.audio),
    exclusions: text(j.exclusions),
    nextQuestion: text(j.nextQuestion),
  };
  return { domain: "video", ...a };
}
