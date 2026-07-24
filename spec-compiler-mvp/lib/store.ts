// localStorage persistence with defensive loading.
//
// Everything read back from storage is sanitized field-by-field: a corrupt
// blob, an old schema, or a hand-edited value degrades to defaults instead
// of crashing the app. Keys are versioned so future schema changes can
// migrate or start fresh deliberately.
//
// Storage is injectable (KV) so all of this is unit-testable in node.

import {
  Domain,
  ImageSpec,
  VideoSpec,
  EMPTY_SPEC,
  EMPTY_VIDEO_SPEC,
} from "./types";
import { OutcomeRecord, PendingCopy, OutcomeResult } from "./outcomes";

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STATE_KEY = "spec-compiler.state.v1";
const OUTCOMES_KEY = "spec-compiler.outcomes.v1";
const MAX_OUTCOMES = 500;

function defaultKV(): KV | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export interface PersistedState {
  domain: Domain;
  imageSpec: ImageSpec;
  videoSpec: VideoSpec;
  pending: PendingCopy[];
  /** Per-domain: did the AI assist fill anything for the current spec? */
  assisted: { image: boolean; video: boolean };
}

// ---------- sanitizers ----------

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : null;
}

function sanitizeImageSpec(raw: unknown): ImageSpec {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_SPEC };
  const r = raw as Record<string, unknown>;
  return {
    idea: str(r.idea),
    format: oneOf(r.format, ["square", "landscape", "portrait"] as const),
    formatUse: str(r.formatUse),
    style: oneOf(r.style, ["realistic", "anime", "3d", "illustration"] as const),
    nonNegotiable: str(r.nonNegotiable),
    exclusions: str(r.exclusions),
  };
}

function sanitizeVideoSpec(raw: unknown): VideoSpec {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_VIDEO_SPEC };
  const r = raw as Record<string, unknown>;
  return {
    idea: str(r.idea),
    format: oneOf(r.format, ["square", "landscape", "portrait"] as const),
    duration: oneOf(r.duration, ["short", "medium", "long"] as const),
    motion: oneOf(r.motion, ["static", "slow", "dynamic", "handheld"] as const),
    nonNegotiable: str(r.nonNegotiable),
    audio: str(r.audio),
    exclusions: str(r.exclusions),
  };
}

const RESULTS: readonly OutcomeResult[] = [
  "first_try",
  "one_regen",
  "two_regens",
  "three_plus",
  "abandoned",
];

function sanitizePending(raw: unknown): PendingCopy | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const domain = oneOf(r.domain, ["image", "video"] as const);
  if (!domain || typeof r.id !== "string" || typeof r.platform !== "string") {
    return null;
  }
  return {
    id: r.id,
    at: typeof r.at === "number" ? r.at : 0,
    domain,
    platform: r.platform,
    score: typeof r.score === "number" ? r.score : 0,
    isComplete: r.isComplete === true,
    regenRisks: typeof r.regenRisks === "number" ? r.regenRisks : 0,
    assisted: r.assisted === true,
  };
}

function sanitizeOutcome(raw: unknown): OutcomeRecord | null {
  const base = sanitizePending(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const result = oneOf(r.result, RESULTS);
  if (!result) return null;
  return {
    ...base,
    result,
    resolvedAt: typeof r.resolvedAt === "number" ? r.resolvedAt : base.at,
  };
}

// ---------- state ----------

export function loadPersistedState(kv: KV | null = defaultKV()): PersistedState | null {
  if (!kv) return null;
  let parsed: unknown;
  try {
    const rawText = kv.getItem(STATE_KEY);
    if (!rawText) return null;
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  const assisted =
    typeof r.assisted === "object" && r.assisted !== null
      ? (r.assisted as Record<string, unknown>)
      : {};
  return {
    domain: oneOf(r.domain, ["image", "video"] as const) ?? "image",
    imageSpec: sanitizeImageSpec(r.imageSpec),
    videoSpec: sanitizeVideoSpec(r.videoSpec),
    pending: Array.isArray(r.pending)
      ? r.pending
          .map(sanitizePending)
          .filter((p): p is PendingCopy => p !== null)
      : [],
    assisted: {
      image: assisted.image === true,
      video: assisted.video === true,
    },
  };
}

export function savePersistedState(
  state: PersistedState,
  kv: KV | null = defaultKV()
): void {
  if (!kv) return;
  try {
    kv.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Quota/private-mode failures are non-fatal — the app keeps working
    // in memory; persistence just doesn't stick.
  }
}

// ---------- outcomes ----------

export function loadOutcomes(kv: KV | null = defaultKV()): OutcomeRecord[] {
  if (!kv) return [];
  let parsed: unknown;
  try {
    const rawText = kv.getItem(OUTCOMES_KEY);
    if (!rawText) return [];
    parsed = JSON.parse(rawText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(sanitizeOutcome)
    .filter((o): o is OutcomeRecord => o !== null);
}

export function saveOutcomes(
  records: OutcomeRecord[],
  kv: KV | null = defaultKV()
): void {
  if (!kv) return;
  try {
    kv.setItem(OUTCOMES_KEY, JSON.stringify(records.slice(-MAX_OUTCOMES)));
  } catch {
    // non-fatal, as above
  }
}

export function clearOutcomes(kv: KV | null = defaultKV()): void {
  if (!kv) return;
  kv.removeItem(OUTCOMES_KEY);
}
