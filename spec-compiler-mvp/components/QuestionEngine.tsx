"use client";

// The dynamic question engine. The AI reads the idea and ASKS — it doesn't
// pre-fill a form. Level 1: overall subject questions. Deep Analysis: the
// idea broken into sections; open one and the AI asks about just that part.
// Answers accumulate into qa.answers and feed the compiled prompt.

import { useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Domain, ImageSpec, VideoSpec } from "@/lib/types";
import { ProviderConfig } from "@/lib/providers";
import {
  QAState,
  Question,
  Section,
  buildAnswered,
  answeredCount,
} from "@/lib/questions";

interface Props {
  domain: Domain;
  idea: string;
  spec: ImageSpec | VideoSpec;
  qa: QAState;
  onQaChange: (qa: QAState) => void;
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

function QuestionItem({
  q,
  answer,
  onAnswer,
}: {
  q: Question;
  answer: string;
  onAnswer: (value: string) => void;
}) {
  const chipSelected = q.options.includes(answer);
  return (
    <div className="border-t border-dashed border-line pt-3">
      <p className="font-body text-sm text-ink mb-2">{q.question}</p>
      {q.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onAnswer(answer === opt ? "" : opt)}
              className={`px-2.5 py-1 font-mono text-[11px] border rounded-sm transition-colors ${
                answer === opt
                  ? "bg-ink text-paperRaised border-ink"
                  : "bg-paperRaised text-ink border-line hover:border-ink"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <input
        value={chipSelected ? "" : answer}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder={q.options.length ? "or type your own…" : "type your answer…"}
        className="w-full bg-paper border-b border-line px-1 py-1 text-xs font-body text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
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
  const [busyOverall, setBusyOverall] = useState(false);
  const [busySections, setBusySections] = useState(false);
  const [loadingSections, setLoadingSections] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const hasIdea = idea.trim().length > 0;
  const ready = config && hasIdea;

  const setAnswer = (id: string, value: string) => {
    const answers = { ...qa.answers };
    if (value.trim()) answers[id] = value;
    else delete answers[id];
    onQaChange({ ...qa, answers });
  };

  const friendly = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|403|authentication|unauthor/i.test(msg)) {
      return "The provider rejected that key — check it and try again.";
    }
    if (/429|rate.?limit/i.test(msg)) return "Rate-limited — wait and retry.";
    return msg.slice(0, 180);
  };

  const askOverall = async () => {
    if (!ready || busyOverall) return;
    setBusyOverall(true);
    setError(null);
    try {
      const { generateOverallQuestions } = await import("@/lib/analyze");
      const questions = await generateOverallQuestions(
        domain,
        idea,
        buildAnswered(domain, spec, qa),
        optsOf(config)
      );
      onQaChange({ ...qa, overall: questions });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusyOverall(false);
    }
  };

  const deepAnalysis = async () => {
    if (!config || busySections) return;
    setBusySections(true);
    setError(null);
    try {
      const { generateSections } = await import("@/lib/analyze");
      const sections = await generateSections(
        domain,
        idea,
        buildAnswered(domain, spec, qa),
        optsOf(config)
      );
      onQaChange({ ...qa, sections });
      // auto-open the first section for immediate feedback
      if (sections[0]) void toggleSection(sections[0], sections);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusySections(false);
    }
  };

  const toggleSection = async (section: Section, sectionsOverride?: Section[]) => {
    const open = new Set(openSections);
    if (open.has(section.id)) {
      open.delete(section.id);
      setOpenSections(open);
      return;
    }
    open.add(section.id);
    setOpenSections(open);

    if (qa.sectionQuestions[section.id] || !config) return;
    const loading = new Set(loadingSections);
    loading.add(section.id);
    setLoadingSections(loading);
    try {
      const { generateSectionQuestions } = await import("@/lib/analyze");
      const questions = await generateSectionQuestions(
        domain,
        idea,
        section,
        buildAnswered(domain, spec, qa),
        optsOf(config)
      );
      onQaChange({
        ...qa,
        sections: sectionsOverride ?? qa.sections,
        sectionQuestions: { ...qa.sectionQuestions, [section.id]: questions },
      });
    } catch (e) {
      setError(friendly(e));
      const reopen = new Set(openSections);
      reopen.delete(section.id);
      setOpenSections(reopen);
    } finally {
      const done = new Set(loadingSections);
      done.delete(section.id);
      setLoadingSections(done);
    }
  };

  const count = answeredCount(qa);

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted flex items-center gap-1.5">
          <Sparkles size={12} /> AI questions
        </span>
        {count > 0 && (
          <span className="font-mono text-[10px] text-safe">
            {count} detail{count === 1 ? "" : "s"} added
          </span>
        )}
      </div>

      {!config ? (
        <p className="font-body text-xs text-inkMuted">
          Add a provider key above and the AI will ask what it needs to get
          your {domain} right — tailored to your idea, not a fixed form.
        </p>
      ) : qa.overall.length === 0 ? (
        <>
          <button
            type="button"
            onClick={askOverall}
            disabled={!ready || busyOverall}
            className="w-full py-2 font-mono text-xs uppercase tracking-wide border border-ink bg-ink text-paperRaised rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {busyOverall ? (
              <>
                <Loader2 size={12} className="animate-spin" /> thinking…
              </>
            ) : (
              <>Ask what the AI needs</>
            )}
          </button>
          {!hasIdea && (
            <p className="font-mono text-[10px] text-inkMuted mt-1.5">
              type an idea first — the questions are built from it
            </p>
          )}
        </>
      ) : (
        <>
          <div className="space-y-3">
            {qa.overall.map((q) => (
              <QuestionItem
                key={q.id}
                q={q}
                answer={qa.answers[q.id] ?? ""}
                onAnswer={(v) => setAnswer(q.id, v)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={askOverall}
            disabled={busyOverall}
            className="mt-2 font-mono text-[10px] text-inkMuted hover:text-ink transition-colors disabled:opacity-40"
          >
            {busyOverall ? "re-asking…" : "↻ re-ask (after editing the idea)"}
          </button>

          {/* Deep Analysis */}
          <div className="mt-4 pt-3 border-t border-line">
            {qa.sections.length === 0 ? (
              <button
                type="button"
                onClick={deepAnalysis}
                disabled={busySections}
                className="w-full py-2 font-mono text-xs uppercase tracking-wide border border-line rounded-sm text-ink hover:border-ink disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {busySections ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> breaking it
                    down…
                  </>
                ) : (
                  <>Deep analysis — refine a specific part</>
                )}
              </button>
            ) : (
              <>
                <p className="font-mono text-[10px] uppercase text-inkMuted mb-2">
                  Refine a part
                </p>
                <div className="space-y-2">
                  {qa.sections.map((s) => {
                    const isOpen = openSections.has(s.id);
                    const isLoading = loadingSections.has(s.id);
                    const qs = qa.sectionQuestions[s.id] ?? [];
                    return (
                      <div
                        key={s.id}
                        className="border border-line rounded-sm bg-paper"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSection(s)}
                          className="w-full flex items-center justify-between px-3 py-2 font-mono text-xs text-ink hover:bg-paperRaised transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                            {s.label}
                          </span>
                          {isLoading && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                        </button>
                        {isOpen && !isLoading && qs.length > 0 && (
                          <div className="px-3 pb-3 space-y-3">
                            {qs.map((q) => (
                              <QuestionItem
                                key={q.id}
                                q={q}
                                answer={qa.answers[q.id] ?? ""}
                                onAnswer={(v) => setAnswer(q.id, v)}
                              />
                            ))}
                          </div>
                        )}
                        {isOpen && !isLoading && qs.length === 0 && (
                          <p className="px-3 pb-3 font-mono text-[10px] text-inkMuted">
                            no questions came back — try another part
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {error && <p className="font-mono text-[11px] text-risk mt-2">{error}</p>}
    </div>
  );
}
