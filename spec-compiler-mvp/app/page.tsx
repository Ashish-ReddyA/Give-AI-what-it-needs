"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Domain,
  EMPTY_SPEC,
  EMPTY_VIDEO_SPEC,
  ImageSpec,
  VideoSpec,
} from "@/lib/types";
import {
  scoreSpec,
  IMAGE_REQUIRED_FIELDS,
  VIDEO_REQUIRED_FIELDS,
} from "@/lib/completeness";
import { compileAll } from "@/lib/compilers";
import { compileAllVideo } from "@/lib/compilers-video";
import {
  Analysis,
  mergeImageAnalysis,
  mergeVideoAnalysis,
} from "@/lib/analyze-core";
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
import AssistPanel from "@/components/AssistPanel";
import OutcomeTracker from "@/components/OutcomeTracker";
import OutcomeStats from "@/components/OutcomeStats";

export default function Home() {
  const [domain, setDomain] = useState<Domain>("image");
  const [imageSpec, setImageSpec] = useState<ImageSpec>(EMPTY_SPEC);
  const [videoSpec, setVideoSpec] = useState<VideoSpec>(EMPTY_VIDEO_SPEC);
  // Explicit user override: compile despite unanswered required fields.
  // This is what keeps the meter and the results gate coherent — results
  // never silently appear while the meter says fields are at risk.
  // Deliberately NOT persisted: accepting risk is a per-session decision.
  const [compileAnyway, setCompileAnyway] = useState(false);
  const [pending, setPending] = useState<PendingCopy[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [assisted, setAssisted] = useState({ image: false, video: false });
  // Guards the save effect so a render before hydration can't clobber
  // stored state with defaults.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const state = loadPersistedState();
    if (state) {
      setDomain(state.domain);
      setImageSpec(state.imageSpec);
      setVideoSpec(state.videoSpec);
      setPending(state.pending);
      setAssisted(state.assisted);
    }
    setOutcomes(loadOutcomes());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedState({ domain, imageSpec, videoSpec, pending, assisted });
  }, [hydrated, domain, imageSpec, videoSpec, pending, assisted]);

  const switchDomain = (d: Domain) => {
    setDomain(d);
    setCompileAnyway(false);
  };

  const startNewSpec = () => {
    if (domain === "image") {
      setImageSpec(EMPTY_SPEC);
      setAssisted((a) => ({ ...a, image: false }));
    } else {
      setVideoSpec(EMPTY_VIDEO_SPEC);
      setAssisted((a) => ({ ...a, video: false }));
    }
    setCompileAnyway(false);
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
      ? JSON.stringify(imageSpec) === JSON.stringify(EMPTY_SPEC)
      : JSON.stringify(videoSpec) === JSON.stringify(EMPTY_VIDEO_SPEC);

  const showResults =
    completeness.hasIdea && (completeness.isComplete || compileAnyway);

  const results = useMemo(() => {
    if (!showResults) return [];
    return domain === "image" ? compileAll(imageSpec) : compileAllVideo(videoSpec);
  }, [showResults, domain, imageSpec, videoSpec]);

  // AI assist fills only empty fields — the user's explicit picks always win.
  const handleAnalysis = (a: Analysis): { filled: string[] } => {
    if (a.domain === "image") {
      const { spec, filled } = mergeImageAnalysis(imageSpec, a);
      setImageSpec(spec);
      if (filled.length > 0) setAssisted((s) => ({ ...s, image: true }));
      return { filled };
    }
    const { spec, filled } = mergeVideoAnalysis(videoSpec, a);
    setVideoSpec(spec);
    if (filled.length > 0) setAssisted((s) => ({ ...s, video: true }));
    return { filled };
  };

  // A successful copy = "about to spend credits" — open an outcome entry.
  // One pending entry per domain+platform; re-copying replaces it.
  const handleCopy = (platform: string) => {
    const entry: PendingCopy = {
      id: newId(),
      at: Date.now(),
      domain,
      platform,
      score: completeness.score,
      isComplete: completeness.isComplete,
      regenRisks: completeness.regenRisks,
      assisted: assisted[domain],
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

  const dismissPending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

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
            Answer a few questions before you generate. Get one compiled
            prompt per platform — no wasted credits on the wrong shape,
            length, or missing detail.
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
          <AssistPanel
            domain={domain}
            spec={domain === "image" ? imageSpec : videoSpec}
            onAnalysis={handleAnalysis}
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

        {results.length > 0 && (
          <section className="mb-6">
            <ResultsPanel results={results} onCopy={handleCopy} />
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
            Deterministic compilers · BYOK AI assist · outcome log (local
            only) · also an MCP server (mcp/). See ROADMAP.md.
          </p>
        </footer>
      </div>
    </main>
  );
}
