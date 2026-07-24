// The AI question engine + prompt composer. Entity-first: the model reads
// the idea, extracts the things in it, asks deep questions about each, then
// composes a coherent prompt from the answers.
//
//   generateEntities         → the things in the idea (Barista, Latte, …)
//   generateEntityQuestions  → deep, multi-select, relational questions
//   composeScene             → weaves the answers into a real prompt (prose)
//
// Two transport routes, chosen by provider kind:
//   anthropic     → browser → api.anthropic.com directly (key stays local),
//                   structured outputs via messages.parse + zodOutputFormat.
//   openai-compat → browser → /api/analyze proxy → the provider, JSON mode +
//                   client-side normalization.
//
// Dynamically imported, so the Anthropic SDK stays in a lazy chunk.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { Domain } from "./types";
import { PROVIDERS } from "./providers";
import { Question, Entity } from "./questions";

// ---- schemas (Anthropic structured outputs) ----

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.string()),
      multi: z.boolean(),
    })
  ),
});

const EntitiesSchema = z.object({
  entities: z.array(z.object({ id: z.string(), label: z.string() })),
});

const SceneSchema = z.object({ prompt: z.string() });

// ---- prompts (provider-neutral) ----

const CONTEXT_NOTE = `The user message is JSON: { idea, alreadyAnswered, alreadyAsked }. Never ask about anything present in alreadyAnswered, and never repeat (or lightly reword) any question in alreadyAsked — ask only genuinely new aspects. Options must be short, self-contained descriptive phrases that read naturally in a scene description (e.g. "orange tabby fur", "a ceramic cup", "being poured from a steel jug", "warm sunset light") — not one-word fragments. Leave options as [] for genuinely open questions.`;

function entitiesSystem(domain: Domain): string {
  const medium = domain === "video" ? "video" : "image";
  return `Extract the concrete things the user might want to control in this ${medium} idea: each distinct subject, each key object, and the setting/background. Then ALSO append one final element with id "scene" and label "Scene" for overall mood, lighting, and time of day.

Return 3 to 7 elements, main subject first and "Scene" last, each with a short snake_case id and a 1-2 word display label (e.g. "Barista", "Latte", "Cafe", "Scene"). Do not include aspect ratio, duration, or technical settings.`;
}

function entityQuestionsSystem(domain: Domain, label: string): string {
  const medium = domain === "video" ? "video clip" : "image";
  const scene = label.toLowerCase() === "scene";
  const focus = scene
    ? `Ask about overall mood, lighting, time of day, weather/atmosphere, and color palette.`
    : `Cover its appearance (color, material, texture, size) and — when it applies — its STATE or RELATION to other things: for a drink, whether it's in a cup or being poured and from what; for a person, their pose, what they're doing, and what they're wearing; for a place, what's in it.`;
  return `The user is specifying the "${label}" in their AI-generated ${medium}. Ask 3 to 6 detailed questions about ONLY "${label}". ${focus}

For an attribute where several values can sensibly co-exist (traits, clothing, colors, objects present), set "multi": true so the user can pick more than one. For a mutually-exclusive choice (a single pose, one time of day), set "multi": false. Order by impact. ${CONTEXT_NOTE}`;
}

function composeSystem(domain: Domain): string {
  const medium = domain === "video" ? "video generation" : "image generation";
  return `You write a single, vivid, coherent ${medium} prompt. Given the user's idea and their structured answers, weave EVERYTHING into natural, flowing description — do NOT output a comma-separated list of fragments, and do NOT invent details the user didn't give. Keep it to 1-3 sentences, concrete and visual. Do not mention aspect ratio, resolution, duration, or camera/render settings — those are added separately. Respond with ONLY a JSON object {"prompt": "..."}.`;
}

const QUESTIONS_CONTRACT = `\n\nRespond with ONLY a JSON object of the form {"questions":[{"id":"short_snake_id","question":"...","options":["...","..."],"multi":false}]}. No prose, no markdown code fences.`;
const ENTITIES_CONTRACT = `\n\nRespond with ONLY a JSON object of the form {"entities":[{"id":"short_snake_id","label":"Barista"}]}. No prose, no markdown code fences.`;
const SCENE_CONTRACT = `\n\n(Return ONLY {"prompt":"..."}.)`;

// ---- options / transport ----

export interface AnalyzeOptions {
  providerId: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function userMessage(idea: string, alreadyAnswered: Record<string, string>) {
  return JSON.stringify({ idea: idea.trim(), alreadyAnswered });
}

function anthropicClient(opts: AnalyzeOptions): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    timeout: 30_000,
    maxRetries: 1,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
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

// One structured call, routed by provider kind. `content` is the raw user
// payload (JSON string for questions; free-form for compose).
async function runStructured(
  system: string,
  jsonContract: string,
  content: string,
  anthropicSchema: z.ZodType,
  opts: AnalyzeOptions
): Promise<Record<string, unknown>> {
  const provider = PROVIDERS[opts.providerId];

  if (provider?.kind === "anthropic") {
    const client = anthropicClient(opts);
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(anthropicSchema) },
    });
    if (message.stop_reason === "refusal") {
      throw new Error("The model declined this idea.");
    }
    return (message.parsed_output as Record<string, unknown>) ?? {};
  }

  const model = (opts.model ?? "").trim() || provider?.defaultModel || "";
  if (!model) throw new Error("Pick a model for this provider first.");
  const doFetch = opts.fetch ?? fetch;
  const resp = await doFetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-key": opts.apiKey },
    body: JSON.stringify({
      provider: opts.providerId,
      model,
      baseUrl: opts.baseUrl,
      system: system + jsonContract,
      user: content,
    }),
  });
  const data = (await resp.json()) as { text?: string; error?: string };
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status}).`);
  return extractJson(data.text ?? "");
}

// ---- normalization ----

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeQuestions(raw: unknown, idPrefix: string): Question[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Question[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const question = str(r.question);
    if (!question) return;
    let id = `${idPrefix}${str(r.id) || `q${i}`}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const options = Array.isArray(r.options)
      ? r.options.map(str).filter(Boolean).slice(0, 8)
      : [];
    out.push({ id, question, options, multi: r.multi === true });
  });
  return out;
}

function normalizeEntities(raw: unknown): Entity[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Entity[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const label = str(r.label);
    if (!label) return;
    let id = str(r.id) || `e${i}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    out.push({ id, label });
  });
  return out.slice(0, 8);
}

// ---- public generators ----

export async function generateEntities(
  domain: Domain,
  idea: string,
  answered: Record<string, string>,
  opts: AnalyzeOptions
): Promise<Entity[]> {
  const obj = await runStructured(
    entitiesSystem(domain),
    ENTITIES_CONTRACT,
    userMessage(idea, answered),
    EntitiesSchema,
    opts
  );
  return normalizeEntities(obj.entities);
}

export async function generateEntityQuestions(
  domain: Domain,
  idea: string,
  entity: Entity,
  answered: Record<string, string>,
  alreadyAsked: string[],
  opts: AnalyzeOptions
): Promise<Question[]> {
  const content = JSON.stringify({
    idea: idea.trim(),
    alreadyAnswered: answered,
    alreadyAsked,
  });
  const obj = await runStructured(
    entityQuestionsSystem(domain, entity.label),
    QUESTIONS_CONTRACT,
    content,
    QuestionsSchema,
    opts
  );
  return normalizeQuestions(obj.questions, `${entity.id}_`);
}

/** Weave the idea + answered details into one coherent prompt (prose). */
export async function composeScene(
  domain: Domain,
  idea: string,
  details: Record<string, string>,
  opts: AnalyzeOptions
): Promise<string> {
  const content = JSON.stringify({ idea: idea.trim(), details });
  const obj = await runStructured(
    composeSystem(domain),
    SCENE_CONTRACT,
    content,
    SceneSchema,
    opts
  );
  const prompt = str(obj.prompt);
  if (!prompt) throw new Error("The model returned an empty prompt — try again.");
  return prompt;
}
