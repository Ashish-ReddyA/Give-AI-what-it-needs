"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clapperboard, ImageIcon, Plus, Sparkles } from "lucide-react";
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
    if (!currentSpecEmpty && !window.confirm("Start a new spec? Your current brief and refinement answers will be cleared.")) {
      return;
    }
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
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-borderUi bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-textPrimary">Spec Compiler</p>
              <p className="hidden text-xs text-textMuted sm:block">Detailed briefs for image and video generation</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-1.5 text-xs font-medium text-textMuted md:flex">
              <CheckCircle2 size={15} className="text-success" /> Saved locally
            </div>
            <div role="group" aria-label="Generation type" className="flex rounded-lg border border-borderUi bg-surfaceSubtle p-1">
              {(["image", "video"] as Domain[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={domain === mode}
                  onClick={() => switchDomain(mode)}
                  className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                    domain === mode
                      ? "bg-surface text-primary shadow-card"
                      : "text-textMuted hover:text-textPrimary"
                  }`}
                >
                  {mode === "image" ? <ImageIcon size={16} /> : <Clapperboard size={16} />}
                  <span className="hidden sm:inline">{mode === "image" ? "Image" : "Video"}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={startNewSpec}
              disabled={currentSpecEmpty}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-borderUi bg-surface px-3 text-sm font-semibold text-textSecondary hover:border-borderStrong hover:bg-surfaceSubtle disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={16} /> <span className="hidden sm:inline">New spec</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="mb-7 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{domain === "image" ? "Image workspace" : "Video workspace"}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-textPrimary sm:text-4xl">
            Turn an idea into a production-ready prompt.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-textSecondary">
            Build the core brief, refine every important detail, then compile it for the platforms you use.
          </p>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            {domain === "image" ? (
              <QuestionFlow spec={imageSpec} onChange={setImageSpec} />
            ) : (
              <VideoQuestionFlow spec={videoSpec} onChange={setVideoSpec} />
            )}

            <QuestionEngine
              domain={domain}
              idea={currentSpec.idea}
              spec={currentSpec}
              qa={currentQa}
              onQaChange={setCurrentQa}
              config={providerConfig}
            />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <ProviderKeyBar onConfigChange={setProviderConfig} />

            <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card" aria-labelledby="compile-title">
              <h2 id="compile-title" className="text-lg font-semibold text-textPrimary">Review and compile</h2>
              <div className="mt-4">
                <CompletenessMeter result={completeness} />
              </div>

              <div className="mt-5 border-t border-borderUi pt-4">
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-textSecondary">Composition</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${providerConfig && answeredCount(currentQa) > 0 ? "bg-primarySoft text-primary" : "bg-surfaceSubtle text-textMuted"}`}>
                    {providerConfig && answeredCount(currentQa) > 0 ? "AI enhanced" : "Deterministic"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canCompile || composing}
                  className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {composing ? "Compiling prompts..." : generated && stale ? "Update prompts" : "Compile prompts"}
                </button>

                {completeness.hasIdea && !completeness.isComplete && !compileAnyway && (
                  <button
                    type="button"
                    onClick={() => setCompileAnyway(true)}
                    className="mt-2 min-h-10 w-full rounded-lg px-3 text-sm font-medium text-warning hover:bg-warningSoft"
                  >
                    Compile with missing details
                  </button>
                )}

                {compileAnyway && !completeness.isComplete && (
                  <p className="mt-3 rounded-lg bg-warningSoft px-3 py-2 text-xs leading-5 text-warning">
                    You accepted {completeness.regenRisks} missing detail{completeness.regenRisks === 1 ? "" : "s"}. The result may need more retries.
                  </p>
                )}

                {genError && (
                  <p role="alert" className="mt-3 rounded-lg border border-danger/20 bg-dangerSoft px-3 py-2.5 text-sm text-danger">
                    {genError}
                  </p>
                )}
              </div>
            </section>
          </aside>

          {generated && (
            <div className="lg:col-span-2 animate-fade-in">
              {stale && (
                <div className="mb-4 rounded-lg border border-warning/20 bg-warningSoft px-4 py-3 text-sm text-warning">
                  The brief changed after these prompts were compiled. Update them before copying.
                </div>
              )}
              <ResultsPanel results={generated.results} onCopy={handleCopy} />
            </div>
          )}

          {pending.length > 0 && (
            <div className="lg:col-span-2">
              <OutcomeTracker pending={pending} onResolve={resolvePending} onDismiss={dismissPending} />
            </div>
          )}

          {outcomes.length > 0 && (
            <div className="lg:col-span-2">
              <OutcomeStats outcomes={outcomes} onClear={handleClearLog} />
            </div>
          )}
        </div>

        <footer className="mt-10 flex flex-col gap-2 border-t border-borderUi py-6 text-sm text-textMuted sm:flex-row sm:items-center sm:justify-between">
          <span>Specifications and outcome history are stored in this browser.</span>
          <span className="font-mono text-xs">Web app + MCP server</span>
        </footer>
      </div>
    </main>
  );
}
