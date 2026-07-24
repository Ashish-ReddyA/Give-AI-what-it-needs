// The outcome log — the instrumentation that turns dogfooding into signal.
//
// The product's one claim is "answering questions upfront cuts wasted
// generations." Until now the app couldn't measure that about itself.
// Every copied prompt becomes a pending item; the user resolves it with
// one tap (first try / N regens / abandoned); summarizeOutcomes() then
// compares complete vs. incomplete specs. That comparison IS the
// hypothesis test.

import { Domain } from "./types";

export type OutcomeResult =
  | "first_try"
  | "one_regen"
  | "two_regens"
  | "three_plus"
  | "abandoned";

export const RESULT_LABELS: Record<OutcomeResult, string> = {
  first_try: "first try",
  one_regen: "1 regen",
  two_regens: "2 regens",
  three_plus: "3+ regens",
  abandoned: "abandoned",
};

/** A copied prompt waiting for its outcome. Survives refresh —
 * the user leaves to generate and comes back later. */
export interface PendingCopy {
  id: string;
  at: number;
  domain: Domain;
  platform: string;
  /** Completeness score (0–100) at the moment of copy */
  score: number;
  /** Was the meter fully green when copied? The hypothesis variable. */
  isComplete: boolean;
  regenRisks: number;
  /** Did the AI assist fill any field of this spec? */
  assisted: boolean;
}

export interface OutcomeRecord extends PendingCopy {
  result: OutcomeResult;
  resolvedAt: number;
}

/** Numeric regen count for averaging; null for abandoned (excluded from
 * averages — an abandoned run is a different failure, counted separately).
 * "3+" is floored to 3, which UNDERSTATES bad outcomes — the honest
 * direction to be wrong in. */
export function regensOf(result: OutcomeResult): number | null {
  switch (result) {
    case "first_try":
      return 0;
    case "one_regen":
      return 1;
    case "two_regens":
      return 2;
    case "three_plus":
      return 3;
    case "abandoned":
      return null;
  }
}

export interface Bucket {
  /** resolved, non-abandoned records in this bucket */
  n: number;
  avgRegens: number | null;
  firstTryRate: number | null;
}

export interface OutcomeSummary {
  total: number;
  abandoned: number;
  complete: Bucket;
  incomplete: Bucket;
  assisted: Bucket;
}

function bucket(records: OutcomeRecord[]): Bucket {
  const counted = records
    .map((r) => regensOf(r.result))
    .filter((n): n is number => n !== null);
  if (counted.length === 0) {
    return { n: 0, avgRegens: null, firstTryRate: null };
  }
  const sum = counted.reduce((a, b) => a + b, 0);
  const firstTries = counted.filter((n) => n === 0).length;
  return {
    n: counted.length,
    avgRegens: sum / counted.length,
    firstTryRate: firstTries / counted.length,
  };
}

export function summarizeOutcomes(records: OutcomeRecord[]): OutcomeSummary {
  return {
    total: records.length,
    abandoned: records.filter((r) => r.result === "abandoned").length,
    complete: bucket(records.filter((r) => r.isComplete)),
    incomplete: bucket(records.filter((r) => !r.isComplete)),
    assisted: bucket(records.filter((r) => r.assisted)),
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
