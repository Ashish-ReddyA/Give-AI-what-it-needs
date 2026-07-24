"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Domain,
  EMPTY_SPEC,
  EMPTY_VIDEO_SPEC,
  ImageSpec,
  VideoSpec,
  CompiledPrompt,
} from "@/lib/types";
import {
  scoreSpec,
  IMAGE_REQUIRED_FIELDS,
  VIDEO_REQUIRED_FIELDS,
} from "@/lib/completeness";
import { compileAll } from "@/lib/compilers";
import { compileAllVideo } from "@/lib/compilers-video";
import { ProviderConfig } from "@/lib/providers";
import {
  QAState,
  EMPTY_QA,
  composeSubject,
  qaAnsweredByText,
  answeredCount,
} from "@/lib/questions";
import {
  PendingCopy,
  OutcomeRecord,
  OutcomeResult,
  newId,
} from "@/lib/outcomes";
import {
  loadPersistedState,
  savePersistedState,
  loadOutcomes,
  saveOutcomes,
  clearOutcomes,
} from "@/lib/store";
import QuestionFlow from "@/components/QuestionFlow";
import VideoQuestionFlow from "@/components/VideoQuestionFlow";
import CompletenessMeter from "@/components/CompletenessMeter";
import ResultsPanel from "@/components/ResultsPanel";
import ProviderKeyBar from "@/components/ProviderKeyBar";
import QuestionEngine from "@/components/QuestionEngine";
import OutcomeTracker from "@/components/OutcomeTracker";
import OutcomeStats from "@/components/OutcomeStats";

interface Generated {
  sig: string;
  results: CompiledPrompt[];
}

export default function Home() {
  const [domain, setDomain] = useState<Domain>("image");
  const [imageSpec, setImageSpec] = useState<ImageSpec>(EMPTY_SPEC);
  const [videoSpec, setVideoSpec] = useState<VideoSpec>(EMPTY_VIDEO_SPEC);
  const [qa, setQa] = useState<{ image: QAState; video: QAState }>({
    image: EMPTY_QA,
    video: EMPTY_QA,
  });
  const [compileAnyway, setCompileAnyway] = useState(false);
  const [pending, setPending] = useState<PendingCopy[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [composing, setComposing] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const state = loadPersistedState();
    if (state) {
      setDomain(state.domain);
      setImageSpec(state.imageSpec);
      setVideoSpec(state.videoSpec);
      setPending(state.pending);
      setQa(state.qa);
    }
    setOutcomes(loadOutcomes());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedState({ domain, imageSpec, videoSpec, pending, qa });
  }, [hydrated, domain, imageSpec, videoSpec, pending, qa]);

  const currentSpec = domain === "image" ? imageSpec : videoSpec;
  const currentQa = qa[domain];
  // Functional updater so QuestionEngine's async loads always merge into the
  // latest state (never clobber a just-picked answer).
  const setCurrentQa = (update: (prev: QAState) => QAState) =>
    setQa((p) => ({ ...p, [domain]: update(p[domain]) }));

  const switchDomain = (d: Domain) => {
    setDomain(d);
    setCompileAnyway(false);
    setGenerated(null);
    setGenError(null);
  };

  const startNewSpec = () => {
    if (domain === "image") setImageSpec(EMPTY_SPEC);
    else setVideoSpec(EMPTY_VIDEO_SPEC);
    setQa((p) => ({ ...p, [domain]: EMPTY_QA }));
    setCompileAnyway(false);
    setGenerated(null);
  };

  const completeness = useMemo(
    () =>
      domain === "image"
        ? scoreSpec(imageSpec, IMAGE_REQUIRED_FIELDS)
        : scoreSpec(videoSpec, VIDEO_REQUIRED_FIELDS),
    [domain, imageSpec, videoSpec]
  );

  const currentSpecEmpty =
    domain === "image"
      ? JSON.stringify(imageSpec) === JSON.stringify(EMPTY_SPEC) &&
        answeredCount(qa.image) === 0
      : JSON.stringify(videoSpec) === JSON.stringify(EMPTY_VIDEO_SPEC) &&
        answeredCount(qa.video) === 0;

  const canCompile =
    completeness.hasIdea && (completeness.isComplete || compileAnyway);

  // Signature of everything that affects the prompt — drives staleness.
  const genSignature = useMemo(
    () => JSON.stringify({ domain, spec: currentSpec, answers: currentQa.answers }),
    [domain, currentSpec, currentQa.answers]
  );
  const stale = generated !== null && generated.sig !== genSignature;

  const handleGenerate = async () => {
    if (!canCompile || composing) return;
    setComposing(true);
    setGenError(null);
    try {
      // AI-compose a coherent subject from the answers; fall back to the
      // deterministic join when there's no key or nothing to compose.
      let subject = composeSubject(currentSpec.idea, currentQa);
      if (providerConfig && answeredCount(currentQa) > 0) {
        const { composeScene } = await import("@/lib/analyze");
        subject = await composeScene(
          domain,
          currentSpec.idea,
          qaAnsweredByText(currentQa),
          {
            providerId: providerConfig.providerId,
            apiKey: providerConfig.apiKey,
            model: providerConfig.model,
            baseUrl: providerConfig.baseUrl,
          }
        );
      }
      const results =
        domain === "image"
          ? compileAll({ ...imageSpec, idea: subject })
          : compileAllVideo({ ...videoSpec, idea: subject });
      setGenerated({ sig: genSignature, results });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setComposing(false);
    }
  };

  const handleCopy = (platform: string) => {
    const entry: PendingCopy = {
      id: newId(),
      at: Date.now(),
      domain,
      platform,
      score: completeness.score,
      isComplete: completeness.isComplete,
      regenRisks: completeness.regenRisks,
      assisted: answeredCount(currentQa) > 0,
    };
    setPending((prev) => [
      ...prev.filter((p) => !(p.domain === domain && p.platform === platform)),
      entry,
    ]);
  };

  const resolvePending = (id: string, result: OutcomeResult) => {
    const entry = pending.find((p) => p.id === id);
    if (!entry) return;
    const record: OutcomeRecord = { ...entry, result, resolvedAt: Date.now() };
    setPending((prev) => prev.filter((p) => p.id !== id));
    setOutcomes((prev) => {
      const next = [...prev, record];
      saveOutcomes(next);
      return next;
    });
  };

  const dismissPending = (id: string) =>
    setPending((prev) => prev.filter((p) => p.id !== id));

  const handleClearLog = () => {
    if (!window.confirm("Delete the whole outcome log? This is the hypothesis data.")) {
      return;
    }
    clearOutcomes();
    setOutcomes([]);
  };

  return (
    <main className="min-h-screen px-4 py-10 sm:py-16">
      <div className="max-w-xl mx-auto">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-inkMuted mb-1">
            Spec Compiler
          </p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink leading-tight">
            Ask first. Spend once.
          </h1>
          <p className="font-body text-sm text-inkMuted mt-2">
            Describe your idea; the AI pulls out the things in it and asks what
            it needs about each, then writes one real prompt per platform — no
            wasted credits on the wrong shape, length, or a missing detail.
          </p>
        </header>

        <section className="mb-6">
          <div className="flex gap-2 border-b border-line pb-3">
            {(["image", "video"] as Domain[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => switchDomain(d)}
                className={`px-4 py-1.5 font-mono text-xs uppercase tracking-wide border rounded-sm transition-colors ${
                  domain === d
                    ? "bg-ink text-paperRaised border-ink"
                    : "bg-paperRaised text-inkMuted border-line hover:border-ink hover:text-ink"
                }`}
              >
                {d === "image" ? "Image" : "Video"}
              </button>
            ))}
            <button
              type="button"
              onClick={startNewSpec}
              disabled={currentSpecEmpty}
              className="ml-auto px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-inkMuted border border-line rounded-sm hover:border-ink hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              new spec
            </button>
          </div>
          {domain === "video" && (
            <p className="font-mono text-[10px] text-risk mt-2">
              video runs cost real credits — spec tightly
            </p>
          )}
        </section>

        <section className="mb-6">
          {domain === "image" ? (
            <QuestionFlow spec={imageSpec} onChange={setImageSpec} />
          ) : (
            <VideoQuestionFlow spec={videoSpec} onChange={setVideoSpec} />
          )}
        </section>

        <section className="mb-6">
          <ProviderKeyBar onConfigChange={setProviderConfig} />
        </section>

        <section className="mb-6">
          <QuestionEngine
            domain={domain}
            idea={currentSpec.idea}
            spec={currentSpec}
            qa={currentQa}
            onQaChange={setCurrentQa}
            config={providerConfig}
          />
        </section>

        <section className="mb-6">
          <CompletenessMeter result={completeness} />
        </section>

        {completeness.hasIdea && !completeness.isComplete && !compileAnyway && (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setCompileAnyway(true)}
              className="w-full py-2 font-mono text-xs uppercase tracking-wide border border-dashed border-risk text-risk rounded-sm hover:bg-riskSoft transition-colors"
            >
              Compile anyway — accepting {completeness.regenRisks} regen risk
              {completeness.regenRisks === 1 ? "" : "s"}
            </button>
          </section>
        )}

        {canCompile && (!generated || stale) && (
          <section className="mb-6">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={composing}
              className="w-full py-2.5 font-mono text-xs uppercase tracking-wide border border-ink bg-ink text-paperRaised rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {composing
                ? "writing your prompts…"
                : generated
                  ? "↻ Regenerate — inputs changed"
                  : providerConfig && answeredCount(currentQa) > 0
                    ? "Generate compiled prompts"
                    : "Generate compiled prompts (add a key + answers for a polished write-up)"}
            </button>
            {genError && (
              <p className="font-mono text-[11px] text-risk mt-2">{genError}</p>
            )}
          </section>
        )}

        {generated && (
          <section className="mb-6">
            <ResultsPanel results={generated.results} onCopy={handleCopy} />
          </section>
        )}

        {pending.length > 0 && (
          <section className="mb-6">
            <OutcomeTracker
              pending={pending}
              onResolve={resolvePending}
              onDismiss={dismissPending}
            />
          </section>
        )}

        {outcomes.length > 0 && (
          <section className="mb-6">
            <OutcomeStats outcomes={outcomes} onClear={handleClearLog} />
          </section>
        )}

        <footer className="mt-12 pt-4 border-t border-line">
          <p className="font-mono text-[11px] text-inkMuted">
            Entity-first AI questions (BYOK) · AI-composed prompts ·
            deterministic platform layer · outcome log (local) · also an MCP
            server (mcp/). See ROADMAP.md.
          </p>
        </footer>
      </div>
    </main>
  );
}
