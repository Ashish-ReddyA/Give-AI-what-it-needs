"use client";

// Entity-first question engine. The AI extracts the things in the idea
// (Barista · Latte · Cafe · Scene); open each and it asks deep questions
// about just that thing — multi-select where values co-exist, relational
// where they apply. Answers accumulate in qa.answers and feed the AI
// compose step at generate time.

import { useRef, useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Domain, ImageSpec, VideoSpec } from "@/lib/types";
import { ProviderConfig } from "@/lib/providers";
import {
  QAState,
  Question,
  Entity,
  buildAnswered,
  answeredCount,
  askedQuestions,
} from "@/lib/questions";

interface Props {
  domain: Domain;
  idea: string;
  spec: ImageSpec | VideoSpec;
  qa: QAState;
  // Functional updater — async loads merge into the LATEST state so a
  // slow question-fetch can never clobber an answer the user just picked.
  onQaChange: (update: (prev: QAState) => QAState) => void;
  config: ProviderConfig | null;
}

function optsOf(config: ProviderConfig) {
  return {
    providerId: config.providerId,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
  };
}

// Answers are stored as a comma-joined string; multi-select just keeps more
// than one token in it.
function QuestionItem({
  q,
  answer,
  onAnswer,
}: {
  q: Question;
  answer: string;
  onAnswer: (value: string) => void;
}) {
  const tokens = answer
    ? answer.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const has = (opt: string) => tokens.includes(opt);
  const customValue = q.options.length
    ? tokens.filter((t) => !q.options.includes(t)).join(", ")
    : answer;

  const toggleChip = (opt: string) => {
    if (q.multi) {
      const next = has(opt) ? tokens.filter((t) => t !== opt) : [...tokens, opt];
      onAnswer(next.join(", "));
    } else {
      onAnswer(has(opt) ? "" : opt);
    }
  };

  const onCustom = (text: string) => {
    if (q.multi) {
      const chips = tokens.filter((t) => q.options.includes(t));
      const customs = text.split(",").map((s) => s.trim()).filter(Boolean);
      onAnswer([...chips, ...customs].join(", "));
    } else {
      onAnswer(text.trim());
    }
  };

  return (
    <div className="border-t border-dashed border-lineSoft pt-3 first:border-t-0 first:pt-0">
      <p className="font-body text-sm text-ink mb-2.5 leading-snug">
        {q.question}
        {q.multi && (
          <span className="font-mono text-[10px] text-inkFaint ml-1.5">
            · pick any
          </span>
        )}
      </p>
      {q.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggleChip(opt)}
              className={`px-2.5 py-1 font-mono text-[11px] border rounded-sm transition-all ${
                has(opt)
                  ? "bg-ink text-paperRaised border-ink shadow-inset"
                  : "bg-paperRaised text-ink border-line hover:border-ink hover:-translate-y-px"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <input
        value={customValue}
        onChange={(e) => onCustom(e.target.value)}
        placeholder={
          q.multi
            ? "add your own (comma-separated)…"
            : q.options.length
              ? "or type your own…"
              : "type your answer…"
        }
        className="w-full bg-paper border-b border-line px-1 py-1 text-xs font-body text-ink placeholder:text-inkFaint focus:outline-none focus:border-ink transition-colors"
      />
    </div>
  );
}

export default function QuestionEngine({
  domain,
  idea,
  spec,
  qa,
  onQaChange,
  config,
}: Props) {
  const [busyEntities, setBusyEntities] = useState(false);
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [deepening, setDeepening] = useState<Set<string>>(new Set());
  const [deepened, setDeepened] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Entities whose questions are loaded or in flight — prevents a second
  // open (or a rapid double-click) from re-asking the same questions.
  const generated = useRef<Set<string>>(new Set());

  const hasIdea = idea.trim().length > 0;
  const ready = config && hasIdea;

  const setAnswer = (id: string, value: string) => {
    onQaChange((prev) => {
      const answers = { ...prev.answers };
      if (value.trim()) answers[id] = value;
      else delete answers[id];
      return { ...prev, answers };
    });
  };

  const friendly = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|403|authentication|unauthor/i.test(msg)) {
      return "The provider rejected that key — check it and try again.";
    }
    if (/429|rate.?limit/i.test(msg)) return "Rate-limited — wait and retry.";
    return msg.slice(0, 180);
  };

  const openEntity = async (entity: Entity) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(entity.id)) next.delete(entity.id);
      else next.add(entity.id);
      return next;
    });
    // Already have (or are fetching) this entity's questions → never re-ask.
    if (!config || qa.entityQuestions[entity.id] || generated.current.has(entity.id)) {
      return;
    }
    generated.current.add(entity.id);
    setLoading((prev) => new Set(prev).add(entity.id));
    try {
      const { generateEntityQuestions } = await import("@/lib/analyze");
      const questions = await generateEntityQuestions(
        domain,
        idea,
        entity,
        buildAnswered(domain, spec, qa),
        askedQuestions(qa),
        optsOf(config)
      );
      onQaChange((prev) =>
        prev.entityQuestions[entity.id]
          ? prev // a concurrent op already set them — keep, don't overwrite
          : {
              ...prev,
              entityQuestions: { ...prev.entityQuestions, [entity.id]: questions },
            }
      );
    } catch (e) {
      setError(friendly(e));
      generated.current.delete(entity.id); // allow a retry
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(entity.id);
        return next;
      });
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(entity.id);
        return next;
      });
    }
  };

  // Fetch a deeper round of questions for an open entity: finer-grained
  // sub-attributes (fabric and fit, motion arc, ambient detail). Merges the
  // new questions into the existing ones, dropping any that paraphrase-repeat
  // questions already shown. This is the "More detail" button.
  const deepenEntity = async (entity: Entity) => {
    if (!config || deepening.has(entity.id) || deepened.has(entity.id)) return;
    setDeepening((prev) => new Set(prev).add(entity.id));
    setError(null);
    try {
      const { generateEntityQuestions } = await import("@/lib/analyze");
      const more = await generateEntityQuestions(
        domain,
        idea,
        entity,
        buildAnswered(domain, spec, qa),
        askedQuestions(qa),
        optsOf(config),
        "deep"
      );
      onQaChange((prev) => {
        const existing = prev.entityQuestions[entity.id] ?? [];
        // Merge: keep existing, append only questions whose id isn't already
        // present. The dedup against alreadyAsked already ran in analyze.ts,
        // so `more` excludes paraphrases of the existing questions.
        const existingIds = new Set(existing.map((q) => q.id));
        const merged = [...existing, ...more.filter((q) => !existingIds.has(q.id))];
        return {
          ...prev,
          entityQuestions: { ...prev.entityQuestions, [entity.id]: merged },
        };
      });
      // One deep pass covers a deterministic advanced blueprint. Disable the
      // button afterward so repeated clicks do not spend the user's credits on
      // an identical request.
      setDeepened((prev) => new Set(prev).add(entity.id));
    } catch (e) {
      setError(friendly(e));
    } finally {
      setDeepening((prev) => {
        const next = new Set(prev);
        next.delete(entity.id);
        return next;
      });
    }
  };

  const extract = async () => {
    if (!ready || busyEntities) return;
    setBusyEntities(true);
    setError(null);
    try {
      const { generateEntities } = await import("@/lib/analyze");
      const entities = await generateEntities(
        domain,
        idea,
        buildAnswered(domain, spec, qa),
        optsOf(config)
      );
      // Merge functionally — keep any answers and already-loaded questions.
      onQaChange((prev) => ({ ...prev, entities }));
      if (entities[0]) void openEntity(entities[0]);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusyEntities(false);
    }
  };

  const count = answeredCount(qa);

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4 sm:p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted flex items-center gap-1.5">
          <Sparkles size={13} /> AI questions
        </span>
        {count > 0 && (
          <span className="font-mono text-[10px] text-safe bg-safeSoft px-2 py-0.5 rounded-sm">
            {count} detail{count === 1 ? "" : "s"} added
          </span>
        )}
      </div>

      {!config ? (
        <div className="py-2">
          <p className="font-body text-sm text-inkMuted leading-relaxed">
            Add a provider key above and the AI will pull the things out of your
            idea — each subject, object, and the setting — and ask what it needs
            about each.
          </p>
          <p className="font-mono text-[10px] text-inkFaint mt-3 leading-relaxed">
            Questions stay grounded in your idea: if you didn&apos;t mention a
            subject, the AI won&apos;t invent one.
          </p>
        </div>
      ) : qa.entities.length === 0 ? (
        <>
          <button
            type="button"
            onClick={extract}
            disabled={!ready || busyEntities}
            className="w-full py-2.5 font-mono text-xs uppercase tracking-wide border border-ink bg-ink text-paperRaised rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {busyEntities ? (
              <>
                <Loader2 size={13} className="animate-spin" /> reading your idea…
              </>
            ) : (
              <>Break down my idea</>
            )}
          </button>
          {!hasIdea ? (
            <p className="font-mono text-[10px] text-inkFaint mt-2.5">
              type an idea first — the AI pulls the things out of it
            </p>
          ) : (
            <p className="font-mono text-[10px] text-inkFaint mt-2.5">
              the AI extracts each subject, object, and the setting from your
              idea, then asks only about those
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-mono text-[10px] uppercase text-inkFaint mb-3 tracking-wide">
            The things in your idea — open each to refine it
          </p>
          <div className="space-y-2">
            {qa.entities.map((entity) => {
              const isOpen = open.has(entity.id);
              const isLoading = loading.has(entity.id);
              const qs = qa.entityQuestions[entity.id] ?? [];
              const answeredHere = qs.filter((q) =>
                (qa.answers[q.id] ?? "").trim()
              ).length;
              return (
                <div
                  key={entity.id}
                  className="border border-line rounded-sm bg-paper overflow-hidden transition-colors hover:border-inkMuted"
                >
                  <button
                    type="button"
                    onClick={() => openEntity(entity)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 font-mono text-xs text-ink hover:bg-paperRaised transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                      {entity.label}
                      {answeredHere > 0 && (
                        <span className="text-safe text-[10px] bg-safeSoft px-1.5 py-0.5 rounded-sm">
                          {answeredHere}
                        </span>
                      )}
                    </span>
                    {isLoading && <Loader2 size={13} className="animate-spin" />}
                  </button>
                  {isOpen && !isLoading && qs.length > 0 && (
                    <div className="px-3.5 pb-3.5 space-y-3 border-t border-lineSoft pt-3 animate-fade-in">
                      {qs.map((q) => (
                        <QuestionItem
                          key={q.id}
                          q={q}
                          answer={qa.answers[q.id] ?? ""}
                          onAnswer={(v) => setAnswer(q.id, v)}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => deepenEntity(entity)}
                        disabled={deepening.has(entity.id) || deepened.has(entity.id)}
                        className="w-full mt-1 py-1.5 font-mono text-[10px] uppercase tracking-wide text-inkMuted border border-dashed border-line rounded-sm hover:border-ink hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                      >
                        {deepening.has(entity.id) ? (
                          <>
                            <Loader2 size={11} className="animate-spin" /> digging deeper…
                          </>
                        ) : deepened.has(entity.id) ? (
                          <>deep detail added</>
                        ) : (
                          <>+ more detail</>
                        )}
                      </button>
                    </div>
                  )}
                  {isOpen && !isLoading && qs.length === 0 && (
                    <p className="px-3.5 pb-3.5 pt-3 border-t border-lineSoft font-mono text-[10px] text-inkFaint">
                      no questions came back — try another part
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={extract}
            disabled={busyEntities}
            className="mt-3 font-mono text-[10px] text-inkFaint hover:text-ink transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {busyEntities ? "re-reading…" : "↻ re-extract (after editing the idea)"}
          </button>
        </>
      )}

      {error && (
        <p className="font-mono text-[11px] text-risk mt-3 bg-riskSoft rounded-sm py-1.5 px-2.5">
          {error}
        </p>
      )}
    </div>
  );
}
