// The one LLM call in the app (Phase 2a, BYOK).
//
// Claude does only what the template compilers can't: extract what the
// user's idea ALREADY specifies (so the form never re-asks answered
// questions) and propose the single next-best question. Compilation stays
// 100% deterministic — this module never writes a prompt.
//
// BYOK architecture: the user's Anthropic key lives in their browser and
// this call goes directly browser → api.anthropic.com (the SDK sets the
// `anthropic-dangerous-direct-browser-access` header). No server of ours
// ever sees the key, which is what keeps the app fully static. This
// module is dynamically imported so the SDK stays out of the main bundle.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zodOutputFormat requires zod v4 schemas (zod@3.25 ships v4
// under this subpath); the MCP SDK elsewhere in this repo uses v3 classic.
import { z } from "zod/v4";
import { ImageSpec, VideoSpec } from "./types";
import {
  Analysis,
  answeredImageFields,
  answeredVideoFields,
} from "./analyze-core";

export const ANALYZE_MODEL = "claude-opus-4-8";

// Wire schemas — must stay in sync with the hand-written types in
// analyze-core.ts (tests assert both directions).
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

export interface AnalyzeOptions {
  apiKey: string;
  /** Test hook: injected fetch implementation */
  fetch?: typeof globalThis.fetch;
}

function makeClient({ apiKey, fetch }: AnalyzeOptions): Anthropic {
  return new Anthropic({
    apiKey,
    // BYOK: the key is the user's own; it goes browser → Anthropic only.
    dangerouslyAllowBrowser: true,
    timeout: 30_000,
    maxRetries: 1,
    ...(fetch ? { fetch } : {}),
  });
}

function userMessage(idea: string, alreadyAnswered: Record<string, string>) {
  return JSON.stringify({ idea: idea.trim(), alreadyAnswered });
}

function guard<T>(stopReason: string | null, parsed: T | null | undefined): T {
  if (stopReason === "refusal") {
    throw new Error("The model declined to analyze this idea.");
  }
  if (!parsed) {
    throw new Error("No structured output returned — try again.");
  }
  return parsed;
}

export async function analyzeImageIdea(
  spec: ImageSpec,
  opts: AnalyzeOptions
): Promise<Analysis> {
  const client = makeClient(opts);
  const message = await client.messages.parse({
    model: ANALYZE_MODEL,
    max_tokens: 1024,
    system: IMAGE_SYSTEM,
    messages: [
      { role: "user", content: userMessage(spec.idea, answeredImageFields(spec)) },
    ],
    output_config: { format: zodOutputFormat(ImageAnalysisSchema) },
  });
  return { domain: "image", ...guard(message.stop_reason, message.parsed_output) };
}

export async function analyzeVideoIdea(
  spec: VideoSpec,
  opts: AnalyzeOptions
): Promise<Analysis> {
  const client = makeClient(opts);
  const message = await client.messages.parse({
    model: ANALYZE_MODEL,
    max_tokens: 1024,
    system: VIDEO_SYSTEM,
    messages: [
      { role: "user", content: userMessage(spec.idea, answeredVideoFields(spec)) },
    ],
    output_config: { format: zodOutputFormat(VideoAnalysisSchema) },
  });
  return { domain: "video", ...guard(message.stop_reason, message.parsed_output) };
}
