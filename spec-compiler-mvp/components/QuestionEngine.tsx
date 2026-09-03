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
    <div className="rounded-lg border border-borderUi bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium leading-6 text-textPrimary">{q.question}</p>
        {q.multi && (
          <span className="rounded-full bg-primarySoft px-2 py-0.5 text-xs font-medium text-primary">
            Select any
          </span>
        )}
      </div>
      {q.options.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={q.question}>
          {q.options.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={has(option)}
              onClick={() => toggleChip(option)}
              className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                has(option)
                  ? "border-primary bg-primarySoft text-primary"
                  : "border-borderUi bg-surface text-textSecondary hover:border-borderStrong hover:bg-surfaceSubtle"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={`answer-${q.id}`} className="sr-only">Custom answer for {q.question}</label>
      <input
        id={`answer-${q.id}`}
        value={customValue}
        onChange={(event) => onCustom(event.target.value)}
        placeholder={q.multi ? "Add another answer, separated by commas" : "Type a custom answer"}
        className="min-h-10 w-full rounded-lg border border-borderUi bg-surfaceSubtle px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/10"
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
    <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6" aria-labelledby="ai-refinement-title">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles size={18} />
            <h2 id="ai-refinement-title" className="text-lg font-semibold text-textPrimary">AI refinement</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-textSecondary">
            Analyze the brief, then refine each subject, object, and setting with detailed questions.
          </p>
        </div>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-successSoft px-2.5 py-1 text-xs font-semibold text-success">
            {count} answered
          </span>
        )}
      </div>

      {!config ? (
        <div className="rounded-lg border border-borderUi bg-surfaceSubtle p-4">
          <p className="text-sm font-medium text-textPrimary">Connect an AI provider to analyze this brief.</p>
          <p className="mt-1 text-sm leading-6 text-textSecondary">
            The engine stays grounded in your idea and guarantees required detail with local question blueprints.
          </p>
        </div>
      ) : qa.entities.length === 0 ? (
        <>
          <button
            type="button"
            onClick={extract}
            disabled={!ready || busyEntities}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-45"
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
            <p className="mt-2 text-sm text-textMuted">
              Add a brief first, then analyze it.
            </p>
          ) : (
            <p className="mt-2 text-sm text-textMuted">
              Uses one provider request to identify the subjects, objects, and setting.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-textPrimary">Refinement areas</p>
            <p className="text-xs text-textMuted">Open each area to answer or skip details</p>
          </div>
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
                  className="overflow-hidden rounded-lg border border-borderUi bg-surface transition-colors hover:border-borderStrong"
                >
                  <button
                    type="button"
                    onClick={() => openEntity(entity)}
                    aria-expanded={isOpen}
                    aria-controls={`entity-panel-${entity.id}`}
                    className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-sm font-semibold text-textPrimary hover:bg-surfaceSubtle"
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
                    <div id={`entity-panel-${entity.id}`} className="space-y-3 border-t border-borderUi bg-surfaceSubtle p-4 animate-fade-in">
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
                        className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-borderUi bg-surface px-4 text-sm font-semibold text-textSecondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deepening.has(entity.id) ? (
                          <>
                            <Loader2 size={16} className="animate-spin" /> Generating advanced questions...
                          </>
                        ) : deepened.has(entity.id) ? (
                          <>Advanced questions added</>
                        ) : (
                          <>Generate advanced questions</>
                        )}
                      </button>
                    </div>
                  )}
                  {isOpen && !isLoading && qs.length === 0 && (
                    <p id={`entity-panel-${entity.id}`} className="border-t border-borderUi bg-surfaceSubtle p-4 text-sm text-textMuted">
                      No questions were returned for this area.
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
            className="mt-4 min-h-10 rounded-lg px-3 text-sm font-medium text-textSecondary hover:bg-surfaceSubtle hover:text-primary disabled:opacity-40"
          >
            {busyEntities ? "Analyzing updated brief..." : "Re-analyze after editing the brief"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/20 bg-dangerSoft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
