// The entity-first question engine's data model.
//
// The AI reads the idea and first EXTRACTS the things in it —
// "a barista pouring latte in a sunset cafe" → Barista · Latte · Cafe ·
// Scene. Each is a card; open it and the AI asks detailed questions about
// just that thing (multi-select where several values co-exist, and
// relational ones like "latte: in a cup / being poured"). Answers feed an
// AI compose step that writes a coherent prompt — not a comma dump.
//
// The fixed technical picks (aspect ratio, duration, style, …) stay on the
// spec and are NOT asked here — that's the hybrid split.

import { Domain, ImageSpec, VideoSpec } from "./types";
import { answeredImageFields, answeredVideoFields } from "./analyze-core";

export interface Question {
  /** Globally-unique key for the answers map (namespaced at generation). */
  id: string;
  question: string;
  /** AI-suggested answers; may be empty for open questions. Also free-text. */
  options: string[];
  /** true → several values can co-exist (pick many + type your own). */
  multi: boolean;
}

/** An extracted thing from the idea (a subject, object, the setting, or the
 * catch-all "Scene" for mood/lighting). */
export interface Entity {
  id: string;
  label: string;
}

export interface QAState {
  /** The things pulled from the idea; empty until extraction runs. */
  entities: Entity[];
  /** entityId → that entity's detail questions (loaded on open). */
  entityQuestions: Record<string, Question[]>;
  /** questionId → the answer. Multi-select answers are comma-joined. */
  answers: Record<string, string>;
}

export const EMPTY_QA: QAState = {
  entities: [],
  entityQuestions: {},
  answers: {},
};

/** Every question currently loaded, flattened. */
export function allQuestions(qa: QAState): Question[] {
  return Object.values(qa.entityQuestions).flat();
}

/** Answered facts keyed by question text, so the model never re-asks and the
 * compose step has readable context. */
export function qaAnsweredByText(qa: QAState): Record<string, string> {
  const byId = new Map(allQuestions(qa).map((q) => [q.id, q.question]));
  const out: Record<string, string> = {};
  for (const [id, answer] of Object.entries(qa.answers)) {
    if (!answer.trim()) continue;
    out[byId.get(id) ?? id] = answer.trim();
  }
  return out;
}

/** Everything the AI should treat as settled: the fixed technical picks plus
 * the answered detail questions. */
export function buildAnswered(
  domain: Domain,
  spec: ImageSpec | VideoSpec,
  qa: QAState
): Record<string, string> {
  const fixed =
    domain === "image"
      ? answeredImageFields(spec as ImageSpec)
      : answeredVideoFields(spec as VideoSpec);
  return { ...fixed, ...qaAnsweredByText(qa) };
}

/** Deterministic FALLBACK subject when no key is available to AI-compose:
 * the idea plus answered details, comma-joined. The AI compose step
 * (composeScene) replaces this with real prose whenever a key is present. */
export function composeSubject(idea: string, qa: QAState): string {
  const details = Object.values(qa.answers)
    .map((a) => a.trim())
    .filter(Boolean);
  return [idea.trim(), ...details].filter(Boolean).join(", ");
}

/** How many detail questions have a non-blank answer. */
export function answeredCount(qa: QAState): number {
  return Object.values(qa.answers).filter((a) => a.trim().length > 0).length;
}
