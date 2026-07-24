// The dynamic question engine's data model.
//
// The AI reads the user's idea and GENERATES questions about the subject —
// "a cat playing with a ball" → cat pose? cat color? the ball? — instead of
// a fixed form. Two levels:
//   overall  → the highest-impact questions for the whole idea
//   sections → the idea broken into parts (Cat, Ball, Background, …); pick
//              one and the AI asks detailed questions about just that part
//
// Answers accumulate here and get woven into the subject text that the
// deterministic compilers turn into per-platform prompts. The fixed
// technical picks (aspect ratio, duration, style, …) stay on the spec and
// are NOT asked here — that's the "hybrid" split.

import { Domain, ImageSpec, VideoSpec } from "./types";
import { answeredImageFields, answeredVideoFields } from "./analyze-core";

export interface Question {
  /** Globally-unique key for the answers map (namespaced at generation). */
  id: string;
  question: string;
  /** AI-suggested answers; may be empty for open questions. Also free-text. */
  options: string[];
}

export interface Section {
  id: string;
  label: string;
}

export interface QAState {
  /** Level-1 questions for the whole idea. */
  overall: Question[];
  /** Idea broken into parts; empty until Deep Analysis runs. */
  sections: Section[];
  /** sectionId → that section's detailed questions (loaded on open). */
  sectionQuestions: Record<string, Question[]>;
  /** questionId → the user's answer (chip value or free text). */
  answers: Record<string, string>;
}

export const EMPTY_QA: QAState = {
  overall: [],
  sections: [],
  sectionQuestions: {},
  answers: {},
};

/** Every question currently on screen, flattened — used to resolve answer
 * ids back to their question text for the AI's "already answered" context. */
export function allQuestions(qa: QAState): Question[] {
  return [
    ...qa.overall,
    ...Object.values(qa.sectionQuestions).flat(),
  ];
}

/** The answered facts, keyed by question text, for the model so it never
 * re-asks something the user has already told it. */
export function qaAnsweredByText(qa: QAState): Record<string, string> {
  const byId = new Map(allQuestions(qa).map((q) => [q.id, q.question]));
  const out: Record<string, string> = {};
  for (const [id, answer] of Object.entries(qa.answers)) {
    if (!answer.trim()) continue;
    out[byId.get(id) ?? id] = answer.trim();
  }
  return out;
}

/** Everything the AI should treat as settled: the fixed technical picks
 * plus the answered subject questions. */
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

/** Weave the answered subject details into the idea so the compilers get a
 * rich subject. The technical fields stay on the spec untouched. */
export function composeSubject(idea: string, qa: QAState): string {
  const details = Object.values(qa.answers)
    .map((a) => a.trim())
    .filter(Boolean);
  return [idea.trim(), ...details].filter(Boolean).join(", ");
}

/** How many subject questions the user has actually answered — drives the
 * "N details added" hint. */
export function answeredCount(qa: QAState): number {
  return Object.values(qa.answers).filter((a) => a.trim().length > 0).length;
}
