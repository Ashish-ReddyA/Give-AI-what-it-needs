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

// Explicit completeness checklists per entity KIND. This is what makes a weak
// model thorough: instead of "cover its appearance" (which a small model
// interprets narrowly and skips aspects — the user's bug: asked about the skirt
// but not the top), we hand the model a concrete list of EVERY aspect to cover
// for that kind of thing. A weak model follows the list and asks about the top
// because the list says to. The list is the scaffolding; the model fills values.
//
// Each checklist is written so the aspects are mutually distinct (no two ask
// the same thing) and exhaustive for that kind, so nothing important is silent.
const PERSON_CHECKLIST = [
  "hair (style, length, color)",
  "top clothing (shirt, jacket, sweater — what is on the upper body)",
  "bottom clothing (pants, skirt, shorts — what is on the lower body)",
  "footwear (shoes, boots, barefoot)",
  "accessories (bag, jewelry, glasses, hat)",
  "pose and posture (standing, walking, sitting, leaning)",
  "facial expression and where they are looking",
  "what they are doing (the action, if any)",
  "age range and build",
];
const PLACE_CHECKLIST = [
  "what is in it (furniture, plants, objects the idea names or implies)",
  "lighting (source, direction, warmth)",
  "time of day and weather if outdoors",
  "color palette and materials of the surfaces",
  "depth and scale (tight interior, wide landscape)",
  "atmosphere (busy, empty, calm, tense)",
];
const DRINK_CHECKLIST = [
  "the vessel (cup, glass, mug — material and color)",
  "state (still, being poured, steaming, splashing)",
  "color and opacity of the liquid",
  "foam, layering, or surface detail",
  "what it is being poured from, if pouring",
];
const OBJECT_CHECKLIST = [
  "size (relative to a hand or the scene)",
  "color and material",
  "texture and finish (matte, glossy, worn)",
  "state (new, aged, damaged, open, closed)",
  "orientation and where it rests",
];
const SCENE_CHECKLIST = [
  "overall mood and emotional tone",
  "lighting (quality, direction, color temperature)",
  "time of day",
  "weather or atmosphere (if relevant)",
  "color palette of the whole frame",
  "for video: how the moment unfolds and the pacing of motion",
];

// Map an entity label to its kind so we pick the right checklist. Falls back
// to object for anything unrecognized. Crude but reliable for weak models.
function checklistFor(label: string): string[] {
  const l = label.toLowerCase();
  if (l === "scene") return SCENE_CHECKLIST;
  if (/(barista|girl|boy|woman|man|person|child|kid|lady|guy|portrait|figure|character|chef|worker|dancer)/.test(l)) return PERSON_CHECKLIST;
  if (/(cafe|forest|room|street|beach|mountain|field|garden|kitchen|office|city|landscape|interior|alley|park|shop|bar|restaurant|library)/.test(l)) return PLACE_CHECKLIST;
  if (/(latte|coffee|tea|drink|juice|wine|beer|water|soup|sauce|milk|cocktail)/.test(l)) return DRINK_CHECKLIST;
  return OBJECT_CHECKLIST;
}

function renderChecklist(items: string[]): string {
  return items.map((it) => `  - ${it}`).join("\n");
}

/** Depth of questioning. "standard" = the completeness checklist (thorough).
 * "deep" = even more fine-grained sub-attributes, used by the More-detail button. */
export type QuestionDepth = "standard" | "deep";

const DEEP_EXTRA: Record<string, string[]> = {
  person: [
    "fabric and fit of each clothing item (loose, fitted, flowing)",
    "how the clothing moves while they act (for video)",
    "fine facial features (eye color, jaw, skin tone)",
    "gaze direction and micro-expression",
    "the exact arc of their motion (for video: entry, peak, exit)",
  ],
  place: [
    "where the camera sits in the space (for video: does it move?)",
    "background vs foreground detail levels",
    "sound-implying motion (leaves rustling, steam, footsteps) for video",
    "edge of frame — what is just outside it",
  ],
  drink: [
    "the exact pour trajectory and splash detail (for video)",
    "condensation or steam behavior over time (for video)",
    "refraction and how light passes through the liquid",
  ],
  object: [
    "wear patterns, nicks, patina, engraving",
    "how it catches or reflects the light",
    "for video: does it move, spin, fall, or stay still",
  ],
  scene: [
    "shot-to-shot rhythm and how long each beat holds (video)",
    "transitions and how motion carries between them",
    "the single most important moment in the clip",
    "ambient motion that sells the mood (drifting dust, swaying branches)",
  ],
};

function deepExtrasFor(label: string, domain: Domain): string[] {
  const l = label.toLowerCase();
  let kind = "object";
  if (l === "scene") kind = "scene";
  else if (/(barista|girl|boy|woman|man|person|child|kid|lady|guy|portrait|figure|character|chef|worker|dancer)/.test(l)) kind = "person";
  else if (/(cafe|forest|room|street|beach|mountain|field|garden|kitchen|office|city|landscape|interior|alley|park|shop|bar|restaurant|library)/.test(l)) kind = "place";
  else if (/(latte|coffee|tea|drink|juice|wine|beer|water|soup|sauce|milk|cocktail)/.test(l)) kind = "drink";
  const extras = DEEP_EXTRA[kind] ?? DEEP_EXTRA.object;
  // For image domain, drop the video-only deep extras so we don't ask about
  // motion in a still.
  if (domain === "image") return extras.filter((e) => !/video|motion|pour trajectory|splash|steam over time|shot-to-shot|transitions|ambient motion|drifting|swaying|how .* moves?/.test(e));
  return extras;
}

function entityQuestionsSystem(
  domain: Domain,
  label: string,
  depth: QuestionDepth = "standard"
): string {
  const medium = domain === "video" ? "video clip" : "image";
  const scene = label.toLowerCase() === "scene";
  const checklist = checklistFor(label);
  const baseCount = depth === "deep" ? "5 to 10" : "4 to 8";
  // The completeness list is the core of the thoroughness fix. Tell the model
  // to ask ONE question per checklist aspect it hasn't already covered, so a
  // weak model doesn't skip anything (the "asked about the skirt, not the top"
  // bug). Standard depth already covers every aspect; deep adds sub-attributes.
  const checklistText =
    depth === "deep"
      ? `${renderChecklist(checklist)}\n  AND these finer sub-attributes:\n${renderChecklist(deepExtrasFor(label, domain))}`
      : renderChecklist(checklist);
  const focus = scene
    ? `Cover EACH of these scene aspects (ask one question per aspect unless the idea already settled it):\n${checklistText}`
    : `Cover the "${label}" as a thing in itself, asking ONE question per aspect below — do NOT skip any aspect the idea has not already settled. A question about another entity belongs on that entity's card, not here. Aspects:\n${checklistText}`;
  return `The user is specifying the "${label}" in their AI-generated ${medium}. Ask ${baseCount} detailed questions about ONLY "${label}", each grounded in the idea. ${focus}

CRITICAL: be exhaustive across the aspects above. Do not collapse two aspects into one question and do not skip an aspect because you think it is minor — the user decides what is minor by leaving it blank. If the idea already states an aspect (e.g. "walking"), still ask about its specifics (gait, speed, direction) rather than skipping it, unless it is fully pinned.

For an attribute where several values can sensibly co-exist (traits, clothing items, colors), set "multi": true so the user can pick more than one. For a mutually-exclusive choice (a single pose, one time of day), set "multi": false. Order by impact, but cover every aspect.

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
  opts: AnalyzeOptions,
  maxTokens = 1500
): Promise<Record<string, unknown>> {
  const provider = PROVIDERS[opts.providerId];

  if (provider?.kind === "anthropic") {
    const client = anthropicClient(opts);
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: maxTokens,
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
      maxTokens,
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

// Canonicalize a question string for semantic-similarity dedup. The model is
// told not to repeat questions, but a weak model treats "What is the size of
// the coin?" and "What size is the coin?" as different. This turns both into
// the same canonical token bag so paraphrase repeats get caught in code, not
// left to the model's judgment.
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "in",
  "on", "at", "to", "for", "with", "and", "or", "what", "whats", "which",
  "do", "does", "did", "how", "how's", "wheres", "where", "who", "whom",
  "this", "that", "these", "those", "it", "its", "as", "by", "from", "into",
]);

// Very small suffix-stemmer — enough to collapse "size/sizes", "color/colors",
// "pouring/pours" so plural/verb-form paraphrases match. Not a real stemmer;
// intentionally conservative to avoid false-positives.
function stem(w: string): string {
  for (const suf of ["ies", "ying", "ing", "ed", "es", "s"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      const base = w.slice(0, -suf.length);
      if (suf === "ies") return base + "y";
      return base;
    }
  }
  return w;
}

/** Canonical token bag for a question: lowercase, alnum tokens, stop words and
 * very short tokens dropped, stemmed, sorted, deduped. Two questions that are
 * paraphrases of each other produce the same (or near-same) canonical form. */
export function canonicalQuestion(q: string): string {
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
  return Array.from(new Set(tokens)).sort().join(" ");
}

/** Jaccard similarity over canonical token bags. 1.0 = identical token set. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const sa = new Set(a.split(" "));
  const sb = new Set(b.split(" "));
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Threshold above which two questions are treated as the same question
// rephrased. Tuned to catch "What is the size of the coin?" vs "What size is
// the coin?" (similarity ~1.0) and "What is the size of the coin?" vs "What
// color is the coin?" (similarity ~0.2, kept as distinct). 0.7 keeps near-
// paraphrases while allowing genuinely different attributes through.
const REPEAT_THRESHOLD = 0.7;

/** True if a question is a paraphrase repeat of any already-asked question.
 * Uses canonical token-bag similarity, not exact text match. */
function isRepeat(
  question: string,
  alreadyAskedCanonical: string[],
  newCanonical: string[]
): boolean {
  const canon = canonicalQuestion(question);
  if (!canon) return false;
  for (const prev of alreadyAskedCanonical) {
    if (similarity(canon, prev) >= REPEAT_THRESHOLD) return true;
  }
  for (const prev of newCanonical) {
    if (similarity(canon, prev) >= REPEAT_THRESHOLD) return true;
  }
  return false;
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
  entityLabel: string,
  alreadyAskedCanonical: string[] = []
): Question[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Question[] = [];
  const newCanonical: string[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const question = str(r.question);
    if (!question) return;
    // Drop paraphrase repeats of questions already asked on another entity,
    // and repeats within this same batch. The exact-text dedup the model is
    // asked to do is insufficient for weak models; this is the real guard.
    if (isRepeat(question, alreadyAskedCanonical, newCanonical)) return;
    newCanonical.push(canonicalQuestion(question));
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
  opts: AnalyzeOptions,
  depth: QuestionDepth = "standard"
): Promise<Question[]> {
  const content = JSON.stringify({
    idea: idea.trim(),
    alreadyAnswered: answered,
    alreadyAsked,
  });
  const obj = await runStructured(
    entityQuestionsSystem(domain, entity.label, depth),
    QUESTIONS_CONTRACT,
    content,
    QuestionsSchema,
    opts,
    depth === "deep" ? 2500 : 1500
  );
  // Canonicalize the already-asked list once, then filter the new questions
  // against it so a paraphrase repeat (e.g. "What is the size of the coin?"
  // asked under Girl, then again under Coin) is dropped in code, not left to
  // the model's judgment. Weak models rephrase instead of copying.
  const alreadyAskedCanonical = alreadyAsked.map(canonicalQuestion);
  return normalizeQuestions(
    obj.questions,
    `${entity.id}_`,
    idea,
    entity.label,
    alreadyAskedCanonical
  );
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
