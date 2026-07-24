// The AI question engine. The model reads the user's idea and GENERATES
// questions about the subject — it doesn't pre-fill a fixed form.
//
// Three generators, all provider-agnostic:
//   generateOverallQuestions  → level-1 questions for the whole idea
//   generateSections          → the idea broken into parts (Cat, Ball, …)
//   generateSectionQuestions  → detailed questions about one part
//
// Two transport routes, chosen by provider kind (same as before):
//   anthropic     → browser → api.anthropic.com directly (key stays local),
//                   structured outputs via messages.parse + zodOutputFormat.
//   openai-compat → browser → /api/analyze proxy → the provider (those
//                   providers block direct browser calls), JSON mode +
//                   client-side validation.
//
// Dynamically imported, so the Anthropic SDK stays in a lazy chunk.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { Domain } from "./types";
import { PROVIDERS } from "./providers";
import { Question, Section } from "./questions";

// ---- schemas (Anthropic structured outputs) ----

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.string()),
    })
  ),
});

const SectionsSchema = z.object({
  sections: z.array(z.object({ id: z.string(), label: z.string() })),
});

// ---- prompts (provider-neutral) ----

const CONTEXT_NOTE = `The user message is JSON: { idea, alreadyAnswered }. Never ask about anything already present in alreadyAnswered. Options must be short, self-contained descriptive phrases that read naturally when appended to the subject (e.g. "orange tabby fur", "mid-pounce", "small red rubber ball", "soft window light") — not one-word fragments that only make sense next to the question. Leave options as [] for genuinely open questions.`;

function overallSystem(domain: Domain): string {
  const medium = domain === "video" ? "video clip" : "image";
  return `You help a user specify an AI-generated ${medium} BEFORE they spend credits generating it. Given their rough idea, produce the few highest-impact questions whose answers most change whether the result matches what they picture.

Focus on the SUBJECT and scene: appearance, colors, materials, pose/action, key objects, setting, and mood.${
    domain === "video" ? " You may ask about the action/motion of the subject, but NOT camera moves or clip length." : ""
  } Do NOT ask about aspect ratio, resolution, ${
    domain === "video" ? "duration, camera framing, " : ""
  }file format, or render settings — those are handled elsewhere.

Ask 3 to 6 questions, ordered by impact. ${CONTEXT_NOTE}`;
}

function sectionsSystem(domain: Domain): string {
  const medium = domain === "video" ? "video" : "image";
  return `Break the user's ${medium} idea into the distinct elements they might want to refine separately — each main subject, important objects, and the background/setting (plus lighting or mood when they'd matter). Return 3 to 7 sections, ordered by how much each affects the result, each with a short snake_case id and a 1-2 word display label (e.g. "Cat", "Ball", "Background"). Do not include aspect ratio, duration, or technical settings as sections.`;
}

function sectionQuestionsSystem(domain: Domain, sectionLabel: string): string {
  const medium = domain === "video" ? "video clip" : "image";
  return `The user wants to refine the "${sectionLabel}" part of their AI-generated ${medium}. Ask 3 to 6 detailed questions specifically about "${sectionLabel}" — its appearance, color, material, size, position, texture, and (if it's a subject) pose or behavior.

Ask only about "${sectionLabel}", nothing else. Order by impact. ${CONTEXT_NOTE}`;
}

const QUESTIONS_CONTRACT = `\n\nRespond with ONLY a JSON object of the form {"questions":[{"id":"short_snake_id","question":"...","options":["...","..."]}]}. No prose, no markdown code fences.`;
const SECTIONS_CONTRACT = `\n\nRespond with ONLY a JSON object of the form {"sections":[{"id":"short_snake_id","label":"Cat"}]}. No prose, no markdown code fences.`;

// ---- options / transport ----

export interface AnalyzeOptions {
  providerId: string;
  apiKey: string;
  /** openai-compat: model id (editable in the UI). Ignored for Anthropic. */
  model?: string;
  /** custom provider only. */
  baseUrl?: string;
  /** Test hook. */
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

// One structured call, routed by provider kind. Returns a plain object.
async function runStructured(
  system: string,
  jsonContract: string,
  idea: string,
  answered: Record<string, string>,
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
      messages: [{ role: "user", content: userMessage(idea, answered) }],
      output_config: { format: zodOutputFormat(anthropicSchema) },
    });
    if (message.stop_reason === "refusal") {
      throw new Error("The model declined this idea.");
    }
    return (message.parsed_output as Record<string, unknown>) ?? {};
  }

  // openai-compat → proxy
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
      user: userMessage(idea, answered),
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
      ? r.options.map(str).filter(Boolean).slice(0, 6)
      : [];
    out.push({ id, question, options });
  });
  return out;
}

function normalizeSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Section[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const label = str(r.label);
    if (!label) return;
    let id = str(r.id) || `s${i}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    out.push({ id, label });
  });
  return out.slice(0, 8);
}

// ---- public generators ----

export async function generateOverallQuestions(
  domain: Domain,
  idea: string,
  answered: Record<string, string>,
  opts: AnalyzeOptions
): Promise<Question[]> {
  const obj = await runStructured(
    overallSystem(domain),
    QUESTIONS_CONTRACT,
    idea,
    answered,
    QuestionsSchema,
    opts
  );
  return normalizeQuestions(obj.questions, "o_");
}

export async function generateSections(
  domain: Domain,
  idea: string,
  answered: Record<string, string>,
  opts: AnalyzeOptions
): Promise<Section[]> {
  const obj = await runStructured(
    sectionsSystem(domain),
    SECTIONS_CONTRACT,
    idea,
    answered,
    SectionsSchema,
    opts
  );
  return normalizeSections(obj.sections);
}

export async function generateSectionQuestions(
  domain: Domain,
  idea: string,
  section: Section,
  answered: Record<string, string>,
  opts: AnalyzeOptions
): Promise<Question[]> {
  const obj = await runStructured(
    sectionQuestionsSystem(domain, section.label),
    QUESTIONS_CONTRACT,
    idea,
    answered,
    QuestionsSchema,
    opts
  );
  return normalizeQuestions(obj.questions, `s_${section.id}_`);
}
