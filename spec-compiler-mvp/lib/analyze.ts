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

// The grounding rail. Every prompt below inherits this: the user's idea text
// is the only source of truth for what belongs in the scene. Questions and
// options must be derivable from the idea (plus this entity). The model is
// explicitly forbidden from introducing new subjects — the failure mode this
// kills is "cafe at sunrise" producing "is it a cat or a dog?" options, which
// happens when a weak model reaches for stock image-gen clichés instead of
// reading the actual idea.
const GROUNDING = `GROUNDING RULE (most important): the user's "idea" is the only source of truth for what is in the scene. Every question and every option MUST be about something already stated in or directly implied by the idea plus the current entity. NEVER introduce a new subject, character, animal, or object that the idea does not mention. If the idea says nothing about an animal, do not ask about or suggest any animal. If the idea says nothing about a person, do not invent one. When unsure whether something belongs, ask an open question (empty options) instead of suggesting concrete things the user never named.`;

const CONTEXT_NOTE = `The user message is JSON: { idea, alreadyAnswered, alreadyAsked }. Never ask about anything present in alreadyAnswered, and never repeat (or lightly reword) any question in alreadyAsked — ask only genuinely new aspects. Options must be short, self-contained descriptive phrases that read naturally in a scene description and are plausible for THIS idea (e.g. for a latte: "a ceramic cup", "being poured from a steel jug", "warm latte-art foam") — not one-word fragments, and never stock clichés unrelated to the idea. Leave options as [] for genuinely open questions where you should not presume specifics.`;

function entitiesSystem(domain: Domain): string {
  const medium = domain === "video" ? "video" : "image";
  return `Extract the concrete things the user might want to control in this ${medium} idea. Read the idea carefully and pull out ONLY what is actually in it: each distinct subject that appears, each key object that is mentioned or clearly implied, and the setting/background as described. Do NOT invent subjects or objects the idea does not contain. Then ALSO append one final element with id "scene" and label "Scene" for overall mood, lighting, and time of day.

Return 3 to 7 elements, main subject first and "Scene" last, each with a short snake_case id and a 1-2 word display label taken from the idea's own words where possible. Do not include aspect ratio, duration, or technical settings.

${GROUNDING}`;
}

function entityQuestionsSystem(domain: Domain, label: string): string {
  const medium = domain === "video" ? "video clip" : "image";
  const scene = label.toLowerCase() === "scene";
  const focus = scene
    ? `Ask about overall mood, lighting, time of day, weather/atmosphere, and color palette — but only variations that fit the idea as written. If the idea already names the time of day or weather (e.g. "sunrise"), ask about its quality or intensity, do not re-ask whether it is sunrise or dusk.`
    : `Cover its appearance (color, material, texture, size) and — when it applies and is consistent with the idea — its STATE or RELATION to other things named in the idea: for a drink, whether it is in a cup or being poured and from what; for a person, their pose, what they are doing, and what they are wearing; for a place, what is in it as the idea describes. Only raise these if the idea actually contains that entity.`;
  return `The user is specifying the "${label}" in their AI-generated ${medium}. Ask 3 to 6 detailed questions about ONLY "${label}", each grounded in the idea. ${focus}

For an attribute where several values can sensibly co-exist (traits, clothing, colors, objects present in the idea), set "multi": true so the user can pick more than one. For a mutually-exclusive choice (a single pose, one time of day), set "multi": false. Order by impact.

${GROUNDING}

${CONTEXT_NOTE}`;
}

function composeSystem(domain: Domain): string {
  const medium = domain === "video" ? "video generation" : "image generation";
  return `You write a single, vivid, coherent ${medium} prompt. Given the user's idea and their structured answers, weave EVERYTHING into natural, flowing description — do NOT output a comma-separated list of fragments, and do NOT invent details the user didn't give. Only use the idea and the answers; if an answer is blank, do not fabricate a value for it. Keep it to 1-3 sentences, concrete and visual. Do not mention aspect ratio, resolution, duration, or camera/render settings — those are added separately. Respond with ONLY a JSON object {"prompt": "..."}.`;
}

const QUESTIONS_CONTRACT = `\n\nRespond with ONLY a JSON object of the form {"questions":[{"id":"short_snake_id","question":"...","options":["...","..."],"multi":false}]}. Each entry in "options" is a plain descriptive string ONLY — never the word "multi" or any field name. "multi" is a separate boolean sibling of "options", not an option value. No prose, no markdown code fences.`;
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
      temperature: 0,
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

// Weaker models sometimes echo the schema's own keywords into the options
// array (e.g. the literal token "multi" before each real option) or wrap
// each option in an object. These would otherwise render as junk chips.
const OPTION_NOISE = new Set([
  "multi",
  "true",
  "false",
  "options",
  "option",
  "id",
  "question",
]);

// Defense-in-depth against the stock-cliché hallucination the user hit: a weak
// model given "a cafe at sunrise" can still emit "cat" / "dog" / "horse" as
// options for the Scene. The prompt rewrites above are the primary fix; this is
// a cheap, deterministic backstop that drops animal suggestions when the idea
// mentions no animal at all. It only prunes obviously-unrelated stock options —
// it never removes anything the idea actually contains.
const STOCK_ANIMALS = [
  "cat", "cats", "kitten", "dog", "dogs", "puppy", "puppies", "horse",
  "horses", "bird", "birds", "fish", "rabbit", "rabbits", "bunny", "fox",
  "foxes", "wolf", "wolves", "bear", "bears", "lion", "lions", "tiger",
  "tigers", "deer", "elephant", "cow", "cows", "sheep", "goat", "goats",
  "pig", "pigs", "duck", "ducks", "chicken", "chickens", "hamster",
];

function ideaMentionsAnimal(idea: string): boolean {
  const low = ` ${idea.toLowerCase()} `;
  return STOCK_ANIMALS.some((a) => {
    // word-boundary check so "dog" does not match "hotdog"
    return new RegExp(`[^a-z]${a}[^a-z]`).test(low);
  });
}

// True if an option string is just (or mostly) a stock animal the idea never
// named. We allow the animal word if it appears alongside other descriptive
// words from the idea (e.g. "a sleepy orange cat" is kept only if the idea
// mentions a cat); when the idea has no animal, any animal-led option is cut.
function isUnrelatedStockAnimal(option: string, ideaHasAnimal: boolean): boolean {
  if (ideaHasAnimal) return false;
  const low = option.toLowerCase().trim();
  if (!low) return false;
  // Drop leading articles so "a cat" / "an owl" / "the dog" are evaluated on
  // the noun, not the article.
  const tokens = low
    .split(/[^a-z]+/)
    .filter((t) => t && !["a", "an", "the"].includes(t));
  if (tokens.length === 0) return false;
  const head = tokens[0];
  if (STOCK_ANIMALS.includes(head)) return true;
  // Also catch "a small dog" style where a size adjective precedes the animal:
  // if any token is a stock animal and the option is short (<= 4 content
  // tokens), treat it as an animal suggestion unrelated to a non-animal idea.
  if (tokens.length <= 4 && tokens.some((t) => STOCK_ANIMALS.includes(t))) {
    return true;
  }
  return false;
}

function optionText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    for (const k of ["value", "label", "option", "text", "name", "title"]) {
      const s = str(r[k]);
      if (s) return s;
    }
  }
  return "";
}

function normalizeOptions(
  raw: unknown,
  idea: string,
  entityLabel: string
): string[] {
  if (!Array.isArray(raw)) return [];
  const ideaHasAnimal = ideaMentionsAnimal(idea);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const s = optionText(v);
    if (!s || OPTION_NOISE.has(s.toLowerCase())) continue;
    if (isUnrelatedStockAnimal(s, ideaHasAnimal)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeQuestions(
  raw: unknown,
  idPrefix: string,
  idea: string,
  entityLabel: string
): Question[] {
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
    out.push({
      id,
      question,
      options: normalizeOptions(r.options, idea, entityLabel),
      multi: r.multi === true,
    });
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
  return normalizeQuestions(obj.questions, `${entity.id}_`, idea, entity.label);
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
