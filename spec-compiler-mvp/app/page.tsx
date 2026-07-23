"use client";

import { useMemo, useState } from "react";
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
import QuestionFlow from "@/components/QuestionFlow";
import VideoQuestionFlow from "@/components/VideoQuestionFlow";
import CompletenessMeter from "@/components/CompletenessMeter";
import ResultsPanel from "@/components/ResultsPanel";

export default function Home() {
  const [domain, setDomain] = useState<Domain>("image");
  const [imageSpec, setImageSpec] = useState<ImageSpec>(EMPTY_SPEC);
  const [videoSpec, setVideoSpec] = useState<VideoSpec>(EMPTY_VIDEO_SPEC);
  // Explicit user override: compile despite unanswered required fields.
  // This is what keeps the meter and the results gate coherent — results
  // never silently appear while the meter says fields are at risk.
  const [compileAnyway, setCompileAnyway] = useState(false);

  const switchDomain = (d: Domain) => {
    setDomain(d);
    setCompileAnyway(false);
  };

  const completeness = useMemo(
    () =>
      domain === "image"
        ? scoreSpec(imageSpec, IMAGE_REQUIRED_FIELDS)
        : scoreSpec(videoSpec, VIDEO_REQUIRED_FIELDS),
    [domain, imageSpec, videoSpec]
  );

  const showResults =
    completeness.hasIdea && (completeness.isComplete || compileAnyway);

  const results = useMemo(() => {
    if (!showResults) return [];
    return domain === "image" ? compileAll(imageSpec) : compileAllVideo(videoSpec);
  }, [showResults, domain, imageSpec, videoSpec]);

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
            {domain === "video" && (
              <span className="ml-auto self-center font-mono text-[10px] text-risk">
                video runs cost real credits — spec tightly
              </span>
            )}
          </div>
        </section>

        <section className="mb-6">
          {domain === "image" ? (
            <QuestionFlow spec={imageSpec} onChange={setImageSpec} />
          ) : (
            <VideoQuestionFlow spec={videoSpec} onChange={setVideoSpec} />
          )}
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
          <section>
            <ResultsPanel results={results} />
          </section>
        )}

        <footer className="mt-12 pt-4 border-t border-line">
          <p className="font-mono text-[11px] text-inkMuted">
            Image + video domains, deterministic compilers. LLM-assisted
            intake and MCP server are next — see ROADMAP.md.
          </p>
        </footer>
      </div>
    </main>
  );
}
